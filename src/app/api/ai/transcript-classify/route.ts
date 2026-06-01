/**
 * POST /api/ai/transcript-classify
 *
 * Classifica entries de transcrição em concept | doubt | example | none.
 * Background, NÃO cobra coin. Roda Haiku.
 *
 * Body:  { entries: { id: string, text: string }[] }
 * Resp:  { classifications: { id: string, marker: "concept"|"doubt"|"example"|null }[] }
 *
 * Fallback (sem ANTHROPIC_API_KEY): heurística por palavras-chave.
 */

import { createMessage } from "@/lib/llm-fallback";
import { logAndSanitize } from "@/lib/api-security";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_ENTRIES = 20;
const MAX_TEXT_CHARS = 600;

type EntryIn = { id: string; text: string };
type Marker = "concept" | "doubt" | "example" | null;
type Classification = { id: string; marker: Marker };

function heuristic(entries: EntryIn[]): Classification[] {
  return entries.map((e) => {
    const t = e.text.toLowerCase();
    let m: Marker = null;
    if (/\?|como assim|não entendi|dúvida|por que|por quê|pq /.test(t)) m = "doubt";
    else if (/por exemplo|exemplo|veja|imagine|caso clínico|caso prático/.test(t))
      m = "example";
    else if (
      /é definido|chamamos|conceito|princípio|teorema|lei de|fórmula|característica/.test(
        t,
      )
    )
      m = "concept";
    return { id: e.id, marker: m };
  });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`transcript-classify:ip:${ip}`, 60, 60_000);
  if (ipLimit) return ipLimit;

  let body: { entries?: EntryIn[] };
  try {
    body = (await req.json()) as { entries?: EntryIn[] };
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const raw = Array.isArray(body.entries) ? body.entries : [];
  const entries: EntryIn[] = raw
    .filter(
      (e): e is EntryIn =>
        !!e && typeof e.id === "string" && typeof e.text === "string",
    )
    .slice(-MAX_ENTRIES)
    .map((e) => ({ id: e.id, text: e.text.slice(0, MAX_TEXT_CHARS) }));

  if (entries.length === 0) {
    return Response.json({ classifications: [] });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ classifications: heuristic(entries), demo: true });
  }

  const system = `Você é um classificador de trechos de transcrição de aula. Para cada trecho, escolha UM rótulo:
- "concept": apresentação de um conceito-chave, definição, princípio ou teoria.
- "doubt": pergunta do aluno ou momento de dúvida ("não entendi", "como assim?", "?").
- "example": exemplo prático, caso clínico, analogia ou ilustração.
- null: nenhum dos acima (transição, intro, repetição, fala fora de contexto).

Responda APENAS com JSON válido no formato:
{ "classifications": [ { "id": "<id>", "marker": "concept"|"doubt"|"example"|null } ] }
Sem markdown, sem prosa.`;

  const userMessage = JSON.stringify({
    entries: entries.map((e) => ({ id: e.id, text: e.text })),
  });

  try {
    const resp = await createMessage({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = resp.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text.trim() : "";
    let parsed: unknown;
    try {
      const jsonText = text
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
      parsed = JSON.parse(jsonText);
    } catch {
      return Response.json({ classifications: heuristic(entries), demo: true });
    }
    const obj = parsed as { classifications?: unknown };
    const list = Array.isArray(obj.classifications) ? obj.classifications : [];
    const validIds = new Set(entries.map((e) => e.id));
    const normalized: Classification[] = list
      .map((c): Classification | null => {
        if (!c || typeof c !== "object") return null;
        const o = c as Record<string, unknown>;
        if (typeof o.id !== "string" || !validIds.has(o.id)) return null;
        const m = o.marker;
        if (m === "concept" || m === "doubt" || m === "example") {
          return { id: o.id, marker: m };
        }
        return { id: o.id, marker: null };
      })
      .filter((x): x is Classification => x !== null);
    return Response.json({ classifications: normalized });
  } catch (err) {
    const sanitized = logAndSanitize("api/ai/transcript-classify", err);
    return Response.json(
      { ...sanitized, classifications: heuristic(entries), demo: true },
      { status: 200 },
    );
  }
}
