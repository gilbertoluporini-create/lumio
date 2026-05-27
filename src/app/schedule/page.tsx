"use client";

import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
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
import { listSubjectsAsync } from "@/lib/db";
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

function greetingPrefix(): string {
  const h = new Date().getHours();
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

function dayHeaderLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
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
  title: string;
  subjectId?: string;
  subjectName?: string;
  subjectColor?: string; // gradient (ex.: "from-indigo-500 to-violet-500")
  room?: string;
  description?: string;
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
    const dow = d.getDay();
    for (const s of subjects) {
      for (const slot of s.schedule ?? []) {
        if (slot.dayOfWeek !== dow) continue;
        out.push({
          id: `aula-${s.id}-${d.toISOString().slice(0, 10)}-${slot.startTime}`,
          type: "aula",
          date: new Date(d),
          startMinutes: timeToMinutes(slot.startTime),
          endMinutes: timeToMinutes(slot.endTime),
          startTime: slot.startTime,
          endTime: slot.endTime,
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

/* Converte CalendarEvent (storage) em UEvent. */
function customEventToUEvent(
  ev: CalendarEvent,
  subjects: Subject[],
): UEvent {
  const start = new Date(ev.starts_at);
  const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  const subj = ev.subject_id ? subjects.find((s) => s.id === ev.subject_id) : undefined;
  return {
    id: ev.id,
    type: ev.type,
    date: day,
    startMinutes: start.getHours() * 60 + start.getMinutes(),
    endMinutes: end.getHours() * 60 + end.getMinutes(),
    startTime: formatTime(start),
    endTime: formatTime(end),
    title: ev.title,
    subjectId: subj?.id,
    subjectName: subj?.name,
    subjectColor: subj?.color,
    description: ev.description,
  };
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

  /* Week view navigation cursor (independente do month cursor) */
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  /* Carrega subjects + custom events em paralelo. */
  useEffect(() => {
    let active = true;
    Promise.all([listSubjectsAsync(user.id), listEventsAsync(user.id)])
      .then(([subs, evs]) => {
        if (!active) return;
        setSubjects(subs);
        setCustomEvents(evs);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  const reloadCustomEvents = useCallback(() => {
    listEventsAsync(user.id).then((evs) => setCustomEvents(evs));
  }, [user.id]);

  /* Combina aulas + custom events para uma janela ampla (12 semanas), depois filtra por view. */
  const allEvents = useMemo(() => {
    // Janela: 8 semanas antes do cursor → 16 semanas depois → cobre mês + semana + agenda 30d
    const windowStart = new Date(cursor);
    windowStart.setDate(windowStart.getDate() - 14);
    const windowEnd = new Date(cursor);
    windowEnd.setMonth(windowEnd.getMonth() + 3);

    const aulas = subjects.length ? expandSlotsToEvents(subjects, windowStart, windowEnd) : [];
    const custom = customEvents.map((c) => customEventToUEvent(c, subjects));
    // Inclui TODOS custom (mesmo fora da janela acima — pra cards "próximos")
    const all = [...aulas, ...custom];
    return all
      .filter((e) => activeTypes.has(e.type))
      .sort((a, b) => {
        const ad = a.date.getTime() - b.date.getTime();
        if (ad !== 0) return ad;
        return a.startMinutes - b.startMinutes;
      });
  }, [subjects, customEvents, cursor, activeTypes]);

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

  /* Próximos 30 dias a partir de hoje. */
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const today00 = new Date(now);
    today00.setHours(0, 0, 0, 0);
    const horizon = new Date(today00);
    horizon.setDate(horizon.getDate() + 30);
    const nowMin = now.getHours() * 60 + now.getMinutes();

    return allEvents.filter((e) => {
      if (e.date.getTime() < today00.getTime()) return false;
      if (e.date.getTime() > horizon.getTime()) return false;
      if (isSameDay(e.date, today00)) {
        return e.endMinutes > nowMin;
      }
      return true;
    });
  }, [allEvents]);

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

  /* Cards por tipo. */
  const cardEvents = useMemo(() => {
    const byType = (t: CalendarEventType) =>
      upcomingEvents.filter((e) => e.type === t).slice(0, 3);
    return {
      aula: byType("aula"),
      bloco: byType("bloco"),
      prova: byType("prova"),
      trabalho: byType("trabalho"),
    };
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

  /* Sincroniza weekAnchor ao mudar pra view semana ou clicar num dia (UX:
     entrar na semana e ver a semana do dia selecionado). */
  useEffect(() => {
    if (view === "semana") {
      setWeekAnchor((prev) => {
        const sa = startOfWeek(prev);
        const ss = startOfWeek(selectedDay);
        return sa.getTime() === ss.getTime() ? prev : selectedDay;
      });
    }
  }, [view, selectedDay]);

  const eventsInWeek = useMemo(() => {
    const start = weekDays[0];
    const end = new Date(weekDays[6]);
    end.setHours(23, 59, 59, 999);
    return allEvents.filter(
      (e) => e.date.getTime() >= start.getTime() && e.date.getTime() <= end.getTime(),
    );
  }, [allEvents, weekDays]);

  /* Agenda view: próximos 30 dias filtrados por tipo (se houver). */
  const agendaEvents = useMemo(() => {
    if (agendaFilter === "all") return upcomingEvents;
    return upcomingEvents.filter((e) => e.type === agendaFilter);
  }, [upcomingEvents, agendaFilter]);

  function goToToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDay(today);
    const c = new Date(today);
    c.setDate(1);
    setCursor(c);
  }

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + delta);
      next.setDate(1);
      next.setHours(0, 0, 0, 0);
      return next;
    });
  }

  function setMonthYear(month: number, year: number) {
    const d = new Date(year, month, 1);
    d.setHours(0, 0, 0, 0);
    setCursor(d);
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
    const isCustom = customEvents.some((c) => c.id === u.id);
    const details: DetailsEvent = {
      id: u.id,
      type: u.type,
      date: u.date,
      startTime: u.startTime,
      endTime: u.endTime,
      title: u.title,
      subjectId: u.subjectId,
      subjectName: u.subjectName,
      subjectColor: u.subjectColor,
      room: u.room,
      description: u.description,
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

  function jumpToAgendaFiltered(type: CalendarEventType | "all") {
    setAgendaFilter(type);
    setView("agenda");
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  const firstName = user.name.split(" ")[0] || "estudante";
  const monthLabel = `${MONTHS_LONG[cursor.getMonth()]} de ${cursor.getFullYear()}`;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            {greetingPrefix()}, {firstName}
          </p>
          <h1 className="text-3xl md:text-4xl heading-display">
            Calendário de estudos
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Organize suas aulas, sessões de estudo e prazos importantes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              <Plus className="h-4 w-4" />
              Nova matéria
            </Link>
          </Button>
          <Button asChild variant="gradient" size="sm">
            <Link href="/dashboard">
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
            cursor={cursor}
            label={monthLabel}
            onSelect={setMonthYear}
          />
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
                  onClick={() => setView(v)}
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
          {view === "mes" && (
            <MonthGrid
              cells={monthGrid.cells}
              cursorMonth={cursor.getMonth()}
              today={today}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onDayDoubleClick={(d) => openCreateDialog({ date: d })}
              eventsByDay={eventsByDay}
            />
          )}
          {view === "semana" && (
            <WeekGrid
              days={weekDays}
              events={eventsInWeek}
              today={today}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onShiftWeek={(delta) => {
                setWeekAnchor((prev) => {
                  const next = new Date(prev);
                  next.setDate(prev.getDate() + delta * 7);
                  next.setHours(0, 0, 0, 0);
                  return next;
                });
              }}
              onEventClick={openEventDetails}
            />
          )}
          {view === "agenda" && (
            <AgendaView
              events={agendaEvents.slice(0, 60)}
              activeFilter={agendaFilter}
              onFilterChange={setAgendaFilter}
            />
          )}

          <Legend activeTypes={activeTypes} onToggle={toggleType} />

          {/* 4 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <CategoryCard
              title="Próximas aulas"
              icon={GraduationCap}
              accent="text-primary"
              onSeeAll={() => jumpToAgendaFiltered("aula")}
            >
              <EventList items={cardEvents.aula} fallback="Nenhuma aula agendada" />
            </CategoryCard>

            <CategoryCard
              title="Blocos de estudo"
              icon={BookOpen}
              accent="text-blue-500"
              onSeeAll={() => jumpToAgendaFiltered("bloco")}
              onAdd={() => openCreateDialog({ type: "bloco" })}
            >
              <EventList items={cardEvents.bloco} fallback="Sem blocos planejados" />
            </CategoryCard>

            <CategoryCard
              title="Provas"
              icon={FileText}
              accent="text-red-500"
              onSeeAll={() => jumpToAgendaFiltered("prova")}
              onAdd={() => openCreateDialog({ type: "prova" })}
              extraHeaderAction={
                <button
                  type="button"
                  onClick={() => setPdfUploadOpen(true)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors"
                  aria-label="Upload calendário de provas"
                  title="Upload calendário de provas (PDF)"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
              }
            >
              <EventList items={cardEvents.prova} fallback="Nenhuma prova marcada" />
              <button
                type="button"
                onClick={() => setPdfUploadOpen(true)}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-background/50 px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-accent/40 transition-colors"
              >
                <Upload className="h-3 w-3" />
                Upload calendário de provas
              </button>
            </CategoryCard>

            <CategoryCard
              title="Trabalhos e entregas"
              icon={Sparkles}
              accent="text-amber-500"
              onSeeAll={() => jumpToAgendaFiltered("trabalho")}
              onAdd={() => openCreateDialog({ type: "trabalho" })}
            >
              <EventList items={cardEvents.trabalho} fallback="Nada entregue em breve" />
            </CategoryCard>
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="lg:col-span-3">
          <div className="rounded-xl border border-border/70 bg-card p-4 sticky top-4">
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
                Nenhum compromisso nos próximos dias.
              </div>
            ) : (
              <div className="space-y-4">
                {agendaGroups.map((g, idx) => (
                  <div key={idx}>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                      {dayHeaderLabel(g.date)} · {formatDateLabel(g.date)}
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
  return (
    <DropdownMenuContent align="start" className="w-64 p-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            onClick={() => setPickerYear((y) => y - 1)}
            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground"
            aria-label="Ano anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-semibold tabular-nums">{pickerYear}</span>
          <button
            type="button"
            onClick={() => setPickerYear((y) => y + 1)}
            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground"
            aria-label="Próximo ano"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS_LONG.map((m, idx) => {
            const isCurrent =
              idx === cursor.getMonth() && pickerYear === cursor.getFullYear();
            return (
              <button
                key={m}
                type="button"
                onClick={() => onSelect(idx, pickerYear)}
                className={cn(
                  "h-8 rounded text-xs font-medium transition-colors",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground",
                )}
              >
                {m.slice(0, 3)}
              </button>
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
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <button
            type="button"
            onClick={onAll}
            className="flex-1 rounded px-2 py-1 text-xs hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            Marcar todos
          </button>
          <button
            type="button"
            onClick={onNone}
            className="flex-1 rounded px-2 py-1 text-xs hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            Limpar
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MonthGrid({
  cells,
  cursorMonth,
  today,
  selectedDay,
  onSelectDay,
  onDayDoubleClick,
  eventsByDay,
}: {
  cells: Date[];
  cursorMonth: number;
  today: Date;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  onDayDoubleClick: (d: Date) => void;
  eventsByDay: Map<string, UEvent[]>;
}) {
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
          const visible = events.slice(0, 3);
          const overflow = events.length - visible.length;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDay(date)}
              onDoubleClick={() => onDayDoubleClick(date)}
              className={cn(
                "relative min-h-[96px] md:min-h-[110px] border-r border-b border-border/40 px-1.5 py-1.5 text-left transition-colors",
                idx % 7 === 6 && "border-r-0",
                idx >= 35 && "border-b-0",
                !inMonth && "bg-muted/20",
                isToday && "bg-primary/5",
                isSelected && "ring-2 ring-primary ring-inset",
                "hover:bg-accent/40",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] font-medium px-1",
                    !inMonth && "text-muted-foreground/50",
                    inMonth && !isToday && !isSelected && "text-foreground",
                    isToday && "bg-primary text-primary-foreground",
                    isSelected && !isToday && "bg-primary/20 text-primary",
                  )}
                >
                  {date.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {visible.map((e) => {
                  const meta = EVENT_TYPE_META[e.type];
                  const subjTheme = getThemeFromGradient(e.subjectColor);
                  const dotClass = subjTheme?.dot ?? meta.dot;
                  const softClass = subjTheme?.soft ?? meta.soft;
                  return (
                    <div
                      key={e.id}
                      className={cn(
                        "flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate",
                        softClass,
                      )}
                      title={`${e.startTime}–${e.endTime} ${e.title}`}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)} />
                      <span className="font-medium tabular-nums text-muted-foreground">
                        {e.startTime}
                      </span>
                      <span className="truncate">{e.title}</span>
                    </div>
                  );
                })}
                {overflow > 0 && (
                  <div className="text-[10px] text-muted-foreground font-medium pl-2.5">
                    +{overflow} mais
                  </div>
                )}
              </div>
            </button>
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
}: {
  days: Date[];
  events: UEvent[];
  today: Date;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  onShiftWeek: (delta: number) => void;
  onEventClick: (event: UEvent) => void;
}) {
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = WEEK_START_HOUR; h <= WEEK_END_HOUR; h++) out.push(h);
    return out;
  }, []);

  const totalMinutes = (WEEK_END_HOUR - WEEK_START_HOUR) * 60;
  const totalHeight = (WEEK_END_HOUR - WEEK_START_HOUR) * WEEK_HOUR_PX;

  const eventsByDayInWeek = useMemo(() => {
    const map = new Map<string, UEvent[]>();
    for (const e of events) {
      const k = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [events]);

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

      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border/60 bg-card/60">
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          const isSelected = isSameDay(d, selectedDay);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelectDay(d)}
              className={cn(
                "flex flex-col items-center py-2 transition-colors",
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
            </button>
          );
        })}
      </div>

      {/* Hour grid + events */}
      <div className="relative overflow-x-auto">
        <div
          className="grid grid-cols-[60px_repeat(7,1fr)]"
          style={{ height: totalHeight }}
        >
          {/* Hour gutter */}
          <div className="relative border-r border-border/40">
            {hours.map((h, idx) => (
              <div
                key={h}
                className="absolute left-0 right-0 px-1.5 text-[10px] text-muted-foreground tabular-nums text-right pr-1"
                style={{ top: idx * WEEK_HOUR_PX - 6 }}
              >
                {pad2(h)}:00
              </div>
            ))}
          </div>

          {/* 7 day columns */}
          {days.map((d, dayIdx) => {
            const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const dayEvents = eventsByDayInWeek.get(k) ?? [];
            const isToday = isSameDay(d, today);
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  "relative border-r border-border/40",
                  dayIdx === 6 && "border-r-0",
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
                {isToday && <NowIndicator />}
                {/* Events */}
                {dayEvents.map((e) => {
                  const startOffset = Math.max(
                    0,
                    e.startMinutes - WEEK_START_HOUR * 60,
                  );
                  const endClamped = Math.min(
                    totalMinutes,
                    e.endMinutes - WEEK_START_HOUR * 60,
                  );
                  if (endClamped <= 0 || startOffset >= totalMinutes) return null;
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
                        "absolute left-1 right-1 rounded-md border-l-2 px-1.5 py-1 text-[10px] leading-tight overflow-hidden text-left transition-shadow hover:shadow-md hover:z-10",
                        softClass,
                        textClass,
                      )}
                      style={{
                        top,
                        height,
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
  );
}

function NowIndicator() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < WEEK_START_HOUR * 60 || minutes > WEEK_END_HOUR * 60) return null;
  const top = ((minutes - WEEK_START_HOUR * 60) / 60) * WEEK_HOUR_PX;
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

function AgendaView({
  events,
  activeFilter,
  onFilterChange,
}: {
  events: UEvent[];
  activeFilter: CalendarEventType | "all";
  onFilterChange: (f: CalendarEventType | "all") => void;
}) {
  // Agrupa por dia
  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; events: UEvent[] }>();
    for (const e of events) {
      const k = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const existing = map.get(k);
      if (existing) existing.events.push(e);
      else map.set(k, { date: new Date(e.date), events: [e] });
    }
    return Array.from(map.values());
  }, [events]);

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
        <PlaceholderView
          title="Agenda vazia"
          hint="Nenhum compromisso para essa categoria nos próximos 30 dias."
        />
      ) : (
        <div className="rounded-xl border border-border/70 bg-card divide-y divide-border/60">
          {groups.map((g, idx) => (
            <div key={idx} className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {dayHeaderLabel(g.date)} · {formatDateLabel(g.date)}
              </div>
              <div className="space-y-2">
                {g.events.map((e) => (
                  <AgendaEventRow key={e.id} event={e} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgendaEventRow({ event: e }: { event: UEvent }) {
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
            <Clock className="h-3 w-3" />
            {e.startTime}–{e.endTime}
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
  if (e.subjectId) {
    return (
      <Link
        href={`/subject/${e.subjectId}`}
        className="flex items-center gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2 hover:border-primary/40 hover:bg-secondary/40 transition-colors"
      >
        {content}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2">
      {content}
    </div>
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
          <Clock className="h-2.5 w-2.5" />
          {e.startTime}
          {e.endTime !== e.startTime && `–${e.endTime}`}
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

  if (e.subjectId) {
    return (
      <Link href={`/subject/${e.subjectId}`} className={baseClasses}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onOpenDetails} className={baseClasses}>
      {body}
    </button>
  );
}

function PlaceholderView({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
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
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-opacity",
              active ? "text-foreground" : "text-muted-foreground/60",
            )}
            title={active ? "Ocultar" : "Mostrar"}
          >
            <span className={cn("h-2 w-2 rounded-full", meta.dot, !active && "opacity-50")} />
            {meta.label === "Bloco de estudo" ? "Blocos de estudo" : meta.label + "s"}
          </button>
        );
      })}
    </div>
  );
}

function CategoryCard({
  title,
  icon: Icon,
  accent,
  onSeeAll,
  onAdd,
  extraHeaderAction,
  children,
}: {
  title: string;
  icon: LucideIcon;
  accent: string;
  onSeeAll: () => void;
  onAdd?: () => void;
  extraHeaderAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn("h-4 w-4 shrink-0", accent)} />
          <span className="text-sm font-semibold truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {extraHeaderAction}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors"
              aria-label={`Adicionar em ${title}`}
              title="Adicionar"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onSeeAll}
            className="text-[11px] text-primary hover:underline"
          >
            Ver todas →
          </button>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function EventList({ items, fallback }: { items: UEvent[]; fallback: string }) {
  if (items.length === 0) return <EmptyMini message={fallback} />;
  return (
    <div className="space-y-2.5">
      {items.map((e) => {
        const meta = EVENT_TYPE_META[e.type];
        const body = (
          <>
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white",
                e.subjectColor ? cn("bg-gradient-to-br", e.subjectColor) : meta.bar,
              )}
            >
              <EventIcon event={e} size={3.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground">
                {dayHeaderLabel(e.date)} · {formatDateLabel(e.date)} · {e.startTime}
              </div>
              <div className="text-sm font-medium truncate">{e.title}</div>
              {e.subjectName && e.subjectName !== e.title && (
                <div className="text-[11px] text-muted-foreground truncate">
                  {e.subjectName}
                </div>
              )}
              {e.room && !e.subjectName && (
                <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {e.room}
                </div>
              )}
            </div>
          </>
        );
        return e.subjectId ? (
          <Link
            key={e.id}
            href={`/subject/${e.subjectId}`}
            className="flex items-start gap-2.5 -mx-1 px-1 py-1 rounded-md hover:bg-secondary/40 transition-colors"
          >
            {body}
          </Link>
        ) : (
          <div key={e.id} className="flex items-start gap-2.5">
            {body}
          </div>
        );
      })}
    </div>
  );
}

function EmptyMini({ message }: { message: string }) {
  return (
    <div className="text-xs text-muted-foreground py-4 text-center">
      {message}
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
