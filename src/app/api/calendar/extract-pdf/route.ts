import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { logAndSanitize, escapeForPrompt } from "@/lib/api-security";
import { getClientIp, limitOrThrow } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ---------------- types ---------------- */

type ExtractedEventType = "prova" | "trabalho" | "aula" | "bloco" | "outro";

type ExtractedEvent = {
  date: string; // "YYYY-MM-DD"
  title: string;
  type: ExtractedEventType;
  startTime?: string; // "HH:MM"
  endTime?: string; // "HH:MM"
  subjectGuess?: string;
  description?: string;
};

const VALID_TYPES: ReadonlySet<ExtractedEventType> = new Set([
  "prova",
  "trabalho",
  "aula",
  "bloco",
  "outro",
]);

const MAX_TEXT_BYTES = 200_000; // ~200KB de texto bruto bem mais que suficiente
const MAX_EVENTS = 80;
const TEXT_SLICE_LIMIT = 30_000; // o que efetivamente vai pro prompt

/* ---------------- validation helpers ---------------- */

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);
}

function normalizeType(raw: unknown): ExtractedEventType {
  if (typeof raw === "string") {
    const lower = raw.toLowerCase().trim();
    if (VALID_TYPES.has(lower as ExtractedEventType)) {
      return lower as ExtractedEventType;
    }
  }
  return "outro";
}

function normalizeEvent(raw: unknown): ExtractedEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isValidDate(o.date)) return null;
  const title =
    typeof o.title === "string" && o.title.trim().length > 0
      ? o.title.trim().slice(0, 200)
      : null;
  if (!title) return null;

  const ev: ExtractedEvent = {
    date: o.date,
    title,
    type: normalizeType(o.type),
  };
  if (isValidTime(o.startTime)) ev.startTime = o.startTime;
  if (isValidTime(o.endTime)) ev.endTime = o.endTime;
  if (
    typeof o.subjectGuess === "string" &&
    o.subjectGuess.trim().length > 0
  ) {
    ev.subjectGuess = o.subjectGuess.trim().slice(0, 120);
  }
  if (typeof o.description === "string" && o.description.trim().length > 0) {
    ev.description = o.description.trim().slice(0, 400);
  }
  return ev;
}

function normalizeEvents(raw: unknown): ExtractedEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtractedEvent[] = [];
  for (const item of raw) {
    const ev = normalizeEvent(item);
    if (ev) out.push(ev);
    if (out.length >= MAX_EVENTS) break;
  }
  return out;
}

function tryParseJson(text: string): { events: ExtractedEvent[] } | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { events?: unknown };
    return { events: normalizeEvents(parsed?.events) };
  } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { events?: unknown };
      return { events: normalizeEvents(parsed?.events) };
    } catch {}
  }
  return null;
}

/* ---------------- prompt ---------------- */

function buildSystemPrompt(currentYear: number): string {
  return `Você extrai datas de provas, trabalhos e entregas de calendários acadêmicos brasileiros (texto extraído de PDF).

REGRAS DE EXTRAÇÃO:
- Identifique APENAS eventos com data clara (dia + mês). Se o ano não estiver explícito, assuma ${currentYear} (ou ${currentYear + 1} se a data já passou neste ano).
- Não invente eventos. Não duplique.
- Foque em: provas, P1/P2/P3, avaliações, exames, simulados, entregas de trabalho/relatório/projeto, apresentações, seminários, prazos.
- Ignore: aulas regulares recorrentes (que já estão na grade), feriados, recessos, semanas de aula sem data específica.

CLASSIFICAÇÃO DE TIPO:
- "prova": provas, avaliações, simulados, exames, P1/P2/P3, NP1/NP2, sub.
- "trabalho": entrega de trabalho, relatório, projeto, TCC, monografia, seminário, apresentação.
- "aula": aulas pontuais marcadas com data (raro neste contexto).
- "bloco": blocos/sessões de estudo (raro neste contexto).
- "outro": qualquer evento acadêmico fora das categorias acima.

CAMPOS:
- date: ISO YYYY-MM-DD obrigatório.
- title: nome curto e claro (ex: "P1 de Anatomia", "Entrega do relatório de Bioquímica").
- type: uma das 5 categorias acima.
- startTime / endTime: "HH:MM" em 24h. Omita se não houver horário.
- subjectGuess: nome da matéria que melhor casa com a lista fornecida pelo usuário. Use exatamente um nome da lista quando possível; senão, omita.
- description: contexto adicional curto (sala, conteúdo cobrado, observações). Se a data tem dúvida, mencione brevemente aqui.

FORMATO DE SAÍDA (JSON puro, sem markdown, sem comentários, sem texto extra):
{
  "events": [
    {
      "date": "2026-06-15",
      "title": "P1 de Anatomia",
      "type": "prova",
      "startTime": "08:00",
      "endTime": "10:00",
      "subjectGuess": "Anatomia Humana I",
      "description": "Conteúdo: sistema esquelético e articular."
    }
  ]
}

Se não conseguir identificar nenhum evento, retorne {"events":[]}.`;
}

