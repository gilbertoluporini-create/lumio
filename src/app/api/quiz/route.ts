import { createMessage } from "@/lib/llm-fallback";
import type { ChatMessage, Slide } from "@/lib/types";
import { LIMITS, escapeForPrompt, logAndSanitize } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { assertLectureOwnership } from "@/lib/lecture-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export type QuizQuestion = {
  question: string;
  options: string[]; // 4 opções
  correctIndex: number; // 0-3
  explanation: string;
};

export type QuizAsset = {
  generatedAt: string;
  questions: QuizQuestion[];
};

type Body = {
  lectureTitle: string;
  subject: string;
  /**
   * Transcrição da aula OU equivalente (source_text do PDF puro). Opcional
   * quando `documentId` é usado — servidor carrega do banco se ausente.
   */
  transcript?: string;
  slides?: Slide[];
  messages?: ChatMessage[];
  /** Modo aula gravada. Tem precedência sobre documentId se ambos vierem. */
  lectureId?: string;
  /** Modo PDF puro (/resumo/doc/[summaryId]). Usado se lectureId ausente. */
  documentId?: string;
  count?: number;
};

const SYSTEM_PROMPT = `Você gera QUIZZES de revisão pra estudantes universitários brasileiros. Recebe:
- Transcrição da aula
- Slides do professor (se houver)
- Conversa do chat IA-aluno (se houver)

Gere questões de múltipla escolha com EXATAMENTE 4 opções cada, onde APENAS 1 está correta.

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- Crie EXATAMENTE o número solicitado de questões (default 8).
- Cada questão testa UM conceito-chave da aula.
- 4 opções (A, B, C, D) — uma certa, três plausíveis mas erradas.
- correctIndex: 0 (A), 1 (B), 2 (C) ou 3 (D).
- explanation: 1-2 frases explicando por que a resposta correta é correta (vai aparecer depois que o aluno responde).
- Variedade: fatos, conceitos, comparações, aplicações.
- Não invente conteúdo que não esteja na aula.
- Em português brasileiro.

FORMATO:
{
  "questions": [
    {
      "question": "<enunciado>",
      "options": ["<A>", "<B>", "<C>", "<D>"],
      "correctIndex": 0,
      "explanation": "<por que a correta está correta>"
    }
  ]
}`;

function normalize(raw: unknown, expectedCount: number): QuizQuestion[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const arr = Array.isArray(o.questions) ? o.questions : [];
  const out: QuizQuestion[] = [];
  for (const q of arr) {
    if (!q || typeof q !== "object") continue;
    const item = q as Record<string, unknown>;
    const question =
      typeof item.question === "string" ? item.question.trim() : "";
    const options = Array.isArray(item.options)
      ? (item.options as unknown[])
          .filter((x) => typeof x === "string")
          .map((x) => (x as string).trim())
          .filter(Boolean)
      : [];
    const correctIndex =
      typeof item.correctIndex === "number" ? Math.floor(item.correctIndex) : -1;
    const explanation =
      typeof item.explanation === "string" ? item.explanation.trim() : "";

    if (!question || options.length !== 4) continue;
    if (correctIndex < 0 || correctIndex > 3) continue;
    if (!explanation) continue;

    out.push({ question, options, correctIndex, explanation });
  }
  return out.slice(0, Math.max(expectedCount, 15));
}

