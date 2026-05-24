"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Dna,
  Dumbbell,
  Filter,
  FlaskConical,
  Flame,
  Gavel,
  Globe,
  HeartPulse,
  Languages,
  Landmark,
  Leaf,
  Library,
  Lightbulb,
  Mic,
  MoreVertical,
  Music,
  Palette,
  Pill,
  Plus,
  RefreshCw,
  Scale,
  Sigma,
  Sparkles,
  Star,
  Stethoscope,
  Syringe,
  Users,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listLecturesAsync, listSubjectsAsync } from "@/lib/db";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================================================
// Quiz payload shape — copiado de QuizView
// (questions: { question, options, correctIndex, explanation })
// ============================================================================
type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type QuizPayload = {
  generatedAt?: string;
  questions: QuizQuestion[];
};

type QuizAssetRow = {
  id: string;
  lecture_id: string;
  user_id: string;
  kind: "quiz";
  payload: QuizPayload;
  created_at: string;
  updated_at: string;
};

export default function QuizPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <QuizView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

// ============================================================================
// Resolver de ícone por matéria (copiado do dashboard)
// ============================================================================
function getSubjectIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/cardio|cora[cç][aã]o|cardiovasc|circulat|hemato|vascul/.test(n)) return HeartPulse;
  if (/respirat|pulm[aã]o|pulmonar|pneumo/.test(n)) return Wind;
  if (/endo|horm[oô]n|metabol|diabet/.test(n)) return Pill;
  if (/farmaco|medicament|terap[eê]utic|vacin/.test(n)) return Syringe;
  if (/anatomia|sistema\s+nerv|c[eé]rebro|neuro|psiqui|psicolog/.test(n)) return Brain;
  if (/habilidad|cl[ií]nic|semiolog|propedeu/.test(n)) return Stethoscope;
  if (/aten[cç][aã]o\s*prim|aps|sa[uú]de\s+coletiva|sa[uú]de\s+p[uú]blica|epidemio/.test(n)) return Activity;
  if (/reuni[aã]o|integ|tutor|grupo|tbl|pbl/.test(n)) return Users;
  if (/gen[eé]tic|dna|cromoss/.test(n)) return Dna;
  if (/bioqu[ií]m|qu[ií]mic/.test(n)) return FlaskConical;
  if (/f[ií]sic|mec[aâ]nic\s+(quant|cl[aá]ss)/.test(n)) return Atom;
  if (/biolog|bases\s+biol|histol|embriol|ecolog|botan|zoolog/.test(n)) return Leaf;
  if (/c[aá]lculo|c[áa]lculo|matem[aá]tic|alg[eé]bra|geometria/.test(n)) return Calculator;
  if (/estat[ií]stic|probabilidad/.test(n)) return Sigma;
  if (/direito|civil|penal|constituci|tribut|processual|trabalh.*direito|oab/.test(n)) return Gavel;
  if (/[eé]tica|cidadan|deont/.test(n)) return Scale;
  if (/filosof|sociol|antropol|hist[oó]ri|geogr/.test(n)) return Landmark;
  if (/literat|portugu[eê]s\b|reda[cç][aã]o/.test(n)) return Library;
  if (/ingl[eê]s|espanhol|franc[eê]s|alem[aã]o|l[ií]ngua|idioma/.test(n)) return Languages;
  if (/program|software|c[oó]digo|algoritmo|estrutur.*dados|engenharia\s+de\s+softw/.test(n)) return Code;
  if (/redes|sistema.*operac|computa[cç][aã]o|inform[aá]tic|dados|ia\b|machine\s+learning/.test(n)) return Code;
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