/* ---------------- route ---------------- */

export async function POST(req: Request) {
  // Rate limit por IP
  const ip = getClientIp(req);
  const ipLimit = limitOrThrow(`calendar:extract-pdf:ip:${ip}`, 10, 60_000);
  if (ipLimit) return ipLimit;

  let body: { text?: unknown; subjectNames?: unknown };
  try {
    body = (await req.json()) as { text?: unknown; subjectNames?: unknown };
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const subjectNames: string[] = Array.isArray(body.subjectNames)
    ? body.subjectNames
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, 60)
    : [];

  if (text.length < 50) {
    return Response.json(
      { error: "PDF vazio ou com texto insuficiente." },
      { status: 400 },
    );
  }
  if (text.length > MAX_TEXT_BYTES) {
    return Response.json(
      { error: "PDF grande demais. Envie só as páginas do calendário." },
      { status: 413 },
    );
  }

  // Auth opcional (mesmo padrão do extract-slides): só exige login se Supabase
  // estiver configurado. Em dev sem env, segue sem auth pra facilitar teste.
  const supabaseEnabled = !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (supabaseEnabled) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return Response.json({ error: "Faça login." }, { status: 401 });
      }
      const userLimit = limitOrThrow(
        `calendar:extract-pdf:user:${user.id}`,
        15,
        60_000,
      );
      if (userLimit) return userLimit;
    } catch (err) {
      console.error("[calendar/extract-pdf] auth check failed", err);
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Demo fallback: sem chave, devolve eventos fictícios pra UI dev poder testar.
  if (!apiKey) {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const inDays = (n: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d;
    };
    return Response.json({
      demo: true,
      events: [
        {
          date: fmt(inDays(7)),
          title: "P1 de Anatomia (DEMO)",
          type: "prova",
          startTime: "08:00",
          endTime: "10:00",
          subjectGuess: subjectNames[0],
          description:
            "Modo demo: configure ANTHROPIC_API_KEY pra extração real.",
        },
        {
          date: fmt(inDays(14)),
          title: "Entrega trabalho Bioquímica (DEMO)",
          type: "trabalho",
          subjectGuess: subjectNames[1],
        },
      ] satisfies ExtractedEvent[],
    });
  }

  const client = new Anthropic({ apiKey });
  const currentYear = new Date().getFullYear();
  const sliced = text.slice(0, TEXT_SLICE_LIMIT);
  const subjectList =
    subjectNames.length > 0 ? subjectNames.join(", ") : "(nenhuma)";

  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text: buildSystemPrompt(currentYear),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Matérias existentes do usuário: ${escapeForPrompt(subjectList)}\n\nTexto do calendário acadêmico:\n\n<calendar>\n${escapeForPrompt(sliced)}\n</calendar>\n\nExtraia os eventos e responda APENAS com o JSON.`,
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = tryParseJson(raw);

    if (!parsed) {
      return Response.json(
        {
          events: [],
          error:
            "Não consegui identificar eventos no PDF. Tente outro arquivo ou adicione manualmente.",
        },
        { status: 200 },
      );
    }

    return Response.json({ events: parsed.events });
  } catch (err) {
    return Response.json(
      logAndSanitize("api/calendar/extract-pdf", err),
      { status: 500 },
    );
  }
}
