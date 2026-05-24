/**
 * POST /api/ai/summary-images
 *
 * Dado um lectureId que já tem summary gerado, extrai 2-3 conceitos visuais
 * do markdown via Haiku, chama /api/ai/generate-images, e salva as URLs em
 * lecture.summary.images.
 *
 * Body: { lectureId: string, count?: 2|3|4 }
 * Response: { images: LectureSummaryImage[] }
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";
import { checkDailyCostCap, dailyCapResponse } from "@/lib/cost-cap";
import type { LectureSummary } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type ConceptExtraction = {
  concepts: Array<{ title: string; prompt: string; caption?: string }>;
};

type SourceContext = {
  lectureTitle: string;
  subjectName: string;
  markdown: string;
  transcript?: string;
  slidesText?: string;
  count: number;
};

async function extractVisualConcepts(
  ctx: SourceContext,
): Promise<ConceptExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { concepts: [] };

  const client = new Anthropic({ apiKey });

  // Monta bloco de fontes com prioridade: summary > transcript > slides
  const sources: string[] = [];
  sources.push(`# RESUMO GERADO\n${ctx.markdown.slice(0, 5000)}`);
  if (ctx.transcript && ctx.transcript.trim().length > 80) {
    sources.push(`# TRANSCRIÇÃO DA AULA\n${ctx.transcript.slice(0, 4000)}`);
  }
  if (ctx.slidesText && ctx.slidesText.trim().length > 80) {
    sources.push(`# SLIDES DO PROFESSOR\n${ctx.slidesText.slice(0, 4000)}`);
  }

  const sys = `Você é um curador visual ESPECIALISTA em material didático de medicina/saúde/ciências para estudantes universitários brasileiros.

OBJETIVO: a partir do conteúdo de UMA AULA específica (transcrição, slides e resumo), extrair ${ctx.count} conceitos que ficariam EXCELENTES visualizados como infográficos médicos profissionais — fidedignos ao conteúdo real da aula.

REGRAS DE ANCORAMENTO (críticas):
- Cada conceito deve estar EXPLICITAMENTE mencionado nas fontes (transcrição, slides ou resumo).
- Use termos técnicos EXATOS da aula. Se o professor disse "polo superior da tireoide", use isso, não "thyroid upper pole" genérico.
- Inclua nomes de estruturas anatômicas específicas mencionadas (artérias, veias, nervos, etc).
- Se a aula menciona valores numéricos, ciclos com etapas, classificações — inclua isso no prompt da imagem.

PRIORIZE conceitos que sejam:
- Estruturas anatômicas específicas mencionadas (com nomes exatos)
- Fluxos/ciclos com etapas numeradas (ex: ciclo da PCR, etapas da hemostasia)
- Comparações lado-a-lado (ex: tipos de leucemia, fases do sono)
- Mecanismos com setas/relações (ex: eixo HHA, feedback negativo)
- Tabelas/classificações visualizáveis em grid

EVITE: textos longos, definições puramente verbais, conceitos abstratos sem componente visual.

ESTILO DOS PROMPTS (em inglês pra Imagen 4, mas com TERMOS TÉCNICOS EM PORTUGUÊS quando forem labels):
- Comece descrevendo o tipo de diagrama ("anatomical cross-section diagram", "numbered process flow", "comparison table")
- Liste OS LABELS exatos em português que devem aparecer (poucos, máximo 6 por imagem)
- Descreva cores funcionais (vermelho=artéria, azul=veia, verde=normal, etc)
- Indique se é vista frontal/posterior/transversal quando aplicável

TEMA DA AULA: "${ctx.lectureTitle}" — Matéria: ${ctx.subjectName}

Retorne APENAS JSON puro (sem markdown, sem cercas):
{
  "concepts": [
    {
      "title": "Curto em pt-BR (3-6 palavras)",
      "prompt": "Detailed English prompt with Portuguese labels for Imagen, including: 1) diagram type, 2) main subject, 3) labels in Portuguese, 4) color coding, 5) view/perspective",
      "caption": "Frase curta pt-BR (8-15 palavras) explicando o que a imagem mostra do conteúdo da aula"
    }
  ]
}`;

  const resp = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1500,
    system: sys,
    messages: [
      {
        role: "user",
        content: `FONTES DA AULA:\n\n${sources.join("\n\n---\n\n")}\n\nGere ${ctx.count} conceitos visuais ancorados nessas fontes.`,
      },
    ],
  });

  const text =
    resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim() ?? "";

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as ConceptExtraction;
  } catch {
    return { concepts: [] };
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = limitOrThrow(`summary-images:ip:${ip}`, 5, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Cap diário USD por user (anti-abuse). Admin/founder bypass.
  const cap = await checkDailyCostCap(user.id);
  if (!cap.ok) return dailyCapResponse(cap);

  let body: { lectureId?: string; count?: number };
  try {
    body = (await req.json()) as { lectureId?: string; count?: number };
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body.lectureId) {
    return Response.json(
      { error: "lectureId obrigatório." },
      { status: 400 },
    );
  }
  const count = Math.max(2, Math.min(4, body.count ?? 3));

  // Carrega lecture com TODO contexto pra ancorar a geração: summary +
  // transcript + slides + título + matéria.
  const { data: lectureRow, error: lecErr } = await supabase
    .from("lectures")
    .select("id, title, subject_id, transcript, slides, summary")
    .eq("id", body.lectureId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (lecErr || !lectureRow) {
    return Response.json({ error: "Lecture não encontrada." }, { status: 404 });
  }
  const lectureSummary = lectureRow.summary as LectureSummary | null;
  if (!lectureSummary?.generalSummary) {
    return Response.json(
      { error: "Summary ainda não foi gerado." },
      { status: 404 },
    );
  }

  // Tenta puxar nome da matéria
  let subjectName = "Geral";
  if (lectureRow.subject_id) {
    const { data: subj } = await supabase
      .from("subjects")
      .select("name")
      .eq("id", lectureRow.subject_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (subj?.name) subjectName = subj.name as string;
  }

  // Serializa slides como texto
  type SlideRow = { pageNumber?: number; title?: string; text?: string };
  const slidesArr = (lectureRow.slides ?? []) as SlideRow[];
  const slidesText = Array.isArray(slidesArr)
    ? slidesArr
        .map(
          (s) =>
            `[Slide ${s.pageNumber ?? "?"}${s.title ? ` — ${s.title}` : ""}]\n${s.text ?? ""}`,
        )
        .join("\n\n")
    : "";

  // 1) Extrair conceitos ancorados no contexto completo
  const { concepts } = await extractVisualConcepts({
    lectureTitle: (lectureRow.title as string) ?? "Aula",
    subjectName,
    markdown: lectureSummary.generalSummary,
    transcript: (lectureRow.transcript as string | null) ?? undefined,
    slidesText,
    count,
  });
  if (!concepts || concepts.length === 0) {
    return Response.json({ images: [] });
  }

  // 2) Chamar generate-images via fetch interno
  const origin = req.headers.get("x-forwarded-proto")
    ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
    : `http://${req.headers.get("host")}`;
  const cookieHeader = req.headers.get("cookie") ?? "";

  const imagesResp = await fetch(`${origin}/api/ai/generate-images`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify({
      prompts: concepts.map((c) => c.prompt),
    }),
  });

  if (!imagesResp.ok) {
    const errText = await imagesResp.text().catch(() => "");
    console.error("[summary-images] generate-images failed", errText);
    return Response.json(
      { error: "Falha ao gerar imagens." },
      { status: 502 },
    );
  }
  const { urls } = (await imagesResp.json()) as { urls?: string[] };
  if (!urls || urls.length === 0) {
    return Response.json({ images: [] });
  }

  // 3) Combinar URLs + captions/alts
  const images = urls.map((url, i) => ({
    url,
    alt: concepts[i]?.title ?? `Ilustração ${i + 1}`,
    caption: concepts[i]?.caption ?? concepts[i]?.title,
  }));

  // 4) Salvar em lecture.summary.images via update direto
  const updatedSummary: LectureSummary = {
    ...lectureSummary,
    images,
  };
  await supabase
    .from("lectures")
    .update({ summary: updatedSummary })
    .eq("id", body.lectureId)
    .eq("user_id", user.id);

  return Response.json({ images });
}
