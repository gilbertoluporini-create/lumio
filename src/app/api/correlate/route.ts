import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  LectureSummary,
  LectureSummarySection,
  Slide,
} from "@/lib/types";
import { LIMITS, escapeForPrompt, logAndSanitize } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { assertLectureOwnership } from "@/lib/lecture-auth";
import { logAiUsage } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  lectureTitle: string;
  subject: string;
  transcript: string;
  slides?: Slide[];
  messages?: ChatMessage[];
  lectureId?: string; // pra salvar como asset
};

const SYSTEM_PROMPT = `Você é o Lumio, gerador de RESUMOS DE AULA. Você recebe:
- A transcrição da aula (pode ser parcial)
- Os slides do professor (JSON com pageNumber + título + texto), quando disponíveis
- A conversa do chat IA-aluno (perguntas que o aluno fez e respostas que recebeu durante a aula)

Sua tarefa: produzir um RESUMO ESTRUTURADO da aula no formato JSON definido abaixo, organizado por slide (quando há slides) ou por bloco lógico (quando não há).

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers, sem texto extra.
- Não invente conteúdo. Se a transcrição não cobre um slide, o spokenContent fica como "Não coberto explicitamente na transcrição."
- spokenContent: 3-6 frases parafraseando o que o professor falou sobre aquele tópico/slide. Use **negrito** em pontos-chave.
- relatedQA: dentre as mensagens do chat, pegue as perguntas do aluno + respostas que se relacionam DIRETAMENTE com aquele slide/tópico. Se nenhuma, deixe vazio.
- highlights: 5-8 bullets curtos dos pontos centrais de TODA a aula.
- generalSummary: parágrafo único (3-5 frases) sintetizando a aula inteira.
- Em português do Brasil, didático e claro.

FORMATO DE SAÍDA (JSON puro):
{
  "generalSummary": "<parágrafo síntese>",
  "highlights": ["<bullet 1>", "<bullet 2>", "..."],
  "sections": [
    {
      "slideNumber": 1,
      "slideTitle": "<título do slide ou null>",
      "spokenContent": "<o que o professor falou sobre>",
      "relatedQA": [
        { "question": "<pergunta do aluno>", "answer": "<resposta resumida>" }
      ]
    }
  ]
}

Se NÃO houver slides, gere sections livres com slideNumber=null e slideTitle representando o tópico identificado.`;

function normalize(raw: unknown): LectureSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sectionsRaw = Array.isArray(o.sections) ? o.sections : [];
  const sections = sectionsRaw
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const sec = s as Record<string, unknown>;
      const spoken = typeof sec.spokenContent === "string" ? sec.spokenContent : "";
      const slideNumber =
        typeof sec.slideNumber === "number"
          ? sec.slideNumber
          : sec.slideNumber === null
            ? undefined
            : Number.isFinite(Number(sec.slideNumber))
              ? Number(sec.slideNumber)
              : undefined;
      const slideTitle =
        typeof sec.slideTitle === "string" && sec.slideTitle.trim().length > 0
          ? sec.slideTitle.trim()
          : undefined;
      const qaRaw = Array.isArray(sec.relatedQA) ? sec.relatedQA : [];
      const relatedQA = qaRaw
        .map((qa) => {
          if (!qa || typeof qa !== "object") return null;
          const qaO = qa as Record<string, unknown>;
          const q = typeof qaO.question === "string" ? qaO.question : "";
          const a = typeof qaO.answer === "string" ? qaO.answer : "";
          if (!q && !a) return null;
          return { question: q, answer: a };
        })
        .filter((x): x is { question: string; answer: string } => x !== null);
      const section: LectureSummarySection = {
        slideNumber,
        slideTitle,
        spokenContent: spoken,
        relatedQA,
      };
      return section;
    })
    .filter((s): s is LectureSummarySection => s !== null && s.spokenContent.length > 0);

  const highlights = Array.isArray(o.highlights)
    ? (o.highlights as unknown[]).filter((h): h is string => typeof h === "string")
    : [];

  const generalSummary =
    typeof o.generalSummary === "string" ? o.generalSummary : "";

  if (!generalSummary && sections.length === 0 && highlights.length === 0) {
    return null;
  }

  return {
    generatedAt: new Date().toISOString(),
    generalSummary,
    highlights,
    sections,
  };
}

function tryParseJson(text: string): LectureSummary | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return normalize(JSON.parse(cleaned));
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return normalize(JSON.parse(m[0]));
    } catch {}
  }
  return null;
}

