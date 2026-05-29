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

export type MindmapNode = {
  label: string;
  detail?: string;
  children?: MindmapNode[];
};

export type MindmapAsset = {
  generatedAt: string;
  centralTopic: string;
  branches: MindmapNode[];
};

type Body = {
  lectureTitle: string;
  subject: string;
  transcript: string;
  slides?: Slide[];
  messages?: ChatMessage[];
  lectureId: string;
};

const SYSTEM_PROMPT = `Você gera MAPAS MENTAIS de aulas universitárias em português brasileiro.

Recebe: transcrição, slides (se houver), chat (se houver).

Sua tarefa: extrair a estrutura hierárquica da aula em forma de mapa mental.

REGRAS:
- Responda APENAS com JSON válido. Sem markdown wrappers.
- centralTopic: 1 frase curta resumindo o tema central da aula.
- branches: 3-6 ramos principais (grandes conceitos/seções).
- Cada branch pode ter 2-5 children (sub-tópicos).
- Sub-tópicos podem ter mais children (max 3 níveis de profundidade total).
- label: nome curto (1-4 palavras).
- detail (opcional): 1 frase de contexto se útil.
- Em português brasileiro, claro e conciso.
- NÃO invente conteúdo que não esteja na aula.

FORMATO:
{
  "centralTopic": "<tema central da aula>",
  "branches": [
    {
      "label": "<ramo principal>",
      "detail": "<contexto opcional>",
      "children": [
        { "label": "<sub-tópico>", "children": [{ "label": "<detalhe>" }] }
      ]
    }
  ]
}`;

function normalizeNode(raw: unknown): MindmapNode | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!label) return null;
  const detail = typeof o.detail === "string" ? o.detail.trim() : undefined;
  const childrenRaw = Array.isArray(o.children) ? o.children : [];
  const children = childrenRaw
    .map(normalizeNode)
    .filter((x): x is MindmapNode => x !== null);
  const node: MindmapNode = { label };
  if (detail) node.detail = detail;
  if (children.length > 0) node.children = children;
  return node;
}

function normalize(raw: unknown): MindmapAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const centralTopic =
    typeof o.centralTopic === "string" ? o.centralTopic.trim() : "";
  if (!centralTopic) return null;
  const branchesRaw = Array.isArray(o.branches) ? o.branches : [];
  const branches = branchesRaw
    .map(normalizeNode)
    .filter((x): x is MindmapNode => x !== null);
  if (branches.length === 0) return null;
  return {
    generatedAt: new Date().toISOString(),
    centralTopic,
    branches,
  };
}

function tryParseJson(text: string): MindmapAsset | null {
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
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`mindmap:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const transcript = (body.transcript || "").trim();
  if (!transcript) {
    return Response.json({ error: "Transcrição vazia." }, { status: 400 });
  }
  if (transcript.length > LIMITS.TRANSCRIPT_CHARS) {
    return Response.json({ error: "Transcrição muito longa." }, { status: 413 });
  }
  if (!body.lectureId) {
    return Response.json({ error: "lectureId obrigatório." }, { status: 400 });
  }

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

    const userLimit = limitOrThrow(`mindmap:user:${userId}`, 10, 60_000);
    if (userLimit) return userLimit;

    const owns = await assertLectureOwnership(userId as string, body.lectureId);
    if (!owns) {
      return Response.json({ error: "Aula não encontrada." }, { status: 404 });
    }

    const charge = await chargeCoins(user.id, COIN_COSTS.mindmap, "mindmap", {
      lecture_id: body.lectureId,
    });
    if (!charge.ok) {
      return Response.json(
        {
          error: `Saldo insuficiente. Mapa mental custa ${charge.required} coins, você tem ${charge.balance}.`,
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

=== TRANSCRIÇÃO ===
${escapeForPrompt(transcript)}

=== SLIDES ===
${slidesBlock}

=== CHAT ===
${chatBlock}

Gere o mapa mental no formato JSON especificado. APENAS JSON.`;

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
    const mindmap = tryParseJson(raw);

    if (!mindmap) {
      if (userId) {
        try {
          await creditCoins(userId, COIN_COSTS.mindmap, "refund", {
            reason: "mindmap_no_content",
          });
        } catch (e) {
          console.error("[mindmap] refund failed", e);
        }
      }
      return Response.json(
        { error: "Não foi possível gerar o mapa mental. Coins devolvidos." },
        { status: 500 },
      );
    }

    if (userId) {
      try {
        const admin = createAdminClient();
        await admin.from("lecture_assets").insert({
          lecture_id: body.lectureId,
          user_id: userId,
          kind: "mindmap",
          payload: mindmap,
          coins_spent: COIN_COSTS.mindmap,
        });
      } catch (e) {
        console.error("[mindmap] asset insert failed", e);
      }
    }

    return Response.json({ mindmap });
  } catch (err) {
    if (userId) {
      try {
        await creditCoins(userId, COIN_COSTS.mindmap, "refund", {
          reason: "mindmap_api_failure",
        });
      } catch (e) {
        console.error("[mindmap] refund (api) failed", e);
      }
    }
    return Response.json(logAndSanitize("api/mindmap", err), { status: 500 });
  }
}
