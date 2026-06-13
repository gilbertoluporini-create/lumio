import { createMessage } from "@/lib/llm-fallback";
import type { ChatMessage, Slide } from "@/lib/types";
import { LIMITS, escapeForPrompt, logAndSanitize } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { assertLectureOwnership } from "@/lib/lecture-auth";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export type Flashcard = {
  question: string;
  answer: string;
  hint?: string;
  difficulty?: "easy" | "medium" | "hard";
};

export type FlashcardsAsset = {
  generatedAt: string;
  cards: Flashcard[];
};

type Body = {
  lectureTitle: string;
  subject: string;
  /**
   * Transcrição da aula OU equivalente (source_text do PDF puro).
   * Quando o caller envia `documentId` e não envia transcript, o servidor
   * carrega `documents.source_text` direto do banco — mas o caller ainda
   * pode (e geralmente vai) passar o texto pra economizar uma query.
   */
  transcript?: string;
  slides?: Slide[];
  messages?: ChatMessage[];
  /** Modo aula gravada. lectureId tem precedência se ambos vierem. */
  lectureId?: string;
  /** Modo PDF puro (/resumo/doc/[summaryId]). Usado se lectureId ausente. */
  documentId?: string;
  count?: number; // default 10
};

const SYSTEM_PROMPT = `Você é um gerador de FLASH CARDS de revisão pra estudantes universitários brasileiros. Recebe:
- Transcrição da aula
- Slides do professor (se houver)
- Conversa do chat IA-aluno (se houver)

Sua tarefa: gerar um conjunto de flash cards no formato pergunta-resposta, otimizados pra revisão ativa.

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- Crie EXATAMENTE o número solicitado de cards (default 10).
- Cada card foca em UM conceito-chave, fato importante ou definição.
- Pergunta direta (1 frase), resposta concisa (1-3 frases).
- Inclua "hint" opcional (uma pista curta) e "difficulty" (easy/medium/hard) baseado em complexidade.
- Variedade: conceitos, definições, comparações, fatos numéricos, aplicações práticas.
- Não invente conteúdo que não esteja na aula.
- Em português brasileiro.

FORMATO:
{
  "cards": [
    {
      "question": "<pergunta direta>",
      "answer": "<resposta concisa>",
      "hint": "<pista opcional>",
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}`;

function normalize(raw: unknown, expectedCount: number): Flashcard[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const arr = Array.isArray(o.cards) ? o.cards : [];
  const out: Flashcard[] = [];
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const card = c as Record<string, unknown>;
    const question =
      typeof card.question === "string" ? card.question.trim() : "";
    const answer = typeof card.answer === "string" ? card.answer.trim() : "";
    if (!question || !answer) continue;
    const hintRaw =
      typeof card.hint === "string" ? card.hint.trim() : undefined;
    const diff = card.difficulty;
    const difficulty =
      diff === "easy" || diff === "medium" || diff === "hard"
        ? diff
        : undefined;
    const card2: Flashcard = { question, answer };
    if (hintRaw) card2.hint = hintRaw;
    if (difficulty) card2.difficulty = difficulty;
    out.push(card2);
  }
  return out.slice(0, Math.max(expectedCount, 20));
}