export async function POST(req: Request) {
  // Rate limit por IP — resumo é caro
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`correlate:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const transcript = (body.transcript || "").trim();
  if (!transcript) {
    return Response.json(
      { error: "Transcrição vazia — grave ou cole o texto antes de gerar o resumo." },
      { status: 400 },
    );
  }
  if (transcript.length > LIMITS.TRANSCRIPT_CHARS) {
    return Response.json({ error: "Transcrição muito longa." }, { status: 413 });
  }

  // Coin gate: cobra coins por resumo (substitui o antigo subscription gate)
  const supabaseEnabled = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  let userId: string | null = null;
  if (supabaseEnabled) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        { error: "Configuração de servidor incompleta. Contate o suporte." },
        { status: 503 },
      );
    }
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Faça login pra gerar resumos." }, { status: 401 });
    }
    userId = user.id;

    // Rate limit + ownership check (se vier lectureId, exige ownership)
    const userLimit = limitOrThrow(`correlate:user:${userId}`, 10, 60_000);
    if (userLimit) return userLimit;
    if (body.lectureId) {
      const ownsLecture = await assertLectureOwnership(
        userId as string,
        body.lectureId,
      );
      if (!ownsLecture) {
        return Response.json(
          { error: "Aula não encontrada." },
          { status: 404 },
        );
      }
    }

    const charge = await chargeCoins(user.id, COIN_COSTS.summary, "summary", {
      lecture_title: body.lectureTitle,
      subject: body.subject,
    });
    if (!charge.ok) {
      return Response.json(
        {
          error: `Saldo insuficiente. Gerar resumo custa ${charge.required} coins, você tem ${charge.balance}.`,
          required: charge.required,
          balance: charge.balance,
          upgrade: "/account/coins",
        },
        { status: 402 },
      );
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  const slidesBlock = body.slides && body.slides.length > 0
    ? body.slides
        .map(
          (s) =>
            `Slide ${s.pageNumber}${s.title ? ` — ${s.title}` : ""}\n${s.text || "(sem texto)"}`,
        )
        .join("\n\n")
    : "(Sem slides do professor anexados — organize sections por blocos lógicos da transcrição.)";

  const chatBlock = body.messages && body.messages.length > 0
    ? body.messages
        .map((m) => `[${m.role === "user" ? "Aluno" : "IA"}] ${m.content}`)
        .join("\n\n")
    : "(Nenhuma interação no chat durante a aula.)";

  if (!apiKey) {
    const demo: LectureSummary = {
      generatedAt: new Date().toISOString(),
      generalSummary:
        "Modo demo: sem ANTHROPIC_API_KEY configurada. Configure em .env.local pra gerar resumos reais com base na transcrição e nos slides.",
      highlights: [
        "Configure ANTHROPIC_API_KEY em .env.local",
        "Reinicie npm run dev",
        "O resumo real será gerado pelo Claude Sonnet 4.6",
      ],
      sections: (body.slides && body.slides.length > 0
        ? body.slides
        : [{ pageNumber: 1, title: "Aula", text: "" } as Slide]
      ).slice(0, 3).map((s) => ({
        slideNumber: s.pageNumber,
        slideTitle: s.title,
        spokenContent: `**Modo demo.** Este seria o conteúdo correlacionado entre o slide ${s.pageNumber} e a transcrição.`,
        relatedQA: [],
      })),
    };
    return Response.json({ summary: demo, demo: true });
  }

  const client = new Anthropic({ apiKey });

  const userMessage = `MATÉRIA: ${body.subject}
TÍTULO DA AULA: ${body.lectureTitle}

=== TRANSCRIÇÃO DA AULA ===
${transcript}

=== SLIDES DO PROFESSOR ===
${slidesBlock}

=== INTERAÇÕES NO CHAT (perguntas do aluno + respostas da IA durante a aula) ===
${chatBlock}

Gere o resumo estruturado conforme o formato JSON especificado. Responda APENAS com o JSON.`;

  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const summary = tryParseJson(raw);

    if (!summary) {
      // Refund: nada gerado, devolve coins
      if (userId) {
        try {
          await creditCoins(userId, COIN_COSTS.summary, "refund", {
            reason: "correlate_no_content",
          });
        } catch (refundErr) {
          console.error("[correlate] refund (no content) failed", refundErr);
        }
      }
      return Response.json(
        {
          error:
            "Não foi possível estruturar o resumo. Coins devolvidos. Tente novamente.",
          rawPreview: raw.slice(0, 500),
        },
        { status: 500 },
      );
    }

    // Log usage (tokens + custo USD) — alimenta dashboard admin/cost-cap
    if (userId) {
      await logAiUsage({
        userId,
        endpoint: "correlate",
        model: "claude-sonnet-4-5-20250929",
        inputTokens: resp.usage?.input_tokens ?? 0,
        outputTokens: resp.usage?.output_tokens ?? 0,
        coinsCharged: COIN_COSTS.summary,
      });
    }

    // Salva como asset na subpasta da aula (lecture_assets)
    if (userId && body.lectureId) {
      try {
        const admin = createAdminClient();
        await admin.from("lecture_assets").insert({
          lecture_id: body.lectureId,
          user_id: userId,
          kind: "summary",
          payload: summary,
          coins_spent: COIN_COSTS.summary,
        });
      } catch (assetErr) {
        console.error("[correlate] asset insert failed", assetErr);
        // Não falha a requisição — resumo já tá no response e na coluna lectures.summary
      }
    }

    return Response.json({ summary });
  } catch (err) {
    if (userId) {
      try {
        await creditCoins(userId, COIN_COSTS.summary, "refund", {
          reason: "correlate_api_failure",
        });
      } catch (refundErr) {
        console.error("[correlate] refund failed", refundErr);
      }
    }
    return Response.json(logAndSanitize("api/correlate", err), { status: 500 });
  }
}
