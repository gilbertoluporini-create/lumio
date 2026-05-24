"use client";

/**
 * /quiz-banco/[assetId] — Visualização rica de UM banco de questões.
 *
 * Layout 3 colunas:
 *  - Esquerda (220px): lista de questões com status (não resp./correta/errada)
 *  - Centro (flex-1): questão atual A-E + explicação
 *  - Direita (300px): estatísticas + chat + próximos passos
 */

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Layers,
  Loader2,
  MapIcon,
  PanelLeft,
  RefreshCw,
  Sparkles,
  Star,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiChatPanel } from "@/components/lumi/lumi-chat-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getLectureAsync, getSubjectAsync } from "@/lib/db";
import {
  formatPracticeTime,
  listAttemptsAsync,
  saveAttemptAsync,
  subscribeAttempts,
  type QuizAttempt,
} from "@/lib/quiz-attempts";
import { getSubjectIcon } from "@/lib/subject-icon";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function QuizBancoPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <QuizBancoView user={user} assetId={assetId} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

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

type QuizBank = {
  assetId: string;
  lectureId: string;
  questions: QuizQuestion[];
  generatedAt: string;
};

type MobileTab = "stats" | "chat" | "next";

const LETTERS = ["A", "B", "C", "D", "E"];

function QuizBancoView({ user, assetId }: { user: User; assetId: string }) {
  const router = useRouter();
  const [bank, setBank] = useState<QuizBank | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("stats");
  const [siblings, setSiblings] = useState<{
    summary: boolean;
    flashcardsId: string | null;
    mindmapId: string | null;
  }>({ summary: false, flashcardsId: null, mindmapId: null });
  const questionStartRef = useRef<number>(Date.now());

  // Load bank + lecture + subject + attempts
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("lecture_assets")
          .select("id, lecture_id, payload, created_at")
          .eq("id", assetId)
          .eq("user_id", user.id)
          .eq("kind", "quiz")
          .maybeSingle();
        if (!active) return;
        if (error || !data) {
          toast.error("Quiz não encontrado.");
          router.replace("/quiz");
          return;
        }
        const row = data as {
          id: string;
          lecture_id: string;
          payload: QuizPayload;
          created_at: string;
        };
        const questions = Array.isArray(row.payload?.questions)
          ? row.payload.questions
          : [];
        setBank({
          assetId: row.id,
          lectureId: row.lecture_id,
          questions,
          generatedAt: row.payload?.generatedAt ?? row.created_at,
        });

        const lec = await getLectureAsync(user.id, row.lecture_id);
        if (!active) return;
        setLecture(lec);
        if (lec) {
          const subj = await getSubjectAsync(user.id, lec.subjectId);
          if (active) setSubject(subj);
        }

        const atts = await listAttemptsAsync(user.id);
        if (active) setAttempts(atts);

        // Sibling assets
        try {
          const { data: sib } = await supabase
            .from("lecture_assets")
            .select("id, kind")
            .eq("user_id", user.id)
            .eq("lecture_id", row.lecture_id);
          if (!active) return;
          const rows = (sib ?? []) as Array<{ id: string; kind: string }>;
          let flashcardsId: string | null = null;
          let mindmapId: string | null = null;
          for (const r of rows) {
            if (r.kind === "flashcards") flashcardsId = r.id;
            if (r.kind === "mindmap") mindmapId = r.id;
          }
          setSiblings({
            summary: !!lec?.summary,
            flashcardsId,
            mindmapId,
          });
        } catch {
          /* ignore */
        }
      } catch (err) {
        toast.error(`Erro: ${(err as Error).message}`);
        router.replace("/quiz");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [assetId, user.id, router]);

  // React to attempts changes
  useEffect(() => {
    return subscribeAttempts(user.id, (next) => {
      setAttempts(next);
    });
  }, [user.id]);

  // Reset timer when question changes
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [currentIdx]);

  // Stats only for this bank
  const bankAttempts = useMemo(
    () => attempts.filter((a) => a.asset_id === assetId),
    [attempts, assetId],
  );
  const stats = useMemo(() => {
    const total = bankAttempts.length;
    const correct = bankAttempts.filter((a) => a.correct).length;
    const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100);
    const totalTimeMs = bankAttempts.reduce((sum, a) => sum + a.time_ms, 0);
    const avgTimeMs = total === 0 ? 0 : Math.round(totalTimeMs / total);
    return { total, correct, accuracy, totalTimeMs, avgTimeMs };
  }, [bankAttempts]);

  // Status por questão: latest attempt
  const questionStatus = useMemo(() => {
    const map = new Map<number, "correct" | "wrong" | "untouched">();
    const byQuestion = new Map<number, QuizAttempt[]>();
    for (const a of bankAttempts) {
      if (!byQuestion.has(a.question_index)) {
        byQuestion.set(a.question_index, []);
      }
      byQuestion.get(a.question_index)!.push(a);
    }
    if (!bank) return map;
    for (let i = 0; i < bank.questions.length; i++) {
      const arr = byQuestion.get(i);
      if (!arr || arr.length === 0) {
        map.set(i, "untouched");
      } else {
        // latest
        const latest = arr.sort((a, b) =>
          a.answered_at < b.answered_at ? 1 : -1,
        )[0];
        map.set(i, latest.correct ? "correct" : "wrong");
      }
    }
    return map;
  }, [bankAttempts, bank]);

  const currentQuestion = bank?.questions[currentIdx] ?? null;
  const isCorrect = currentQuestion ? selected === currentQuestion.correctIndex : false;

  const pickQuestion = useCallback((idx: number) => {
    setCurrentIdx(idx);
    setSelected(null);
    setRevealed(false);
    setShowExplanation(false);
    setMobileSidebarOpen(false);
  }, []);

  const submitAnswer = useCallback(async () => {
    if (!bank || !currentQuestion || selected === null) return;
    if (revealed) {
      // Next question
      const nextIdx = (currentIdx + 1) % bank.questions.length;
      pickQuestion(nextIdx);
      return;
    }
    const timeMs = Date.now() - questionStartRef.current;
    const correct = selected === currentQuestion.correctIndex;
    const attempt: QuizAttempt = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      user_id: user.id,
      asset_id: bank.assetId,
      question_index: currentIdx,
      selected_index: selected,
      correct,
      answered_at: new Date().toISOString(),
      time_ms: Math.max(0, timeMs),
    };
    try {
      await saveAttemptAsync(attempt);
      setAttempts((prev) => [...prev, attempt]);
    } catch (err) {
      toast.error(`Erro salvando resposta: ${(err as Error).message}`);
    }
    setRevealed(true);
    setShowExplanation(true);
  }, [bank, currentQuestion, selected, revealed, currentIdx, user.id, pickQuestion]);

  const openWizard = useCallback((mode: "summary" | "flashcards" | "mindmap") => {
    toast.message("Wizard em breve", {
      description: `Vamos abrir o gerador de ${
        mode === "summary"
          ? "resumo"
          : mode === "flashcards"
            ? "flashcards"
            : "mapa mental"
      }.`,
    });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!bank || !lecture) return null;

  const SubjectIcon = subject ? getSubjectIcon(subject.name) : Sparkles;

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-8">
      {/* Breadcrumb */}
      <nav className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <Link href="/quiz" className="hover:text-foreground transition-colors">
          Quiz
        </Link>
        <ChevronRight className="h-3 w-3" />
        {subject ? <span>{subject.name}</span> : <span>—</span>}
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
            {lecture.title}
          </h1>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {subject && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 dark:bg-primary/15 px-2.5 py-1 text-primary font-medium">
                <SubjectIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
                {subject.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Target className="h-3 w-3" /> {bank.questions.length} questões
            </span>
            {stats.total > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  "gap-1 text-[10px]",
                  stats.accuracy >= 80
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                )}
              >
                Acerto {stats.accuracy}%
              </Badge>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-3 w-full md:w-[220px] shrink-0">
          <div className="text-[11px] text-muted-foreground mb-1.5">
            Progresso geral
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {stats.total}
            </span>
            <span className="text-xs text-muted-foreground">
              de {bank.questions.length} respondidas
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
              style={{
                width: `${
                  bank.questions.length === 0
                    ? 0
                    : (stats.total / bank.questions.length) * 100
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Encontrar primeira não respondida
            for (let i = 0; i < bank.questions.length; i++) {
              if (questionStatus.get(i) === "untouched") {
                pickQuestion(i);
                return;
              }
            }
            toast.info("Todas as questões já foram respondidas.");
          }}
        >
          <ArrowRight className="h-3.5 w-3.5" /> Próxima não respondida
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Encontrar primeira errada
            for (let i = 0; i < bank.questions.length; i++) {
              if (questionStatus.get(i) === "wrong") {
                pickQuestion(i);
                return;
              }
            }
            toast.info("Nenhuma questão errada — você tá mandando muito bem!");
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Revisar erradas
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="lg:hidden ml-auto"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <PanelLeft className="h-3.5 w-3.5" /> Questões
        </Button>
      </div>

      {/* Grid 3-col */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] gap-6">
        {/* LEFT: Question list */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px]">
            <QuestionList
              questions={bank.questions}
              currentIdx={currentIdx}
              status={questionStatus}
              onPick={pickQuestion}
            />
          </div>
        </aside>

        {/* CENTER */}
        <main className="min-w-0 space-y-6">
          {currentQuestion && (
            <QuestionArea
              question={currentQuestion}
              idx={currentIdx}
              total={bank.questions.length}
              selected={selected}
              revealed={revealed}
              showExplanation={showExplanation}
              isCorrect={isCorrect}
              onSelect={(i) => !revealed && setSelected(i)}
              onSubmit={() => void submitAnswer()}
              onToggleExplanation={() => setShowExplanation((v) => !v)}
            />
          )}

          {/* 4 CTAs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ActionCard
              icon={<FileText className="h-5 w-5" />}
              title="Abrir resumo"
              description="Volte pro texto da aula."
              onClick={() => {
                if (siblings.summary) {
                  router.push(`/resumo/${lecture.id}`);
                } else {
                  toast.info("Esta aula ainda não tem resumo.");
                }
              }}
            />
            <ActionCard
              icon={<Layers className="h-5 w-5" />}
              title="Criar flashcards"
              description={
                siblings.flashcardsId
                  ? "Abrir deck existente."
                  : "Gerar deck deste conteúdo."
              }
              coinCost={siblings.flashcardsId ? undefined : 12}
              onClick={() => {
                if (siblings.flashcardsId) {
                  router.push(`/deck/${siblings.flashcardsId}`);
                } else {
                  openWizard("flashcards");
                }
              }}
            />
            <ActionCard
              icon={<MapIcon className="h-5 w-5" />}
              title="Mapa mental"
              description={
                siblings.mindmapId
                  ? "Abrir mapa existente."
                  : "Visualize as conexões."
              }
              coinCost={siblings.mindmapId ? undefined : 20}
              onClick={() => {
                if (siblings.mindmapId) {
                  router.push(`/mapa/${siblings.mindmapId}`);
                } else {
                  openWizard("mindmap");
                }
              }}
            />
            <ActionCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Revisar gravação"
              description="Veja a aula completa."
              href={`/lecture/${lecture.id}`}
            />
          </div>
        </main>

        {/* RIGHT */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px] space-y-4 max-h-[calc(100vh-100px)] overflow-y-auto pr-1">
            <BankStatsCard stats={stats} bankSize={bank.questions.length} />
            <LumiChatPanel
              lectureId={lecture.id}
              contextLabel={`Quiz · ${lecture.title}`}
              variant="quiz"
            />
            <BankNextStepsCard
              lectureId={lecture.id}
              hasSummary={siblings.summary}
              flashcardsId={siblings.flashcardsId}
              mindmapId={siblings.mindmapId}
              answeredCount={stats.total}
              totalQuestions={bank.questions.length}
            />
          </div>
        </aside>
      </div>

      {/* Mobile drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          />
          <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-card border-r border-border/60 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Questões</h3>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-secondary/60"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <QuestionList
              questions={bank.questions}
              currentIdx={currentIdx}
              status={questionStatus}
              onPick={pickQuestion}
            />
          </div>
        </div>
      )}

      {/* Mobile tabs */}
      <div className="lg:hidden mt-8">
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex border-b border-border/60 bg-secondary/20">
            {(
              [
                { k: "stats", label: "Estatísticas" },
                { k: "chat", label: "Lumi" },
                { k: "next", label: "Próximos" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.k}
                type="button"
                onClick={() => setMobileTab(tab.k)}
                className={cn(
                  "flex-1 px-2 py-2.5 text-xs font-medium transition-colors",
                  mobileTab === tab.k
                    ? "bg-card text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-3">
            {mobileTab === "stats" && (
              <BankStatsCard stats={stats} bankSize={bank.questions.length} />
            )}
            {mobileTab === "chat" && (
              <LumiChatPanel
                lectureId={lecture.id}
                contextLabel={`Quiz · ${lecture.title}`}
                variant="quiz"
              />
            )}
            {mobileTab === "next" && (
              <BankNextStepsCard
                lectureId={lecture.id}
                hasSummary={siblings.summary}
                flashcardsId={siblings.flashcardsId}
                mindmapId={siblings.mindmapId}
                answeredCount={stats.total}
                totalQuestions={bank.questions.length}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function QuestionList({
  questions,
  currentIdx,
  status,
  onPick,
}: {
  questions: QuizQuestion[];
  currentIdx: number;
  status: Map<number, "correct" | "wrong" | "untouched">;
  onPick: (i: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
        Questões ({questions.length})
      </div>
      <ol className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
        {questions.map((q, i) => {
          const st = status.get(i) ?? "untouched";
          const isActive = currentIdx === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onPick(i)}
                className={cn(
                  "group w-full text-left flex items-start gap-2.5 px-2 py-1.5 rounded-lg text-xs transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-mono font-semibold",
                    isActive
                      ? "bg-primary text-white"
                      : st === "correct"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : st === "wrong"
                          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          : "bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1 line-clamp-2 leading-snug pt-0.5">
                  {q.question}
                </span>
                {st === "correct" && (
                  <Check className="h-3 w-3 text-emerald-500 shrink-0 mt-1" />
                )}
                {st === "wrong" && (
                  <X className="h-3 w-3 text-rose-500 shrink-0 mt-1" />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function QuestionArea({
  question,
  idx,
  total,
  selected,
  revealed,
  showExplanation,
  isCorrect,
  onSelect,
  onSubmit,
  onToggleExplanation,
}: {
  question: QuizQuestion;
  idx: number;
  total: number;
  selected: number | null;
  revealed: boolean;
  showExplanation: boolean;
  isCorrect: boolean;
  onSelect: (i: number) => void;
  onSubmit: () => void;
  onToggleExplanation: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
          {idx + 1} / {total}
        </span>
        {revealed && (
          <Badge
            variant="secondary"
            className={cn(
              "gap-1 text-[10px]",
              isCorrect
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
            )}
          >
            {isCorrect ? (
              <>
                <Check className="h-2.5 w-2.5" /> Correta
              </>
            ) : (
              <>
                <X className="h-2.5 w-2.5" /> Errada
              </>
            )}
          </Badge>
        )}
      </div>

      <h2 className="text-base md:text-lg font-semibold leading-snug mb-5">
        {idx + 1}. {question.question}
      </h2>

      <div className="space-y-2.5" role="radiogroup" aria-label="Alternativas">
        {question.options.map((opt, i) => {
          const isSel = selected === i;
          const isCorr = i === question.correctIndex;
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
                  "h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-xs font-mono font-semibold transition-colors",
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

      {question.explanation && (
        <div className="mt-5">
          <button
            type="button"
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
              {question.explanation}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        <div className="text-[10px] text-muted-foreground/80">
          Suas respostas ficam salvas neste dispositivo.
        </div>
        <Button
          variant="gradient"
          onClick={onSubmit}
          disabled={selected === null && !revealed}
        >
          {revealed ? "Próxima" : "Responder"} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function BankStatsCard({
  stats,
  bankSize,
}: {
  stats: {
    total: number;
    correct: number;
    accuracy: number;
    totalTimeMs: number;
    avgTimeMs: number;
  };
  bankSize: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold mb-3">Estatísticas</div>
      <div className="space-y-3">
        <StatRow
          label="Acerto"
          value={`${stats.accuracy}%`}
          accent
          icon={<Target className="h-3.5 w-3.5 text-primary" />}
        />
        <StatRow
          label="Respondidas"
          value={`${stats.total} / ${bankSize}`}
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
        />
        <StatRow
          label="Corretas"
          value={String(stats.correct)}
          icon={<Star className="h-3.5 w-3.5 text-amber-500" />}
        />
        <StatRow
          label="Tempo médio"
          value={
            stats.avgTimeMs > 0
              ? `${Math.round(stats.avgTimeMs / 1000)}s`
              : "—"
          }
          icon={<Clock className="h-3.5 w-3.5 text-primary" />}
        />
        <StatRow
          label="Tempo total"
          value={formatPracticeTime(stats.totalTimeMs)}
          icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
        />
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-6 w-6 shrink-0 rounded-md bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
          {icon ?? <Circle className="h-3 w-3 text-primary" />}
        </span>
        <span className="text-xs text-foreground/80 truncate">{label}</span>
      </div>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums shrink-0",
          accent && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  coinCost,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  coinCost?: number;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <div className="rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 transition-all p-4 h-full flex flex-col gap-2 group cursor-pointer">
      <div className="h-9 w-9 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
        {icon}
      </div>
      <div className="text-sm font-semibold mt-1">{title}</div>
      <div className="text-xs text-muted-foreground leading-snug flex-1">
        {description}
      </div>
      <div className="text-[10px] text-muted-foreground/80 mt-1">
        {coinCost ? (
          <>
            <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
              {coinCost}
            </span>{" "}
            coins
          </>
        ) : (
          <>Grátis</>
        )}
      </div>
    </div>
  );
  if (href) return <Link href={href}>{body}</Link>;
  return (
    <button type="button" onClick={onClick} className="text-left w-full">
      {body}
    </button>
  );
}

function BankNextStepsCard({
  lectureId,
  hasSummary,
  flashcardsId,
  mindmapId,
  answeredCount,
  totalQuestions,
}: {
  lectureId: string;
  hasSummary: boolean;
  flashcardsId: string | null;
  mindmapId: string | null;
  answeredCount: number;
  totalQuestions: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold mb-3">Próximos passos</div>
      <ul className="space-y-2">
        <StepItem
          done={answeredCount >= totalQuestions}
          label={
            answeredCount >= totalQuestions
              ? "Banco completo. Revisite os erros."
              : `Responder ${totalQuestions - answeredCount} questões restantes`
          }
        />
        <StepItem
          done={hasSummary}
          label="Abrir resumo da aula"
          href={hasSummary ? `/resumo/${lectureId}` : undefined}
        />
        <StepItem
          done={!!flashcardsId}
          label={flashcardsId ? "Estudar deck deste tópico" : "Criar flashcards"}
          href={flashcardsId ? `/deck/${flashcardsId}` : undefined}
        />
        <StepItem
          done={!!mindmapId}
          label={mindmapId ? "Abrir mapa mental" : "Criar mapa mental"}
          href={mindmapId ? `/mapa/${mindmapId}` : undefined}
        />
        <StepItem
          done={false}
          label="Ver gravação completa"
          href={`/lecture/${lectureId}`}
        />
      </ul>
    </div>
  );
}

function StepItem({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href?: string;
}) {
  const body = (
    <div className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-secondary/40 transition-colors group cursor-pointer">
      <span
        className={cn(
          "shrink-0 h-4 w-4 rounded border mt-0.5 flex items-center justify-center",
          done
            ? "bg-primary border-primary text-white"
            : "border-border bg-background group-hover:border-primary",
        )}
        aria-hidden
      >
        {done && (
          <svg
            viewBox="0 0 12 12"
            className="h-2.5 w-2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 6.5l2.5 2.5L10 3.5" />
          </svg>
        )}
      </span>
      <span
        className={cn(
          "text-xs leading-snug",
          done ? "text-muted-foreground line-through" : "text-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
  return <li>{href ? <Link href={href}>{body}</Link> : body}</li>;
}
