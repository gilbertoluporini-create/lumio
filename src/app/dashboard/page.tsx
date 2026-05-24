"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  Clock,
  Code,
  Dna,
  Dumbbell,
  FlaskConical,
  Gavel,
  Globe,
  HeartPulse,
  Languages,
  Landmark,
  Layers,
  Leaf,
  Library,
  Lightbulb,
  MessageSquare,
  Microscope,
  Mic,
  MoreVertical,
  Music,
  Palette,
  Pill,
  Plus,
  Scale,
  Sigma,
  Sparkles,
  Stethoscope,
  Syringe,
  Trash2,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ColorPicker } from "@/components/app/emoji-color-picker";
import {
  createLectureAsync,
  createSubjectAsync,
  deleteSubjectAsync,
  listLecturesAsync,
  listSubjectsAsync,
} from "@/lib/db";
import { calculateStreak } from "@/lib/streak";
import {
  DAY_LABELS_SHORT,
  SUBJECT_PALETTE,
  type Lecture,
  type ScheduleSlot,
  type Subject,
  type User,
} from "@/lib/types";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <Dashboard user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Escolhe um ícone temático com base no nome da matéria.
 * Cobre cursos brasileiros mais comuns (medicina, direito, engenharia,
 * exatas, humanas, computação, biologia, línguas, artes, ed. física).
 * Fallback: BookOpen (livro genérico).
 *
 * Regras em ordem de especificidade — a primeira que casar ganha.
 * Mantém regex em PT-BR sem depender de acento.
 */
function getSubjectIcon(name: string): LucideIcon {
  const n = name.toLowerCase();

  // Medicina — sistemas e clínica
  if (/cardio|cora[cç][aã]o|cardiovasc|circulat|hemato|vascul/.test(n)) return HeartPulse;
  if (/respirat|pulm[aã]o|pulmonar|pneumo/.test(n)) return Wind;
  if (/endo|horm[oô]n|metabol|diabet/.test(n)) return Pill;
  if (/farmaco|medicament|terap[eê]utic|vacin/.test(n)) return Syringe;
  if (/anatomia|sistema\s+nerv|c[eé]rebro|neuro|psiqui|psicolog/.test(n)) return Brain;
  if (/habilidad|cl[ií]nic|semiolog|propedeu/.test(n)) return Stethoscope;
  if (/aten[cç][aã]o\s*prim|aps|sa[uú]de\s+coletiva|sa[uú]de\s+p[uú]blica|epidemio/.test(n)) return Activity;
  if (/pesquisa|inova[cç][aã]o|metodol|tcc|tese|monografia/.test(n)) return Microscope;
  if (/reuni[aã]o|integ|tutor|grupo|tbl|pbl/.test(n)) return Users;

  // Biologia / ciências naturais
  if (/gen[eé]tic|dna|cromoss/.test(n)) return Dna;
  if (/bioqu[ií]m|qu[ií]mic/.test(n)) return FlaskConical;
  if (/f[ií]sic|mec[aâ]nic\s+(quant|cl[aá]ss)/.test(n)) return Atom;
  if (/biolog|bases\s+biol|histol|embriol|ecolog|botan|zoolog/.test(n)) return Leaf;

  // Matemática / estatística
  if (/c[aá]lculo|c[áa]lculo|matem[aá]tic|alg[eé]bra|geometria/.test(n)) return Calculator;
  if (/estat[ií]stic|probabilidad/.test(n)) return Sigma;

  // Direito
  if (/direito|civil|penal|constituci|tribut|processual|trabalh.*direito|oab/.test(n)) return Gavel;
  if (/[eé]tica|cidadan|deont/.test(n)) return Scale;

  // Humanas
  if (/filosof|sociol|antropol|hist[oó]ri|geogr/.test(n)) return Landmark;
  if (/literat|portugu[eê]s\b|reda[cç][aã]o/.test(n)) return Library;

  // Línguas
  if (/ingl[eê]s|espanhol|franc[eê]s|alem[aã]o|l[ií]ngua|idioma/.test(n)) return Languages;

  // Computação / tecnologia
  if (/program|software|c[oó]digo|algoritmo|estrutur.*dados|engenharia\s+de\s+softw/.test(n)) return Code;
  if (/redes|sistema.*operac|computa[cç][aã]o|inform[aá]tic|dados|ia\b|machine\s+learning/.test(n)) return Code;

  // Engenharia (geral, depois das específicas)
  if (/engenharia|el[eé]tric|eletr[oô]nic|mec[aâ]nic|civil|materiais|projeto/.test(n)) return Wrench;

  // Administração / negócios / economia
  if (/admin|gest[aã]o|empreend|neg[oó]cio|marketing|contab|empres/.test(n)) return Briefcase;
  if (/economi|finan[cç]/.test(n)) return Landmark;

  // Geografia / ambiente
  if (/geografia|ambient|sustent/.test(n)) return Globe;

  // Artes
  if (/m[uú]sic|sonor/.test(n)) return Music;
  if (/arte|design|artes\s+visuais|desenho/.test(n)) return Palette;

  // Educação física
  if (/educa[cç][aã]o\s+f[ií]sic|esporte|treinament|fitness/.test(n)) return Dumbbell;

  // Inovação / ideias soltas
  if (/inova[cç][aã]o|criativ/.test(n)) return Lightbulb;

  return BookOpen;
}

