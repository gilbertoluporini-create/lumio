"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  Trophy,
  Users,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { ContentWizard } from "@/components/ai/content-wizard";
import { LumiCharacter } from "@/components/brand/lumi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listLecturesAsync, listSubjectsAsync } from "@/lib/db";
import {
  formatPracticeTime,
  getAccuracyByAsset,
  getStats,
  listAttemptsAsync,
  saveAttemptAsync,
  subscribeAttempts,
  type QuizAttempt,
  type QuizStats,
} from "@/lib/quiz-attempts";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

// ============================================================================
// Quiz payload shape — copiado de QuizView
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

// ============================================================================
// Filtros
// ============================================================================
type DifficultyFilter = "all" | "easy" | "medium" | "hard";
type StatusFilter = "all" | "untouched" | "in-progress" | "mastered";
type PeriodFilter = "all" | "7d" | "30d" | "90d";

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
// Resolver de ícone por matéria
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
// Donut
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
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
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
// Sparkline + bar chart
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

function WeekBarChart({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const todayIdx = (new Date().getDay() + 6) % 7;
  return (
    <div className="flex items-end gap-1 h-10 w-full">
      {data.map((d, i) => {
        const pct = d.count === 0 ? 8 : Math.max(8, (d.count / max) * 100);
        const isToday = i === todayIdx;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div
              className={cn(
                "w-full rounded-t-sm transition-colors",
                d.count === 0
                  ? "bg-muted-foreground/15"
                  : isToday
                    ? "bg-primary"
                    : "bg-primary/40",
              )}
              style={{ height: `${pct}%` }}
              title={`${d.count} ${d.count === 1 ? "questão" : "questões"}`}
            />
            <span
              className={cn(
                "text-[9px] font-mono",
                isToday ? "text-primary font-semibold" : "text-muted-foreground",
              )}
            >
              {d.day}
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
function difficultyFromCount(n: number): {
  key: Exclude<DifficultyFilter, "all">;
  label: string;
  tone: string;
} {
  if (n < 10) {
    return {
      key: "easy",
      label: "Fácil",
      tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (n <= 20) {
    return {
      key: "medium",
      label: "Médio",
      tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    };
  }
  return {
    key: "hard",
    label: "Difícil",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  };
}

function statusFromStats(s: { total: number; accuracy: number }): {
  key: Exclude<StatusFilter, "all">;
  label: string;
} {
  if (s.total === 0) return { key: "untouched", label: "Não iniciado" };
  if (s.accuracy >= 80) return { key: "mastered", label: "Dominando" };
  return { key: "in-progress", label: "Em progresso" };
}

function withinPeriod(dateIso: string | null, period: PeriodFilter): boolean {
  if (period === "all" || !dateIso) return period === "all";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0;
    return null; // "novo" — sem baseline
  }
  return Math.round(((current - previous) / previous) * 100);
}

function comingSoon(label: string) {
  toast.message(`${label} em breve.`, {
    description: "Estamos costurando o relatório completo.",
  });
}

// ============================================================================
// View principal
// ============================================================================
function QuizView({ user }: { user: User }) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [quizzes, setQuizzes] = useState<QuizAssetRow[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Filtros
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");

  // Selected quiz + question pra "Pratique agora"
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const questionStartRef = useRef<number>(Date.now());

  const greeting = useGreeting();
  const firstName = user.name.split(" ")[0] || "estudante";

  // Carrega subjects, lectures, quizzes (Supabase) e attempts (local)
  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const [subs, lecs, atts] = await Promise.all([
          listSubjectsAsync(user.id),
          listLecturesAsync(user.id),
          listAttemptsAsync(user.id),
        ]);
        if (cancel) return;
        setSubjects(subs);
        setLectures(lecs);
        setAttempts(atts);

        if (isSupabaseConfigured()) {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("lecture_assets")
            .select(
              "id, lecture_id, user_id, kind, payload, created_at, updated_at",
            )
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

  // Reagir a mudanças em attempts (outras abas)
  useEffect(() => {
    return subscribeAttempts(user.id, (next) => {
      setAttempts(next);
    });
  }, [user.id]);

  // Lookups
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

  // Stats globais
  const stats: QuizStats = useMemo(() => getStats(attempts), [attempts]);
  const statsByAsset = useMemo(() => getAccuracyByAsset(attempts), [attempts]);

  // Filtros aplicados aos bancos
  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((q) => {
      const lec = lectureById.get(q.lecture_id);
      if (activeSubjectId && lec?.subjectId !== activeSubjectId) return false;

      const qCount = q.payload?.questions?.length ?? 0;
      const diff = difficultyFromCount(qCount);
      if (difficultyFilter !== "all" && diff.key !== difficultyFilter) {
        return false;
      }

      const assetStats = statsByAsset.get(q.id) ?? {
        total: 0,
        correct: 0,
        accuracy: 0,
        lastAt: null,
      };
      const status = statusFromStats(assetStats);
      if (statusFilter !== "all" && status.key !== statusFilter) return false;

      if (periodFilter !== "all") {
        if (!withinPeriod(assetStats.lastAt ?? q.updated_at, periodFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [
    quizzes,
    activeSubjectId,
    difficultyFilter,
    statusFilter,
    periodFilter,
    lectureById,
    statsByAsset,
  ]);

  // Default-select first quiz quando lista filtrada muda
  useEffect(() => {
    if (loading) return;
    if (filteredQuizzes.length > 0) {
      const stillSelected =
        selectedQuizId && filteredQuizzes.some((q) => q.id === selectedQuizId);
      if (!stillSelected) {
        setSelectedQuizId(filteredQuizzes[0].id);
        setQuestionIdx(0);
        setSelectedAnswer(null);
        setRevealed(false);
        setShowExplanation(false);
        questionStartRef.current = Date.now();
      }
    } else {
      setSelectedQuizId(null);
    }
  }, [filteredQuizzes, loading, selectedQuizId]);

  // Resetar timer quando troca de questão
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [selectedQuizId, questionIdx]);

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

  const totalQuestionsAvailable = useMemo(
    () => quizzes.reduce((acc, q) => acc + (q.payload?.questions?.length ?? 0), 0),
    [quizzes],
  );

  const weeklyDelta = pctDelta(stats.answeredThisWeek, stats.answeredLastWeek);
  const activeFiltersCount =
    (difficultyFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (periodFilter !== "all" ? 1 : 0);

  const pickQuiz = useCallback(
    (id: string) => {
      if (id === selectedQuizId) return;
      setSelectedQuizId(id);
      setQuestionIdx(0);
      setSelectedAnswer(null);
      setRevealed(false);
      setShowExplanation(false);
      questionStartRef.current = Date.now();
    },
    [selectedQuizId],
  );

  const rotateQuestion = useCallback(() => {
    if (!selectedQuiz) return;
    const total = selectedQuiz.payload.questions.length;
    if (total <= 1) {
      setSelectedAnswer(null);
      setRevealed(false);
      setShowExplanation(false);
      questionStartRef.current = Date.now();
      return;
    }
    // Próxima random ≠ atual
    let next = Math.floor(Math.random() * total);
    if (next === questionIdx) next = (next + 1) % total;
    setQuestionIdx(next);
    setSelectedAnswer(null);
    setRevealed(false);
    setShowExplanation(false);
    questionStartRef.current = Date.now();
  }, [selectedQuiz, questionIdx]);

  const answerAndAdvance = useCallback(async () => {
    if (!selectedQuiz) return;
    const q = selectedQuiz.payload.questions[questionIdx];
    if (!q) return;
    if (selectedAnswer === null) return;

    // Primeiro clique: revelar
    if (!revealed) {
      const timeMs = Date.now() - questionStartRef.current;
      const correct = selectedAnswer === q.correctIndex;
      const attempt: QuizAttempt = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        user_id: user.id,
        asset_id: selectedQuiz.id,
        question_index: questionIdx,
        selected_index: selectedAnswer,
        correct,
        answered_at: new Date().toISOString(),
        time_ms: Math.max(0, timeMs),
      };
      try {
        await saveAttemptAsync(attempt);
        setAttempts((prev) => [...prev, attempt]);
      } catch (err) {
        console.error("[quiz] erro salvando attempt", err);
        toast.error("Não consegui salvar sua resposta.");
      }
      setRevealed(true);
      setShowExplanation(true);
      return;
    }

    // Segundo clique: próxima
    rotateQuestion();
  }, [selectedQuiz, questionIdx, selectedAnswer, revealed, rotateQuestion, user.id]);

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
        <PageHeader
          greeting={greeting}
          firstName={firstName}
          onNewQuiz={() => setWizardOpen(true)}
        />
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-16 text-center">
          <div className="flex justify-center mb-3">
            <LumiCharacter mood="thinking" size="lg" float />
          </div>
          <h2 className="text-xl font-semibold">
            Você ainda não tem quizzes.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Gere um quiz agora a partir de uma aula, PDF ou material seu — o
            Lumi monta questões de múltipla escolha com correção comentada.
          </p>
          <Button
            variant="gradient"
            size="lg"
            className="mt-6"
            onClick={() => setWizardOpen(true)}
          >
            <Plus className="h-4 w-4" /> Criar primeiro quiz
          </Button>
        </div>
        <ContentWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          mode="quiz"
          userId={user.id}
          onCreated={({ lectureId }) => {
            router.push(`/lecture/${lectureId}/products`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <PageHeader
        greeting={greeting}
        firstName={firstName}
        onNewQuiz={() => setWizardOpen(true)}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* 1. Desempenho geral */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Desempenho geral
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <Donut
                pct={stats.total === 0 ? null : stats.accuracy}
                size={68}
                stroke={8}
                muted={stats.total === 0}
              />
              <span className="mt-1 text-[10px] text-muted-foreground">
                de acerto
              </span>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[11px] text-muted-foreground">
                Respondidas:{" "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {stats.total.toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Corretas:{" "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {stats.correct.toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground/80 pt-1">
                {totalQuestionsAvailable.toLocaleString("pt-BR")} disponíveis
              </div>
            </div>
          </div>
          <button
            onClick={() => comingSoon("Relatório completo")}
            className="mt-3 text-[11px] text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
          >
            Ver relatório completo <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* 2. Questões respondidas */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Questões respondidas
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-3xl md:text-4xl font-semibold font-mono tabular-nums leading-none">
                {stats.total.toLocaleString("pt-BR")}
              </div>
              <div
                className={cn(
                  "mt-1 text-[11px]",
                  weeklyDelta === null
                    ? "text-muted-foreground"
                    : weeklyDelta >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                )}
              >
                {weeklyDelta === null
                  ? "primeira semana"
                  : `${weeklyDelta >= 0 ? "+" : ""}${weeklyDelta}% vs. semana passada`}
              </div>
            </div>
            <div className="w-20 h-10 shrink-0">
              <MiniLineChart data={stats.weeklySeries} height={40} />
            </div>
          </div>
          <button
            onClick={() => comingSoon("Histórico")}
            className="mt-3 text-[11px] text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
          >
            Ver histórico <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* 3. Sequência atual */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Sequência atual
          </div>
          <div className="flex items-center gap-2">
            <Flame
              className={cn(
                "h-7 w-7",
                stats.streak > 0
                  ? "text-amber-500"
                  : "text-muted-foreground/40",
              )}
            />
            <div className="text-3xl md:text-4xl font-semibold font-mono tabular-nums leading-none">
              {stats.streak}
            </div>
            <div className="text-sm text-muted-foreground self-end pb-1">
              dia{stats.streak === 1 ? "" : "s"}
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Trophy className="h-3 w-3" /> Melhor: {stats.bestStreak} dia
            {stats.bestStreak === 1 ? "" : "s"}
          </div>
          <button
            onClick={() => comingSoon("Conquistas")}
            className="mt-3 text-[11px] text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
          >
            Ver conquistas <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* 4. Tempo de prática */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            Tempo de prática
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl md:text-4xl font-semibold tabular-nums leading-none">
                {formatPracticeTime(stats.totalTimeMs)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                acumulado
              </div>
            </div>
            <div className="w-24 shrink-0">
              <WeekBarChart data={stats.weekly} />
            </div>
          </div>
          <button
            onClick={() => comingSoon("Estatísticas")}
            className="mt-3 text-[11px] text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
          >
            Ver estatísticas <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Subject filter pills */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto pb-1 -mb-1 no-scrollbar">
          <button
            onClick={() => setActiveSubjectId(null)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all shrink-0",
              activeSubjectId === null
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border/60 bg-background hover:bg-secondary/40 text-muted-foreground",
            )}
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.2} />
            Todos
          </button>
          {subjects.map((s) => {
            const Ic = getSubjectIcon(s.name);
            const isActive = activeSubjectId === s.id;
            return (
              <button
                key={s.id}
                onClick={() =>
                  setActiveSubjectId((prev) => (prev === s.id ? null : s.id))
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all max-w-[200px] shrink-0",
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
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1.5 shrink-0">
              <Filter className="h-3.5 w-3.5" /> Mais filtros
              {activeFiltersCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-primary text-white text-[10px] h-4 min-w-4 px-1 font-mono">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Dificuldade
            </DropdownMenuLabel>
            {(
              [
                ["all", "Todas"],
                ["easy", "Fácil (< 10 questões)"],
                ["medium", "Médio (10–20)"],
                ["hard", "Difícil (> 20)"],
              ] as const
            ).map(([k, label]) => (
              <DropdownMenuItem
                key={k}
                onClick={(e) => {
                  e.preventDefault();
                  setDifficultyFilter(k);
                }}
                className="pl-2"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center text-primary">
                  {difficultyFilter === k && <Check className="h-3.5 w-3.5" />}
                </span>
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Status
            </DropdownMenuLabel>
            {(
              [
                ["all", "Todos"],
                ["untouched", "Não iniciado"],
                ["in-progress", "Em progresso"],
                ["mastered", "Dominando (≥ 80%)"],
              ] as const
            ).map(([k, label]) => (
              <DropdownMenuItem
                key={k}
                onClick={(e) => {
                  e.preventDefault();
                  setStatusFilter(k);
                }}
                className="pl-2"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center text-primary">
                  {statusFilter === k && <Check className="h-3.5 w-3.5" />}
                </span>
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Período (última atividade)
            </DropdownMenuLabel>
            {(
              [
                ["all", "Qualquer"],
                ["7d", "Últimos 7 dias"],
                ["30d", "Últimos 30 dias"],
                ["90d", "Últimos 90 dias"],
              ] as const
            ).map(([k, label]) => (
              <DropdownMenuItem
                key={k}
                onClick={(e) => {
                  e.preventDefault();
                  setPeriodFilter(k);
                }}
                className="pl-2"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center text-primary">
                  {periodFilter === k && <Check className="h-3.5 w-3.5" />}
                </span>
                {label}
              </DropdownMenuItem>
            ))}
            {activeFiltersCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setDifficultyFilter("all");
                    setStatusFilter("all");
                    setPeriodFilter("all");
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Limpar filtros
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
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
                Nenhum banco corresponde aos filtros atuais.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => {
                  setActiveSubjectId(null);
                  setDifficultyFilter("all");
                  setStatusFilter("all");
                  setPeriodFilter("all");
                }}
              >
                Limpar todos os filtros
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
                const assetStats = statsByAsset.get(quiz.id) ?? {
                  total: 0,
                  correct: 0,
                  accuracy: 0,
                  lastAt: null,
                };
                const lastDateIso = assetStats.lastAt ?? quiz.updated_at;
                const lastLabel = assetStats.lastAt
                  ? `Última tentativa ${new Date(lastDateIso).toLocaleDateString(
                      "pt-BR",
                      { day: "2-digit", month: "2-digit", year: "2-digit" },
                    )}`
                  : "Nunca respondido";
                return (
                  <div
                    key={quiz.id}
                    onClick={() => pickQuiz(quiz.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pickQuiz(quiz.id);
                      }
                    }}
                    className={cn(
                      "w-full text-left rounded-xl border bg-card p-4 transition-all flex items-center gap-3 cursor-pointer outline-none",
                      isActive
                        ? "border-primary/60 shadow-md ring-1 ring-primary/30"
                        : "border-border/60 hover:border-primary/40 hover:shadow-sm focus-visible:ring-1 focus-visible:ring-primary/50",
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
                          <Clock className="h-3 w-3" /> {lastLabel}
                        </span>
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
                      <Donut
                        pct={assetStats.total === 0 ? null : assetStats.accuracy}
                        size={36}
                        stroke={5}
                        muted={assetStats.total === 0}
                      />
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
                        <DropdownMenuItem asChild>
                          <Link href={`/quiz-banco/${quiz.id}`}>
                            <ArrowRight className="h-4 w-4" /> Abrir banco completo
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => pickQuiz(quiz.id)}>
                          <Sparkles className="h-4 w-4" /> Praticar aqui
                        </DropdownMenuItem>
                        {lec && (
                          <DropdownMenuItem asChild>
                            <Link href={`/lecture/${lec.id}/products`}>
                              <ArrowRight className="h-4 w-4" /> Abrir na aula
                            </Link>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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

      <ContentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        mode="quiz"
        userId={user.id}
        onCreated={({ lectureId }) => {
          router.push(`/lecture/${lectureId}/products`);
        }}
      />
    </div>
  );
}

// ============================================================================
// Cabeçalho com saudação + título + ações
// ============================================================================
function PageHeader({
  greeting,
  firstName,
  onNewQuiz,
}: {
  greeting: string;
  firstName: string;
  onNewQuiz: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between mb-8">
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground mb-1">
          {greeting}, {firstName}
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
            <Mic className="h-4 w-4" /> Nova aula
          </Link>
        </Button>
        <Button variant="gradient" onClick={onNewQuiz}>
          <Plus className="h-4 w-4" /> Novo quiz
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

      <div className="space-y-2" role="radiogroup" aria-label="Opções da questão">
        {q.options.map((opt, i) => {
          const isSel = selectedAnswer === i;
          const isCorr = i === q.correctIndex;
          const showCorrect = revealed && isCorr;
          const showWrong = revealed && isSel && !isCorr;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isSel}
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
            aria-expanded={showExplanation}
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
          Suas respostas ficam salvas neste dispositivo.
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