function tryParseJson(text: string, count: number): Flashcard[] {
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
  // Rate limit por IP — flashcards são caros (Sonnet 4.5)
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`flashcards:ip:${ip}`, 5, 60_000); // 5/min/IP
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Precedência: lectureId > documentId (paridade com chat-summary e
  // summary-images). Pelo menos um obrigatório.
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

  // Transcript do body é opcional quando documentId é usado — buscamos do
  // banco logo abaixo. Quando lectureId é usado, ainda exigimos o transcript
  // no body (paridade com fluxo atual).
  let transcript = (body.transcript || "").trim();
  if (hasLecture && !transcript) {
    return Response.json(
      { error: "Transcrição vazia." },
      { status: 400 },
    );
  }
  if (transcript.length > LIMITS.TRANSCRIPT_CHARS) {
    return Response.json({ error: "Transcrição muito longa." }, { status: 413 });
  }
  const count = Math.min(Math.max(body.count ?? 10, 5), 20);

  // Auth + coin gate
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

    // Rate limit por user
    const userLimit = limitOrThrow(`flashcards:user:${userId}`, 10, 60_000);
    if (userLimit) return userLimit;

    // Verifica ownership da fonte (defesa contra IDOR — RLS também cobre).
    if (hasLecture) {
      const ownsLecture = await assertLectureOwnership(
        userId as string,
        body.lectureId as string,
      );
      if (!ownsLecture) {
        return Response.json({ error: "Aula não encontrada." }, { status: 404 });
      }
    } else {
      // hasDocument: carrega documents.source_text como "transcript equivalente"
      // e valida ownership via user_id.
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
      // Se o caller já passou transcript no body (UX rápida), respeitamos.
      // Senão usamos source_text do banco como transcript equivalente.
      if (!transcript) {
        const raw = (doc.source_text ?? "").trim();
        if (!raw) {
          return Response.json(
            { error: "Documento sem texto extraído." },
            { status: 400 },
          );
        }
        // Truncate em 12k chars (padrão summary-images) — PDFs longos
        // explodem custo de token sem ganho proporcional de qualidade.
        transcript = raw.slice(0, 12_000);
      }
    }

    // Defesa de margem: cap diário de gasto USD (anti-abuse) antes de cobrar.
    const cap = await checkDailyCostCap(user.id);
    if (!cap.ok) return dailyCapResponse(cap);

    const charge = await chargeCoins(
      user.id,
      COIN_COSTS.flashcards,
      "flashcards",
      hasLecture
        ? { lecture_id: body.lectureId }
        : { document_id: body.documentId },
    );
    if (!charge.ok) {
      return Response.json(
        {
          error: `Saldo insuficiente. Flash cards custam ${charge.required} coins, você tem ${charge.balance}.`,
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
      : "(Sem slides anexados.)";

  const chatBlock =
    body.messages && body.messages.length > 0
      ? body.messages
          .map((m) => `[${m.role === "user" ? "Aluno" : "IA"}] ${m.content}`)
          .join("\n\n")
      : "(Sem chat.)";

  const userMessage = `MATÉRIA: ${escapeForPrompt(body.subject)}
TÍTULO: ${escapeForPrompt(body.lectureTitle)}
QUANTIDADE: ${count} flash cards

=== TRANSCRIÇÃO ===
${escapeForPrompt(transcript)}

=== SLIDES ===
${slidesBlock}

=== INTERAÇÕES ===
${chatBlock}

Gere ${count} flash cards no formato JSON especificado. APENAS JSON.`;

  try {
    const resp = await createMessage({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 6000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const cards = tryParseJson(raw, count);

    if (cards.length === 0) {
      if (userId) {
        try {
          await creditCoins(userId, COIN_COSTS.flashcards, "refund", {
            reason: "flashcards_no_content",
          });
        } catch (refundErr) {
          console.error("[flashcards] refund failed", refundErr);
        }
      }
      return Response.json(
        {
          error:
            "Não foi possível gerar flash cards. Coins devolvidos. Tente novamente.",
        },
        { status: 500 },
      );
    }

    const asset: FlashcardsAsset = {
      generatedAt: new Date().toISOString(),
      cards,
    };

    // Salva como asset — usa lecture_id OU document_id (constraint em
    // lecture_assets exige pelo menos um). Seguimos exclusividade: quando
    // documentId é o caminho ativo, lecture_id fica null e vice-versa.
    if (userId) {
      try {
        const admin = createAdminClient();
        await admin.from("lecture_assets").insert({
          lecture_id: hasLecture ? (body.lectureId as string) : null,
          document_id: hasLecture ? null : (body.documentId as string),
          user_id: userId,
          kind: "flashcards",
          payload: asset,
          coins_spent: COIN_COSTS.flashcards,
        });
      } catch (assetErr) {
        console.error("[flashcards] asset insert failed", assetErr);
      }
    }

    return Response.json({ flashcards: asset });
  } catch (err) {
    if (userId) {
      try {
        await creditCoins(userId, COIN_COSTS.flashcards, "refund", {
          reason: "flashcards_api_failure",
        });
      } catch (refundErr) {
        console.error("[flashcards] refund (api) failed", refundErr);
      }
    }
    return Response.json(logAndSanitize("api/flashcards", err), {
      status: 500,
    });
  }
}