// ============================================================================
// Donut chart — usado pros stat cards + cada banco de questões
// ============================================================================
function Donut({
  pct,
  size = 64,
  stroke = 8,
  label,
  muted = false,
}: {
  pct: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  muted?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const safe = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const dash = (safe / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted-foreground/15"
        />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#donut-grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            className="transition-all duration-500"
          />
        )}
        <defs>
          <linearGradient id="donut-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.6 0.25 290)" />
            <stop offset="100%" stopColor="oklch(0.65 0.25 330)" />
          </linearGradient>
        </defs>
      </svg>
      <span
        className={cn(
          "absolute font-mono font-semibold tabular-nums",
          size > 60 ? "text-base" : "text-[10px]",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {label ?? (pct === null ? "—" : `${Math.round(safe)}%`)}
      </span>
    </div>
  );
}

// ============================================================================
// Sparkline + bar chart (versões mini)
// ============================================================================
function MiniLineChart({ data, height = 32 }: { data: number[]; height?: number }) {
  if (data.length === 0 || data.every((v) => v === 0)) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="h-px w-full bg-muted-foreground/20" />
      </div>
    );
  }
  const max = Math.max(1, ...data);
  const w = 100;
  const padY = 4;
  const stepX = w / Math.max(1, data.length - 1);
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = padY + (1 - v / max) * (height - 2 * padY);
    return [x, y] as const;
  });
  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${w},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="quiz-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.6 0.25 290)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="oklch(0.6 0.25 290)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#quiz-spark-fill)" />
      <path
        d={linePath}
        fill="none"
        stroke="oklch(0.6 0.25 290)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WeekBarChart({ data }: { data: number[] }) {
  const labels = ["S", "T", "Q", "Q", "S", "S", "D"];
  const max = Math.max(1, ...data);
  const todayIdx = (new Date().getDay() + 6) % 7;
  return (
    <div className="flex items-end gap-1 h-10 w-full">
      {data.map((v, i) => {
        const pct = v === 0 ? 8 : Math.max(8, (v / max) * 100);
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
            />
            <span
              className={cn(
                "text-[9px] font-mono",
                isToday ? "text-primary font-semibold" : "text-muted-foreground",
              )}
            >
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Greeting
// ============================================================================
function useGreeting() {
  return useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);
}

// ============================================================================
// Dificuldade derivada da quantidade de questões
// ============================================================================
function difficultyFromCount(n: number): { label: string; tone: string } {
  if (n < 10) return { label: "Fácil", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
  if (n <= 20) return { label: "Médio", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
  return { label: "Difícil", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
}

// ============================================================================
// View principal
// ============================================================================
function QuizView({ user }: { user: User }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<QuizAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);

  // Selected quiz + question for "Pratique agora"
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const greeting = useGreeting();
  const firstName = user.name.split(" ")[0] || "estudante";

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const [subs, lecs] = await Promise.all([
          listSubjectsAsync(user.id),
          listLecturesAsync(user.id),
        ]);
        if (cancel) return;
        setSubjects(subs);
        setLectures(lecs);

        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("lecture_assets")
            .select("id, lecture_id, user_id, kind, payload, created_at, updated_at")
            .eq("user_id", user.id)
            .eq("kind", "quiz")
            .order("created_at", { ascending: false });
          if (!cancel) {
            if (error) {
              console.error("[quiz] erro listando quizzes", error);
              setQuizzes([]);
            } else {
              setQuizzes((data ?? []) as QuizAssetRow[]);
            }
          }
        } else {
          setQuizzes([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, [user.id]);

  // Lookup helpers
  const lectureById = useMemo(() => {
    const map = new Map<string, Lecture>();
    for (const l of lectures) map.set(l.id, l);
    return map;
  }, [lectures]);

  const subjectById = useMemo(() => {
    const map = new Map<string, Subject>();
    for (const s of subjects) map.set(s.id, s);
    return map;
  }, [subjects]);

  // Filtered quizzes by active subject
  const filteredQuizzes = useMemo(() => {
    if (!activeSubjectId) return quizzes;
    return quizzes.filter((q) => {
      const lec = lectureById.get(q.lecture_id);
      return lec?.subjectId === activeSubjectId;
    });
  }, [quizzes, activeSubjectId, lectureById]);

  // Default-select first quiz
  useEffect(() => {
    if (!loading && filteredQuizzes.length > 0) {
      const stillSelected =
        selectedQuizId && filteredQuizzes.some((q) => q.id === selectedQuizId);
      if (!stillSelected) {
        setSelectedQuizId(filteredQuizzes[0].id);
        setQuestionIdx(0);
        setSelectedAnswer(null);
        setRevealed(false);
        setShowExplanation(false);
      }
    } else if (!loading && filteredQuizzes.length === 0) {
      setSelectedQuizId(null);
    }
  }, [filteredQuizzes, loading, selectedQuizId]);

  const selectedQuiz = useMemo(
    () => quizzes.find((q) => q.id === selectedQuizId) ?? null,
    [quizzes, selectedQuizId],
  );
  const selectedLecture = selectedQuiz
    ? lectureById.get(selectedQuiz.lecture_id)
    : null;
  const selectedSubject = selectedLecture
    ? subjectById.get(selectedLecture.subjectId)
    : null;

  const totalQuestions = useMemo(
    () => quizzes.reduce((acc, q) => acc + (q.payload?.questions?.length ?? 0), 0),
    [quizzes],
  );

  // Stats placeholders — sem persistência ainda
  const stats = {
    totalQuestions,
    correctAnswers: 0,
    answered: 0,
    weeklySeries: new Array(8).fill(0),
    streak: 0,
    bestStreak: 0,
    minutesByDay: new Array(7).fill(0),
    minutesTotal: 0,
  };

  function pickQuiz(id: string) {
    if (id === selectedQuizId) return;
    setSelectedQuizId(id);
    setQuestionIdx(0);
    setSelectedAnswer(null);
    setRevealed(false);
    setShowExplanation(false);
  }

  function rotateQuestion() {
    if (!selectedQuiz) return;
    const total = selectedQuiz.payload.questions.length;
    setQuestionIdx((prev) => (prev + 1) % total);
    setSelectedAnswer(null);
    setRevealed(false);
    setShowExplanation(false);
  }

  function answerAndAdvance() {
    if (selectedAnswer === null) return;
    if (!revealed) {
      setRevealed(true);
      setShowExplanation(true);
      return;
    }
    rotateQuestion();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-4 w-40 rounded-md bg-secondary/40 animate-pulse mb-3" />
        <div className="h-9 w-96 max-w-full rounded-md bg-secondary/50 animate-pulse mb-2" />
        <div className="h-4 w-72 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-36 rounded-2xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-xl bg-secondary/30 animate-pulse"
              />
            ))}
          </div>
          <div className="lg:col-span-5 h-96 rounded-2xl bg-secondary/30 animate-pulse" />
        </div>
      </div>
    );
  }

  // ============================================================================
  // EMPTY STATE: nenhum quiz ainda
  // ============================================================================
  if (quizzes.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <PageHeader greeting={greeting} firstName={firstName} />
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-16 text-center">
          <div className="flex justify-center mb-3">
            <LumiCharacter mood="thinking" size="lg" float />
          </div>
          <h2 className="text-xl font-semibold">Você ainda não tem quizzes.</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Gere o primeiro quiz a partir de uma aula gravada — o Lumi monta
            questões de múltipla escolha com correção comentada.
          </p>
          <Button asChild variant="gradient" size="lg" className="mt-6">
            <Link href="/dashboard">
              <Sparkles className="h-4 w-4" /> Criar primeiro quiz
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <PageHeader greeting={greeting} firstName={firstName} />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* 1. Desempenho geral */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Desempenho geral
          </div>
          <div className="flex items-center gap-4">
            <Donut pct={null} size={64} stroke={8} muted />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-[11px] text-muted-foreground">
                Total de questões:{" "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {stats.totalQuestions}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Corretas:{" "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {stats.correctAnswers}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground/80 pt-1">
                Responda quizzes pra ver
              </div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-primary font-medium inline-flex items-center gap-1">
            Ver relatório completo <ArrowRight className="h-3 w-3" />
          </div>
        </div>

        {/* 2. Questões respondidas */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Questões respondidas
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-3xl md:text-4xl font-semibold font-mono tabular-nums leading-none">
                {stats.answered}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                +0% vs semana passada
              </div>
            </div>
            <div className="w-20 h-10 shrink-0 opacity-70">
              <MiniLineChart data={stats.weeklySeries} height={40} />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-primary font-medium inline-flex items-center gap-1">
            Ver histórico <ArrowRight className="h-3 w-3" />
          </div>
        </div>

        {/* 3. Sequência atual */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Sequência atual
          </div>
          <div className="flex items-center gap-2">
            <Flame className="h-7 w-7 text-amber-500" />
            <div className="text-3xl md:text-4xl font-semibold font-mono tabular-nums leading-none">
              {stats.streak}
            </div>
            <div className="text-sm text-muted-foreground self-end pb-1">
              dia{stats.streak === 1 ? "" : "s"}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Melhor: {stats.bestStreak} dia{stats.bestStreak === 1 ? "" : "s"}
          </div>
          <div className="mt-3 text-[11px] text-primary font-medium inline-flex items-center gap-1">
            Ver conquistas <ArrowRight className="h-3 w-3" />
          </div>
        </div>

        {/* 4. Tempo de prática */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Tempo de prática
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl md:text-4xl font-semibold tabular-nums leading-none">
                {stats.minutesTotal}min
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                esta semana
              </div>
            </div>
            <div className="w-24 shrink-0">
              <WeekBarChart data={stats.minutesByDay} />
            </div>
          </div>
          <div className="mt-3 text-[11px] text-primary font-medium inline-flex items-center gap-1">
            Ver estatísticas <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </div>

      {/* Subject filter pills */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveSubjectId(null)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
            activeSubjectId === null
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border/60 bg-background hover:bg-secondary/40 text-muted-foreground",
          )}
        >
          Todos
        </button>
        {subjects.map((s) => {
          const Ic = getSubjectIcon(s.name);
          const isActive = activeSubjectId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSubjectId(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all max-w-[200px]",
                isActive
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/60 bg-background hover:bg-secondary/40 text-muted-foreground",
              )}
            >
              <Ic className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.2} />
              <span className="truncate">{s.name}</span>
            </button>
          );
        })}
        <div className="ml-auto">
          <Button variant="ghost" size="sm" className="text-xs gap-1.5">
            <Filter className="h-3.5 w-3.5" /> Mais filtros
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Bancos de questões */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Bancos de questões
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
              {filteredQuizzes.length}{" "}
              {filteredQuizzes.length === 1 ? "banco" : "bancos"}
            </span>
          </div>

          {filteredQuizzes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum quiz nesta matéria ainda.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => setActiveSubjectId(null)}
              >
                Limpar filtro
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredQuizzes.map((quiz) => {
                const lec = lectureById.get(quiz.lecture_id);
                const sub = lec ? subjectById.get(lec.subjectId) : null;
                const Ic = getSubjectIcon(sub?.name ?? "");
                const qCount = quiz.payload?.questions?.length ?? 0;
                const diff = difficultyFromCount(qCount);
                const isActive = quiz.id === selectedQuizId;
                const lastUpdated = new Date(quiz.updated_at).toLocaleDateString(
                  "pt-BR",
                  { day: "2-digit", month: "short" },
                );
                return (
                  <button
                    key={quiz.id}
                    onClick={() => pickQuiz(quiz.id)}
                    className={cn(
                      "w-full text-left rounded-xl border bg-card p-4 transition-all flex items-center gap-3",
                      isActive
                        ? "border-primary/60 shadow-md ring-1 ring-primary/30"
                        : "border-border/60 hover:border-primary/40 hover:shadow-sm",
                    )}
                  >
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                      <Ic className="h-5 w-5 text-primary" strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">
                        {lec?.title ?? "Quiz sem aula"}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        {sub && <span className="truncate">{sub.name}</span>}
                        <span>·</span>
                        <span className="font-mono tabular-nums">
                          {qCount} {qCount === 1 ? "questão" : "questões"}
                        </span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {lastUpdated}
                        </span>
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
                      <Donut pct={null} size={36} stroke={5} muted />
                    </div>
                    <span
                      className={cn(
                        "shrink-0 hidden md:inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                        diff.tone,
                      )}
                    >
                      {diff.label}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-secondary cursor-pointer shrink-0"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lec && (
                          <DropdownMenuItem asChild>
                            <Link href={`/lecture/${lec.id}/products`}>
                              <ArrowRight className="h-4 w-4" /> Abrir na aula
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => pickQuiz(quiz.id)}>
                          <Sparkles className="h-4 w-4" /> Praticar agora
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </button>
                );
              })}
            </div>
          )}

          {filteredQuizzes.length > 0 && (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:gap-1.5 transition-all"
            >
              Ver todos os bancos <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {/* Right: Pratique agora */}
        <div className="lg:col-span-5">
          <PracticePanel
            quiz={selectedQuiz}
            lecture={selectedLecture}
            subject={selectedSubject}
            questionIdx={questionIdx}
            selectedAnswer={selectedAnswer}
            revealed={revealed}
            showExplanation={showExplanation}
            onSelect={(i) => !revealed && setSelectedAnswer(i)}
            onToggleExplanation={() => setShowExplanation((v) => !v)}
            onAnswerAndAdvance={answerAndAdvance}
            onRotate={rotateQuestion}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Cabeçalho com saudação + título + ações
// ============================================================================
function PageHeader({
  greeting,
  firstName,
}: {
  greeting: string;
  firstName: string;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between mb-8">
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground mb-1">
          {greeting}, {firstName} <span aria-hidden>👋</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Quiz para aprender e evoluir.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Pratique com questões e acompanhe seu desempenho.
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button asChild variant="outline">
          <Link href="/dashboard">
            <Plus className="h-4 w-4" /> Nova matéria
          </Link>
        </Button>
        <Button asChild variant="gradient">
          <Link href="/dashboard">
            <Mic className="h-4 w-4" /> Nova aula
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Pratique agora — coluna direita
// ============================================================================
const LETTERS = ["A", "B", "C", "D", "E"];

function PracticePanel({
  quiz,
  lecture,
  subject,
  questionIdx,
  selectedAnswer,
  revealed,
  showExplanation,
  onSelect,
  onToggleExplanation,
  onAnswerAndAdvance,
  onRotate,
}: {
  quiz: QuizAssetRow | null;
  lecture: Lecture | null | undefined;
  subject: Subject | null | undefined;
  questionIdx: number;
  selectedAnswer: number | null;
  revealed: boolean;
  showExplanation: boolean;
  onSelect: (i: number) => void;
  onToggleExplanation: () => void;
  onAnswerAndAdvance: () => void;
  onRotate: () => void;
}) {
  if (!quiz || !quiz.payload?.questions?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center h-full min-h-[400px] flex flex-col items-center justify-center">
        <LumiCharacter mood="studying" size="md" />
        <h3 className="mt-3 text-base font-semibold">
          Selecione um banco pra praticar
        </h3>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
          Escolha um quiz na lista ao lado pra começar a responder questões.
        </p>
      </div>
    );
  }

  const total = quiz.payload.questions.length;
  const q = quiz.payload.questions[questionIdx];
  const isCorrect = selectedAnswer === q.correctIndex;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 lg:sticky lg:top-4">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pratique agora
          </h2>
          {lecture && (
            <div className="text-xs text-foreground/80 truncate mt-0.5">
              {lecture.title}
              {subject && (
                <span className="text-muted-foreground"> · {subject.name}</span>
              )}
            </div>
          )}
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] shrink-0">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          Questão em destaque
        </Badge>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
          {questionIdx + 1} / {total}
        </span>
        <button
          onClick={onRotate}
          className="text-[11px] text-primary font-medium inline-flex items-center gap-1 hover:underline"
        >
          <RefreshCw className="h-3 w-3" /> Trocar questão
        </button>
      </div>

      <h3 className="text-base md:text-lg font-semibold leading-snug mb-4">
        {questionIdx + 1}. {q.question}
      </h3>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isSel = selectedAnswer === i;
          const isCorr = i === q.correctIndex;
          const showCorrect = revealed && isCorr;
          const showWrong = revealed && isSel && !isCorr;
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              disabled={revealed}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all",
                showCorrect
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : showWrong
                    ? "border-rose-500/60 bg-rose-500/10"
                    : isSel
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/60 hover:border-border/80 hover:bg-secondary/30",
                revealed && "cursor-default",
              )}
            >
              <div
                className={cn(
                  "h-7 w-7 shrink-0 rounded-md flex items-center justify-center text-xs font-mono font-semibold transition-colors",
                  showCorrect
                    ? "bg-emerald-500 text-white"
                    : showWrong
                      ? "bg-rose-500 text-white"
                      : isSel
                        ? "bg-primary text-white"
                        : "bg-secondary text-muted-foreground",
                )}
              >
                {showCorrect ? (
                  <Check className="h-4 w-4" />
                ) : showWrong ? (
                  <X className="h-4 w-4" />
                ) : (
                  LETTERS[i] ?? String(i + 1)
                )}
              </div>
              <span className="text-sm leading-relaxed flex-1">{opt}</span>
            </button>
          );
        })}
      </div>

      {/* Explicação */}
      {q.explanation && (
        <div className="mt-4">
          <button
            onClick={onToggleExplanation}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform",
                showExplanation && "rotate-90",
              )}
            />
            Ver explicação
          </button>
          {showExplanation && (
            <div
              className={cn(
                "mt-2 rounded-lg p-3 text-sm leading-relaxed",
                revealed
                  ? isCorrect
                    ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                    : "bg-amber-500/10 text-amber-900 dark:text-amber-200"
                  : "bg-secondary/40 text-foreground/80",
              )}
            >
              {revealed && (
                <strong className="block mb-1">
                  {isCorrect ? "Mandou bem." : "Quase."}
                </strong>
              )}
              {q.explanation}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="text-[10px] text-muted-foreground/80">
          Respostas não são salvas ainda.
        </div>
        <Button
          variant="gradient"
          onClick={onAnswerAndAdvance}
          disabled={selectedAnswer === null && !revealed}
        >
          {revealed ? "Próxima" : "Responder e próxima"}{" "}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
