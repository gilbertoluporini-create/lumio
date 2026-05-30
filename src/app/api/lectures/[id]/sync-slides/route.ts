/**
 * POST /api/lectures/[id]/sync-slides
 *
 * Correlaciona os slides do PDF anexado com os capítulos da transcrição
 * revisada via Haiku. Cobra slide_sync coins.
 *
 * Pré-requisitos da aula:
 *  - `transcript_chapters` existente (rodar 'Revisar transcrição' antes)
 *  - `slides` com pelo menos 1 item
 *
 * Salva `slideIndex` no campo correspondente de cada chapter.
 *
 * Body: ignorado — usa lectureId da URL.
 * Response: { chapters: TranscriptChapters }
 */

import { NextResponse, type NextRequest } from "next/server";
import { createMessage } from "@/lib/llm-fallback";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { logAndSanitize } from "@/lib/api-security";
import { COIN_COSTS, chargeCoins, creditCoins } from "@/lib/coins";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { assertLectureOwnership } from "@/lib/lecture-auth";
import { logAiUsage } from "@/lib/ai-usage";
import type {
  Slide,
  TranscriptChapters,
  TranscriptRevisedChapter,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type MappingItem = { chapterId: string; slideIndex: number | null };

function buildSystemPrompt(): string {
  return `Você é um assistente especialista em material didático. Recebe:
1) Uma lista de CAPÍTULOS da transcrição revisada de uma aula universitária.
2) Uma lista de SLIDES do PDF que o professor usou.

Sua tarefa: correlacionar cada capítulo ao slide mais relacionado em conteúdo.

REGRAS:
- Granularidade é CAPÍTULO → 1 SLIDE (não múltiplos).
- Use o TÍTULO + RESUMO + primeiros parágrafos do capítulo, e o TÍTULO + TEXTO do slide.
- Se NENHUM slide se relaciona com aquele capítulo (ex: capítulo "Organização e avisos"), retorne slideIndex: null. Não force correlação.
- Se vários slides se relacionam, escolha o mais central/principal.
- Capítulos diferentes podem apontar pro MESMO slide (professor passa tempo num slide).

FORMATO DE SAÍDA — APENAS JSON VÁLIDO (sem markdown, sem comentários):
{
  "mapping": [
    { "chapterId": "<id do capítulo>", "slideIndex": <0-based index do slide ou null> }
  ]
}`;
}

function buildUserPrompt(
  chapters: TranscriptRevisedChapter[],
  slides: Slide[],
): string {
  const chaptersBlock = chapters
    .map((c) => {
      const firstParas = c.paragraphs
        .slice(0, 2)
        .map((p) => p.text)
        .join(" ")
        .slice(0, 500);
      return [
        `### Capítulo id="${c.id}"`,
        `Título: ${c.title}`,
        c.summary ? `Resumo: ${c.summary}` : "",
        `Trecho: ${firstParas}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const slidesBlock = slides
    .map((s, i) => {
      const text = (s.text ?? "").trim().slice(0, 400);
      return [
        `### Slide index=${i} (página ${s.pageNumber ?? i + 1})`,
        s.title ? `Título: ${s.title}` : "",
        text ? `Texto: ${text}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return `CAPÍTULOS:\n\n${chaptersBlock}\n\n---\n\nSLIDES:\n\n${slidesBlock}\n\nRetorne o JSON com o mapping.`;
}

function tryParseMapping(raw: string): MappingItem[] | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { mapping?: unknown };
    if (!parsed || !Array.isArray(parsed.mapping)) return null;
    const out: MappingItem[] = [];
    for (const m of parsed.mapping) {
      if (!m || typeof m !== "object") continue;
      const o = m as Record<string, unknown>;
      const chapterId = typeof o.chapterId === "string" ? o.chapterId : "";
      const slideIndex =
        typeof o.slideIndex === "number"
          ? o.slideIndex
          : o.slideIndex === null
            ? null
            : undefined;
      if (!chapterId || slideIndex === undefined) continue;
      out.push({ chapterId, slideIndex });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: lectureId } = await ctx.params;
  if (!lectureId) {
    return NextResponse.json({ error: "Lecture id ausente." }, { status: 400 });
  }

  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`sync-slides:ip:${ip}`, 5, 60_000);
  if (ipLimit) return ipLimit;

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "Configuração de servidor incompleta." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const userId = user.id;

  const userLimit = limitOrThrow(`sync-slides:user:${userId}`, 8, 60_000);
  if (userLimit) return userLimit;

  const owns = await assertLectureOwnership(userId, lectureId);
  if (!owns) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }

  // Carrega chapters + slides
  const admin = createAdminClient();
  const { data: lectureRow, error: lecErr } = await admin
    .from("lectures")
    .select("transcript_chapters, slides")
    .eq("id", lectureId)
    .maybeSingle();
  if (lecErr || !lectureRow) {
    return NextResponse.json({ error: "Aula não encontrada." }, { status: 404 });
  }
  const chapters = (lectureRow.transcript_chapters as TranscriptChapters | null)
    ?.chapters;
  const slides = (lectureRow.slides as Slide[] | null) ?? [];

  if (!chapters || chapters.length === 0) {
    return NextResponse.json(
      {
        error:
          "Capítulos não gerados ainda. Gere a transcrição revisada antes de sincronizar.",
      },
      { status: 400 },
    );
  }
  if (slides.length === 0) {
    return NextResponse.json(
      { error: "Anexe um PDF de slides antes de sincronizar." },
      { status: 400 },
    );
  }

  // Cobra coins
  const cost = COIN_COSTS.slide_sync;
  const charged = await chargeCoins(userId, cost, "slide_sync", { lectureId });
  if (!charged.ok) {
    return NextResponse.json(
      {
        error: "Coins insuficientes.",
        balance: charged.balance,
        required: cost,
      },
      { status: 402 },
    );
  }

  const system = buildSystemPrompt();
  const userPrompt = buildUserPrompt(chapters, slides);

  try {
    const resp = await createMessage({
      model: HAIKU_MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const rawText =
      textBlock && textBlock.type === "text" ? textBlock.text : "";
    const mapping = tryParseMapping(rawText);

    if (!mapping || mapping.length === 0) {
      await creditCoins(userId, cost, "refund", {
        lectureId,
        kind: "slide_sync_parse_failed",
      });
      console.error(
        "[sync-slides] parse failed, raw preview:",
        rawText.slice(0, 500),
      );
      return NextResponse.json(
        { error: "Não foi possível correlacionar. Tente de novo." },
        { status: 502 },
      );
    }

    // Mescla slideIndex em cada chapter preservando o resto.
    const byId = new Map(mapping.map((m) => [m.chapterId, m.slideIndex]));
    const mergedChapters: TranscriptRevisedChapter[] = chapters.map((c) => {
      const idx = byId.get(c.id);
      if (idx === undefined) return c;
      if (idx === null) {
        // Limpa slideIndex anterior se IA decidiu que não há correlação
        const { slideIndex: _drop, ...rest } = c;
        void _drop;
        return rest;
      }
      // Valida bounds
      if (idx < 0 || idx >= slides.length) return c;
      return { ...c, slideIndex: idx };
    });

    const payload: TranscriptChapters = {
      chapters: mergedChapters,
      generatedAt: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("lectures")
      .update({ transcript_chapters: payload })
      .eq("id", lectureId);
    if (upErr) {
      console.error("[sync-slides] db update failed", upErr);
    }

    void logAiUsage({
      userId,
      endpoint: "/api/lectures/[id]/sync-slides",
      model: HAIKU_MODEL,
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
      coinsCharged: cost,
    }).catch(() => {});

    return NextResponse.json({ chapters: payload });
  } catch (err) {
    await creditCoins(userId, cost, "refund", {
      lectureId,
      kind: "slide_sync_error",
    });
    return NextResponse.json(
      logAndSanitize("api/lectures/sync-slides", err),
      { status: 500 },
    );
  }
}
