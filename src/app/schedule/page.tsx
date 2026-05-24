"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
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
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { listSubjectsAsync } from "@/lib/db";
import {
  DAY_LABELS_LONG,
  type Subject,
  type User,
} from "@/lib/types";
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
  return weekdayLabel(date);
}

/**
 * Mapeia matéria → ícone temático (copiado/condensado do dashboard).
 */
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

/* ---------------- types ---------------- */

type ClassEvent = {
  date: Date; // dia da ocorrência
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  room?: string;
};

type CalendarView = "mes" | "semana" | "agenda";

/* ---------------- expansion ---------------- */

/**
 * Expande as `ScheduleSlot[]` semanais de cada matéria em ocorrências
 * concretas dentro do intervalo [from, to] (inclusivo).
 */
function expandSlots(subjects: Subject[], from: Date, to: Date): ClassEvent[] {
  const out: ClassEvent[] = [];
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
          date: new Date(d),
          startMinutes: timeToMinutes(slot.startTime),
          endMinutes: timeToMinutes(slot.endTime),
          startTime: slot.startTime,
          endTime: slot.endTime,
          subjectId: s.id,
          subjectName: s.name,
          subjectColor: s.color,
          room: slot.room,
        });
      }
    }
  }
  out.sort((a, b) => {
    const ad = a.date.getTime() - b.date.getTime();
    if (ad !== 0) return ad;
    return a.startMinutes - b.startMinutes;
  });
  return out;
}

/* ---------------- view ---------------- */

