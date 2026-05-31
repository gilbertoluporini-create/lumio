/**
 * POST /api/study-plans/suggest-topics
 *
 * Recebe uma lista de fontes (PDFs e aulas gravadas) e devolve uma sugestão
 * de agrupamento em tópicos baseado em similaridade de título.
 *
 * Usado pelo botão "Lumi organiza pra mim" no passo 3 do wizard de plano.
 * O user vê os tópicos sugeridos, aceita/edita, e prossegue.
 *
 * Modelo: Claude Haiku 4.5 (rápido + barato — tarefa de classificação
 * por similaridade, não precisa de Sonnet). Não cobra coins (é só
 * heurística de organização, não geração de conteúdo).
 *
 * Body: {
 *   sources: [{ kind: "doc"|"lec", id: string, title: string }]
 * }
 *
 * Response: {
 *   topics: [{ title: string, sourceIds: [{ kind, id }] }]
 * }
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createMessage } from "@/lib/llm-fallback";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SourceInput = { kind: "doc" | "lec"; id: string; title: string };
type TopicSuggestion = {
  title: string;
  sourceIds: Array<{ kind: "doc" | "lec"; id: string }>;
};

const SUGGEST_MODEL = "claude-haiku-4-5";

function buildPrompt(sources: SourceInput[]): string {
  const list = sources
    .map(
      (s, i) =>
        `[${i + 1}] kind=${s.kind === "doc" ? "PDF" : "AULA"} id=${s.id} título="${s.title}"`,
    )
    .join("\n");

  return `Você recebe ${sources.length} fontes de material acadêmico (PDFs e/ou aulas gravadas) de um aluno de medicina. Agrupe em TÓPICOS baseado em similaridade de tema/título.

Regras:
- 1 PDF + 1 aula sobre o MESMO tema → mesmo tópico
- Materiais sobre temas distintos → tópicos separados
- Quando ficar incerto, prefere SEPARAR (tópicos próprios)
- Título do tópico deve ser CURTO (3-6 palavras), descritivo do tema central
- Use as IDs exatas que recebeu — não invente

Fontes:
${list}

Responda APENAS com JSON válido, sem texto antes/depois, sem cercas \`\`\`. Formato:
{
  "topics": [
    { "title": "Hormônios sexuais", "sourceIds": [{"kind":"doc","id":"<uuid>"}, {"kind":"lec","id":"<uuid>"}] },
    { "title": "Tireóide", "sourceIds": [{"kind":"doc","id":"<uuid>"}] }
  ]
}

Cobertura: TODAS as fontes recebidas devem aparecer em algum tópico. Não duplique IDs entre tópicos.`;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = limitOrThrow(`suggest-topics:ip:${ip}`, 20, 60_000);
  if (limited) return limited;

  let body: { sources?: SourceInput[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const sources = Array.isArray(body.sources) ? body.sources : [];
  if (sources.length < 2) {
    return NextResponse.json(
      { error: "Precisa de pelo menos 2 fontes pra agrupar." },
      { status: 400 },
    );
  }
  if (sources.length > 30) {
    return NextResponse.json(
      { error: "Máximo 30 fontes por sugestão." },
      { status: 400 },
    );
  }
  for (const s of sources) {
    if (
      !s ||
      (s.kind !== "doc" && s.kind !== "lec") ||
      typeof s.id !== "string" ||
      typeof s.title !== "string"
    ) {
      return NextResponse.json(
        { error: "Source mal formada — esperado {kind, id, title}." },
        { status: 400 },
      );
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }

  let rawText = "";
  try {
    const resp = await createMessage({
      model: SUGGEST_MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: buildPrompt(sources) }],
    });
    const block = resp.content.find((b) => b.type === "text");
    rawText = block && block.type === "text" ? block.text : "";
  } catch (err) {
    console.error("[suggest-topics] LLM failed", err);
    return NextResponse.json(
      {
        error: `LLM error: ${(err as Error).message ?? "unknown"}`,
        // Fallback amigável: 1 tópico por source com o título original
        fallback: {
          topics: sources.map((s) => ({
            title: s.title,
            sourceIds: [{ kind: s.kind, id: s.id }],
          })),
        },
      },
      { status: 502 },
    );
  }

  // Tenta extrair JSON (LLM às vezes vem com markdown apesar do prompt)
  const cleanedText = rawText
    .replace(/```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: { topics?: TopicSuggestion[] } | null = null;
  try {
    parsed = JSON.parse(cleanedText) as { topics?: TopicSuggestion[] };
  } catch {
    return NextResponse.json(
      {
        error: "LLM respondeu em formato inválido.",
        fallback: {
          topics: sources.map((s) => ({
            title: s.title,
            sourceIds: [{ kind: s.kind, id: s.id }],
          })),
        },
      },
      { status: 502 },
    );
  }

  const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
  // Valida: cada sourceId precisa estar na lista original (LLM pode alucinar)
  const validIds = new Set(sources.map((s) => `${s.kind}:${s.id}`));
  const sanitized: TopicSuggestion[] = [];
  const seenIds = new Set<string>();
  for (const t of topics) {
    if (!t || typeof t.title !== "string" || !Array.isArray(t.sourceIds)) {
      continue;
    }
    const filtered = t.sourceIds.filter((s) => {
      if (!s || (s.kind !== "doc" && s.kind !== "lec")) return false;
      const key = `${s.kind}:${s.id}`;
      if (!validIds.has(key)) return false;
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });
    if (filtered.length === 0) continue;
    sanitized.push({
      title: t.title.trim().slice(0, 80) || "Tópico",
      sourceIds: filtered,
    });
  }

  // Adiciona como tópicos individuais quaisquer sources que o LLM esqueceu
  for (const s of sources) {
    const key = `${s.kind}:${s.id}`;
    if (seenIds.has(key)) continue;
    sanitized.push({
      title: s.title,
      sourceIds: [{ kind: s.kind, id: s.id }],
    });
    seenIds.add(key);
  }

  return NextResponse.json({ topics: sanitized });
}
