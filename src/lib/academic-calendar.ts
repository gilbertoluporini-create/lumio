/**
 * Calendário acadêmico institucional — tipos e helpers compartilhados.
 *
 * Client-safe (sem next/headers, sem SDK) pra ser importável tanto no dialog
 * de upload quanto no endpoint de extração e no render do prompt da Lumi.
 *
 * Vive em `user_profiles.academic_calendar` (migration 056).
 */

import type { CalendarEventType } from "./calendar-events";

export type AcademicEventCategory =
  | "prova" // avaliações, exames finais, testes de progresso
  | "nota" // entrega/divulgação de notas
  | "prazo" // prazos de inscrição (PRA, prova de faltosos)
  | "feriado" // feriados nacionais/municipais
  | "recesso" // recesso acadêmico, férias
  | "marco" // início/término de semestre, aula inaugural
  | "evento"; // CONSU, COMAA, SEMICA, reuniões

export type AcademicEvent = {
  /** Data de início, ISO yyyy-mm-dd. */
  date: string;
  /** Data final quando o evento é um intervalo (ex: "22 a 26/06"). */
  endDate?: string | null;
  title: string;
  category: AcademicEventCategory;
  /** 1 = primeiro semestre, 2 = segundo. */
  semester?: number | null;
};

export type AcademicCalendar = {
  institution?: string | null;
  year?: number | null;
  sourceFile?: string | null;
  importedAt?: string | null;
  events: AcademicEvent[];
};

export const ACADEMIC_CATEGORY_META: Record<
  AcademicEventCategory,
  { label: string; eventType: CalendarEventType; tone: string }
> = {
  prova: { label: "Prova", eventType: "prova", tone: "text-red-500" },
  nota: { label: "Notas", eventType: "trabalho", tone: "text-amber-500" },
  prazo: { label: "Prazo", eventType: "trabalho", tone: "text-amber-500" },
  feriado: { label: "Feriado", eventType: "outro", tone: "text-emerald-500" },
  recesso: { label: "Recesso", eventType: "outro", tone: "text-emerald-500" },
  marco: { label: "Marco do semestre", eventType: "outro", tone: "text-primary" },
  evento: { label: "Evento", eventType: "outro", tone: "text-muted-foreground" },
};

const CATEGORIES = Object.keys(ACADEMIC_CATEGORY_META) as AcademicEventCategory[];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

/**
 * Normaliza o payload cru (vindo da IA ou do banco) descartando o que não
 * casa com o shape. Nunca lança — entrada suja vira lista vazia.
 */