function ScheduleView({ user }: { user: User }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
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

  useEffect(() => {
    let active = true;
    listSubjectsAsync(user.id)
      .then((rows) => {
        if (active) setSubjects(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  /* Eventos do mês visível (com padding de semanas pra grid 6x7). */
  const monthGrid = useMemo(() => {
    const firstOfMonth = new Date(cursor);
    firstOfMonth.setHours(0, 0, 0, 0);
    const startWeekday = firstOfMonth.getDay(); // 0..6 (Dom..Sáb)
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startWeekday);

    // 6 semanas × 7 dias = 42 células
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push(d);
    }
    return { cells, gridStart, gridEnd: cells[cells.length - 1] };
  }, [cursor]);

  /* Eventos no range visível do calendário. */
  const monthEvents = useMemo(() => {
    if (subjects.length === 0) return [];
    return expandSlots(subjects, monthGrid.gridStart, monthGrid.gridEnd);
  }, [subjects, monthGrid.gridStart, monthGrid.gridEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ClassEvent[]>();
    for (const e of monthEvents) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [monthEvents]);

  /* Próximas 5 dias de eventos pra sidebar e cards. */
  const upcomingRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 30);
    return { start, end };
  }, []);

  const upcomingEvents = useMemo(() => {
    if (subjects.length === 0) return [];
    const all = expandSlots(subjects, upcomingRange.start, upcomingRange.end);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return all.filter((e) => {
      if (e.date.getTime() > now.setHours(0, 0, 0, 0)) return true;
      // mesmo dia: só se ainda não terminou
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isSameDay(e.date, today)) return e.endMinutes > nowMin;
      return false;
    });
  }, [subjects, upcomingRange]);

  const next3Classes = useMemo(() => upcomingEvents.slice(0, 3), [upcomingEvents]);

  /* Sidebar: agrupa próximos 5 dias com aulas. */
  const agendaGroups = useMemo(() => {
    const groups: Array<{ date: Date; events: ClassEvent[] }> = [];
    const byKey = new Map<string, { date: Date; events: ClassEvent[] }>();
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
            {greetingPrefix()}, {firstName} <span aria-hidden>👋</span>
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
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
        <div className="flex items-center gap-2">
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
          <div className="h-8 px-3 inline-flex items-center rounded-md border border-border bg-background text-sm font-medium capitalize">
            {monthLabel}
          </div>
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
          <Button variant="outline" size="sm" disabled title="Em breve">
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
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
              eventsByDay={eventsByDay}
            />
          )}
          {view === "semana" && (
            <PlaceholderView
              title="Visualização por semana"
              hint="A grade semanal detalhada chega em breve. Por enquanto, use a vista de Mês ou a Agenda lateral."
            />
          )}
          {view === "agenda" && (
            <AgendaView events={upcomingEvents.slice(0, 30)} />
          )}

          <Legend />

          {/* 4 cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <CategoryCard
              title="Próximas aulas"
              icon={GraduationCap}
              accent="text-primary"
              link="/schedule"
            >
              {next3Classes.length === 0 ? (
                <EmptyMini message="Nenhuma aula agendada" />
              ) : (
                <div className="space-y-2.5">
                  {next3Classes.map((e, idx) => {
                    const Icon = getSubjectIcon(e.subjectName);
                    return (
                      <div key={idx} className="flex items-start gap-2.5">
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white",
                            e.subjectColor,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] text-muted-foreground">
                            {dayHeaderLabel(e.date)} · {formatDateLabel(e.date)} ·{" "}
                            {e.startTime}
                          </div>
                          <div className="text-sm font-medium truncate">
                            {e.subjectName}
                          </div>
                          {e.room && (
                            <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {e.room}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CategoryCard>

            <CategoryCard
              title="Blocos de estudo"
              icon={BookOpen}
              accent="text-blue-500"
              link="#"
              linkDisabled
            >
              <EmptyMini message="Em breve" />
            </CategoryCard>

            <CategoryCard
              title="Provas"
              icon={FileText}
              accent="text-red-500"
              link="#"
              linkDisabled
            >
              <EmptyMini message="Em breve" />
            </CategoryCard>

            <CategoryCard
              title="Trabalhos e entregas"
              icon={Sparkles}
              accent="text-orange-500"
              link="#"
              linkDisabled
            >
              <EmptyMini message="Em breve" />
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
                onClick={() => setView("agenda")}
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
                      {g.events.map((e, eIdx) => {
                        const Icon = getSubjectIcon(e.subjectName);
                        return (
                          <div
                            key={eIdx}
                            className="flex items-start gap-2 rounded-md border border-border/50 bg-background/60 px-2 py-1.5"
                          >
                            <div
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gradient-to-br text-white",
                                e.subjectColor,
                              )}
                            >
                              <Icon className="h-3 w-3" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock className="h-2.5 w-2.5" />
                                {e.startTime}–{e.endTime}
                              </div>
                              <div className="text-xs font-medium truncate">
                                {e.subjectName}
                              </div>
                              {e.room ? (
                                <div className="text-[10px] text-muted-foreground truncate">
                                  {e.room}
                                </div>
                              ) : (
                                <div className="text-[10px] text-muted-foreground">
                                  Aula presencial
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border/60">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs text-muted-foreground"
                disabled
                title="Em breve"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar compromisso
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------- subcomponents ---------------- */

function MonthGrid({
  cells,
  cursorMonth,
  today,
  selectedDay,
  onSelectDay,
  eventsByDay,
}: {
  cells: Date[];
  cursorMonth: number;
  today: Date;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  eventsByDay: Map<string, ClassEvent[]>;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
      {/* Weekday header */}
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

      {/* 6×7 grid */}
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
                {visible.map((e, eIdx) => (
                  <div
                    key={eIdx}
                    className="flex items-center gap-1 text-[10px] leading-tight truncate"
                    title={`${e.startTime}–${e.endTime} ${e.subjectName}`}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full bg-gradient-to-br shrink-0",
                        e.subjectColor,
                      )}
                    />
                    <span className="font-medium tabular-nums text-muted-foreground">
                      {e.startTime}
                    </span>
                    <span className="truncate">{e.subjectName}</span>
                  </div>
                ))}
                {overflow > 0 && (
                  <div className="text-[10px] text-muted-foreground font-medium pl-2.5">
                    +{overflow}
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

function AgendaView({ events }: { events: ClassEvent[] }) {
  if (events.length === 0) {
    return (
      <PlaceholderView
        title="Agenda vazia"
        hint="Nenhuma aula nos próximos 30 dias. Cadastre matérias e horários no dashboard."
      />
    );
  }

  // Agrupa por dia
  const groups = new Map<string, { date: Date; events: ClassEvent[] }>();
  for (const e of events) {
    const k = `${e.date.getFullYear()}-${e.date.getMonth()}-${e.date.getDate()}`;
    const existing = groups.get(k);
    if (existing) existing.events.push(e);
    else groups.set(k, { date: new Date(e.date), events: [e] });
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card divide-y divide-border/60">
      {Array.from(groups.values()).map((g, idx) => (
        <div key={idx} className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {dayHeaderLabel(g.date)} · {formatDateLabel(g.date)}
          </div>
          <div className="space-y-2">
            {g.events.map((e, eIdx) => {
              const Icon = getSubjectIcon(e.subjectName);
              return (
                <div
                  key={eIdx}
                  className="flex items-center gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2"
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white",
                      e.subjectColor,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {e.subjectName}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
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

function Legend() {
  const items: Array<{ label: string; color: string; active?: boolean }> = [
    { label: "Aulas", color: "bg-primary", active: true },
    { label: "Blocos de estudo", color: "bg-blue-500" },
    { label: "Provas", color: "bg-red-500" },
    { label: "Trabalhos", color: "bg-orange-500" },
    { label: "Outros", color: "bg-emerald-500" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px]">
      {items.map((it) => (
        <span
          key={it.label}
          className={cn(
            "inline-flex items-center gap-1.5",
            it.active ? "text-foreground" : "text-muted-foreground/70",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", it.color, !it.active && "opacity-60")} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function CategoryCard({
  title,
  icon: Icon,
  accent,
  link,
  linkDisabled,
  children,
}: {
  title: string;
  icon: LucideIcon;
  accent: string;
  link: string;
  linkDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", accent)} />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {linkDisabled ? (
          <span className="text-[11px] text-muted-foreground/60">Em breve</span>
        ) : (
          <Link href={link} className="text-[11px] text-primary hover:underline">
            Ver todas →
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
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

