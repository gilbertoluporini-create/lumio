"use client";
import { LumiPic } from "@/components/brand/lumi";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarDays,
  Code,
  Dna,
  Dumbbell,
  Filter,
  FileText,
  FlaskConical,
  Gavel,
  GraduationCap,
  Globe,
  HeartPulse,
  Languages,
  Landmark,
  Leaf,
  Library,
  Lightbulb,
  Loader2,
  MapPin,
  Mic,
  Microscope,
  Music,
  Palette,
  Pill,
  Plus,
  Scale,
  Sigma,
  Sparkles,
  Stethoscope,
  Syringe,
  Tag,
  Upload,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EventFormDialog } from "@/components/calendar/event-form-dialog";
import {
  EventDetailsDialog,
  type DetailsEvent,
} from "@/components/calendar/event-details-dialog";
import { ExamPdfUpload } from "@/components/calendar/exam-pdf-upload";
import { SchedulePdfUpload } from "@/components/calendar/schedule-pdf-upload";
import { AcademicCalendarUpload } from "@/components/calendar/academic-calendar-upload";
import {
  describeTermGap,
  getNonTeachingDays,
  getTermWindows,
  isWithinTerm,
  normalizeAcademicCalendar,
  toLocalIso,
  type AcademicCalendar,
  type TermWindow,
} from "@/lib/academic-calendar";
import { listSubjectsStrictAsync } from "@/lib/db";
import {
  EVENT_TYPE_META,
  listEventsAsync,
  type CalendarEvent,
  type CalendarEventType,
} from "@/lib/calendar-events";
import {
  DAY_LABELS_LONG,
  type Subject,
  type User,
} from "@/lib/types";
import { getThemeFromGradient } from "@/lib/subject-color";
import { cn } from "@/lib/utils";

export default function SchedulePage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <ScheduleView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

/* ---------------- helpers ---------------- */

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Hora vem do tique da página; sem isso a saudação congela na hora do último
 *  render (aba aberta a noite toda continua dando "Boa tarde"). */
function greetingPrefix(h: number): string {
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const MONTHS_LONG = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAY_HEADERS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDateLabel(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
}

function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function weekdayLabel(date: Date): string {
  const dow = date.getDay();
  if (dow === 0) return "Domingo";
  if (dow === 6) return "Sábado";
  return `${DAY_LABELS_LONG[dow]}-feira`;
}

/** `today` (00:00 local) vem de fora: chamar new Date() aqui prenderia o rótulo
 *  no dia em que a página renderizou pela última vez. */
function dayHeaderLabel(date: Date, today: Date): string {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Amanhã";
  if (diffDays === -1) return "Ontem";
  return weekdayLabel(date);
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay()); // Dom = 0
  return out;
}

/**
 * Âncora de semana pra um mês: a primeira semana cujo MIOLO (quarta) cai no
 * mês. Sem isso, pular pra agosto podia parar numa semana que começa em 26/07
 * e o rótulo continuaria dizendo "Julho".
 */
function weekAnchorForMonth(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  first.setHours(0, 0, 0, 0);
  const normalized = first.getMonth(); // aceita month = -1 ou 12 (virada de ano)
  const mid = startOfWeek(first);
  mid.setDate(mid.getDate() + 3);
  if (mid.getMonth() === normalized) return first;
  const next = new Date(first);
  next.setDate(next.getDate() + 7);
  return next;
}

/**
 * Mesma ideia do `describeTermGap`, mas pra JANELA DE 7 DIAS. A versão do lib
 * decide por MÊS: numa semana inteira fora do período letivo que caia num mês
 * que só encosta na janela (01–07/02 com semestre começando em 09/02) ela
 * enxerga sobreposição e devolve null — a grade da semana ficava vazia e sem
 * nenhuma explicação. Acontece toda virada de semestre.
 */
function describeWeekGap(
  days: Date[],
  windows: TermWindow[],
): { title: string; detail: string } | null {
  if (windows.length === 0 || days.length === 0) return null;
  const first = toLocalIso(days[0]);
  const last = toLocalIso(days[days.length - 1]);
  if (windows.some((w) => w.start <= last && w.end >= first)) return null;

  const next = windows
    .map((w) => w.start)
    .filter((s) => s > last)
    .sort()[0];
  const prevEnd = windows
    .map((w) => w.end)
    .filter((e) => e < first)
    .sort()
    .pop();
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };

  if (next) {
    return {
      title: "Fora do período letivo",
      detail: prevEnd
        ? `O semestre terminou em ${fmt(prevEnd)} e o próximo começa em ${fmt(next)}. Suas aulas voltam a aparecer a partir dessa data.`
        : `O semestre começa em ${fmt(next)}. Suas aulas aparecem a partir dessa data.`,
    };
  }
  return {
    title: "Fora do período letivo",
    detail: prevEnd
      ? `O período letivo terminou em ${fmt(prevEnd)}. Suba o calendário do próximo ano pra ver as aulas seguintes.`
      : "Esta semana está fora do período letivo do calendário que você importou.",
  };
}

/**
 * Rótulo do dia NÃO LETIVO (feriado/recesso do calendário acadêmico), dia a dia.
 *
 * O `getNonTeachingDays` do lib devolve só um Set de datas — ele APAGA a aula da
 * grade e não sobra nada na tela dizendo por quê. Dava o pior vazio possível: o
 * aluno sobe um calendário anual com "Recesso de meio de ano 01/07 a 31/07" e
 * julho inteiro fica com ZERO aula, ZERO banner e ZERO marcador, porque a
 * janela letiva [05/02, 15/12] cobre julho e tanto o `describeTermGap` (mês)
 * quanto o `temAula` (semana) devolvem null. Pior ainda: feriado e recesso vêm
 * DESMARCADOS por padrão no importador (só prova/nota/prazo/marco entram na
 * agenda), então nem chip de evento existe pra explicar — mas o calendário
 * INTEIRO vai pro perfil e alimenta o `getNonTeachingDays`. Ou seja: o dia
 * some da grade mesmo quando o aluno nunca pediu o evento na agenda.
 * Preservando o TÍTULO do evento aqui, cada dia suprimido consegue se explicar
 * na própria célula ("Recesso acadêmico - Carnaval"), em vez de virar o "vazio
 * e mudo parece bug" que faz o aluno subir a grade de novo (e duplicar tudo).
 *
 * Mesma expansão do lib (intervalo dia a dia, data LOCAL, guarda de 400) —
 * aqui o valor é o título, não só a presença da data.
 */
function buildNonTeachingLabels(
  cal: AcademicCalendar | null,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!cal) return out;
  for (const e of cal.events) {
    if (e.category !== "feriado" && e.category !== "recesso") continue;
    const cursor = new Date(`${e.date}T00:00:00`);
    const last = new Date(`${e.endDate ?? e.date}T00:00:00`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) continue;
    let guard = 0;
    while (cursor.getTime() <= last.getTime() && guard < 400) {
      const iso = toLocalIso(cursor);
      // Primeiro evento do dia manda: dois recessos sobrepostos não viram um
      // rótulo concatenado ilegível dentro de uma célula de ~26px.
      if (!out.has(iso)) out.set(iso, e.title);
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }
  return out;
}

/**
 * Marcador local de "este aluno JÁ teve calendário acadêmico salvo no perfil".
 * Quem ESCREVE é o importador (academic-calendar-upload.tsx, mesma chave); aqui
 * a leitura serve só pra desambiguar a resposta 200 {"profile":null}, que a
 * rota devolve tanto pra aluno sem perfil quanto pra SELECT que falhou
 * (getUserProfileAsync loga o erro e retorna null). Vale só neste dispositivo —
 * é o que dá pra fazer do cliente enquanto a rota não separa os dois casos.
 */
function hasSavedAcademicCalendarLocally(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage.getItem(
      `lumio.academic-calendar.saved.${userId}`,
    );
  } catch {
    return false;
  }
}

function getSubjectIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/cardio|cora[cç][aã]o|cardiovasc|circulat|hemato|vascul/.test(n)) return HeartPulse;
  if (/respirat|pulm[aã]o|pulmonar|pneumo/.test(n)) return Wind;
  if (/endo|horm[oô]n|metabol|diabet/.test(n)) return Pill;
  if (/farmaco|medicament|terap[eê]utic|vacin/.test(n)) return Syringe;
  if (/anatomia|sistema\s+nerv|c[eé]rebro|neuro|psiqui|psicolog/.test(n)) return Brain;
  if (/habilidad|cl[ií]nic|semiolog|propedeu/.test(n)) return Stethoscope;
  if (/aten[cç][aã]o\s*prim|aps|sa[uú]de\s+coletiva|sa[uú]de\s+p[uú]blica|epidemio/.test(n)) return Activity;
  if (/pesquisa|inova[cç][aã]o|metodol|tcc|tese|monografia/.test(n)) return Microscope;
  if (/reuni[aã]o|integ|tutor|grupo|tbl|pbl/.test(n)) return Users;
  if (/gen[eé]tic|dna|cromoss/.test(n)) return Dna;
  if (/bioqu[ií]m|qu[ií]mic/.test(n)) return FlaskConical;
  if (/f[ií]sic|mec[aâ]nic\s+(quant|cl[aá]ss)/.test(n)) return Atom;
  if (/biolog|bases\s+biol|histol|embriol|ecolog|botan|zoolog/.test(n)) return Leaf;
  if (/c[aá]lculo|matem[aá]tic|alg[eé]bra|geometria/.test(n)) return Calculator;
  if (/estat[ií]stic|probabilidad/.test(n)) return Sigma;
  if (/direito|civil|penal|constituci|tribut|processual|trabalh.*direito|oab/.test(n)) return Gavel;
  if (/[eé]tica|cidadan|deont/.test(n)) return Scale;
  if (/filosof|sociol|antropol|hist[oó]ri|geogr/.test(n)) return Landmark;
  if (/literat|portugu[eê]s\b|reda[cç][aã]o/.test(n)) return Library;
  if (/ingl[eê]s|espanhol|franc[eê]s|alem[aã]o|l[ií]ngua|idioma/.test(n)) return Languages;
  if (/program|software|c[oó]digo|algoritmo|estrutur.*dados/.test(n)) return Code;
  if (/redes|sistema.*operac|computa[cç][aã]o|inform[aá]tic|dados/.test(n)) return Code;
  if (/engenharia|el[eé]tric|eletr[oô]nic|mec[aâ]nic|civil|materiais|projeto/.test(n)) return Wrench;
  if (/admin|gest[aã]o|empreend|neg[oó]cio|marketing|contab|empres/.test(n)) return Briefcase;
  if (/economi|finan[cç]/.test(n)) return Landmark;
  if (/geografia|ambient|sustent/.test(n)) return Globe;
  if (/m[uú]sic|sonor/.test(n)) return Music;
  if (/arte|design|artes\s+visuais|desenho/.test(n)) return Palette;
  if (/educa[cç][aã]o\s+f[ií]sic|esporte|treinament|fitness/.test(n)) return Dumbbell;
  if (/inova[cç][aã]o|criativ/.test(n)) return Lightbulb;
  return BookOpen;
}

function getTypeIcon(type: CalendarEventType): LucideIcon {
  switch (type) {
    case "aula":
      return GraduationCap;
    case "bloco":
      return BookOpen;
    case "prova":
      return FileText;
    case "trabalho":
      return Sparkles;
    case "outro":
      return Tag;
  }
}

/* ---------------- unified event type ---------------- */

/**
 * Evento unificado pra renderização — aulas (vindas de subjects[].schedule)
 * e eventos custom (vindos do localStorage) são normalizados pra este shape.
 */
type UEvent = {
  id: string;
  type: CalendarEventType;
  date: Date; // dia (00:00 local)
  startMinutes: number;
  endMinutes: number;
  startTime: string; // "HH:MM"
  endTime: string;
  /** 00:00→23:59 (feriado/recesso/prazo do calendário acadêmico): render sem hora. */
  allDay: boolean;
  title: string;
  subjectId?: string;
  subjectName?: string;
  subjectColor?: string; // gradient (ex.: "from-indigo-500 to-violet-500")
  room?: string;
  description?: string;
  /**
   * Id do CalendarEvent de origem. Evento de INTERVALO vira uma ocorrência por
   * dia e os dias seguintes carregam um id sufixado (pra não repetir key do
   * React) — quem precisa achar o evento no storage (editar/excluir) tem que
   * usar este campo, não o `id`.
   */
  sourceId?: string;
  /** "22/06 a 26/06" quando o evento cobre mais de um dia; senão undefined. */
  spanLabel?: string;
};

type CalendarView = "mes" | "semana" | "agenda";

const ALL_TYPES: CalendarEventType[] = [
  "aula",
  "bloco",
  "prova",
  "trabalho",
  "outro",
];

/* Expande os ScheduleSlot[] semanais em ocorrências dentro de [from, to]. */
function expandSlotsToEvents(
  subjects: Subject[],
  from: Date,
  to: Date,
  /**
   * Limites vindos do calendário acadêmico. Sem eles a aula semanal se
   * repetiria pra sempre (inclusive em férias e nos anos seguintes); com
   * eles, a grade só vale dentro do período letivo e pula feriado/recesso.
   */
  bounds?: { terms: TermWindow[]; nonTeaching: Set<string> },
): UEvent[] {
  const out: UEvent[] = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  for (
    let d = new Date(start);
    d.getTime() <= end.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    if (bounds) {
      // Data local (não toISOString, que converte pra UTC e pode pular um dia).
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!isWithinTerm(iso, bounds.terms)) continue;
      if (bounds.nonTeaching.has(iso)) continue;
    }
    const dow = d.getDay();
    for (const s of subjects) {
      for (const slot of s.schedule ?? []) {
        if (slot.dayOfWeek !== dow) continue;
        out.push({
          // O id tem que carregar TODOS os campos que distinguem um slot do
          // outro (fim e sala inclusive), porque dois slots do mesmo dia
          // começando na mesma hora são legítimos e chegam mesmo ao banco: o
          // mergeSlots do upload só funde blocos encostados quando a SALA é a
          // mesma ("salas diferentes = aulas diferentes"), e a união de grades
          // dedup por dia|início|fim|sala. Só com subjectId+dia+início os dois
          // UEvents nasciam com id idêntico e viravam duas keys iguais no mês,
          // na semana, na agenda e na sidebar — o React casava um nó só por
          // key e destruía/recriava um dos blocos a cada re-render (piscando ao
          // navegar semana ou mexer na legenda).
          id: `aula-${s.id}-${d.toISOString().slice(0, 10)}-${slot.startTime}-${slot.endTime}-${slot.room ?? ""}`,
          type: "aula",
          date: new Date(d),
          startMinutes: timeToMinutes(slot.startTime),
          endMinutes: timeToMinutes(slot.endTime),
          startTime: slot.startTime,
          endTime: slot.endTime,
          allDay: false, // aula da grade sempre tem horário
          title: s.name,
          subjectId: s.id,
          subjectName: s.name,
          subjectColor: s.color,
          room: slot.room,
        });
      }
    }
  }
  return out;
}