export function normalizeAcademicEvents(raw: unknown): AcademicEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: AcademicEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!isIsoDate(o.date)) continue;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    const category = CATEGORIES.includes(o.category as AcademicEventCategory)
      ? (o.category as AcademicEventCategory)
      : "evento";
    const endDate = isIsoDate(o.endDate) ? o.endDate : null;
    const semRaw = typeof o.semester === "number" ? o.semester : Number(o.semester);
    const semester = semRaw === 1 || semRaw === 2 ? semRaw : null;
    out.push({
      date: o.date,
      endDate: endDate && endDate >= o.date ? endDate : null,
      title: title.slice(0, 160),
      category,
      semester,
    });
  }
  // Ordena cronologicamente e remove duplicatas exatas (data + título).
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((e) => {
      const k = `${e.date}|${e.title.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export function normalizeAcademicCalendar(raw: unknown): AcademicCalendar | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const events = normalizeAcademicEvents(o.events);
  if (events.length === 0) return null;
  const yearRaw = typeof o.year === "number" ? o.year : Number(o.year);
  return {
    institution:
      typeof o.institution === "string" ? o.institution.trim().slice(0, 160) : null,
    year: Number.isInteger(yearRaw) && yearRaw > 2000 && yearRaw < 2100 ? yearRaw : null,
    sourceFile:
      typeof o.sourceFile === "string" ? o.sourceFile.trim().slice(0, 200) : null,
    importedAt: typeof o.importedAt === "string" ? o.importedAt : null,
    events,
  };
}

function formatBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "10/06/2026" ou "22/06 a 26/06/2026" pra intervalos. */
export function formatEventDate(e: AcademicEvent): string {
  if (!e.endDate || e.endDate === e.date) return formatBr(e.date);
  const [, em, ed] = e.date.split("-");
  return `${ed}/${em} a ${formatBr(e.endDate)}`;
}

/* ---------------- janela letiva (para expansão das aulas) ---------------- */

export type TermWindow = { start: string; end: string };

const START_RE = /in[ií]cio\s+do\s+(semestre|per[ií]odo)\s+letivo/i;
const END_RE = /t[ée]rmino\s+do\s+(per[ií]odo|semestre)\s+letivo/i;

/**
 * Deriva as janelas letivas (início → término) a partir dos marcos do
 * calendário. Um calendário anual costuma render 2 janelas (1º e 2º semestre).
 *
 * Serve pra limitar a repetição das aulas da grade horária: sem isso, uma
 * aula de segunda 08:00 se repetiria infinitamente — inclusive em janeiro,
 * em julho e em 2030.
 */
export function getTermWindows(cal: AcademicCalendar | null): TermWindow[] {
  if (!cal || cal.events.length === 0) return [];
  const starts = cal.events
    .filter((e) => e.category === "marco" && START_RE.test(e.title))
    .map((e) => e.date)
    .sort();
  const ends = cal.events
    .filter((e) => e.category === "marco" && END_RE.test(e.title))
    .map((e) => e.endDate ?? e.date)
    .sort();
  if (starts.length === 0 || ends.length === 0) return [];

  const windows: TermWindow[] = [];
  for (const start of starts) {
    // Casa cada início com o primeiro término que vem depois dele.
    const end = ends.find((d) => d > start);
    if (end) windows.push({ start, end });
  }
  return windows;
}

/**
 * Dias em que NÃO há aula: feriados e recessos (intervalos expandidos dia a
 * dia). Set de "yyyy-mm-dd" pra lookup O(1) na expansão.
 */
export function getNonTeachingDays(cal: AcademicCalendar | null): Set<string> {
  const out = new Set<string>();
  if (!cal) return out;
  for (const e of cal.events) {
    if (e.category !== "feriado" && e.category !== "recesso") continue;
    const cursor = new Date(`${e.date}T00:00:00`);
    const last = new Date(`${e.endDate ?? e.date}T00:00:00`);
    // Guarda contra intervalo absurdo vindo de extração ruim.
    let guard = 0;
    while (cursor.getTime() <= last.getTime() && guard < 400) {
      out.add(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }
  return out;
}

/** A data cai dentro de alguma janela letiva? Sem janelas → sem restrição. */
export function isWithinTerm(iso: string, windows: TermWindow[]): boolean {
  if (windows.length === 0) return true;
  return windows.some((w) => iso >= w.start && iso <= w.end);
}

/**
 * Renderiza o calendário pro system prompt do agente Lumi — só o que é
 * acionável: o que está por vir na janela informada. Retorna null se não
 * houver nada relevante (evita queimar tokens com calendário vencido).
 */
export function renderAcademicCalendarForPrompt(
  cal: AcademicCalendar | null,
  opts: { today?: Date; horizonDays?: number; max?: number } = {},
): string | null {
  if (!cal || cal.events.length === 0) return null;
  const today = opts.today ?? new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + (opts.horizonDays ?? 120));
  const horizonIso = horizon.toISOString().slice(0, 10);

  const upcoming = cal.events
    // Um intervalo em curso (recesso que começou ontem) ainda importa.
    .filter((e) => (e.endDate ?? e.date) >= todayIso && e.date <= horizonIso)
    .slice(0, opts.max ?? 25);
  if (upcoming.length === 0) return null;

  const lines = upcoming.map(
    (e) =>
      `- ${formatEventDate(e)}: ${e.title} [${ACADEMIC_CATEGORY_META[e.category].label}]`,
  );
  const header = cal.institution
    ? `CALENDÁRIO ACADÊMICO OFICIAL (${cal.institution}${cal.year ? `, ${cal.year}` : ""}) — próximas datas:`
    : "CALENDÁRIO ACADÊMICO OFICIAL — próximas datas:";
  return `${header}\n${lines.join("\n")}\nUse essas datas pra planejar estudo, avisar de prazos e evitar sugerir estudo em recesso/feriado.`;
}
