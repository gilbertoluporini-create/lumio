import { createMessage } from "@/lib/llm-fallback";
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
const CHUNK_SIZE = 30_000; // quanto de texto cabe em UMA chamada da IA
const CHUNK_OVERLAP = 2_000; // sobreposição pra não cortar um evento no meio
const CHUNK_BUDGET_MS = 50_000; // prazo dos blocos, com folga sob o maxDuration=60

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

/**
 * MOTIVO: antes a rota mandava pra IA só `text.slice(0, 30_000)`. Um plano de
 * ensino / cronograma de 15-40 páginas rende 45-120KB de texto, ou seja: tudo
 * depois de ~10 páginas (P2, exames finais, entregas de nov/dez) sumia SEM UMA
 * PALAVRA na tela — o preview listava só as primeiras provas, o aluno conferia
 * linha a linha, adicionava, e descobria o resto no dia da prova. Agora o texto
 * INTEIRO é fatiado em blocos (com sobreposição, pra não partir um evento no
 * meio) e cada bloco vai pra IA; o merge abaixo tira as duplicatas da emenda.
 *
 * MOTIVO 2: o corte era por OFFSET DE CARACTERE seco, então a emenda caía no
 * MEIO de uma linha datada — a IA lia "P2 de Farmaco" (linha truncada no fim do
 * bloco N) e "P2 de Farmacologia" (linha inteira no bloco N+1) e devolvia dois
 * títulos diferentes pro MESMO evento, que o dedup exato não casava. Agora as
 * bordas são empurradas pra quebra de linha: nenhuma linha chega pela metade. A
 * sobra que o snap do fim descarta já está inteira dentro dos 2.000 chars de
 * sobreposição do bloco seguinte, então nada se perde. Texto sem \n nenhum
 * (extração que vem em bloco único) volta ao comportamento antigo.
 */
function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  for (let start = 0; start < text.length; start += step) {
    const last = start + CHUNK_SIZE >= text.length;
    const nlStart = start === 0 ? -1 : text.indexOf("\n", start);
    const from =
      nlStart >= 0 && nlStart < start + CHUNK_SIZE ? nlStart + 1 : start;
    const nlEnd = text.lastIndexOf("\n", start + CHUNK_SIZE);
    const to = last || nlEnd <= from ? start + CHUNK_SIZE : nlEnd;
    if (to > from) chunks.push(text.slice(from, to));
    if (last) break;
  }
  return chunks;
}

const TITLE_STOP_WORDS = new Set([
  "de",
  "do",
  "da",
  "dos",
  "das",
  "e",
  "em",
  "no",
  "na",
]);

/** Palavras do título sem acento/pontuação/conectivo, pra comparar redações. */
function titleWords(title: string): Set<string> {
  return new Set(
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 0 && !TITLE_STOP_WORDS.has(w)),
  );
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const w of a) if (!b.has(w)) return false;
  return true;
}

/**
 * MOTIVO: a chave `date|title` EXATA não pegava a duplicata da emenda. O SYSTEM
 * prompt manda a IA REESCREVER a linha ("nome curto e claro") e cada bloco é uma
 * chamada independente, sem temperature fixa: a MESMA prova volta "P1 de
 * Anatomia" de um bloco e "Prova P1 - Anatomia" do outro. As duas passavam pro
 * preview marcadas, as duas eram gravadas (o cliente só compara com a agenda JÁ
 * salva, não dentro do lote) e o aluno ficava com dois chips idênticos no mesmo
 * dia — no mês, em duas colunas na semana, na agenda e na sidebar — pra apagar
 * um a um pelo modal de detalhes. Agora, além da chave exata, eventos do MESMO
 * dia vindos de BLOCOS DIFERENTES caem fora quando as palavras de um título
 * cabem dentro do outro. Dentro do MESMO bloco nada é fundido: lá o prompt já
 * proíbe duplicar e duas provas parecidas no mesmo dia são de verdade.
 */
function mergeEvents(lists: ExtractedEvent[][]): ExtractedEvent[] {
  const seen = new Set<string>();
  const kept: { ev: ExtractedEvent; chunk: number; words: Set<string> }[] = [];
  for (let i = 0; i < lists.length; i++) {
    for (const ev of lists[i]) {
      const key = `${ev.date}|${ev.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      const words = titleWords(ev.title);
      const overlapDup =
        words.size > 0 &&
        kept.some(
          (k) =>
            k.chunk !== i &&
            k.ev.date === ev.date &&
            k.words.size > 0 &&
            (isSubset(words, k.words) || isSubset(k.words, words)),
        );
      if (overlapDup) continue;
      seen.add(key);
      kept.push({ ev, chunk: i, words });
      if (kept.length >= MAX_EVENTS) break;
    }
    if (kept.length >= MAX_EVENTS) break;
  }
  return kept.map((k) => k.ev);
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

  const currentYear = new Date().getFullYear();
  const chunks = splitIntoChunks(text);
  const subjectList =
    subjectNames.length > 0 ? subjectNames.join(", ") : "(nenhuma)";

  const extractChunk = async (chunk: string) => {
    const resp = await createMessage({
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
          content: `Matérias existentes do usuário: ${escapeForPrompt(subjectList)}\n\nTexto do calendário acadêmico:\n\n<calendar>\n${escapeForPrompt(chunk)}\n</calendar>\n\nExtraia os eventos e responda APENAS com o JSON.`,
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    return tryParseJson(raw);
  };

  // MOTIVO: era `Promise.all(chunks.map(extractChunk))` seco. Com 6-8 blocos
  // paralelos sob maxDuration=60, bastava UM estourar o tempo ou falhar na
  // Anthropic E no fallback pra requisição inteira morrer: 500 (ou 504 com corpo
  // HTML, que no cliente vira `{}` e "Falha ao extrair eventos.") e ZERO eventos
  // — inclusive os 7 blocos que leram perfeitamente e já foram pagos, com o
  // aluno refazendo tudo e queimando mais um dos 10 req/60s por IP. Agora cada
  // bloco falha SOZINHO (vira null) e todos correm contra um prazo dentro do
  // teto da plataforma: volta o que deu pra ler em vez de nada.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CHUNK_BUDGET_MS);
  });

  try {
    const parsed = await Promise.all(
      chunks.map((chunk) =>
        Promise.race([
          extractChunk(chunk).catch((err) => {
            console.error("[calendar/extract-pdf] bloco falhou", err);
            return null;
          }),
          deadline,
        ]),
      ),
    );

    // Só é "não consegui identificar" se NENHUM bloco voltou JSON válido.
    if (parsed.every((p) => p === null)) {
      return Response.json(
        {
          events: [],
          error:
            "Não consegui identificar eventos no PDF. Tente outro arquivo ou adicione manualmente.",
        },
        { status: 200 },
      );
    }

    return Response.json({
      events: mergeEvents(parsed.map((p) => p?.events ?? [])),
      // Bloco que caiu/estourou não pode sumir calado: com `partial` o cliente
      // pode avisar que parte do documento não foi lida (hoje ele ignora o
      // campo, mas assim a informação existe em vez de se perder na rota).
      partial: parsed.some((p) => p === null),
    });
  } catch (err) {
    return Response.json(
      logAndSanitize("api/calendar/extract-pdf", err),
      { status: 500 },
    );
  } finally {
    clearTimeout(timer);
  }
}
