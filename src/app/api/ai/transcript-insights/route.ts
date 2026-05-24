/**
 * POST /api/ai/transcript-insights
 *
 * Extrai keyTerms (pontos-chave detectados) + topics (tópicos da aula) a partir
 * de uma transcrição corrente. Background, NÃO cobra coin. Roda Haiku.
 *
 * Body:  { transcript: string, durationSec?: number, lectureTitle?: string }
 * Resp:  { keyTerms: string[], topics: { title, startSec, color }[] }
 */

import Anthropic from "@anthropic-ai/sdk";
import { escapeForPrompt, logAndSanitize } from "@/lib/api-security";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TRANSCRIPT_CHARS = 12_000;
const COLORS = ["violet", "emerald", "amber", "rose"] as const;
type Color = (typeof COLORS)[number];

type Body = {
  transcript?: string;
  durationSec?: number;
  lectureTitle?: string;
};

type Topic = { title: string; startSec: number; color: Color };

function fallback(body: Body): { keyTerms: string[]; topics: Topic[] } {
  const t = (body.transcript ?? "").slice(0, 2000);
  const words = t
    .split(/[^\p{L}0-9]+/u)
    .filter((w) => w.length >= 6)
    .map((w) => w.toLowerCase());
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const keyTerms = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
  return { keyTerms, topics: [] };
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`transcript-insights:ip:${ip}`, 30, 60_000);
  if (ipLimit) return ipLimit;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const transcript = (body.transcript ?? "").trim();
  if (transcript.length < 80) {
    return Response.json({ keyTerms: [], topics: [] });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ...fallback(body), demo: true });
  }

  const sliced = transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  const durationSec = Number.isFinite(body.durationSec)
    ? Math.max(0, Math.round(body.durationSec ?? 0))
    : 0;

  const system = `Você analisa transcrições de aula universitária em português do Brasil e extrai:
- keyTerms: 6-10 termos/entidades-chave (conceitos, pessoas, fórmulas) citados. Cada item é uma string CURTA (1-3 palavras).
- topics: até 4 tópicos lógicos sequenciais que a aula cobriu. Para cada tópico, estime o startSec (em segundos a partir do início) com base na proporção do texto onde o tópico aparece.

Responda APENAS com JSON válido:
{
  "keyTerms": ["...", "..."],
  "topics": [ { "title": "...", "startSec": 0 } ]
}
Sem markdown, sem prosa.`;

  const userPrompt = `Aula: ${escapeForPrompt(body.lectureTitle ?? "Sem título")}
Duração até agora: ${durationSec} segundos.

<untrusted_transcript>
${escapeForPrompt(sliced)}
</untrusted_transcript>`;

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: userPrompt }],
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
      return Response.json({ ...fallback(body), demo: true });
    }
    const obj = parsed as { keyTerms?: unknown; topics?: unknown };
    const keyTerms = Array.isArray(obj.keyTerms)
      ? obj.keyTerms.filter((t): t is string => typeof t === "string" && t.length <= 60).slice(0, 10)
      : [];
    const topicsRaw = Array.isArray(obj.topics) ? obj.topics : [];
    const topics: Topic[] = topicsRaw
      .map((t, i): Topic | null => {
        if (!t || typeof t !== "object") return null;
        const o = t as Record<string, unknown>;
        const title = typeof o.title === "string" ? o.title.slice(0, 80) : "";
        const startSecRaw = Number(o.startSec);
        const startSec = Number.isFinite(startSecRaw) ? Math.max(0, startSecRaw) : 0;
        if (!title) return null;
        return { title, startSec, color: COLORS[i % COLORS.length] };
      })
      .filter((x): x is Topic => x !== null)
      .slice(0, 4);
    return Response.json({ keyTerms, topics });
  } catch (err) {
    const sanitized = logAndSanitize("api/ai/transcript-insights", err);
    return Response.json(
      { ...sanitized, ...fallback(body), demo: true },
      { status: 200 },
    );
  }
}