/**
 * Conta aulas nas últimas N semanas. Retorna array do mais antigo → mais
 * recente, pra plotar sparkline da esquerda pra direita.
 */
function getWeeklyLectureCounts(lectures: Lecture[], weeks = 8): number[] {
  const counts = Array(weeks).fill(0);
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (const l of lectures) {
    const created = new Date(l.createdAt).getTime();
    const diff = now - created;
    if (diff < 0) continue;
    const weekIdx = Math.floor(diff / weekMs);
    if (weekIdx < weeks) counts[weeks - 1 - weekIdx]++;
  }
  return counts;
}

/**
 * Minutos gravados em cada dia da semana atual (Seg → Dom).
 */
function getWeekMinutesByDay(lectures: Lecture[]): number[] {
  const counts = Array(7).fill(0);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  const dayOffset = (now.getDay() + 6) % 7; // 0=Seg ... 6=Dom
  startOfWeek.setDate(now.getDate() - dayOffset);

  for (const l of lectures) {
    const created = new Date(l.createdAt);
    if (created >= startOfWeek) {
      const idx = (created.getDay() + 6) % 7;
      counts[idx] += Math.round(l.durationSec / 60);
    }
  }
  return counts;
}

function formatHoursMinutes(min: number): { h: number; m: number; label: string } {
  if (min < 60) return { h: 0, m: min, label: `${min}min` };
  const h = Math.floor(min / 60);
  const m = min % 60;
  return { h, m, label: m > 0 ? `${h}h ${m}min` : `${h}h` };
}

/** Sparkline SVG simples — gradient roxo, line + area fill. */
function MiniLineChart({ data, height = 36 }: { data: number[]; height?: number }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data);
  const w = 100;
  const padY = 4;
  const stepX = w / Math.max(1, data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = padY + (1 - v / max) * (height - 2 * padY);
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${w},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full h-full" aria-hidden="true">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.6 0.25 290)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="oklch(0.6 0.25 290)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-fill)" />
      <path d={linePath} fill="none" stroke="oklch(0.6 0.25 290)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(([x, y], i) =>
        i === points.length - 1 ? (
          <circle key={i} cx={x} cy={y} r="2.5" fill="oklch(0.6 0.25 290)" />
        ) : null,
      )}
    </svg>
  );
}