function tryParseJson(text: string, count: number): QuizQuestion[] {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return normalize(JSON.parse(cleaned), count);
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return normalize(JSON.parse(m[0]), count);
    } catch {}
  }
  return [];
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`quiz:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Precedência: lectureId > documentId.
  const hasLecture =
    typeof body.lectureId === "string" && body.lectureId.length > 0;
  const hasDocument =
    !hasLecture &&
    typeof body.documentId === "string" &&
    body.documentId.length > 0;
  if (!hasLecture && !hasDocument) {
    return Response.json(
      { error: "lectureId ou documentId obrigatório." },
      { status: 400 },
    );
  }

  let transcript = (body.transcript || "").trim();
  if (hasLecture && !transcript) {
    return Response.json({ error: "Transcrição vazia." }, { status: 400 });
  }
  if (transcript.length > LIMITS.TRANSCRIPT_CHARS) {
    return Response.json({ error: "Transcrição muito longa." }, { status: 413 });
  }
  const count = Math.min(Math.max(body.count ?? 8, 3), 15);

  const supabaseEnabled = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  let userId: string | null = null;
  if (supabaseEnabled) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: "Configuração de servidor incompleta." },
        { status: 503 },
      );
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Faça login." }, { status: 401 });
    }
    userId = user.id;

    const userLimit = limitOrThrow(`quiz:user:${userId}`, 10, 60_000);
    if (userLimit) return userLimit;

    if (hasLecture) {
      const ownsLecture = await assertLectureOwnership(
        userId as string,
        body.lectureId as string,
      );
      if (!ownsLecture) {
        return Response.json({ error: "Aula não encontrada." }, { status: 404 });
      }
    } else {
      // hasDocument: valida ownership + carrega source_text se transcript
      // não veio no body.
      const admin = createAdminClient();
      const { data: docRow } = await admin
        .from("documents")
        .select("id, title, source_text, subject_id")
        .eq("id", body.documentId as string)
        .eq("user_id", userId as string)
        .maybeSingle();
      const doc = docRow as
        | {
            id: string;
            title: string | null;
            source_text: string | null;
            subject_id: string | null;
          }
        | null;
      if (!doc) {
        return Response.json(
          { error: "Documento não encontrado." },
          { status: 404 },
        );
      }
      if (!transcript) {
        const raw = (doc.source_text ?? "").trim();
        if (!raw) {
          return Response.json(
            { error: "Documento sem texto extraído." },
            { status: 400 },
          );
        }
        // Truncate 12k chars (padrão summary-images).
        transcript = raw.slice(0, 12_000);
      }
    }

    const charge = await chargeCoins(
      user.id,
      COIN_COSTS.quiz,
      "quiz",
      hasLecture
        ? { lecture_id: body.lectureId }
        : { document_id: body.documentId },
    );
    if (!charge.ok) {
      return Response.json(
        {
          error: `Saldo insuficiente. Quiz custa ${charge.required} coins, você tem ${charge.balance}.`,
          required: charge.required,
          balance: charge.balance,
          upgrade: "/account/coins",
        },
        { status: 402 },
      );
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY não configurada." },
      { status: 503 },
    );
  }

  const slidesBlock =
    body.slides && body.slides.length > 0
      ? body.slides
          .map(
            (s) =>
              `Slide ${s.pageNumber}${s.title ? ` — ${s.title}` : ""}\n${s.text || "(sem texto)"}`,
          )
          .join("\n\n")
      : "(Sem slides.)";

  const chatBlock =
    body.messages && body.messages.length > 0
      ? body.messages
          .map((m) => `[${m.role === "user" ? "Aluno" : "IA"}] ${m.content}`)
          .join("\n\n")
      : "(Sem chat.)";

  const userMessage = `MATÉRIA: ${escapeForPrompt(body.subject)}
TÍTULO: ${escapeForPrompt(body.lectureTitle)}
QUANTIDADE: ${count} questões

=== TRANSCRIÇÃO ===
${escapeForPrompt(transcript)}

=== SLIDES ===
${slidesBlock}

=== CHAT ===
${chatBlock}

Gere ${count} questões de múltipla escolha no JSON especificado. APENAS JSON.`;

  try {
    const resp = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 7000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const questions = tryParseJson(raw, count);

    if (questions.length === 0) {
      if (userId) {
        try {
          await creditCoins(userId, COIN_COSTS.quiz, "refund", {
            reason: "quiz_no_content",
          });
        } catch (e) {
          console.error("[quiz] refund failed", e);
        }
      }
      return Response.json(
        { error: "Não foi possível gerar o quiz. Coins devolvidos." },
        { status: 500 },
      );
    }

    const asset: QuizAsset = {
      generatedAt: new Date().toISOString(),
      questions,
    };

    let assetId: string | null = null;
    if (userId) {
      try {
        const admin = createAdminClient();
        const { data: inserted } = await admin
          .from("lecture_assets")
          .insert({
            lecture_id: hasLecture ? (body.lectureId as string) : null,
            document_id: hasLecture ? null : (body.documentId as string),
            user_id: userId,
            kind: "quiz",
            payload: asset,
            coins_spent: COIN_COSTS.quiz,
          })
          .select("id")
          .single();
        assetId = (inserted as { id?: string } | null)?.id ?? null;
      } catch (e) {
        // Insert falhou DEPOIS do LLM gerar. User pagou mas não tem asset.
        // Reembolsa coins e retorna 500 — antes engolia o erro e devolvia
        // assetId=null (user clicava "Ver" e caia em lista vazia).
        console.error("[quiz] asset insert failed", e);
        try {
          await creditCoins(userId, COIN_COSTS.quiz, "refund", {
            reason: "quiz_asset_insert_failure",
          });
        } catch (refundErr) {
          console.error("[quiz] refund after insert error failed", refundErr);
        }
        return Response.json(
          { error: "Falha ao salvar quiz. Coins reembolsados." },
          { status: 500 },
        );
      }
    }

    return Response.json({ quiz: asset, assetId });
  } catch (err) {
    if (userId) {
      try {
        await creditCoins(userId, COIN_COSTS.quiz, "refund", {
          reason: "quiz_api_failure",
        });
      } catch (e) {
        console.error("[quiz] refund (api) failed", e);
      }
    }
    return Response.json(logAndSanitize("api/quiz", err), { status: 500 });
  }
}