function minutesToTime(m: number): string {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/**
 * Fim INVENTADO aqui, quando o CalendarEvent chegou SEM `ends_at`.
 *
 * O `+1h` cru atravessava a meia-noite na faixa das 23h e, como esta tela
 * expande evento de intervalo em UMA ocorrência POR DIA, o compromisso nascia
 * em DOIS dias: "entrega 30/06 às 23:59" (a tool `agendar_evento` da Lumi só
 * inventa fim pra prova/bloco — pra trabalho/aula/outro grava `ends_at`
 * undefined, e o formulário aceita o campo "Fim" apagado) virava 30/06 23:59 →
 * 01/07 00:59: o prazo aparecia no mês, na semana, na view Agenda e na sidebar
 * em 01/07 — um dia em que ele não existe — e o modal anunciava "Período: 30/06
 * a 01/07" pra um prazo de um dia só. Saturando na virada do dia (00:00 do dia
 * seguinte) o fim continua DEPOIS do início e cai no `endsAtMidnight` logo
 * abaixo, que devolve o evento pro dia certo. Mesma correção que o
 * exam-pdf-upload já fez no que ele GRAVA (`syntheticEndIso`/
 * `startOfNextDayIso`); aqui ela fecha o que já está gravado sem fim.
 */
function fallbackEndDate(start: Date): Date {
  const plusHour = new Date(start.getTime() + 60 * 60 * 1000);
  if (plusHour.getDate() === start.getDate()) return plusHour;
  // Dia + 1 no construtor normaliza virada de mês/ano sozinho.
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
}

/**
 * Converte CalendarEvent (storage) em UEvent(s) — UM POR DIA COBERTO.
 *
 * Evento de intervalo ("Exames finais 22/06 a 26/06", "Recesso 16 a 18/02") é
 * gravado como UM registro só, com starts_at no primeiro dia 00:00 e ends_at
 * no último 23:59. Derivando o dia só do starts_at, o mês/semana pintavam a
 * faixa exclusivamente no primeiro dia (23, 24, 25 e 26/06 ficavam em branco)
 * e, do segundo dia em diante, `upcomingEvents` descartava o evento inteiro
 * por `date < hoje` — a semana de provas sumia da sidebar e da view Agenda no
 * meio dela mesma. Expandir dia a dia fecha os dois buracos de uma vez.
 */
function customEventToUEvents(
  ev: CalendarEvent,
  subjects: Subject[],
): UEvent[] {
  const start = new Date(ev.starts_at);
  const end = ev.ends_at ? new Date(ev.ends_at) : fallbackEndDate(start);
  const subj = ev.subject_id ? subjects.find((s) => s.id === ev.subject_id) : undefined;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  const firstDay = new Date(start);
  firstDay.setHours(0, 0, 0, 0);
  const lastDay = new Date(end);
  lastDay.setHours(0, 0, 0, 0);

  /* Evento que termina EXATAMENTE em 00:00 (bloco 22:00→00:00) não ocupa o dia
     seguinte: sem isso sobraria um bloco fantasma de duração zero na
     madrugada. Volta um dia e fecha o último dia às 23:59. */
  const endsAtMidnight =
    endMinutes === 0 && lastDay.getTime() > firstDay.getTime();
  if (endsAtMidnight) lastDay.setDate(lastDay.getDate() - 1);

  const spansDays =
    !Number.isNaN(firstDay.getTime()) &&
    !Number.isNaN(lastDay.getTime()) &&
    lastDay.getTime() > firstDay.getTime();

  const common = {
    type: ev.type,
    title: ev.title,
    subjectId: subj?.id,
    subjectName: subj?.name,
    subjectColor: subj?.color,
    description: ev.description,
    sourceId: ev.id,
  };

  if (!spansDays) {
    return [
      {
        ...common,
        id: ev.id,
        date: firstDay,
        startMinutes,
        endMinutes,
        startTime: formatTime(start),
        endTime: formatTime(end),
        allDay: startMinutes === 0 && endMinutes >= 23 * 60 + 59,
      },
    ];
  }

  const spanLabel = `${formatDateLabel(firstDay)} a ${formatDateLabel(lastDay)}`;
  const out: UEvent[] = [];
  const cursor = new Date(firstDay);
  // Guarda contra intervalo absurdo vindo de extração ruim (mesmo limite do
  // getNonTeachingDays): sem ela um ends_at podre trava a renderização.
  let guard = 0;
  while (cursor.getTime() <= lastDay.getTime() && guard < 400) {
    const isFirst = cursor.getTime() === firstDay.getTime();
    const isLast = cursor.getTime() === lastDay.getTime();
    const dayStartMin = isFirst ? startMinutes : 0;
    const dayEndMin =
      isLast && !endsAtMidnight ? endMinutes : 23 * 60 + 59;
    out.push({
      ...common,
      // Só o primeiro dia mantém o id cru do CalendarEvent; os demais levam
      // sufixo pra não colidir como key do React (o storage segue em sourceId).
      id: isFirst ? ev.id : `${ev.id}#${toLocalIso(cursor)}`,
      date: new Date(cursor),
      startMinutes: dayStartMin,
      endMinutes: dayEndMin,
      startTime: minutesToTime(dayStartMin),
      endTime: minutesToTime(dayEndMin),
      allDay: dayStartMin === 0 && dayEndMin >= 23 * 60 + 59,
      spanLabel,
    });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

/* ---------------- view ---------------- */

function ScheduleView({ user }: { user: User }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [view, setView] = useState<CalendarView>("mes");
  const [activeTypes, setActiveTypes] = useState<Set<CalendarEventType>>(
    () => new Set(ALL_TYPES),
  );
  const [agendaFilter, setAgendaFilter] = useState<CalendarEventType | "all">("all");

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventDialogDefaults, setEventDialogDefaults] = useState<{
    date?: Date;
    type?: CalendarEventType;
  }>({});
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

  /* Detail dialog (sidebar / week click) */
  const [detailsEvent, setDetailsEvent] = useState<DetailsEvent | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  /* Exam PDF upload dialog */
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [scheduleUploadOpen, setScheduleUploadOpen] = useState(false);
  const [academicUploadOpen, setAcademicUploadOpen] = useState(false);

  /* Week view navigation cursor (independente do month cursor) */
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  /* Relógio da página. Sem isso nada re-renderiza na virada do dia: a aba fica
     aberta a noite toda e o destaque de "hoje", os rótulos Hoje/Amanhã/Ontem e
     a linha do agora continuam no dia anterior até o usuário mexer em algo.
     O tique é de HORA (não de minuto) — cobre a meia-noite e a saudação com
     ~24 re-renders por dia em vez de 1440. Os dois states só mudam de valor
     quando o valor muda de verdade, então o React faz bailout no resto. */
  const [todayKey, setTodayKey] = useState(() => toLocalIso(new Date()));
  const [hourOfDay, setHourOfDay] = useState(() => new Date().getHours());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      const now = new Date();
      setTodayKey(toLocalIso(now));
      setHourOfDay(now.getHours());
    };
    const scheduleNext = () => {
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setMinutes(0, 0, 5); // +5ms de folga pra não cair em :59.999
      nextHour.setHours(now.getHours() + 1);
      const delay = Math.max(1_000, nextHour.getTime() - now.getTime());
      timer = setTimeout(() => {
        sync();
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    /* Timer sozinho não cobre notebook suspenso nem throttling de aba oculta. */
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        sync();
        clearTimeout(timer);
        scheduleNext();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /* Hoje 00:00 local, derivado do tique (parse manual pra não depender de como
     a engine interpreta string ISO). Identidade só muda quando o dia vira. */
  const today = useMemo(() => {
    const [y, m, d] = todayKey.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [todayKey]);

  /* O tique de meia-noite atualizava só o `today`; o `selectedDay` congelava no
     dia em que a aba foi aberta. Quem entra às 22h e clica "Adicionar
     compromisso" à 00:35 abria o formulário com a data de ONTEM (a hora padrão
     já vem do relógio novo): o evento nascia no passado e sumia na hora —
     `upcomingEvents` corta tudo com `date < hoje`, então não aparecia nem na
     sidebar nem na view Agenda, só escondido na célula de ontem. Só arrasta
     quando o dia selecionado AINDA era o "hoje" anterior; se o aluno escolheu
     outro dia de propósito, a escolha dele manda. */
  const prevTodayRef = useRef(today);
  useEffect(() => {
    const prevToday = prevTodayRef.current;
    prevTodayRef.current = today;
    if (prevToday.getTime() === today.getTime()) return;
    setSelectedDay((prev) =>
      prev.getTime() === prevToday.getTime() ? new Date(today) : prev,
    );
    /* Na view Semana quem está na tela é o weekAnchor, não o cursor — lá o
       cursor é DERIVADO da semana visível (mid-month) pelo efeito de sync mais
       abaixo. Empurrá-lo pro mês novo aqui só produzia o desencontro "semana
       ainda em janeiro, rótulo em Janeiro, botão Mês abrindo FEVEREIRO", que o
       efeito de sync não desfaz (deps [view, selectedDay], e o selectedDay não
       mudou). Quando o selectedDay ARRASTA (o aluno estava com hoje
       selecionado), é o próprio efeito de sync que move weekAnchor e cursor
       juntos. Daqui pra baixo é assunto de grade de MÊS. */
    if (view === "semana") return;
    /* O tique também não tocava no `cursor`, e na virada de MÊS a grade
       continuava desenhando o mês velho: aba aberta em 31/01 na view Mês, à
       00:00 o `today` e o `selectedDay` viram 01/02 e o cabeçalho segue dizendo
       "Janeiro de 2026" — com o destaque de hoje e o anel de seleção caindo na
       célula 01/02 da última linha, renderizada como FORA do mês
       (`!inMonth && bg-muted/20`), enquanto a sidebar já lista compromissos de
       fevereiro que não estão em célula nenhuma da grade. Só o botão "Hoje"
       consertava. Como no selectedDay, só arrasta quando o cursor ainda estava
       no mês do "hoje" anterior: se o aluno navegou pra outro mês, a navegação
       dele manda. */
    const cursorSeguiaOMesDeHoje =
      cursor.getFullYear() === prevToday.getFullYear() &&
      cursor.getMonth() === prevToday.getMonth();
    if (!cursorSeguiaOMesDeHoje) return;
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    /* E o cursor NÃO pode virar a página sozinho. Quando o aluno tinha
       escolhido outro dia (clicou em 20/07 pra olhar aquele dia e deixou a aba
       aberta até 01/08), o setSelectedDay acima não arrasta nada — a guarda
       exige prev === prevToday — mas o cursor pulava pra agosto assim mesmo: a
       grade de agosto vai de 26/07 a 05/09 e 20/07 não tem célula NENHUMA ali.
       O anel de seleção sumia da tela (nada mais dizia qual dia estava
       escolhido) e o "Adicionar compromisso" da sidebar, único CTA visível de
       criar evento, seguia ancorado num dia invisível e já passado, que o
       `upcomingEvents` corta (`date < today`): o aluno salvava "P1
       Farmacologia", via o toast de sucesso e a grade EXATAMENTE igual, lia
       como "não salvou" e cadastrava de novo, ficando com a prova duplicada
       num mês que ele nem vê. É palavra por palavra o modo de falha que o
       `selectSameDayInMonth` fechou nas setas/dropdown; este caminho tinha
       ficado sem essa chamada. Mesma regra dele: leva o dia escolhido pro mês
       novo mantendo o dia do mês, clampado no último dia do destino (sem o
       clamp, 31/01 → fevereiro escorregaria pra 03/03, de novo fora da grade). */
    setSelectedDay((prev) => {
      if (
        prev.getFullYear() === today.getFullYear() &&
        prev.getMonth() === today.getMonth()
      ) {
        return prev;
      }
      const lastDay = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0,
      ).getDate();
      const d = new Date(
        today.getFullYear(),
        today.getMonth(),
        Math.min(prev.getDate(), lastDay),
      );
      d.setHours(0, 0, 0, 0);
      return d;
    });
    /* `cursor` e `view` entram nas deps porque as decisões acima leem o que
       está na tela; o tique continua sendo o único disparador que faz algo — as
       re-execuções por mudança de cursor/view morrem na guarda de igualdade do
       prevToday lá em cima. */
  }, [today, cursor, view]);

  /* Falha ao LER as matérias do banco. Precisa ser visível: uma lista vazia
     por erro de rede/RLS é indistinguível de "ainda não cadastrei nada", e o
     aluno reage subindo a grade de novo — duplicando tudo. */
  const [subjectsError, setSubjectsError] = useState(false);

  /* Carrega subjects + custom events em paralelo, mas com falhas INDEPENDENTES.
     Com Promise.all, uma falha na leitura das matérias (token expirado, RLS,
     rede oscilando — listSubjectsStrictAsync re-lança de propósito) rejeitava o
     conjunto e o setCustomEvents nunca rodava, mesmo com o listEventsAsync
     (localStorage, que nunca lança) tendo resolvido: provas, blocos de estudo e
     feriados sumiam da tela junto com as aulas, enquanto o banner só falava em
     matéria. */
  useEffect(() => {
    let active = true;
    let pending = 2;
    let subjectsSettled = false;
    let capado: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      pending -= 1;
      if (pending === 0 && active) {
        if (capado) clearTimeout(capado);
        setLoading(false);
      }
    };
    /* Esta leitura entra no MESMO token de ordem dos reloads (subjectsSeqRef):
       com o teto abaixo a página passa a pintar com a carga inicial ainda em
       voo, então ela pode aterrissar DEPOIS de um "Tentar de novo" ou de um
       upload de grade (onSaved → reloadSubjects) e repor as matérias velhas por
       cima das recém-gravadas — e, como é um SUCESSO, sem banner nenhum
       dizendo. */
    const seq = ++subjectsSeqRef.current;
    listSubjectsStrictAsync(user.id)
      .then((subs) => {
        if (!active || seq !== subjectsSeqRef.current) return;
        setSubjects(subs);
        setSubjectsError(false);
      })
      .catch((err) => {
        // Estado anterior fica de pé: melhor a grade velha na tela que um mês
        // em branco mentindo que não existe aula.
        console.error("[schedule] carga das matérias falhou", err);
        if (active && seq === subjectsSeqRef.current) setSubjectsError(true);
      })
      .finally(() => {
        subjectsSettled = true;
        settle();
      });
    listEventsAsync(user.id)
      .then((evs) => {
        if (active) setCustomEvents(evs);
      })
      .catch((err) => {
        console.error("[schedule] carga dos eventos falhou", err);
      })
      .finally(settle);
    /* TETO PRO GATE DA PRIMEIRA PINTURA — mesmo remédio que o calendário
       acadêmico já tinha e estas duas cargas ficaram sem. O client do Supabase
       é criado sem fetch customizado e sem AbortSignal, então uma requisição
       que sai e nunca volta (wifi da faculdade trocando pra 4G, captive portal,
       VPN caindo no meio da leitura) deixa a promise SEM assentar até o timeout
       de TCP do SO — minutos. Sem teto, o `pending` nunca chegava a 0, o
       `setLoading(false)` nunca rodava e o gate `if (loading || !academicSettled)`
       devolvia só o spinner centralizado: sem header, sem "Subir agenda", sem
       banner e sem "Tentar de novo" (os dois banners de erro vivem DEPOIS do
       gate, logo inalcançáveis). A única saída era F5.
       Passados 12s a página sai inteira, e se as matérias ainda estiverem em voo
       acende o banner de erro — que é o único lugar com o "Tentar de novo" que
       redispara as TRÊS cargas. Folga maior que os 4s do calendário acadêmico de
       propósito: aqui a saída antecipada é uma agenda VAZIA (pior mentira que
       uma grade sem período letivo), então só cortamos quando já não dá pra
       chamar de "carregando". Se a resposta chegar depois, o `.then` repõe as
       matérias e apaga o banner sozinho. */
    capado = setTimeout(() => {
      if (!active) return;
      if (!subjectsSettled) setSubjectsError(true);
      setLoading(false);
    }, 12_000);
    return () => {
      active = false;
      if (capado) clearTimeout(capado);
    };
  }, [user.id]);

  /* Calendário acadêmico: define até quando a grade horária vale (período
     letivo) e quais dias não têm aula (feriado/recesso). Falha silenciosa —
     enquanto NUNCA carregou, a grade segue valendo sem limite, como antes
     (mas uma falha depois de carregado não zera o que já vale; ver abaixo). */
  const [academicCalendar, setAcademicCalendar] =
    useState<AcademicCalendar | null>(null);

  /* FALHA DE LEITURA NÃO PODE APAGAR O CALENDÁRIO QUE JÁ ESTÁ NA MEMÓRIA.
     Antes os dois caminhos de erro (resposta não-ok virava `null` e caía em
     normalizeAcademicCalendar(undefined), e o .catch setava null direto)
     derrubavam o calendário bom pra `null`. Sem janelas letivas o
     `isWithinTerm` devolve true pra TUDO: a grade voltava a se repetir sem
     limite — aula de segunda no Natal, no carnaval, em julho inteiro e no ano
     seguinte — e o banner "Fora do período letivo" sumia junto. Como este
     reload é disparado logo após subir um calendário novo (onSaved), um 500 de
     cold start ou um token expirado se lia como "subir o calendário quebrou
     minha agenda", e só um refresh consertava.
     Agora só um GET BEM-SUCEDIDO troca o estado: `null` de verdade (aluno sem
     calendário no perfil) continua zerando; erro mantém o que já valia. */

  /* A falha de leitura precisa ser VISÍVEL. Enquanto o `.catch` só logava no
     console, uma falha na PRIMEIRA carga (cold start 500, token expirado, rede
     oscilando) deixava o `academicCalendar` em `null` — e sem janelas letivas o
     `isWithinTerm` devolve true pra TODA data: a aula de segunda 08:00 volta a
     ser desenhada em 25/12, no Carnaval, em julho inteiro e nos meses à frente,
     enquanto o banner "Fora do período letivo", o aviso "Mês sem aula" e os
     rótulos de feriado somem todos juntos. Nada na tela dizia que a leitura
     falhou (é o inverso do que o aluno importou o calendário pra ter) e o único
     "Tentar de novo" da página não recarregava o calendário: só F5 saía disso. */
  const [academicError, setAcademicError] = useState(false);

  /* TOKEN DE ORDEM — mesma regra do subjectsSeqRef/eventsSeqRef logo abaixo,
     que o calendário acadêmico tinha ficado sem. Este load tem QUATRO
     disparadores (mount, retry do banner de matérias, retry do próprio banner e
     onSaved do upload), então é fácil ter duas leituras em voo e, sem token,
     quem manda é a que CHEGA por último — não a que saiu por último:
     - a leitura #1 estourando depois de a #2 ter dado certo ressuscitava o
       banner vermelho numa tela com o calendário perfeitamente carregado; o
       aluno clicava "Tentar de novo" de novo e realimentava a corrida;
     - pior, no caminho de gravação parcial do AcademicCalendarUpload o
       onProgress dispara uma leitura ANTES do PATCH (perfil ANTIGO); se ela
       aterrissar depois da leitura do onSaved, o setAcademicCalendar repõe o
       calendário VELHO por cima do recém-salvo: as janelas letivas voltam pro
       semestre passado, as aulas somem atrás de "Fora do período letivo" e os
       feriados novos param de suprimir aula. Como essa resposta é um SUCESSO,
       academicError fica false e não sobra banner nem botão — só F5.
     Agora só a leitura MAIS RECENTE pode escrever no state. */
  const academicSeqRef = useRef(0);

  /* "Ainda não li" ≠ "este aluno não tem calendário" — os dois eram `null`, e
     como o gate de loading só conta matérias + eventos, a primeira pintura
     saía com esta leitura ainda em voo. Sem janelas letivas o `isWithinTerm`
     devolve true pra TODA data: a grade nascia com o mês inteiro de aula (10/07
     no meio do recesso pintado com as 25 aulas da semana, sem o rótulo de
     recesso nas células e sem o banner "Mês sem aula") e 1-3s depois tudo sumia
     de uma vez. Quem olha de relance — ou tira print pra conferir a semana —
     leva a informação errada, e o pisca-apaga de uma grade cheia sumindo
     sozinha é o sintoma que faz o aluno concluir que a agenda perdeu a grade
     dele. Este flag separa o terceiro significado do `null` e segura a primeira
     pintura até a leitura assentar (deu certo, deu erro ou estourou o teto). */
  const [academicSettled, setAcademicSettled] = useState(false);

  /* Retry sem feedback vira clique duplicado: o botão "Tentar de novo" não
     desabilitava nem virava spinner, então o aluno clicava de novo e colocava
     mais uma leitura em voo — exatamente a corrida que o token acima fecha. */
  const [academicLoading, setAcademicLoading] = useState(false);

  const loadAcademicCalendar = useCallback(() => {
    const seq = ++academicSeqRef.current;
    setAcademicLoading(true);
    /* TETO DA PRÓPRIA LEITURA — sem ele o "Tentar de novo" virava botão morto.
       Este fetch saía sem AbortSignal e sem timeout (ao contrário das cargas de
       matérias/eventos, que têm teto de 12s; o teto de 4s do mount só toca o
       `academicSettled`, nunca o `academicLoading`). No wifi da faculdade —
       captive portal, VPN caindo, troca pra 4G — a requisição sai e não volta, a
       promise fica sem assentar por MINUTOS e o `.finally` nunca roda: o botão
       ficava preso em "Lendo…" `disabled`. Como ele é o ÚNICO controle da tela
       que recarrega o calendário quando `subjectsError` é false (o outro
       "Tentar de novo" vive dentro do banner de matérias, que nem está na tela),
       a grade seguia sendo desenhada sem período letivo e sem feriado/recesso —
       aula em 25/12, no recesso e nos meses à frente — sem saída além de F5.
       Com o abort a promise assenta: cai no `.catch` (que é a verdade: a leitura
       falhou), o banner continua de pé e o botão volta a clicável. */
    const ctrl = new AbortController();
    const capado = setTimeout(() => ctrl.abort(), 12_000);
    fetch("/api/user-profile", { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`user-profile respondeu ${r.status}`);
        return r.json();
      })
      .then((data) => {
        // Resposta atrasada de uma leitura que já foi substituída: não escreve
        // no state e nem sequer entra no guard abaixo (o throw dela cairia no
        // .catch e acenderia um banner de erro fantasma).
        if (seq !== academicSeqRef.current) return;
        /* FALHA DE LEITURA TAMBÉM CHEGA COMO 200. O guard do `!r.ok` acima só
           pega erro de transporte: quando o SELECT em user_profiles falha
           (token em refresh, RLS, cold start), getUserProfileAsync loga e
           retorna null, e a rota responde 200 {"profile":null} — indistinguível
           de "aluno sem perfil". Como `r.ok` é true, o setAcademicCalendar(null)
           rodava e zerava o calendário BOM que estava na memória, com o mesmo
           estrago acima e persistindo até um reload que lesse bem. Se este aluno
           já salvou um calendário daqui, "perfil vazio" não é perfil novo: é
           leitura falhada — mesmo guard do academic-calendar-upload.tsx. */
        if (!data?.profile && hasSavedAcademicCalendarLocally(user.id)) {
          throw new Error("user-profile devolveu profile vazio");
        }
        setAcademicCalendar(
          normalizeAcademicCalendar(data?.profile?.academicCalendar),
        );
        setAcademicError(false);
      })
      .catch((err) => {
        console.error("[schedule] leitura do calendário acadêmico falhou", err);
        // Falha de leitura VELHA não acende banner: se uma leitura mais nova já
        // respondeu OK, o calendário na tela está certo e o banner só mentiria.
        if (seq === academicSeqRef.current) setAcademicError(true);
      })
      .finally(() => {
        clearTimeout(capado);
        setAcademicSettled(true);
        if (seq === academicSeqRef.current) setAcademicLoading(false);
      });
  }, [user.id]);

  useEffect(() => {
    loadAcademicCalendar();
    /* Teto pro gate da primeira pintura: este fetch não tem timeout e pode
       ficar pendurado minutos numa rede que caiu — segurar a página inteira no
       spinner por isso seria pior que a grade otimista. Passados 4s a tela sai
       do jeito antigo (sem período letivo), e o banner de erro cobre o resto
       quando a leitura de fato falha. */
    const capado = setTimeout(() => setAcademicSettled(true), 4000);
    return () => clearTimeout(capado);
  }, [loadAcademicCalendar]);

  const termBounds = useMemo(
    () => ({
      terms: getTermWindows(academicCalendar),
      nonTeaching: getNonTeachingDays(academicCalendar),
    }),
    [academicCalendar],
  );

  /* Dia suprimido → texto que aparece na célula do mês e no cabeçalho da
     semana. A AUTORIDADE sobre o que some da grade continua sendo o
     `termBounds.nonTeaching` (o mesmo Set que o expandSlotsToEvents consulta):
     todo dia que ele apaga entra aqui, com o título do evento quando existe e
     com um rótulo genérico quando não existe. Assim é impossível um dia sumir
     da grade sem nada dizendo por quê — que era exatamente o buraco. */
  const nonTeachingByDay = useMemo(() => {
    const labels = buildNonTeachingLabels(academicCalendar);
    const out = new Map<string, string>();
    for (const iso of termBounds.nonTeaching) {
      out.set(iso, labels.get(iso) ?? "Sem aula (calendário acadêmico)");
    }
    return out;
  }, [academicCalendar, termBounds.nonTeaching]);

  /* Token de ordem: os reloads são disparados por vários callbacks (o
     SchedulePdfUpload chama onSaved duas vezes numa mesma sessão do dialog —
     gravação parcial + retry), e duas respostas em voo podem chegar fora de
     ordem. Sem o token, a resposta MAIS VELHA sobrescreve o que acabou de ser
     gravado e as matérias novas somem da tela. */
  const subjectsSeqRef = useRef(0);
  const eventsSeqRef = useRef(0);

  const reloadCustomEvents = useCallback(() => {
    const seq = ++eventsSeqRef.current;
    listEventsAsync(user.id).then((evs) => {
      if (seq === eventsSeqRef.current) setCustomEvents(evs);
    });
  }, [user.id]);

  const reloadSubjects = useCallback(() => {
    const seq = ++subjectsSeqRef.current;
    listSubjectsStrictAsync(user.id)
      .then((subs) => {
        if (seq !== subjectsSeqRef.current) return;
        setSubjects(subs);
        setSubjectsError(false);
      })
      .catch((err) => {
        console.error("[schedule] reload das matérias falhou", err);
        if (seq === subjectsSeqRef.current) setSubjectsError(true);
      });
  }, [user.id]);

  /* Combina aulas + custom events para uma janela ampla (12 semanas), depois filtra por view. */
  const allEvents = useMemo(() => {
    // Janela: 8 semanas antes do cursor → 16 semanas depois → cobre mês + semana + agenda 30d
    const windowStart = new Date(cursor);
    windowStart.setDate(windowStart.getDate() - 14);
    const windowEnd = new Date(cursor);
    windowEnd.setMonth(windowEnd.getMonth() + 3);

    const aulas = subjects.length
      ? expandSlotsToEvents(subjects, windowStart, windowEnd, termBounds)
      : [];
    const custom = customEvents.flatMap((c) => customEventToUEvents(c, subjects));
    // Inclui TODOS custom (mesmo fora da janela acima — pra cards "próximos")
    const all = [...aulas, ...custom];
    return all
      .filter((e) => activeTypes.has(e.type))
      .sort((a, b) => {
        const ad = a.date.getTime() - b.date.getTime();
        if (ad !== 0) return ad;
        return a.startMinutes - b.startMinutes;
      });
  }, [subjects, customEvents, cursor, activeTypes, termBounds]);

  /* Grid do mês (6 semanas × 7 dias). */
  const monthGrid = useMemo(() => {
    const firstOfMonth = new Date(cursor);
    firstOfMonth.setHours(0, 0, 0, 0);
    const startWeekday = firstOfMonth.getDay();
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startWeekday);

    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }
    return { cells, gridStart, gridEnd: cells[cells.length - 1] };
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, UEvent[]>();
    for (const e of allEvents) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [allEvents]);

  /* Próximos 30 dias a partir de hoje. SEMPRE olha pra frente a partir de
     now(), independente do mês visualizado (cursor). Por isso NÃO deriva de
     allEvents (cuja janela de expansão de aulas é relativa ao cursor) —
     expande as aulas na janela hoje→+30d aqui, senão os cards "próximos" e a
     sidebar esvaziam ao navegar o mês. */
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    // Vem do tique de relógio (`today`), não de um new Date() solto: assim a
    // lista recalcula sozinha na virada do dia.
    const today00 = today;
    const horizon = new Date(today00);
    horizon.setDate(horizon.getDate() + 30);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const aulas = subjects.length
      ? expandSlotsToEvents(subjects, today00, horizon, termBounds)
      : [];
    const custom = customEvents.flatMap((c) => customEventToUEvents(c, subjects));

    return [...aulas, ...custom]
      .filter((e) => activeTypes.has(e.type))
      .filter((e) => {
        if (e.date.getTime() < today00.getTime()) return false;
        if (e.date.getTime() > horizon.getTime()) return false;
        if (isSameDay(e.date, today00)) {
          // layoutEndMinutes: evento que cruza a meia-noite tem endMinutes
          // MENOR que o início e seria dado como encerrado durante o próprio
          // acontecimento.
          return layoutEndMinutes(e) > nowMin;
        }
        return true;
      })
      .sort((a, b) => {
        const ad = a.date.getTime() - b.date.getTime();
        if (ad !== 0) return ad;
        return a.startMinutes - b.startMinutes;
      });
    // `hourOfDay` entra de propósito (o lint não vê, porque ele não aparece no
    // corpo): reavalia o corte por `nowMin` a cada hora. O tique não é de
    // minuto, então dentro da hora o corte fica no valor da última reavaliação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, customEvents, activeTypes, termBounds, today, hourOfDay]);

  /* Agrupa por dia (próximos 5 dias com eventos). */
  const agendaGroups = useMemo(() => {
    const groups: Array<{ date: Date; events: UEvent[] }> = [];
    const byKey = new Map<string, { date: Date; events: UEvent[] }>();
    for (const e of upcomingEvents) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.events.push(e);
      } else {
        const group = { date: new Date(e.date), events: [e] };
        byKey.set(key, group);
        groups.push(group);
      }
    }
    return groups.slice(0, 5);
  }, [upcomingEvents]);

  /* Semana visível (7 dias começando no domingo da semana do weekAnchor).
     Quando muda de view ou clica num dia do mês, sincroniza com selectedDay. */
  const weekDays = useMemo(() => {
    const base = startOfWeek(weekAnchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [weekAnchor]);

  /* Sincroniza weekAnchor ao clicar num dia enquanto a view semana está aberta
     (UX: ver a semana do dia selecionado). A TROCA de view não depende mais
     deste efeito — ela passa por changeView/goToWeekOf, que move os três
     estados juntos; aqui a comparação só confirma que já estão alinhados. */
  useEffect(() => {
    if (view !== "semana") return;
    const ss = startOfWeek(selectedDay);
    setWeekAnchor((prev) => {
      const sa = startOfWeek(prev);
      return sa.getTime() === ss.getTime() ? prev : selectedDay;
    });
    /* O `cursor` tem que andar junto da semana visível — este efeito era o
       único caminho que movia o weekAnchor SEM passar pelo goToWeekOf (que move
       os três estados). Depois da virada do dia (sábado 31/01 → domingo 01/02,
       semanas diferentes) ele pulava a grade pra 01–07/02 e o rótulo virava
       "Fevereiro de 2026" (refDate = miolo da semana), mas o cursor continuava
       em 01/01: clicar em "Mês" abria JANEIRO, porque o changeView só
       sincroniza no sentido mes→semana. Mesma regra do goToWeekOf: o mês é o do
       MIOLO (quarta) da semana mostrada, que é de onde o rótulo sai. */
    const mid = new Date(ss);
    mid.setDate(ss.getDate() + 3);
    setCursor((prev) =>
      prev.getFullYear() === mid.getFullYear() &&
      prev.getMonth() === mid.getMonth()
        ? prev
        : new Date(mid.getFullYear(), mid.getMonth(), 1),
    );
  }, [view, selectedDay]);

  /* Data de referência da view ativa. Na semana quem manda é o weekAnchor
     (que navega sozinho), não o cursor do mês — senão label e avisos falam de
     um mês que não é o que está na tela. Usa o miolo da semana (quarta) pra
     semana que cruza a virada do mês cair no mês dominante. */
  const refDate = view === "semana" ? weekDays[3] : cursor;

  /* Período visível está fora do período letivo? Explica em vez de deixar o
     calendário vazio e mudo (parece bug). Na semana a checagem é dos 7 dias
     visíveis (mais preciso que raciocinar por mês). */
  const termGap = useMemo(() => {
    // A agenda é SEMPRE hoje→+30d (não segue o cursor), então um aviso
    // derivado do mês do cursor contradiria a lista logo abaixo dele.
    if (view === "agenda") return null;
    if (view === "semana") {
      const temAula = weekDays.some((d) =>
        isWithinTerm(toLocalIso(d), termBounds.terms),
      );
      if (temAula) return null;
      // Sem aula na semana, o texto TEM que sair da própria semana. Cair no
      // describeTermGap (que raciocina por MÊS) devolvia null toda vez que o
      // mês encostava na janela letiva — semana de 01–07/02 com semestre
      // começando em 09/02 ficava sem uma aula sequer e sem explicação, que é
      // exatamente o "vazio e mudo parece bug" que o banner existe pra evitar.
      return describeWeekGap(weekDays, termBounds.terms);
    }
    return describeTermGap(
      refDate.getFullYear(),
      refDate.getMonth(),
      termBounds.terms,
    );
  }, [view, weekDays, refDate, termBounds.terms]);

  /* Segundo motivo de período vazio, que nenhum dos dois banners acima enxerga:
     estar DENTRO da janela letiva e mesmo assim não ter um único dia com aula,
     porque feriado/recesso apagou todos. É o "Recesso de meio de ano 01/07 a
     31/07" dentro de uma janela [05/02, 15/12] — o describeTermGap vê
     sobreposição e cala, o `temAula` da semana dá true e cala também, e o mês
     inteiro fica sem aula, sem banner e sem evento (feriado/recesso vem
     desmarcado no importador, então nem chip existe). Só dispara quando TODO
     dia letivo do período visível está bloqueado: feriado avulso e emenda de 3
     dias já se explicam pelo marcador da própria célula/coluna, e um banner
     nesses casos seria ruído. */
  const nonTeachingNotice = useMemo(() => {
    if (view === "agenda") return null;
    if (termGap) return null; // fora do período letivo já tem explicação
    if (nonTeachingByDay.size === 0) return null;
    const days =
      view === "semana"
        ? weekDays
        : monthGrid.cells.filter(
            (d) =>
              d.getMonth() === cursor.getMonth() &&
              d.getFullYear() === cursor.getFullYear(),
          );
    const letivos = days.filter((d) =>
      isWithinTerm(toLocalIso(d), termBounds.terms),
    );
    if (letivos.length === 0) return null;
    const blocked = letivos.filter((d) => nonTeachingByDay.has(toLocalIso(d)));
    if (blocked.length < letivos.length) return null;
    const motivos = Array.from(
      new Set(blocked.map((d) => nonTeachingByDay.get(toLocalIso(d))!)),
    ).slice(0, 3);
    return {
      title: view === "semana" ? "Semana sem aula" : "Mês sem aula",
      // "dias letivos" e não "dias": o recorte é sempre o que está DENTRO da
      // janela letiva, senão o texto mentiria num mês que só encosta nela.
      detail: `O calendário acadêmico marca ${
        view === "semana"
          ? "todos os dias letivos desta semana"
          : "todos os dias letivos deste mês"
      } como feriado ou recesso (${motivos.join(", ")}), então a grade não aparece aqui. Suas matérias continuam salvas — não precisa subir a grade de novo.`,
    };
  }, [
    view,
    termGap,
    nonTeachingByDay,
    weekDays,
    monthGrid.cells,
    cursor,
    termBounds.terms,
  ]);

  /* Aulas expandidas na janela DA SEMANA visível. weekAnchor navega
     independente do cursor do mês, então a janela de allEvents (ancorada no
     cursor) não cobre semanas distantes — filtrar allEvents aqui deixaria a
     semana sem aulas ao navegar >2 semanas pra trás. Mesmo padrão de
     upcomingEvents. */
  const eventsInWeek = useMemo(() => {
    const start = new Date(weekDays[0]);
    start.setHours(0, 0, 0, 0);
    const end = new Date(weekDays[6]);
    end.setHours(23, 59, 59, 999);

    const aulas = subjects.length
      ? expandSlotsToEvents(subjects, start, end, termBounds)
      : [];
    const custom = customEvents.flatMap((c) => customEventToUEvents(c, subjects));

    return [...aulas, ...custom]
      .filter((e) => activeTypes.has(e.type))
      .filter(
        (e) =>
          e.date.getTime() >= start.getTime() &&
          e.date.getTime() <= end.getTime(),
      )
      .sort((a, b) => {
        const ad = a.date.getTime() - b.date.getTime();
        if (ad !== 0) return ad;
        return a.startMinutes - b.startMinutes;
      });
  }, [subjects, customEvents, weekDays, activeTypes, termBounds]);

  /* Agenda view: próximos 30 dias filtrados por tipo (se houver). */
  const agendaEvents = useMemo(() => {
    if (agendaFilter === "all") return upcomingEvents;
    return upcomingEvents.filter((e) => e.type === agendaFilter);
  }, [upcomingEvents, agendaFilter]);

  /**
   * Quem mexeu por último na view Mês: as setas/dropdown ("mes", que só movem o
   * `cursor`) ou o clique num dia ("dia", que só move o `selectedDay`). Na hora
   * de entrar na view Semana os dois podem apontar pra meses diferentes e é
   * preciso saber em qual acreditar — sem isso, olhar sempre pro selectedDay
   * descartava calada a navegação de meses, e olhar sempre pro cursor ignorava
   * o dia recém-clicado na última linha da grade. Começa em "dia" porque na
   * montagem o selecionado é hoje (a semana esperada é a de hoje, não a
   * primeira do mês).
   */
  const monthIntentRef = useRef<"dia" | "mes">("dia");

  function goToToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    monthIntentRef.current = "dia";
    setSelectedDay(today);
    // O efeito de sync só reage a MUDANÇA de selectedDay: se hoje já estava
    // selecionado, a semana ficaria parada onde o usuário navegou.
    setWeekAnchor(today);
    const c = new Date(today);
    c.setDate(1);
    setCursor(c);
    /* Na view Agenda nenhum dos três estados acima chega à tela: a lista é
       sempre hoje→+30d (ancorada no `today` do tique), termGap e
       nonTeachingNotice retornam null e o rótulo do mês virou o span estático
       "Próximos 30 dias". O botão era controle MORTO ali — o aluno rolava a
       lista até o fim, clicava "Hoje" pra voltar pro bloco de hoje e nenhum
       pixel mudava. Como a lista COMEÇA no bloco de hoje, levar a rolagem pro
       topo é exatamente o que ele pediu (mesmo caminho do "Ver agenda
       completa" da sidebar). */
    if (view === "agenda" && typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  /**
   * Move a semana visível levando junto o cursor do mês e o selectedDay.
   *
   * Mexer só no weekAnchor deixava os três estados brigando: o rótulo passava
   * a dizer "Setembro" enquanto o cursor continuava em julho (clicar em "Mês"
   * abria JULHO), e, ao voltar pra "Semana", o efeito de sync — que compara
   * weekAnchor com selectedDay — jogava a semana de volta pra do selectedDay,
   * apagando toda a navegação. Manter selectedDay DENTRO da semana mostrada
   * neutraliza esse sync e mantém "Adicionar compromisso" no dia certo.
   */
  function goToWeekOf(anchor: Date) {
    /* Navegar semanas é intenção de DIA, não de MÊS. Sem esta linha o
       monthIntentRef ficava preso em "mes" (posto pelas setas/dropdown do mês)
       e o round-trip Semana → Mês → Semana recalculava a âncora com
       weekAnchorForMonth(cursor), jogando o aluno de volta pra PRIMEIRA semana
       do mês: as três semanas que ele acabou de navegar sumiam sem aviso.
       Como esta função já move o selectedDay pra DENTRO da semana mostrada,
       marcar "dia" faz o changeView reancorar exatamente na semana visível. */
    monthIntentRef.current = "dia";
    const base = startOfWeek(anchor);
    const mid = new Date(base);
    mid.setDate(base.getDate() + 3); // miolo (quarta) = mês dominante da semana
    setWeekAnchor(anchor);
    setCursor(new Date(mid.getFullYear(), mid.getMonth(), 1));
    setSelectedDay((prev) => {
      const d = new Date(base);
      d.setDate(base.getDate() + prev.getDay()); // mesmo dia da semana
      return d;
    });
  }

  /**
   * Navegar meses tem que levar o DIA SELECIONADO junto pro mês que está na
   * tela. Mexendo só no cursor, o selectedDay ficava num mês que não tem uma
   * célula sequer na grade (30/07 não está entre os 42 dias de setembro): o
   * anel de seleção sumia — nada dizia qual dia estava escolhido — e o botão
   * "Adicionar compromisso" da sidebar, único CTA visível de criar evento,
   * continuava ancorado no mês anterior. O aluno navegava até setembro, salvava
   * "P1 Farmacologia", via o toast de sucesso e a grade de setembro EXATAMENTE
   * igual (o compromisso nasceu em julho): a leitura natural é "não salvou",
   * ele cadastrava de novo e ficava uma prova duplicada num mês que ele nem vê.
   * Mantém o dia do mês, clampado no último dia do destino — sem o clamp,
   * 31/01 → fevereiro escorregaria pra 03/03, de novo fora da grade.
   */
  function selectSameDayInMonth(year: number, month: number) {
    setSelectedDay((prev) => {
      const lastDay = new Date(year, month + 1, 0).getDate();
      const d = new Date(year, month, Math.min(prev.getDate(), lastDay));
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }

  /* As setas/dropdown de mês movem TAMBÉM a semana quando a view é semana —
     lá o rótulo sai do weekAnchor, então mexer só no cursor seria um botão
     que não faz nada. */
  function shiftMonth(delta: number) {
    if (view === "semana") {
      // Na semana o rótulo sai do refDate (miolo da semana visível), então a
      // seta tem que mover os DOIS a partir dele — mover o cursor a partir de
      // si mesmo faz a view Mês abrir um mês diferente do que o rótulo dizia.
      const next = new Date(refDate.getFullYear(), refDate.getMonth() + delta, 1);
      next.setHours(0, 0, 0, 0);
      goToWeekOf(weekAnchorForMonth(next.getFullYear(), next.getMonth()));
      return;
    }
    monthIntentRef.current = "mes";
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    next.setHours(0, 0, 0, 0);
    setCursor(next);
    selectSameDayInMonth(next.getFullYear(), next.getMonth());
  }

  function setMonthYear(month: number, year: number) {
    if (view === "semana") {
      goToWeekOf(weekAnchorForMonth(year, month));
      return;
    }
    monthIntentRef.current = "mes";
    const d = new Date(year, month, 1);
    d.setHours(0, 0, 0, 0);
    setCursor(d);
    selectSameDayInMonth(year, month);
  }

  /**
   * Troca de view mantendo cursor, weekAnchor e selectedDay apontando pro MESMO
   * lugar. Antes a sincronização era só o efeito de weekAnchor, que compara
   * weekAnchor com selectedDay e ignora o cursor — os dois desencontros que
   * saíam disso:
   *
   * (a) navegar meses na view Mês (só o cursor anda) e clicar em "Semana": o
   *     efeito achava weekAnchor e selectedDay na mesma semana, mantinha a
   *     âncora de julho e a navegação até setembro sumia sem aviso, com o botão
   *     "Mês" ainda abrindo setembro;
   * (b) clicar numa célula de outro mês (05/08 na grade de julho, só o
   *     selectedDay anda) e ir pra semana: o rótulo virava "Agosto de 2026" e
   *     clicar em "Mês" reabria JULHO.
   *
   * É o mesmo desencontro que as setas já resolvem via goToWeekOf; agora a
   * troca de view passa por ele, escolhendo a âncora pelo controle que o aluno
   * usou por último.
   */
  function changeView(next: CalendarView) {
    if (next === view) return;
    if (next === "semana") {
      const anchor =
        monthIntentRef.current === "mes"
          ? weekAnchorForMonth(cursor.getFullYear(), cursor.getMonth())
          : selectedDay;
      goToWeekOf(anchor);
    }
    setView(next);
  }

  function toggleType(t: CalendarEventType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function openCreateDialog(defaults: { date?: Date; type?: CalendarEventType } = {}) {
    setEditEvent(null);
    setEventDialogDefaults(defaults);
    setEventDialogOpen(true);
  }

  /**
   * Abre o modal de detalhes para um UEvent. Custom events (id na lista
   * customEvents) podem ser editados/excluídos; aulas (id começa com "aula-")
   * são read-only.
   */
  function openEventDetails(u: UEvent) {
    // Dia 2+ de um evento de intervalo tem id sufixado: procurar/editar/excluir
    // tem que usar o id do CalendarEvent de origem, senão o dia 23/06 da semana
    // de provas abriria como "da grade" (read-only) e o botão Excluir sumiria.
    const sourceId = u.sourceId ?? u.id;
    const isCustom = customEvents.some((c) => c.id === sourceId);
    // O modal mostra UM dia; sem isto, o 3º dia de "Exames finais" se anuncia
    // como um evento solto de 24/06 e o aluno não vê que o período vai até 26.
    const description = u.spanLabel
      ? [`Período: ${u.spanLabel}`, u.description].filter(Boolean).join("\n")
      : u.description;
    // Feriado/recesso/prazo é DIA TODO: o mês, a agenda e a sidebar já param de
    // imprimir hora, mas o modal — a única tela que o aluno abre justamente pra
    // ver o detalhe — continuava mostrando o horário falso "00:00 – 23:59" que
    // ninguém escreveu (é só o intervalo interno que representa o dia inteiro).
    // O DetailsEvent não tem campo allDay (o dialog é de outro arquivo), então o
    // recado sai pelo único canal que existe: o dialog imprime só o startTime
    // quando início e fim são iguais (`hasTimeRange`), então mandar os dois como
    // "Dia todo" faz a linha do relógio dizer "Dia todo".
    const allDayLabel = "Dia todo";
    const details: DetailsEvent = {
      id: sourceId,
      type: u.type,
      date: u.date,
      startTime: u.allDay ? allDayLabel : u.startTime,
      endTime: u.allDay ? allDayLabel : u.endTime,
      title: u.title,
      subjectId: u.subjectId,
      subjectName: u.subjectName,
      subjectColor: u.subjectColor,
      room: u.room,
      description,
      readOnly: !isCustom,
    };
    setDetailsEvent(details);
    setDetailsOpen(true);
  }

  /** Abre o EventFormDialog pré-populado com um CalendarEvent (modo edição). */
  function openEditDialog(eventId: string) {
    const ev = customEvents.find((c) => c.id === eventId);
    if (!ev) return;
    setEditEvent(ev);
    setEventDialogDefaults({});
    setEventDialogOpen(true);
  }

  /**
   * Troca o filtro da view Agenda garantindo que o tipo escolhido esteja
   * VISÍVEL. A lista da agenda já vem peneirada por `activeTypes` (legenda
   * embaixo do calendário / dropdown Filtros), então com "Prova" desmarcado a
   * pill "Prova" não trazia nada — e a tela ainda afirmava que não havia prova
   * nos próximos 30 dias, com prova marcada pra semana seguinte. Depois de
   * "Limpar" nos Filtros, as cinco pills viravam botões mortos.
   */
  function applyAgendaFilter(f: CalendarEventType | "all") {
    setAgendaFilter(f);
    if (f === "all") {
      // Sem nenhum tipo ativo, "Todos" é garantidamente vazio: restaura.
      setActiveTypes((prev) => (prev.size === 0 ? new Set(ALL_TYPES) : prev));
      return;
    }
    setActiveTypes((prev) => (prev.has(f) ? prev : new Set(prev).add(f)));
  }

  function jumpToAgendaFiltered(type: CalendarEventType | "all") {
    applyAgendaFilter(type);
    setView("agenda");
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  const firstName = user.name.split(" ")[0] || "estudante";
  const monthLabel = `${MONTHS_LONG[refDate.getMonth()]} de ${refDate.getFullYear()}`;

  /* O gate conta as TRÊS cargas, não só matérias + eventos: liberar a primeira
     pintura com o calendário acadêmico ainda em voo desenha a grade sem período
     letivo e sem feriado/recesso (ver academicSettled), e o aluno vê um mês
     cheio de aula que some sozinho 1-3s depois. */
  if (loading || !academicSettled) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <LumiPic
            src="/illustrations/lumi-calendar.png"
            alt="Lumi com calendário"
            className="hidden h-16 w-auto shrink-0 object-contain drop-shadow-sm sm:block md:h-20"
          />
          <div>
          <p className="text-xs text-muted-foreground mb-1">
            {greetingPrefix(hourOfDay)}, {firstName}
          </p>
          <h1 className="text-3xl md:text-4xl heading-display">
            Calendário de estudos
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Organize suas aulas, sessões de estudo e prazos importantes.
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setScheduleUploadOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Subir agenda
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAcademicUploadOpen(true)}
          >
            <CalendarDays className="h-4 w-4" />
            Calendário acadêmico
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPdfUploadOpen(true)}
          >
            <FileText className="h-4 w-4" />
            Calendário de provas
          </Button>
          {/* Os dois CTAs apontavam pro MESMO `/dashboard` cru: dois rótulos,
              dois ícones e o botão mais destacado da aba levavam pro topo do
              dashboard sem abrir dialog nenhum, e o aluno tinha que caçar o
              botão equivalente lá embaixo. O parâmetro `novo` diz QUAL dialog
              abrir; o dashboard ainda precisa lê-lo (ele não usa searchParams
              hoje) — enquanto não ler, o destino continua o de sempre, sem
              regressão. */}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard?novo=materia">
              <Plus className="h-4 w-4" />
              Nova matéria
            </Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/dashboard?novo=aula">
              <Mic className="h-4 w-4" />
              Nova aula
            </Link>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Hoje
          </Button>
          {/* A agenda ignora o cursor (mostra sempre os próximos 30 dias):
              navegar por mês ali seria controle morto contradizendo a lista. */}
          {view === "agenda" ? (
            <span className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-sm font-medium">
              Próximos 30 dias
            </span>
          ) : (
            <>
              <div className="flex items-center rounded-md border border-border bg-background">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-l-md transition-colors"
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-r-md transition-colors border-l border-border"
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <MonthDropdown
                cursor={refDate}
                label={monthLabel}
                onSelect={setMonthYear}
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            {(["mes", "semana", "agenda"] as const).map((v) => {
              const label = v === "mes" ? "Mês" : v === "semana" ? "Semana" : "Agenda";
              const active = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeView(v)}
                  /* O ativo se distinguia SÓ por `bg-primary`: no leitor de tela
                     os três botões se anunciavam idênticos e o aluno não sabia
                     se estava no Mês, na Semana ou na Agenda. */
                  aria-pressed={active}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "h-7 px-3 rounded text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <FiltersDropdown
            activeTypes={activeTypes}
            onToggle={toggleType}
            onAll={() => setActiveTypes(new Set(ALL_TYPES))}
            onNone={() => setActiveTypes(new Set())}
          />
        </div>
      </div>

      {/* Main 12-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: calendar + cards */}
        <div className="lg:col-span-9 space-y-5">
          {/* Erro de leitura vem ANTES do aviso de período letivo: se o banco
              não respondeu, qualquer conclusão sobre "não tem aula" é chute. */}
          {subjectsError && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  Não consegui carregar suas matérias
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  O calendário pode estar incompleto. Não suba a grade de novo
                  antes de recarregar, senão as matérias podem duplicar.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  reloadSubjects();
                  // Recarrega TAMBÉM os eventos custom: se a carga inicial
                  // tropeçou antes de setá-los, só recarregar as matérias fazia
                  // o banner sumir com provas/blocos ainda faltando na tela —
                  // a agenda passava a afirmar estar íntegra estando furada.
                  reloadCustomEvents();
                  // E o calendário acadêmico: se a carga inicial tropeçou nele
                  // também, sem esta linha não existia NENHUM caminho na UI pra
                  // recuperar o período letivo (só F5).
                  loadAcademicCalendar();
                }}
              >
                Tentar de novo
              </Button>
            </div>
          )}
          {/* Leitura do calendário acadêmico falhou. Sem banner, o aluno via a
              grade voltar a se repetir em feriado, recesso e férias e concluía
              que o app "voltou a mostrar aula errada" — o inverso do que ele
              importou o calendário pra ter. */}
          {academicError && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  Não consegui ler seu calendário acadêmico
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {academicCalendar
                    ? "Continuo usando o calendário que já estava carregado — ele pode estar desatualizado."
                    : "Enquanto isso a grade está sendo desenhada sem período letivo e sem feriado/recesso, então pode aparecer aula em dia sem aula. Nada foi apagado: é só a leitura que falhou."}
                </p>
              </div>
              {/* Enquanto a leitura está em voo o botão precisa DIZER isso:
                  sem desabilitar e sem spinner, nada mudava na tela e o aluno
                  clicava de novo, empilhando leituras concorrentes. */}
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={academicLoading}
                onClick={() => loadAcademicCalendar()}
              >
                {academicLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {academicLoading ? "Lendo…" : "Tentar de novo"}
              </Button>
            </div>
          )}
          {/* LEITURA AINDA EM VOO DEPOIS DO TETO DE 4s. O teto do mount libera a
              primeira pintura com o `academicCalendar` ainda `null` (numa rede
              4G o /api/user-profile passa fácil dos 4s: auth.getUser() + SELECT
              + cold start), e sem janelas letivas o `isWithinTerm` devolve true
              pra TODA data e o `getNonTeachingDays` vem vazio: a grade sai
              desenhada em julho inteiro, no Carnaval e no 25/12, sem rótulo de
              recesso e sem o banner "Mês sem aula" — e, quando a resposta chega,
              metade dos dias esvazia sozinha na frente do aluno. O
              `academicLoading` existia mas só era lido DENTRO do banner de
              `academicError`, que é false numa leitura que ainda nem falhou:
              nada na tela dizia que a informação era provisória. Só o caso
              `null` (nunca leu) entra aqui — com um calendário já carregado a
              tela não está mentindo e o banner só piscaria a cada reload. */}
          {academicLoading && !academicCalendar && !academicError && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Ainda estou lendo seu calendário acadêmico
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Até a resposta chegar, a grade aparece sem período letivo e sem
                  feriado/recesso: pode ter aula desenhada em dia sem aula. Esses
                  dias vão se ajustar sozinhos em alguns segundos.
                </p>
              </div>
            </div>
          )}
          {termGap && !subjectsError && subjects.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {termGap.title}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {termGap.detail}
                </p>
              </div>
            </div>
          )}
          {nonTeachingNotice && !subjectsError && subjects.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {nonTeachingNotice.title}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {nonTeachingNotice.detail}
                </p>
              </div>
            </div>
          )}
          {/* "Limpar" nos Filtros zera o activeTypes e o `.filter` derruba 100%
              dos eventos: o mês virava 42 células em branco e a semana uma
              grade de horas vazia, sem uma linha dizendo o motivo (o único
              indício era o badge "0" lá em cima). A view Agenda já avisava com
              o "Oculto pelos filtros"; mês e semana — onde o aluno passa a maior
              parte do tempo — ficaram de fora. */}
          {activeTypes.size === 0 && view !== "agenda" && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <Filter className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  Tudo oculto pelos filtros
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Nenhuma categoria está marcada, então o calendário aparece
                  vazio. Seus compromissos continuam salvos.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setActiveTypes(new Set(ALL_TYPES))}
              >
                Mostrar tudo
              </Button>
            </div>
          )}
          {view === "mes" && (
            <MonthGrid
              cells={monthGrid.cells}
              cursorMonth={cursor.getMonth()}
              today={today}
              selectedDay={selectedDay}
              onSelectDay={(d) => {
                // Clicar num dia é a intenção mais recente do aluno — é ela que
                // decide a âncora quando ele trocar pra view Semana (senão o
                // clique numa célula de outro mês e a navegação por setas
                // brigam e uma das duas é descartada calada).
                monthIntentRef.current = "dia";
                setSelectedDay(d);
              }}
              onDayDoubleClick={(d) => openCreateDialog({ date: d })}
              onEventClick={openEventDetails}
              eventsByDay={eventsByDay}
              nonTeachingByDay={nonTeachingByDay}
            />
          )}
          {view === "semana" && (
            <WeekGrid
              days={weekDays}
              events={eventsInWeek}
              today={today}
              selectedDay={selectedDay}
              onSelectDay={(d) => {
                monthIntentRef.current = "dia";
                setSelectedDay(d);
              }}
              onShiftWeek={(delta) => {
                // Move os TRÊS estados (semana, cursor do mês, dia selecionado):
                // mexer só no weekAnchor fazia o rótulo dizer "Setembro" com o
                // botão "Mês" abrindo julho, e as navegações se perdiam ao
                // voltar pra view Semana.
                const next = new Date(weekAnchor);
                next.setDate(weekAnchor.getDate() + delta * 7);
                next.setHours(0, 0, 0, 0);
                goToWeekOf(next);
              }}
              onEventClick={openEventDetails}
              nonTeachingByDay={nonTeachingByDay}
            />
          )}
          {view === "agenda" && (
            /* Lista INTEIRA da janela de 30 dias. O `.slice(0, 60)` que ficava
               aqui cortava a agenda de quem tem grade cheia (~25 aulas/semana)
               por volta do 15º dia, calado: uma prova daqui a 24 dias existia no
               storage, aparecia no mês e simplesmente não estava na aba Agenda,
               que continuava dizendo "Próximos 30 dias". */
            <AgendaView
              events={agendaEvents}
              activeFilter={agendaFilter}
              onFilterChange={applyAgendaFilter}
              onOpenDetails={openEventDetails}
              today={today}
              /* Com "Todos" selecionado, checar só `size === 0` cobria o caso
                 extremo ("Limpar" nos Filtros) e deixava passar o comum: basta
                 UMA categoria desmarcada na legenda pra `upcomingEvents` vir
                 peneirado e a lista sair vazia — e a tela então afirmava
                 "Agenda vazia / Nenhum compromisso", com 100+ ocorrências
                 escondidas atrás do filtro. Qualquer categoria desmarcada já
                 torna o vazio AMBÍGUO, e o texto de "Oculto pelos filtros" é
                 justamente o hedge certo ("pode haver compromisso agendado
                 aqui"). */
              hiddenByFilters={
                agendaFilter === "all"
                  ? activeTypes.size < ALL_TYPES.length
                  : !activeTypes.has(agendaFilter)
              }
            />
          )}

          <Legend activeTypes={activeTypes} onToggle={toggleType} />
        </div>

        {/* Right sidebar */}
        <aside className="lg:col-span-3">
          {/* O topbar do AppShell é `sticky top-0 z-20` com
              `h-[calc(60px + env(safe-area-inset-top))]`. Com `top-4` o card
              fixava a 16px e os primeiros ~44px dele ficavam ATRÁS do header:
              o título "Agenda próxima" e o "Ver agenda completa →" saíam
              lavados pelo backdrop-blur e, como o header não é
              pointer-events:none, ele roubava o clique — o link ficava morto
              com a página rolada. 76px (60 do topbar + 16 de respiro) é a mesma
              conta do `sticky top-[80px]` das outras sidebars do app; o
              env() entra porque em mobile o notch soma na altura do header. */}
          <div className="rounded-xl border border-border/70 bg-card p-4 sticky top-[calc(76px_+_env(safe-area-inset-top))]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Agenda próxima</h3>
              <button
                type="button"
                onClick={() => jumpToAgendaFiltered("all")}
                className="text-[11px] text-primary hover:underline"
              >
                Ver agenda completa →
              </button>
            </div>

            {agendaGroups.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                <LumiPic
                  src="/illustrations/lumi-sleeping.png"
                  alt="Lumi descansando"
                  className="mx-auto mb-2 h-16 w-16 object-contain opacity-90 drop-shadow-sm"
                />
                Nenhum compromisso nos próximos dias.
              </div>
            ) : (
              <div className="space-y-4">
                {agendaGroups.map((g, idx) => (
                  <div key={idx}>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                      {dayHeaderLabel(g.date, today)} · {formatDateLabel(g.date)}
                    </div>
                    <div className="space-y-1.5">
                      {g.events.map((e) => (
                        <SidebarEventItem
                          key={e.id}
                          event={e}
                          onOpenDetails={() => openEventDetails(e)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center text-xs"
                onClick={() => openCreateDialog({ date: selectedDay })}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar compromisso
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <EventFormDialog
        open={eventDialogOpen}
        onOpenChange={(o) => {
          setEventDialogOpen(o);
          if (!o) setEditEvent(null);
        }}
        userId={user.id}
        subjects={subjects}
        defaultDate={eventDialogDefaults.date}
        defaultType={eventDialogDefaults.type}
        editEvent={editEvent}
        onCreated={() => reloadCustomEvents()}
        onUpdated={() => reloadCustomEvents()}
      />

      <EventDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        event={detailsEvent}
        userId={user.id}
        onEdit={(ev) => openEditDialog(ev.id)}
        onDeleted={() => reloadCustomEvents()}
      />

      <ExamPdfUpload
        open={pdfUploadOpen}
        onOpenChange={setPdfUploadOpen}
        userId={user.id}
        subjects={subjects}
        onCreated={() => reloadCustomEvents()}
      />

      <SchedulePdfUpload
        open={scheduleUploadOpen}
        onOpenChange={setScheduleUploadOpen}
        userId={user.id}
        subjects={subjects}
        onSaved={() => reloadSubjects()}
      />

      <AcademicCalendarUpload
        open={academicUploadOpen}
        onOpenChange={setAcademicUploadOpen}
        userId={user.id}
        onSaved={() => {
          reloadCustomEvents();
          // Recarrega o calendário pra grade já respeitar o período letivo
          // e os feriados sem precisar de refresh.
          loadAcademicCalendar();
        }}
      />
    </div>
  );
}

/* ---------------- subcomponents ---------------- */

function MonthDropdown({
  cursor,
  label,
  onSelect,
}: {
  cursor: Date;
  label: string;
  onSelect: (month: number, year: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background text-sm font-medium capitalize hover:bg-accent transition-colors"
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      {/* key força remount quando reabre → state interno reseta pro ano do cursor */}
      <MonthDropdownPanel
        key={open ? `${cursor.getFullYear()}-${cursor.getMonth()}` : "closed"}
        cursor={cursor}
        onSelect={(m, y) => {
          onSelect(m, y);
          setOpen(false);
        }}
      />
    </DropdownMenu>
  );
}

function MonthDropdownPanel({
  cursor,
  onSelect,
}: {
  cursor: Date;
  onSelect: (month: number, year: number) => void;
}) {
  const [pickerYear, setPickerYear] = useState<number>(cursor.getFullYear());
  /* Cada controle daqui é DropdownMenuItem, e não <button> puro. Com <button> o
     painel era uma armadilha de foco: ao abrir, o Radix move o foco pro
     container e tenta focar o primeiro item da RovingFocusGroup — mas nenhum
     destes controles estava na Collection do menu, então ↓/↑ chamavam
     focusFirst([]) e não faziam nada, o Tab é engolido pelo próprio Radix
     (preventDefault pra qualquer alvo dentro de [data-radix-menu-content]) e
     Enter/Espaço não tinham alvo. Quem navega por teclado abria o seletor, não
     via anel de foco em lugar nenhum e só saía com Esc — pular de julho pra
     dezembro voltava a exigir 5 cliques na seta "Próximo mês". No leitor de
     tela era pior: filhos não-menuitem dentro de role="menu" nem eram
     anunciados. O `onSelect` das setas de ano dá preventDefault pra o menu não
     fechar (elas navegam o painel, não escolhem o mês). */
  return (
    <DropdownMenuContent align="start" className="w-64 p-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setPickerYear((y) => y - 1);
            }}
            className="h-7 w-7 justify-center rounded p-0 text-muted-foreground [&_svg]:size-3.5"
            aria-label="Ano anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </DropdownMenuItem>
          <span className="text-sm font-semibold tabular-nums">{pickerYear}</span>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setPickerYear((y) => y + 1);
            }}
            className="h-7 w-7 justify-center rounded p-0 text-muted-foreground [&_svg]:size-3.5"
            aria-label="Próximo ano"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </DropdownMenuItem>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS_LONG.map((m, idx) => {
            const isCurrent =
              idx === cursor.getMonth() && pickerYear === cursor.getFullYear();
            return (
              <DropdownMenuItem
                key={m}
                onSelect={() => onSelect(idx, pickerYear)}
                aria-current={isCurrent ? "true" : undefined}
                className={cn(
                  "h-8 justify-center rounded px-0 py-0 text-xs font-medium",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {m.slice(0, 3)}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
  );
}

function FiltersDropdown({
  activeTypes,
  onToggle,
  onAll,
  onNone,
}: {
  activeTypes: Set<CalendarEventType>;
  onToggle: (t: CalendarEventType) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  const count = activeTypes.size;
  const allOn = count === ALL_TYPES.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4" />
          Filtros
          {!allOn && (
            <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Categorias visíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ALL_TYPES.map((t) => {
          const meta = EVENT_TYPE_META[t];
          const checked = activeTypes.has(t);
          return (
            <DropdownMenuItem
              key={t}
              onSelect={(e) => {
                e.preventDefault();
                onToggle(t);
              }}
              /* O quadradinho aqui é DESENHADO (span com borda + ícone Check),
                 não o checkbox do Radix — sem estes dois atributos o item saía
                 como `role="menuitem"` puro e o leitor de tela anunciava
                 "Prova, item de menu" e mais nada: marcar/desmarcar não mudava
                 anúncio nenhum e, como o onSelect faz preventDefault, o menu
                 nem fecha pra dar pista. A única confirmação era o conteúdo do
                 calendário — justo o que ele não consegue varrer.
                 (role vem DEPOIS do default do Radix no spread, então vence.) */
              role="menuitemcheckbox"
              aria-checked={checked}
              className="cursor-pointer"
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border",
                  checked
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
              <span className="text-sm">{meta.label}</span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        {/* Mesmo motivo do seletor de mês: <button> puro dentro de
            [data-radix-menu-content] não entra na Collection do Radix, então
            estes dois NUNCA recebiam foco (↓/↑ só percorriam as 5 categorias, o
            Tab é engolido pelo menu) e, como filhos não-menuitem de role="menu",
            nem eram anunciados no leitor de tela. O preventDefault mantém o
            comportamento de antes: marcar/limpar sem fechar o menu. */}
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onAll();
            }}
            className="flex-1 justify-center rounded px-2 py-1 text-xs text-muted-foreground"
          >
            Marcar todos
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onNone();
            }}
            className="flex-1 justify-center rounded px-2 py-1 text-xs text-muted-foreground"
          >
            Limpar
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Quantos eventos a célula do dia mostra antes de virar "+N mais". */
const MONTH_CELL_PREVIEW = 3;

function MonthGrid({
  cells,
  cursorMonth,
  today,
  selectedDay,
  onSelectDay,
  onDayDoubleClick,
  onEventClick,
  eventsByDay,
  nonTeachingByDay,
}: {
  cells: Date[];
  cursorMonth: number;
  today: Date;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  onDayDoubleClick: (d: Date) => void;
  onEventClick: (event: UEvent) => void;
  eventsByDay: Map<string, UEvent[]>;
  /** Dia → motivo de não ter aula (feriado/recesso do calendário acadêmico). */
  nonTeachingByDay: Map<string, string>;
}) {
  /* Dia com a lista aberta pelo "+N mais".
     Antes o "+N mais" era texto morto dentro do botão do dia: do 4º evento em
     diante o compromisso não era alcançável em NENHUM canto da view Mês —
     clicar no dia só desenha o anel (selectedDay não alimenta lista nenhuma da
     página), o duplo clique abre o form de NOVO evento e a sidebar mostra os
     próximos dias COM evento, não o dia selecionado. A prova marcada num dia de
     5 aulas só existia trocando de view. Agora o "+N mais" abre a célula e cada
     linha abre os detalhes. */
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60 bg-card/60">
        {WEEKDAY_HEADERS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((date, idx) => {
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const events = eventsByDay.get(key) ?? [];
          const inMonth = date.getMonth() === cursorMonth;
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDay);
          const expanded = expandedKey === key;
          const visible = expanded ? events : events.slice(0, MONTH_CELL_PREVIEW);
          // Quantos o corte esconde — NÃO muda ao expandir, senão o botão de
          // alternância desmontaria justamente ao ser clicado (ver abaixo).
          const overflow = events.length - MONTH_CELL_PREVIEW;
          const nonTeaching = nonTeachingByDay.get(toLocalIso(date));
          return (
            /* Era um <button>, depois virou div com role="button" — e nas duas
               formas a célula ENGOLIA a ativação por teclado dos filhos: o
               keydown do chip (ou do "+N mais") borbulha até aqui, o
               preventDefault cancelava o click sintético que o <button> só
               dispara DEPOIS da propagação, e Enter/Espaço num evento apenas
               movia o anel de seleção — o EventDetailsDialog nunca abria e o
               "+N mais" (único caminho pro 4º evento em diante) nunca expandia.
               role="button" ainda torna os filhos PRESENTACIONAIS em ARIA: o
               leitor de tela nem anunciava os chips como botões.
               Agora a célula é contêiner comum (clique e duplo clique seguem
               valendo pro mouse) e quem carrega o papel de controle é o botão
               do NÚMERO do dia, IRMÃO dos chips — ninguém engole ninguém e todo
               dia continua alcançável por Tab. */
            <div
              key={idx}
              onClick={() => onSelectDay(date)}
              onDoubleClick={() => onDayDoubleClick(date)}
              className={cn(
                // px-0.5 no celular: a 360px cada uma das 7 colunas tem ~46px e
                // o `px-1.5` sozinho comia 12px da caixa de conteúdo — 1/4 da
                // célula gasto em respiro enquanto o título da aula ficava com
                // ~15px (2 letras). Volta ao px-1.5 a partir do sm, onde sobra
                // largura.
                "relative min-h-[96px] md:min-h-[110px] border-r border-b border-border/40 px-0.5 sm:px-1.5 py-1.5 text-left transition-colors",
                idx % 7 === 6 && "border-r-0",
                idx >= 35 && "border-b-0",
                !inMonth && "bg-muted/20",
                isToday && "bg-primary/5",
                isSelected && "ring-2 ring-primary ring-inset",
                "hover:bg-accent/40",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <button
                  type="button"
                  // stopPropagation pra não disparar o onClick da célula duas
                  // vezes; é este botão que dá o foco de teclado do dia.
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelectDay(date);
                  }}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation();
                    onDayDoubleClick(date);
                  }}
                  aria-pressed={isSelected}
                  aria-label={`${date.getDate()} de ${MONTHS_LONG[date.getMonth()]}`}
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] font-medium px-1",
                    !inMonth && "text-muted-foreground/50",
                    inMonth && !isToday && !isSelected && "text-foreground",
                    isToday && "bg-primary text-primary-foreground",
                    isSelected && !isToday && "bg-primary/20 text-primary",
                  )}
                >
                  {date.getDate()}
                </button>
              </div>
              {/* Respiro maior no celular: com `space-y-0.5` os chips ficavam a
                  2px um do outro e errar o alvo abria os detalhes do evento
                  ERRADO (ou caía no clique da célula, que só move o anel). */}
              <div className="space-y-1 sm:space-y-0.5">
                {/* Marcador do dia sem aula. Vem ANTES dos eventos (e fora do
                    corte do "+N mais") porque é ele que impede o dia de sumir
                    calado: feriado/recesso apaga a aula da grade mesmo quando o
                    aluno deixou a linha desmarcada no importador e nenhum
                    evento foi criado — sem isto, 16, 17 e 18/02 ficavam em
                    branco sem uma palavra e o aluno concluía que a agenda
                    perdeu a grade dele. */}
                {nonTeaching && (
                  <div
                    className="truncate rounded bg-muted/60 px-1 py-0.5 text-[9px] leading-tight text-muted-foreground"
                    title={nonTeaching}
                  >
                    {nonTeaching}
                  </div>
                )}
                {visible.map((e) => {
                  const meta = EVENT_TYPE_META[e.type];
                  const subjTheme = getThemeFromGradient(e.subjectColor);
                  const dotClass = subjTheme?.dot ?? meta.dot;
                  const softClass = subjTheme?.soft ?? meta.soft;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      // stopPropagation: o clique é do evento, não do dia (que
                      // só moveria a seleção e fecharia nada).
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick(e);
                      }}
                      onDoubleClick={(ev) => ev.stopPropagation()}
                      className={cn(
                        // No celular o chip vira alvo de dedo (min-h 36px, era
                        // ~16,5px) e devolve os 4px do px-1 pro título.
                        "flex w-full min-h-[36px] items-center gap-1 rounded px-0.5 py-1 text-left text-[10px] leading-tight truncate transition-shadow hover:shadow-md sm:min-h-0 sm:px-1 sm:py-0.5",
                        softClass,
                      )}
                      title={
                        // Evento de intervalo aparece em vários dias: o sufixo
                        // é o que revela o período inteiro sem abrir o modal.
                        `${e.allDay ? e.title : `${e.startTime}–${e.endTime} ${e.title}`}${
                          e.spanLabel ? ` · ${e.spanLabel}` : ""
                        }`
                      }
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)} />
                      {/* A hora só entra a partir do sm. Em 360px a célula tem
                          ~26px de caixa de conteúdo e o mínimo do chip era dot
                          (6) + gaps (8) + "07:30" (~27, sem truncate e sem
                          shrink) ≈ 41px: o título encolhia pra ZERO (truncate
                          zera o min-width) e sobrava bolinha + "07:" cortado —
                          o mês inteiro no celular sem um nome de matéria, e o
                          `title` não existe no toque. Melhor o nome da matéria
                          que a hora pela metade. O shrink-0 garante que, onde
                          ela aparece, quem cede espaço é o título. */}
                      {!e.allDay && (
                        <span className="hidden shrink-0 font-medium tabular-nums text-muted-foreground sm:inline">
                          {e.startTime}
                        </span>
                      )}
                      {/* No celular o título QUEBRA em até 2 linhas em vez de
                          truncar em uma. Numa coluna de ~46px havia ~15px pro
                          nome: a 10px de fonte são ~2 caracteres, e o mês
                          inteiro virava "An…", "Fi…", "Bi…" sem como distinguir
                          uma aula da outra — a hora é `hidden sm:inline` e o
                          `title=` é tooltip de mouse, que não existe no toque,
                          então a única saída era abrir o modal de cada chip.
                          Com o padding devolvido (célula e chip) sobram ~27px
                          por linha; em duas linhas cabe "Bioquímica" inteiro.
                          `whitespace-normal` porque o `truncate` do botão põe
                          nowrap e ele herda, matando a quebra. A partir do sm
                          nada muda: line-clamp-1 elipsa igual ao truncate. */}
                      <span className="min-w-0 whitespace-normal break-words line-clamp-2 sm:whitespace-nowrap sm:line-clamp-1">
                        {e.title}
                      </span>
                    </button>
                  );
                })}
                {/* UM botão que ALTERNA, não dois que se revezam. Antes o
                    "+N mais" vivia sob `overflow > 0` e o "mostrar menos" sob
                    `expanded`: clicar num deles zerava a própria condição e o
                    nó FOCADO saía da árvore no mesmo commit. Quem navega por
                    teclado dava ~30 Tabs até a segunda-feira cheia, apertava
                    Enter em "+3 mais" (único caminho pro 4º evento em diante) e
                    o `document.activeElement` caía no <body>: o Tab seguinte
                    recomeçava na topbar do AppShell e ele tinha que refazer os
                    ~30 Tabs pra alcançar os eventos que acabou de revelar. Como
                    a condição agora não depende de `expanded`, o React reusa o
                    MESMO nó e o foco fica onde estava. */}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setExpandedKey(expanded ? null : key);
                    }}
                    onDoubleClick={(ev) => ev.stopPropagation()}
                    aria-expanded={expanded}
                    // Único caminho pro 4º evento em diante na view Mês, e
                    // tinha ~15px de altura encostado nos chips: errar pra cima
                    // abria os detalhes do evento errado, errar pra baixo caía
                    // no clique da célula (que não dá retorno nenhum). Vira
                    // alvo de 36px como os chips.
                    className="flex w-full min-h-[36px] items-center pl-2.5 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground hover:underline sm:block sm:min-h-0"
                  >
                    {expanded ? "mostrar menos" : `+${overflow} mais`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Week grid ---------------- */

const WEEK_START_HOUR = 7;
const WEEK_END_HOUR = 22;
const WEEK_HOUR_PX = 56;

/**
 * Evento "dia inteiro" (00:00→23:59), como os que vêm do calendário acadêmico.
 * Sem tratamento próprio ele viraria um bloco cobrindo a coluna inteira e
 * escondendo as aulas do dia.
 */
function isAllDayEvent(e: UEvent): boolean {
  return e.allDay;
}

/**
 * Fim do evento PARA LAYOUT. Fim <= início significa evento cruzando a
 * meia-noite (22:00–01:00) ou de duração zero — sem normalizar, a altura fica
 * negativa e o bloco some da grade sem nenhum aviso.
 */
function layoutEndMinutes(e: UEvent): number {
  if (e.endMinutes > e.startMinutes) return e.endMinutes;
  if (e.endMinutes < e.startMinutes) return 24 * 60; // corta na meia-noite
  return Math.min(24 * 60, e.startMinutes + 30);
}

type PositionedEvent = { event: UEvent; col: number; cols: number };

/**
 * Distribui em COLUNAS os eventos de um dia que se sobrepõem no horário.
 *
 * Antes todo bloco era `left-1 right-1`: prova sem horário no PDF (o
 * exam-pdf-upload cria tudo 08:00–09:00) caía exatamente em cima da aula das
 * 08:00 e, por vir depois na ordem de render, pintava por cima. Aula 08:00–09:00
 * sumia por completo da semana (seguia no mês e na agenda, o que parecia dado
 * apagado) e, na 08:00–09:40, a metade com o título ficava coberta e todo
 * clique ali abria a prova. Prova/bloco de estudo em cima de aula é o caso
 * normal, não a exceção.
 */
function layoutOverlaps(dayEvents: UEvent[]): PositionedEvent[] {
  const sorted = [...dayEvents].sort(
    (a, b) =>
      a.startMinutes - b.startMinutes ||
      layoutEndMinutes(a) - layoutEndMinutes(b),
  );
  const out: PositionedEvent[] = [];
  let cluster: Array<{ event: UEvent; col: number }> = [];
  let clusterEnd = -1;
  const flush = () => {
    if (cluster.length === 0) return;
    const cols = cluster.reduce((m, c) => Math.max(m, c.col + 1), 1);
    for (const c of cluster) out.push({ event: c.event, col: c.col, cols });
    cluster = [];
  };
  for (const e of sorted) {
    // Começou depois do fim de TODO o grupo aberto → grupo novo, e o próximo
    // evento volta a ocupar a largura inteira da coluna do dia.
    if (cluster.length > 0 && e.startMinutes >= clusterEnd) flush();
    const taken = new Set(
      cluster
        .filter((c) => layoutEndMinutes(c.event) > e.startMinutes)
        .map((c) => c.col),
    );
    let col = 0;
    while (taken.has(col)) col += 1;
    cluster.push({ event: e, col });
    clusterEnd =
      cluster.length === 1
        ? layoutEndMinutes(e)
        : Math.max(clusterEnd, layoutEndMinutes(e));
  }
  flush();
  return out;
}

/**
 * Colunas das TRÊS faixas da semana (cabeçalho dos dias, "dia inteiro" e grade
 * de horas) — sempre iguais, senão elas desalinham ao rolar pro lado.
 *
 * O `min-w` é o que faz o `overflow-x-auto` existir de verdade: com
 * `repeat(7,1fr)` puro o grid encolhe até caber (1fr é minmax(auto,1fr) e as
 * colunas do dia só têm filhos absolutos, min-content = 0), então em 360px cada
 * dia ficava com ~38px, o bloco da aula com ~22px úteis — nem título nem
 * horário legíveis — e a barra de rolagem NUNCA aparecia pra compensar. Com
 * piso de 640px a semana no celular passa a ~83px por dia e arrasta pro lado.
 */
const WEEK_GRID_COLS = "grid min-w-[640px] grid-cols-[60px_repeat(7,1fr)]";

const MONTHS_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function formatWeekRange(days: Date[]): string {
  if (days.length === 0) return "";
  const a = days[0];
  const b = days[days.length - 1];
  const sameMonth = a.getMonth() === b.getMonth();
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameMonth && sameYear) {
    return `${a.getDate()} – ${b.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()}`;
  }
  if (sameYear) {
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${a.getFullYear()}`;
  }
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
}

function WeekGrid({
  days,
  events,
  today,
  selectedDay,
  onSelectDay,
  onShiftWeek,
  onEventClick,
  nonTeachingByDay,
}: {
  days: Date[];
  events: UEvent[];
  today: Date;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  onShiftWeek: (delta: number) => void;
  onEventClick: (event: UEvent) => void;
  /** Dia → motivo de não ter aula (feriado/recesso do calendário acadêmico). */
  nonTeachingByDay: Map<string, string>;
}) {
  /* Faixa de horas da grade: parte de 07–22 mas ABRE pra caber o que estiver
     fora (aula 22:10, plantão 05:00, evento que cruza a meia-noite). Antes
     esses eventos eram descartados no clamp e sumiam da semana em silêncio —
     apareciam no mês e na agenda, o que parecia bug de dado. */
  const { startHour, endHour } = useMemo(() => {
    let min = WEEK_START_HOUR;
    let max = WEEK_END_HOUR;
    for (const e of events) {
      if (isAllDayEvent(e)) continue;
      min = Math.min(min, Math.floor(e.startMinutes / 60));
      max = Math.max(max, Math.ceil(layoutEndMinutes(e) / 60));
    }
    const from = Math.max(0, min);
    return { startHour: from, endHour: Math.min(24, Math.max(max, from + 1)) };
  }, [events]);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = startHour; h <= endHour; h++) out.push(h);
    return out;
  }, [startHour, endHour]);

  const totalMinutes = (endHour - startHour) * 60;
  const totalHeight = (endHour - startHour) * WEEK_HOUR_PX;

  const { timedByDay, allDayByDay } = useMemo(() => {
    const timed = new Map<string, UEvent[]>();
    const allDay = new Map<string, UEvent[]>();
    for (const e of events) {
      const k = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const target = isAllDayEvent(e) ? allDay : timed;
      const arr = target.get(k) ?? [];
      arr.push(e);
      target.set(k, arr);
    }
    // Cada dia vira lista POSICIONADA: sem colunas, quem sobrepõe some embaixo
    // do vizinho e ainda rouba o clique.
    const positioned = new Map<string, PositionedEvent[]>();
    for (const [k, list] of timed) positioned.set(k, layoutOverlaps(list));
    return { timedByDay: positioned, allDayByDay: allDay };
  }, [events]);

  const hasAllDay = allDayByDay.size > 0;

  /* A grade de horas rola DENTRO do card (o max-h-[70vh] logo abaixo) e nascia
     sempre no topo, 07:00. Em curso NOTURNO (19:00–22:40, o caso mais comum
     aqui) o bloco da aula fica em (19-7)*56 = 672px e o scroller mostra ~590px
     no celular / ~665px num 1080p: sete colunas com linha de hora e NENHUMA
     aula à vista. Nada na tela explicava — as aulas existem (não é feriado nem
     fora do período letivo, então termGap e nonTeachingNotice são null) e a
     barra de rolagem interna é overlay no iOS/Android/macOS, só aparece depois
     de arrastar. O aluno concluía que a grade não tinha salvado e subia o PDF
     de novo. Por isso, a cada semana carregada, ancoramos a rolagem interna no
     primeiro evento COM horário dela. */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let firstMinutes = Infinity;
    for (const e of events) {
      if (!isAllDayEvent(e)) {
        firstMinutes = Math.min(firstMinutes, e.startMinutes);
      }
    }
    // Semana vazia ou só com "dia inteiro": não há o que ancorar, fica em 07:00.
    if (!Number.isFinite(firstMinutes)) return;
    const eventTop = ((firstMinutes - startHour * 60) / 60) * WEEK_HOUR_PX;
    /* Cabeçalho e faixa "dia inteiro" são sticky (abaixo), então o que fica
       visível logo abaixo do bloco pregado é exatamente o `scrollTop` medido na
       GRADE. Antes somávamos aqui o offset da grade dentro do scroller — o que
       empurrava a faixa "dia inteiro" pra fora da área visível junto com o
       resto: a prova sem horário no PDF (gravada 00:00→23:59) e a semana de
       exames do calendário acadêmico só existem naquela faixa, e numa turma da
       tarde/noite (13:00 → ~350px, 19:00 → ~680px) elas nasciam acima do topo
       visível, sem nada na tela indicando conteúdo acima.
       Folga de 1h pra dar contexto da hora anterior; manhã cedo dá negativo e o
       clamp deixa tudo como era. */
    el.scrollTop = Math.max(0, eventTop - WEEK_HOUR_PX);
  }, [events, startHour]);

  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
      {/* Week navigation header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-card/60">
        <div className="flex items-center rounded-md border border-border bg-background">
          <button
            type="button"
            onClick={() => onShiftWeek(-1)}
            className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-l-md transition-colors"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onShiftWeek(1)}
            className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-r-md transition-colors border-l border-border"
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="text-sm font-semibold capitalize tabular-nums">
          {formatWeekRange(days)}
        </div>
        <div className="w-[60px]" />
      </div>

      {/* O `min-w-[640px]` das faixas faz caber só a calha de horas + ~3,2 dias
          em 360px, e nada na tela dizia que existem mais 4 à direita (barra de
          rolagem no celular é overlay: só aparece DEPOIS de arrastar). */}
      <div className="border-b border-border/60 px-3 py-1 text-[10px] text-muted-foreground md:hidden">
        {/* O "pra cima e pra baixo" foi acrescentado porque o aviso só falando
            de rolagem horizontal reforçava a leitura errada de que, na
            vertical, o card já mostrava o dia inteiro. */}
        Arraste pro lado pra ver os 7 dias · pra cima e pra baixo, as horas
      </div>

      {/* As três faixas (cabeçalho, "dia inteiro" e horas) dividem UM contêiner
          de rolagem: com scrolls separados, arrastar pro lado desalinhava as
          colunas do cabeçalho das colunas dos eventos.
          A rolagem VERTICAL também passou a ser daqui (max-h). Sem teto, o miolo
          07→22h tem 840px e rola junto com a PÁGINA: descer ~380px pra chegar
          nas 14:00 já tirava a faixa de dias da tela, e as 3 colunas visíveis
          ficavam sem rótulo nenhum — o bloco da aula só imprime título, hora e
          sala, nunca o dia, então "Farmacologia 14:00" na coluna do meio virava
          quarta quando era quinta. Com o teto a rolagem das horas acontece
          DENTRO do card e o cabeçalho fica pregado no topo (sticky abaixo); o
          sticky NÃO funciona sem este teto, porque o overflow-x já faz deste
          div o scrollport (overflow-y: visible computa pra auto) e sem altura
          limitada ele nunca rola. */}
      <div ref={scrollerRef} className="max-h-[70vh] overflow-x-auto overflow-y-auto">
      {/* Cabeçalho dos dias e faixa "dia inteiro" grudam JUNTOS no topo. A faixa
          é o ÚNICO lugar da semana onde vive evento sem horário — prova cujo PDF
          não trazia hora (gravada 00:00→23:59) e a semana de exames do
          calendário acadêmico — e, rolando junto com a grade, ela saía da área
          visível assim que a âncora automática descia pra primeira aula (curso
          da tarde/noite). O cabeçalho sticky seguia colado no topo, então a
          grade PARECIA estar no início e a prova simplesmente não aparecia em
          lugar nenhum daquela view. z-20 no bloco todo: fica acima do bloco de
          aula (hover:z-10) e da linha do agora (z-10). */}
      <div className="sticky top-0 z-20">
      {/* Day headers: é o ÚNICO identificador de dia da grade. Fundo opaco (não
          mais /60) porque tem grade passando por baixo dele. */}
      <div
        className={cn(
          WEEK_GRID_COLS,
          "border-b border-border/60 bg-card",
        )}
      >
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          const isSelected = isSameDay(d, selectedDay);
          const nonTeaching = nonTeachingByDay.get(toLocalIso(d));
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelectDay(d)}
              /* No leitor de tela os 7 dias se anunciavam idênticos ("SEG 16",
                 sem mês, sem ano) e o estado de seleção só existia no
                 `bg-primary/20` da bolinha — informação puramente visual. Só que
                 é o `selectedDay` que alimenta o único CTA de criar evento da
                 tela ("Adicionar compromisso" → openCreateDialog({ date:
                 selectedDay })), e o dialog mostra a data só num
                 `<input type="date">` já preenchido: o aluno apertava Enter num
                 dia achando que selecionou e não tinha como confirmar em qual
                 dia o formulário ia gravar. Mesmos dois atributos que o botão do
                 dia na view Mês já ganhou. O rótulo de feriado/recesso entra
                 junto porque o aria-label SUBSTITUI o conteúdo do botão — sem
                 isso, a única pista de "dia sem aula" sumiria pro leitor. */
              aria-pressed={isSelected}
              aria-label={
                nonTeaching
                  ? `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}, ${nonTeaching}`
                  : `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`
              }
              className={cn(
                "flex min-w-0 flex-col items-center py-2 transition-colors",
                "hover:bg-accent/40",
                isSelected && !isToday && "bg-primary/5",
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {WEEKDAY_HEADERS[d.getDay()]}
              </span>
              <span
                className={cn(
                  "mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-semibold px-1.5",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : isSelected
                      ? "bg-primary/20 text-primary"
                      : "text-foreground",
                )}
              >
                {d.getDate()}
              </span>
              {/* Feriado/recesso apaga as aulas do dia mesmo estando DENTRO do
                  período letivo (e mesmo quando o aluno deixou a linha
                  desmarcada no importador, quando nem evento existe): sem este
                  rótulo a coluna de segunda a quarta do Carnaval ficava
                  totalmente vazia sem uma palavra explicando. */}
              {nonTeaching && (
                <span
                  className="mt-0.5 max-w-full truncate px-1 text-[9px] leading-tight text-muted-foreground"
                  title={nonTeaching}
                >
                  {nonTeaching}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Faixa "dia inteiro" — eventos sem hora (calendário acadêmico) ficam
          aqui em vez de virar um bloco cobrindo a coluna toda. */}
      {/* bg-card obrigatório: agora ela é sticky e a grade de horas passa por
          baixo — sem fundo opaco os blocos de aula apareceriam ATRAVÉS do chip
          da prova. */}
      {hasAllDay && (
        <div className={cn(WEEK_GRID_COLS, "border-b border-border/60 bg-card")}>
          <div className="flex items-start justify-end border-r border-border/40 px-1.5 py-1 text-[10px] text-muted-foreground">
            dia
          </div>
          {days.map((d, dayIdx) => {
            const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const items = allDayByDay.get(k) ?? [];
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  /* min-w-0 é obrigatório aqui: `1fr` é `minmax(auto,1fr)`, ou
                     seja o PISO da coluna é o min-content dela. O chip é um
                     bloco em fluxo normal com `truncate` (white-space:nowrap) —
                     e truncate só zera min-content de item de grid/flex, não de
                     bloco filho — então o min-content da célula virava a largura
                     INTEIRA do título, que vem verbatim do PDF ("Recesso
                     Acadêmico e Feriado de Corpus Christi", até 160 chars).
                     Como esta faixa, o cabeçalho dos dias e a grade de horas são
                     TRÊS grids independentes com o mesmo template, a coluna da
                     quarta esticava só aqui (~240px contra ~100px das outras) e
                     o chip passava a aparecer embaixo do dia errado — e o chip
                     não mostra data, a posição na coluna é a única informação de
                     dia que o aluno tem. Em 360px a soma dos min-contents ainda
                     estourava o card e cortava sexta e sábado. Mesmo modo de
                     falha documentado em ui/dialog.tsx:47-50. */
                  "min-w-0 space-y-0.5 border-r border-border/40 px-1 py-1",
                  dayIdx === 6 && "border-r-0",
                  isSameDay(d, today) && "bg-primary/5",
                )}
              >
                {items.map((e) => {
                  const meta = EVENT_TYPE_META[e.type];
                  const subjTheme = getThemeFromGradient(e.subjectColor);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick(e);
                      }}
                      className={cn(
                        "block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight transition-shadow hover:shadow-md",
                        subjTheme?.soft ?? meta.soft,
                        subjTheme?.text ?? meta.text,
                      )}
                      /* Com o intervalo repetido em vários dias, o tooltip é
                         o que diz que o dia 24 faz parte de 22/06 a 26/06. */
                      title={e.spanLabel ? `${e.title} · ${e.spanLabel}` : e.title}
                    >
                      {e.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Hour grid + events */}
      <div className="relative">
        <div className={WEEK_GRID_COLS} style={{ height: totalHeight }}>
          {/* Hour gutter */}
          <div className="relative border-r border-border/40">
            {hours.map((h, idx) => (
              <div
                key={h}
                className="absolute left-0 right-0 px-1.5 text-[10px] text-muted-foreground tabular-nums text-right pr-1"
                style={{ top: idx * WEEK_HOUR_PX - 6 }}
              >
                {pad2(h % 24)}:00
              </div>
            ))}
          </div>

          {/* 7 day columns */}
          {days.map((d, dayIdx) => {
            const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const dayEvents = timedByDay.get(k) ?? [];
            const isToday = isSameDay(d, today);
            // Fundo esmaecido reforça o rótulo do cabeçalho: a coluna está
            // vazia porque é feriado/recesso, não porque a grade sumiu.
            const isNonTeaching = nonTeachingByDay.has(toLocalIso(d));
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  "relative border-r border-border/40",
                  dayIdx === 6 && "border-r-0",
                  isNonTeaching && "bg-muted/30",
                  isToday && "bg-primary/5",
                )}
              >
                {/* Hour lines */}
                {hours.map((_, idx) => (
                  <div
                    key={idx}
                    className="absolute left-0 right-0 border-t border-border/30"
                    style={{ top: idx * WEEK_HOUR_PX }}
                  />
                ))}
                {/* Now indicator */}
                {isToday && (
                  <NowIndicator startHour={startHour} endHour={endHour} />
                )}
                {/* Events */}
                {dayEvents.map(({ event: e, col, cols }) => {
                  const startOffset = Math.max(
                    0,
                    e.startMinutes - startHour * 60,
                  );
                  const endClamped = Math.min(
                    totalMinutes,
                    layoutEndMinutes(e) - startHour * 60,
                  );
                  // A faixa é derivada dos próprios eventos, então nada deveria
                  // cair fora; guarda só pra nunca renderizar bloco invertido.
                  if (endClamped <= startOffset) return null;
                  const top = (startOffset / 60) * WEEK_HOUR_PX;
                  const height = Math.max(
                    18,
                    ((endClamped - startOffset) / 60) * WEEK_HOUR_PX,
                  );
                  const meta = EVENT_TYPE_META[e.type];
                  const subjTheme = getThemeFromGradient(e.subjectColor);
                  const softClass = subjTheme?.soft ?? meta.soft;
                  const textClass = subjTheme?.text ?? meta.text;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick(e);
                      }}
                      className={cn(
                        "absolute rounded-md border-l-2 px-1.5 py-1 text-[10px] leading-tight overflow-hidden text-left transition-shadow hover:shadow-md hover:z-10",
                        softClass,
                        textClass,
                      )}
                      style={{
                        top,
                        height,
                        // Colunas lado a lado quando há sobreposição (cols > 1);
                        // sozinho, ocupa a largura toda como antes.
                        left: `calc(${(col / cols) * 100}% + 2px)`,
                        width: `calc(${100 / cols}% - 4px)`,
                        borderLeftColor: "currentColor",
                      }}
                      title={`${e.startTime}–${e.endTime} ${e.title}`}
                    >
                      <div className={cn("font-semibold truncate", textClass)}>
                        {e.title}
                      </div>
                      <div className="text-[9px] text-muted-foreground tabular-nums">
                        {e.startTime}–{e.endTime}
                      </div>
                      {e.room && (
                        <div className="text-[9px] text-muted-foreground truncate">
                          {e.room}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}

function NowIndicator({
  startHour,
  endHour,
}: {
  startHour: number;
  endHour: number;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < startHour * 60 || minutes > endHour * 60) return null;
  const top = ((minutes - startHour * 60) / 60) * WEEK_HOUR_PX;
  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top }}
    >
      <div className="relative">
        <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
        <div className="h-px bg-red-500" />
      </div>
    </div>
  );
}

/* ---------------- Agenda view ---------------- */

/** Teto de segurança da lista. Bem acima de um mês de grade cheia (~180
 *  ocorrências) — e quando morde, o rodapé DIZ que mordeu, em vez de a lista
 *  terminar no meio do mês fingindo que não há mais nada. */
const AGENDA_MAX_ROWS = 400;

function AgendaView({
  events,
  activeFilter,
  onFilterChange,
  onOpenDetails,
  today,
  hiddenByFilters = false,
}: {
  events: UEvent[];
  activeFilter: CalendarEventType | "all";
  onFilterChange: (f: CalendarEventType | "all") => void;
  /** Abre o EventDetailsDialog (Editar/Excluir) do evento tocado. */
  onOpenDetails: (event: UEvent) => void;
  /** Hoje 00:00 local, vindo do tique de relógio da página. */
  today: Date;
  /** A categoria pedida está desmarcada nos Filtros/legenda? Muda o texto do
   *  vazio: "não existe compromisso" e "está escondido" são coisas diferentes. */
  hiddenByFilters?: boolean;
}) {
  const shown = useMemo(
    () =>
      events.length > AGENDA_MAX_ROWS ? events.slice(0, AGENDA_MAX_ROWS) : events,
    [events],
  );
  const hiddenCount = events.length - shown.length;

  // Agrupa por dia
  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; events: UEvent[] }>();
    for (const e of shown) {
      const k = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const existing = map.get(k);
      if (existing) existing.events.push(e);
      else map.set(k, { date: new Date(e.date), events: [e] });
    }
    return Array.from(map.values());
  }, [shown]);

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            activeFilter === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          Todos
        </button>
        {ALL_TYPES.map((t) => {
          const meta = EVENT_TYPE_META[t];
          const active = activeFilter === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onFilterChange(t)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? cn(meta.soft, "border-current", meta.text)
                  : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
              {meta.label}
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        hiddenByFilters ? (
          <PlaceholderView
            title="Oculto pelos filtros"
            hint="O que você pediu está desmarcado no dropdown Filtros (ou na legenda embaixo do calendário) — pode haver compromisso agendado aqui. Marque de novo pra ver."
          />
        ) : (
          <PlaceholderView
            title="Agenda vazia"
            hint="Nenhum compromisso para essa categoria nos próximos 30 dias."
          />
        )
      ) : (
        <>
          <div className="rounded-xl border border-border/70 bg-card divide-y divide-border/60">
            {groups.map((g, idx) => (
              <div key={idx} className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {dayHeaderLabel(g.date, today)} · {formatDateLabel(g.date)}
                </div>
                <div className="space-y-2">
                  {g.events.map((e) => (
                    <AgendaEventRow
                      key={e.id}
                      event={e}
                      onOpenDetails={() => onOpenDetails(e)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            /* A lista terminando sem aviso é o que fazia o aluno concluir que
               não havia mais nada no mês. Se cortar, tem que aparecer. */
            <p className="px-1 text-xs text-muted-foreground">
              Mostrando os primeiros {shown.length} de {events.length}{" "}
              compromissos dos próximos 30 dias. Filtre por categoria pra ver os
              outros {hiddenCount}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AgendaEventRow({
  event: e,
  onOpenDetails,
}: {
  event: UEvent;
  onOpenDetails: () => void;
}) {
  const meta = EVENT_TYPE_META[e.type];
  const subjTheme = getThemeFromGradient(e.subjectColor);
  const chipSoft = subjTheme?.soft ?? meta.soft;
  const chipText = subjTheme?.text ?? meta.text;
  const chipDot = subjTheme?.dot ?? meta.dot;
  const content = (
    <>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white",
          e.subjectColor ? cn("bg-gradient-to-br", e.subjectColor) : meta.bar,
        )}
      >
        <EventIcon event={e} size={4} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{e.title}</span>
          <span
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              chipSoft,
              chipText,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", chipDot)} />
            {meta.label}
          </span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1">
            {e.allDay ? (
              <CalendarDays className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            {e.allDay ? "Dia todo" : `${e.startTime}–${e.endTime}`}
          </span>
          {e.room && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {e.room}
            </span>
          )}
          {e.subjectName && (
            <span className="truncate max-w-[180px]">· {e.subjectName}</span>
          )}
        </div>
        {e.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {e.description}
          </p>
        )}
      </div>
    </>
  );
  /* A linha inteira abre os DETALHES, com ou sem matéria.
     Antes ela tinha dois destinos e nenhum servia: COM `subjectId` virava um
     <Link> pra /subject e SEM matéria era uma <div> inerte (clicar não fazia
     absolutamente nada — sem modal, sem hover, sem cursor). Nos dois casos o
     EventDetailsDialog, único lugar com Editar e Excluir, nunca abria pela aba
     Agenda — que é o destino do "Ver agenda completa →", das pills de categoria
     e a única view realmente legível no celular. Quem importou o calendário e
     viu "Prova N1 - Bioquímica" na data errada não tinha como corrigir nem
     apagar por aqui: só descobrindo sozinho que precisava voltar pro Mês ou
     Semana e caçar o dia. A matéria continua a um toque: o próprio dialog tem
     o link "→ <nome da matéria>". */
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="flex w-full items-center gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2 text-left hover:border-primary/40 hover:bg-secondary/40 transition-colors"
    >
      {content}
    </button>
  );
}

function SidebarEventItem({
  event: e,
  onOpenDetails,
}: {
  event: UEvent;
  onOpenDetails: () => void;
}) {
  const meta = EVENT_TYPE_META[e.type];
  const subjTheme = getThemeFromGradient(e.subjectColor);
  const labelTextClass = subjTheme?.text ?? meta.text;
  const body = (
    <>
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded text-white",
          e.subjectColor ? cn("bg-gradient-to-br", e.subjectColor) : meta.bar,
        )}
      >
        <EventIcon event={e} size={3} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {e.allDay ? (
            <>
              <CalendarDays className="h-2.5 w-2.5" />
              Dia todo
            </>
          ) : (
            <>
              <Clock className="h-2.5 w-2.5" />
              {e.startTime}
              {e.endTime !== e.startTime && `–${e.endTime}`}
            </>
          )}
        </div>
        <div className="text-xs font-medium truncate">{e.title}</div>
        <div className={cn("text-[10px] truncate", labelTextClass)}>
          {e.subjectName ?? meta.label}
        </div>
      </div>
    </>
  );

  const baseClasses =
    "flex w-full items-start gap-2 rounded-md border border-border/50 bg-background/60 px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/40";

  /* Mesmo motivo da AgendaEventRow: com `subjectId` o item virava <Link> pra
     /subject e o `onOpenDetails` recebido virava código morto justamente pros
     eventos vindos do importador (que nascem com matéria casada). Editar e
     excluir só existem no dialog. */
  return (
    <button type="button" onClick={onOpenDetails} className={baseClasses}>
      {body}
    </button>
  );
}

function PlaceholderView({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
      <LumiPic
        src="/illustrations/lumi-sleeping.png"
        alt="Lumi descansando"
        className="mx-auto mb-3 h-24 w-24 object-contain drop-shadow-sm"
      />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{hint}</p>
    </div>
  );
}

function Legend({
  activeTypes,
  onToggle,
}: {
  activeTypes: Set<CalendarEventType>;
  onToggle: (t: CalendarEventType) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px]">
      {ALL_TYPES.map((t) => {
        const meta = EVENT_TYPE_META[t];
        const active = activeTypes.has(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t)}
            /* O estado DESMARCADO era desenhado apagando o rótulo
               (`text-muted-foreground/60` = ~2,4:1 no claro e ~3,0:1 no escuro a
               11px, contra os 4,5:1 mínimos de AA) — e é justamente o estado em
               que a categoria sumiu do mês/semana e a legenda é o caminho de
               volta. Com uma ou duas categorias desmarcadas o banner "Tudo
               oculto pelos filtros" nem aparece, então esse texto ilegível era o
               ÚNICO indício na tela: o aluno via o calendário sem provas, não
               conseguia ler qual dos 5 rótulos estava apagado e concluía que o
               app perdeu os eventos. Agora o OFF não depende mais de contraste:
               o rótulo fica em `text-muted-foreground` cheio (~6:1 nos dois
               temas) e quem carrega o estado é o risco. */
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors",
              active ? "text-foreground" : "text-muted-foreground",
            )}
            /* A legenda também FILTRA, e o estado só aparecia na opacidade e no
               `title` — invisível pro leitor de tela, que anunciava "Provas,
               botão" marcado ou desmarcado do mesmo jeito. */
            aria-pressed={active}
            title={active ? "Ocultar" : "Mostrar"}
          >
            {/* Bolinha sempre em cor cheia: ela é a CHAVE de cor que liga a
                legenda aos chips do calendário (a 8px, o `opacity-50` de antes
                deixava a cor em ~2:1 e a chave inútil justamente no estado em
                que o aluno precisa dela pra achar o filtro certo). */}
            <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
            <span className={cn(!active && "line-through")}>
              {meta.label === "Bloco de estudo" ? "Blocos de estudo" : meta.label + "s"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Resolve qual ícone Lucide renderizar pro evento — preferindo o ícone da
 * matéria quando ela existe; senão, fallback pro ícone do tipo de evento.
 *
 * Renderiza via `React.createElement` pra evitar o falso-positivo do lint
 * `react-hooks/static-components` (que reclama de `const Icon = fn(); <Icon/>`).
 */
function EventIcon({ event, size }: { event: UEvent; size: number }) {
  const sizeClass =
    size === 3 ? "h-3 w-3" : size === 3.5 ? "h-3.5 w-3.5" : "h-4 w-4";
  const IconCmp =
    event.subjectColor && event.subjectName
      ? getSubjectIcon(event.subjectName)
      : getTypeIcon(event.type);
  return createElement(IconCmp, { className: sizeClass });
}