/** Bar chart de 7 dias da semana com labels S T Q Q S S D. */
function WeekBarChart({ data }: { data: number[] }) {
  const labels = ["S", "T", "Q", "Q", "S", "S", "D"];
  const max = Math.max(1, ...data);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div className="flex items-end gap-1 h-12 w-full">
      {data.map((v, i) => {
        const pct = Math.max(8, (v / max) * 100); // mínimo 8% pra dar feedback visual
        const isToday = i === todayIdx;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div
              className={cn(
                "w-full rounded-t-sm transition-colors",
                v === 0
                  ? "bg-muted-foreground/15"
                  : isToday
                    ? "bg-primary"
                    : "bg-primary/40",
              )}
              style={{ height: `${pct}%` }}
              title={`${labels[i]}: ${v}min`}
            />
            <span className={cn(
              "text-[9px] font-mono",
              isToday ? "text-primary font-semibold" : "text-muted-foreground",
            )}>
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

type NextSlot = {
  subject: Subject;
  slot: ScheduleSlot;
  dayLabel: string;
  isToday: boolean;
  isTomorrow: boolean;
};

function findNextSlot(subjects: Subject[]): NextSlot | null {
  const now = new Date();
  const currentDow = now.getDay();
  const currentMin = now.getHours() * 60 + now.getMinutes();

  type Candidate = NextSlot & { distance: number };
  const candidates: Candidate[] = [];

  for (const s of subjects) {
    for (const slot of s.schedule ?? []) {
      const dayDiff = (slot.dayOfWeek - currentDow + 7) % 7;
      const slotMin = timeToMinutes(slot.startTime);
      // Hoje, mas já passou → considera próxima semana
      let distance = dayDiff * 24 * 60 + (slotMin - currentMin);
      if (dayDiff === 0 && slotMin <= currentMin) {
        distance += 7 * 24 * 60;
      }
      const isToday = dayDiff === 0 && slotMin > currentMin;
      const isTomorrow = dayDiff === 1;
      candidates.push({
        subject: s,
        slot,
        dayLabel: DAY_LABELS_SHORT[slot.dayOfWeek],
        isToday,
        isTomorrow,
        distance,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0];
}

function Dashboard({ user }: { user: User }) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [lectureOpen, setLectureOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureSubject, setLectureSubject] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [color, setColor] = useState(SUBJECT_PALETTE[0].color);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [s, l] = await Promise.all([
      listSubjectsAsync(user.id),
      listLecturesAsync(user.id),
    ]);
    setSubjects(s);
    setLectures(l);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const totalLectures = lectures.length;
    const totalMinutes = Math.floor(
      lectures.reduce((acc, l) => acc + l.durationSec, 0) / 60,
    );
    const withSummary = lectures.filter((l) => l.summary).length;
    const weeklySeries = getWeeklyLectureCounts(lectures, 8);
    const weekMinutesByDay = getWeekMinutesByDay(lectures);
    const weekMinutesTotal = weekMinutesByDay.reduce((a, b) => a + b, 0);
    return {
      totalLectures,
      totalMinutes,
      withSummary,
      weeklySeries,
      weekMinutesByDay,
      weekMinutesTotal,
    };
  }, [lectures]);

  const streak = useMemo(() => calculateStreak(lectures), [lectures]);

  const nextSlot = useMemo(() => findNextSlot(subjects), [subjects]);

  const lecturesBySubject = useMemo(() => {
    const map: Record<string, Lecture[]> = {};
    for (const l of lectures) {
      if (!map[l.subjectId]) map[l.subjectId] = [];
      map[l.subjectId].push(l);
    }
    return map;
  }, [lectures]);

  const recentLectures = useMemo(
    () =>
      lectures
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 6),
    [lectures],
  );

  async function handleCreateSubject() {
    if (!newName.trim()) return;
    try {
      const nextColorIdx = subjects.length;
      const finalColor =
        color === SUBJECT_PALETTE[0].color
          ? SUBJECT_PALETTE[nextColorIdx % SUBJECT_PALETTE.length].color
          : color;
      const subject = await createSubjectAsync(user.id, {
        name: newName.trim(),
        color: finalColor,
      });
      setNewName("");
      setColor(SUBJECT_PALETTE[0].color);
      setNewOpen(false);
      await refresh();
      toast.success(`Matéria "${subject.name}" criada.`);
    } catch (err) {
      toast.error(`Erro ao criar matéria: ${(err as Error).message}`);
    }
  }

  async function handleDeleteSubject(s: Subject) {
    if (
      !confirm(
        `Excluir a matéria "${s.name}" e todas suas aulas? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    try {
      await deleteSubjectAsync(user.id, s.id);
      await refresh();
      toast.success("Matéria excluída.");
    } catch (err) {
      toast.error(`Erro ao excluir: ${(err as Error).message}`);
    }
  }

  function startNewLecture(subjectId?: string) {
    if (subjects.length === 0) {
      toast.error("Crie uma matéria primeiro.");
      setNewOpen(true);
      return;
    }
    setLectureTitle("");
    setLectureSubject(subjectId ?? subjects[0].id);
    setLectureOpen(true);
  }

  async function handleCreateLecture() {
    const title =
      lectureTitle.trim() || `Aula ${new Date().toLocaleDateString("pt-BR")}`;
    if (!lectureSubject) {
      toast.error("Escolha uma matéria.");
      return;
    }
    try {
      const lecture = await createLectureAsync(user.id, {
        subjectId: lectureSubject,
        title,
      });
      setLectureOpen(false);
      router.push(`/lecture/${lecture.id}`);
    } catch (err) {
      toast.error(`Erro ao criar aula: ${(err as Error).message}`);
    }
  }

  const firstName = user.name.split(" ")[0];
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-8 w-48 rounded-md bg-secondary/50 animate-pulse mb-3" />
        <div className="h-4 w-72 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-3 flex-wrap">
            <span>{greeting}, {firstName}.</span>
            {streak.current > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 text-xs font-medium"
                title={`Streak atual: ${streak.current} dia(s)${streak.longest > streak.current ? ` · maior: ${streak.longest}` : ""}`}
              >
                <span>🔥</span>
                {streak.current} dia{streak.current === 1 ? "" : "s"} seguido
                {streak.current === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            {streak.todayDone
              ? "Mais um dia foco em dia."
              : "Pronto pra mais uma aula?"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Continue seu progresso e transforme estudo em memória.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4" /> Nova matéria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova matéria</DialogTitle>
                <DialogDescription>
                  Cria uma pasta pra organizar aulas, slides e resumos.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ColorPicker value={color} onChange={setColor} />
                  <Input
                    autoFocus
                    placeholder="Ex: Cálculo, Anatomia…"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleCreateSubject()
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  A cor é escolhida automaticamente — clique no quadrado pra
                  trocar.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="gradient" onClick={handleCreateSubject}>
                  Criar matéria
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="gradient" onClick={() => startNewLecture()}>
            <Mic className="h-4 w-4" /> Nova aula
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {/* KPI 1: Próxima aula */}
        {nextSlot ? (
          <Link
            href="/schedule"
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-4">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Próxima aula
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                {(() => {
                  const Ic = getSubjectIcon(nextSlot.subject.name);
                  return <Ic className="h-5 w-5 text-primary" strokeWidth={2.2} />;
                })()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate group-hover:text-primary transition-colors">
                  {nextSlot.subject.name}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {nextSlot.isToday
                    ? "Hoje"
                    : nextSlot.isTomorrow
                      ? "Amanhã"
                      : nextSlot.dayLabel}{" "}
                  · {nextSlot.slot.startTime}–{nextSlot.slot.endTime}
                </div>
              </div>
            </div>
            <div className="text-xs text-primary font-medium inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
              Ver cronograma <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        ) : (
          <Link
            href="/onboarding"
            className="group relative overflow-hidden rounded-2xl border border-dashed border-border/60 bg-card/40 p-5 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Próxima aula
            </div>
            <div className="text-sm text-muted-foreground max-w-[200px] mb-4">
              Suba sua grade horária pra ver aqui
            </div>
            <div className="text-xs text-primary font-medium inline-flex items-center gap-1">
              Configurar agora <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        )}

        {/* KPI 2: Aulas gravadas + sparkline */}
        <Link
          href="/dashboard"
          className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Aulas gravadas
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl md:text-4xl font-semibold font-mono tabular-nums leading-none">
                {stats.totalLectures}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                em {subjects.length} matéria{subjects.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="w-24 h-12 shrink-0">
              <MiniLineChart data={stats.weeklySeries} height={48} />
            </div>
          </div>
        </Link>

        {/* KPI 3: Tempo de estudo + bar chart semana */}
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Tempo de estudo
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl md:text-4xl font-semibold tabular-nums leading-none">
                {formatHoursMinutes(stats.weekMinutesTotal).label || "0min"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">esta semana</div>
            </div>
            <div className="w-28 shrink-0">
              <WeekBarChart data={stats.weekMinutesByDay} />
            </div>
          </div>
        </div>
      </div>

      {/* Matérias (pastas) */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Minhas matérias
          </h2>
          {subjects.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNewOpen(true)}
              className="text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Nova
            </Button>
          )}
        </div>
        {subjects.length === 0 ? (
          <SubjectsEmpty onCreate={() => setNewOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {subjects.map((s) => {
              const subjectLectures = lecturesBySubject[s.id] ?? [];
              return (
                <SubjectFolder
                  key={s.id}
                  subject={s}
                  lectures={subjectLectures}
                  onDelete={() => handleDeleteSubject(s)}
                  onNewLecture={() => startNewLecture(s.id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Aulas recentes */}
      {recentLectures.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Aulas recentes
            </h2>
            {lectures.length > 6 && (
              <span className="text-xs text-muted-foreground">
                Mostrando 6 de {lectures.length}
              </span>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentLectures.map((l) => {
              const subject = subjects.find((s) => s.id === l.subjectId);
              return <LectureCard key={l.id} lecture={l} subject={subject} />;
            })}
          </div>
        </div>
      )}

      {/* Empty state quando sem aulas mas com matérias */}
      {recentLectures.length === 0 && subjects.length > 0 && (
        <EmptyLectures onNew={() => startNewLecture()} />
      )}

      {/* Dialog Nova Aula */}
      <Dialog open={lectureOpen} onOpenChange={setLectureOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova aula</DialogTitle>
            <DialogDescription>
              Em segundos a transcrição começa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                autoFocus
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
                placeholder={`Aula ${new Date().toLocaleDateString("pt-BR")}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Matéria</Label>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => {
                  const sel = s.id === lectureSubject;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setLectureSubject(s.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all",
                        sel
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 bg-background hover:bg-secondary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full bg-gradient-to-br shrink-0",
                          s.color,
                        )}
                      />
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLectureOpen(false)}>
              Cancelar
            </Button>
            <Button variant="gradient" onClick={handleCreateLecture}>
              <Mic className="h-4 w-4" /> Começar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubjectFolder({
  subject,
  lectures,
  onDelete,
  onNewLecture,
}: {
  subject: Subject;
  lectures: Lecture[];
  onDelete: () => void;
  onNewLecture: () => void;
}) {
  const lectureCount = lectures.length;
  const withSummary = lectures.filter((l) => l.summary).length;
  const progress = lectureCount > 0
    ? Math.round((withSummary / lectureCount) * 100)
    : 0;

  const lastLecture = lectures
    .slice()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
  const lastLectureLabel = lastLecture
    ? new Date(lastLecture.updatedAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
    : "—";

  const SubjectIcon = getSubjectIcon(subject.name);

  return (
    <div className="group relative rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-md transition-all">
      <Link
        href={`/subject/${subject.id}`}
        className="block p-4"
      >
        <div className="flex items-center gap-4">
          <div className="h-11 w-11 shrink-0 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
            <SubjectIcon className="h-5 w-5 text-primary" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
              {subject.name}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
                {progress}%
              </span>
            </div>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 pl-2 border-l border-border/40 pr-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Última aula
            </span>
            <span className="text-xs font-mono tabular-nums">
              {lastLectureLabel}
            </span>
          </div>
          <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 pl-3 border-l border-border/40">
            <span className="text-sm font-semibold tabular-nums">
              {lectureCount}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {lectureCount === 1 ? "aula" : "aulas"}
            </span>
          </div>
        </div>
      </Link>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.preventDefault()}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-secondary"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onNewLecture}>
              <Mic className="h-4 w-4" /> Nova aula aqui
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Excluir matéria
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function LectureCard({
  lecture,
  subject,
}: {
  lecture: Lecture;
  subject: Subject | undefined;
}) {
  const hasSlides = (lecture.slides?.length ?? 0) > 0;
  const hasSummary = !!lecture.summary;
  const msgCount = lecture.messages.length;

  return (
    <Link href={`/lecture/${lecture.id}`}>
      <Card className="group h-full transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            {subject ? (
              <Badge variant="outline" className="gap-1.5">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full bg-gradient-to-br shrink-0",
                    subject.color,
                  )}
                />
                {subject.name}
              </Badge>
            ) : (
              <span />
            )}
            {lecture.status === "live" && (
              <Badge variant="live" className="gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 pulse-dot" />
                AO VIVO
              </Badge>
            )}
          </div>
          <h3 className="font-semibold text-base line-clamp-2 group-hover:text-primary transition-colors">
            {lecture.title}
          </h3>
          {lecture.transcript && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {lecture.transcript.slice(0, 140)}
              {lecture.transcript.length > 140 && "…"}
            </p>
          )}
          {(hasSlides || hasSummary || msgCount > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {hasSlides && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Layers className="h-2.5 w-2.5" /> Slides
                </Badge>
              )}
              {hasSummary && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Sparkles className="h-2.5 w-2.5" /> Resumo
                </Badge>
              )}
              {msgCount > 0 && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <MessageSquare className="h-2.5 w-2.5" /> {msgCount}
                </Badge>
              )}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatRelativeTime(lecture.createdAt)}
            </span>
            {lecture.durationSec > 0 && (
              <span className="inline-flex items-center gap-1">
                <Mic className="h-3 w-3" /> {formatDuration(lecture.durationSec)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SubjectsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-12 text-center">
      <div className="flex justify-center mb-2">
        <LumiCharacter mood="waving" size="lg" float />
      </div>
      <h3 className="text-lg font-semibold">Comece criando uma matéria</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Cada matéria vira uma pasta. Aulas, slides, resumos e dúvidas ficam
        organizados dentro dela.
      </p>
      <Button onClick={onCreate} variant="gradient" size="lg" className="mt-6">
        <Plus className="h-4 w-4" /> Nova matéria
      </Button>
    </div>
  );
}

function EmptyLectures({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-10 text-center">
      <div className="flex justify-center mb-2">
        <LumiCharacter mood="default" size="md" float />
      </div>
      <h3 className="text-base font-semibold">Nenhuma aula gravada ainda</h3>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
        Grave sua primeira aula — o Lumi transcreve, anota dúvidas e gera resumo
        no fim.
      </p>
      <Button onClick={onNew} variant="gradient" className="mt-5">
        <Mic className="h-4 w-4" /> Iniciar primeira aula
      </Button>
    </div>
  );
}
