"use client";

/**
 * /deck/[assetId] — Visualização rica de UM deck de flashcards.
 *
 * Layout 3 colunas:
 *  - Esquerda (220px): lista numerada de cards + status SRS
 *  - Centro (flex-1): study session UI (card flip + difficulty buttons)
 *  - Direita (300px): resumo rápido + stats + chat + próximos passos
 */

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Frown,
  Layers,
  Loader2,
  MapIcon,
  Meh,
  PanelLeft,
  Play,
  RotateCw,
  Shuffle,
  Smile,
  SmilePlus,
  Sparkles,
  Star,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { BackToHub } from "@/components/app/back-to-hub";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { LumiChatPanel } from "@/components/lumi/lumi-chat-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getLectureAsync, getSubjectAsync } from "@/lib/db";
import { getSummaryByLectureIdAsync } from "@/lib/summaries";
import { getSubjectIcon } from "@/lib/subject-icon";
import {
  countDueForDeck,
  getDomainForDeck,
  listCardStatesAsync,
  makeCardId,
  nextReview,
  saveCardStateAsync,
  type CardState,
  type Quality,
} from "@/lib/srs";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn, stripMarkdownToPlainText } from "@/lib/utils";
import { ZoomableImage } from "@/components/ui/zoomable-image";

export default function DeckPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <DeckView user={user} assetId={assetId} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

type Flashcard = {
  question: string;
  answer: string;
  hint?: string;
  difficulty?: "easy" | "medium" | "hard";
};

type FlashcardsPayload = {
  generatedAt?: string;
  cards: Flashcard[];
  imageUrls?: string[];
};

type DeckAsset = {
  assetId: string;
  lectureId: string;
  cards: Flashcard[];
  generatedAt: string;
  imageUrls: string[];
};

type MobileTab = "summary" | "chat" | "stats" | "next";

function DeckView({ user, assetId }: { user: User; assetId: string }) {
  const router = useRouter();
  const [deck, setDeck] = useState<DeckAsset | null>(null);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [cardStates, setCardStates] = useState<CardState[]>([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("summary");
  const [assetSiblings, setAssetSiblings] = useState<{
    summary: boolean;
    quizId: string | null;
    mindmapId: string | null;
  }>({ summary: false, quizId: null, mindmapId: null });
  const [summarySnippet, setSummarySnippet] = useState<string | undefined>(
    undefined,
  );

  // ===== Load deck =====
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
          .eq("kind", "flashcards")
          .is("deleted_at", null)
          .maybeSingle();
        if (!active) return;
        if (error || !data) {
          toast.error("Deck não encontrado.");
          router.replace("/flashcards");
          return;
        }
        const row = data as {
          id: string;
          lecture_id: string;
          payload: FlashcardsPayload;
          created_at: string;
        };
        const cards = Array.isArray(row.payload?.cards) ? row.payload.cards : [];
        const imageUrls = Array.isArray(row.payload?.imageUrls)
          ? row.payload.imageUrls.filter(
              (u): u is string => typeof u === "string" && u.length > 0,
            )
          : [];
        setDeck({
          assetId: row.id,
          lectureId: row.lecture_id,
          cards,
          generatedAt: row.payload?.generatedAt ?? row.created_at,
          imageUrls,
        });

        // Load lecture + subject
        const lec = await getLectureAsync(user.id, row.lecture_id);
        if (!active) return;
        setLecture(lec);
        if (lec) {
          const subj = await getSubjectAsync(user.id, lec.subjectId);
          if (active) setSubject(subj);
        }

        // SRS states
        const states = await listCardStatesAsync(user.id);
        if (active) setCardStates(states);

        // Sibling assets (resumo source, quiz, mindmap)
        try {
          const { data: siblings } = await supabase
            .from("lecture_assets")
            .select("id, kind")
            .eq("user_id", user.id)
            .eq("lecture_id", row.lecture_id)
            .is("deleted_at", null);
          if (!active) return;
          const rows = (siblings ?? []) as Array<{ id: string; kind: string }>;
          let quizId: string | null = null;
          let mindmapId: string | null = null;
          for (const r of rows) {
            if (r.kind === "quiz") quizId = r.id;
            if (r.kind === "mindmap") mindmapId = r.id;
          }
          const summaryRow = lec
            ? await getSummaryByLectureIdAsync(user.id, lec.id)
            : null;
          if (!active) return;
          setAssetSiblings({
            summary: !!summaryRow,
            quizId,
            mindmapId,
          });
          setSummarySnippet(summaryRow?.content.generalSummary ?? undefined);
        } catch {
          /* ignore */
        }
      } catch (err) {
        toast.error(`Erro: ${(err as Error).message}`);
        router.replace("/flashcards");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [assetId, user.id, router]);

  // ===== Derived state =====
  const allCardIds = useMemo(() => {
    if (!deck) return [];
    return deck.cards.map((_, i) => makeCardId(deck.assetId, i));
  }, [deck]);

  const masteryPct = useMemo(() => {
    if (allCardIds.length === 0) return 0;
    return Math.round(getDomainForDeck(cardStates, allCardIds) * 100);
  }, [allCardIds, cardStates]);

  const dueCount = useMemo(() => {
    return countDueForDeck(cardStates, allCardIds);
  }, [allCardIds, cardStates]);

  // ===== Session =====
  const currentIdx = sessionStarted && queue.length > 0 ? queue[pos] ?? null : null;
  const currentCard =
    deck && currentIdx !== null ? deck.cards[currentIdx] ?? null : null;
  const sessionProgress =
    queue.length > 0 ? Math.round(((pos + 1) / queue.length) * 100) : 0;

  const startSession = useCallback(
    (opts?: { onlyDue?: boolean; shuffle?: boolean }) => {
      if (!deck || deck.cards.length === 0) {
        toast.info("Este deck está vazio.");
        return;
      }
      const stateById = new Map(cardStates.map((s) => [s.card_id, s]));
      let indices = deck.cards.map((_, i) => i);
      if (opts?.onlyDue) {
        const now = Date.now();
        indices = indices.filter((i) => {
          const s = stateById.get(makeCardId(deck.assetId, i));
          if (!s) return true;
          return new Date(s.next_review).getTime() <= now;
        });
        if (indices.length === 0) {
          toast.info("Nenhum card devido agora. Bom trabalho!");
          return;
        }
      }
      if (opts?.shuffle) {
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
      }
      setQueue(indices);
      setPos(0);
      setFlipped(false);
      setSessionStarted(true);
    },
    [deck, cardStates],
  );

  const endSession = useCallback(() => {
    setSessionStarted(false);
    setQueue([]);
    setPos(0);
    setFlipped(false);
    toast.success("Sessão finalizada — bom trabalho!");
  }, []);

  const nextCard = useCallback(() => {
    setPos((i) => Math.min(i + 1, queue.length - 1));
    setFlipped(false);
  }, [queue.length]);

  const prevCard = useCallback(() => {
    setPos((i) => Math.max(0, i - 1));
    setFlipped(false);
  }, []);

  const rate = useCallback(
    async (quality: Quality) => {
      if (!deck || currentIdx === null) return;
      const cardId = makeCardId(deck.assetId, currentIdx);
      const existing = cardStates.find((s) => s.card_id === cardId) ?? null;
      const updated = nextReview(existing, quality, cardId, user.id);
      setCardStates((prev) => {
        const idx = prev.findIndex((s) => s.card_id === cardId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        }
        return [...prev, updated];
      });
      await saveCardStateAsync(updated);
      const isLast = pos >= queue.length - 1;
      if (isLast) {
        endSession();
      } else {
        nextCard();
      }
    },
    [deck, currentIdx, cardStates, user.id, pos, queue.length, endSession, nextCard],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (!sessionStarted) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((v) => !v);
      } else if (e.key === "ArrowLeft") {
        prevCard();
      } else if (e.key === "ArrowRight") {
        nextCard();
      } else if (flipped && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const q = (parseInt(e.key, 10) - 1) as Quality;
        void rate(q);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionStarted, flipped, nextCard, prevCard, rate]);

  // Wizard stub
  const openWizard = useCallback((mode: "summary" | "quiz" | "mindmap") => {
    toast.message("Wizard em breve", {
      description: `Vamos abrir o gerador de ${
        mode === "summary" ? "resumo" : mode === "quiz" ? "quiz" : "mapa mental"
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
  if (!deck || !lecture) return null;

  const SubjectIcon = subject ? getSubjectIcon(subject.name) : Layers;

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-6 md:py-8">
      {/* Voltar pra aba do menu */}
      <BackToHub className="mb-3" />

      {/* Breadcrumb */}
      <nav className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <Link href="/flashcards" className="hover:text-foreground transition-colors">
          Flashcards
        </Link>
        <ChevronRight className="h-3 w-3" />
        {subject ? <span>{subject.name}</span> : <span>—</span>}
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl md:text-3xl heading-display">
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
              <Layers className="h-3 w-3" /> {deck.cards.length} cards
            </span>
            <Badge
              variant="secondary"
              className="gap-1 text-[10px] bg-primary/10 text-primary"
            >
              Domínio {masteryPct}%
            </Badge>
            {dueCount > 0 && (
              <Badge
                variant="secondary"
                className="gap-1 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300"
              >
                <Timer className="h-2.5 w-2.5" /> {dueCount} devidos
              </Badge>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-3 w-full md:w-[200px] shrink-0">
          <div className="text-[11px] text-muted-foreground mb-1.5">
            Sessão de estudo
          </div>
          <Button
            variant="gradient"
            size="sm"
            className="w-full"
            onClick={() => startSession()}
            disabled={deck.cards.length === 0}
          >
            <Play className="h-3.5 w-3.5" /> Iniciar sessão
          </Button>
        </div>
      </div>

      {/* Actions row */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => startSession({ onlyDue: true })}
          disabled={dueCount === 0}
        >
          <Timer className="h-3.5 w-3.5" /> Revisar devidos ({dueCount})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => startSession({ shuffle: true })}
        >
          <Shuffle className="h-3.5 w-3.5" /> Embaralhar deck
        </Button>
        <Button
          variant="outline"
          size="sm"
          asChild
          disabled={!assetSiblings.summary}
        >
          <Link
            href={
              assetSiblings.summary ? `/resumo/${lecture.id}` : "#"
            }
            onClick={(e) => {
              if (!assetSiblings.summary) {
                e.preventDefault();
                toast.info("Esta aula ainda não tem resumo.");
              }
            }}
          >
            <FileText className="h-3.5 w-3.5" /> Abrir resumo
          </Link>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const ok = await confirmAction({
              title: `Excluir esse deck de flashcards?`,
              description:
                "As cartas e seu progresso de estudo serão removidos. A aula de origem permanece.",
              destructive: true,
              confirmText: "Excluir deck",
            });
            if (!ok) return;
            const { deleteLectureAssetAsync } = await import(
              "@/lib/lecture-assets-delete"
            );
            const res = await deleteLectureAssetAsync(user.id, assetId);
            if (!res.ok) {
              toast.error(`Erro: ${res.error}`);
              return;
            }
            toast.success("Deck excluído.");
            router.push("/flashcards");
          }}
          className="text-destructive hover:text-destructive hover:border-destructive/50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Excluir
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="lg:hidden ml-auto"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <PanelLeft className="h-3.5 w-3.5" /> Cards
        </Button>
      </div>

      {/* Galeria de imagens educacionais (geradas com o deck) */}
      {deck.imageUrls.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Imagens da aula
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {deck.imageUrls.map((url, i) => (
              <ZoomableImage
                key={url}
                src={url}
                alt={`Ilustração ${i + 1}`}
                className="my-0 max-w-none"
                imgClassName="aspect-video object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {/* Grid 3-col */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px] gap-6">
        {/* LEFT: Cards list */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px]">
            <CardsList
              deck={deck}
              cardStates={cardStates}
              currentIdx={currentIdx}
              sessionStarted={sessionStarted}
              onPick={(i) => {
                if (!sessionStarted) startSession();
                const idxInQueue = queue.indexOf(i);
                if (idxInQueue >= 0) {
                  setPos(idxInQueue);
                  setFlipped(false);
                }
              }}
            />
          </div>
        </aside>

        {/* CENTER: Session */}
        <main className="min-w-0 space-y-6">
          <StudyArea
            card={currentCard}
            total={queue.length}
            pos={pos}
            flipped={flipped}
            sessionStarted={sessionStarted}
            sessionProgress={sessionProgress}
            onFlip={() => setFlipped((v) => !v)}
            onPrev={prevCard}
            onNext={nextCard}
            onRate={(q) => void rate(q)}
            onStart={() => startSession()}
            onEnd={endSession}
            deckSize={deck.cards.length}
          />

          {/* 4 CTAs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ActionCard
              icon={<FileText className="h-5 w-5" />}
              title="Abrir resumo"
              description="Volte pro texto principal da aula."
              onClick={() => {
                if (assetSiblings.summary) {
                  router.push(`/resumo/${lecture.id}`);
                } else {
                  toast.info("Esta aula ainda não tem resumo.");
                }
              }}
            />
            <ActionCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Gerar quiz"
              description={
                assetSiblings.quizId ? "Abrir quiz existente." : "Criar quiz."
              }
              coinCost={assetSiblings.quizId ? undefined : 15}
              onClick={() => {
                if (assetSiblings.quizId) {
                  router.push(`/quiz-banco/${assetSiblings.quizId}`);
                } else {
                  openWizard("quiz");
                }
              }}
            />
            <ActionCard
              icon={<MapIcon className="h-5 w-5" />}
              title="Mapa mental"
              description={
                assetSiblings.mindmapId
                  ? "Abrir mapa existente."
                  : "Criar mapa mental."
              }
              coinCost={assetSiblings.mindmapId ? undefined : 20}
              onClick={() => {
                if (assetSiblings.mindmapId) {
                  router.push(`/mapa/${assetSiblings.mindmapId}`);
                } else {
                  openWizard("mindmap");
                }
              }}
            />
            <ActionCard
              icon={<Shuffle className="h-5 w-5" />}
              title="Embaralhar deck"
              description="Sessão com cards em ordem aleatória."
              onClick={() => startSession({ shuffle: true })}
            />
          </div>
        </main>

        {/* RIGHT: Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-[80px] space-y-4 max-h-[calc(100vh-100px)] overflow-y-auto pr-1">
            <DeckQuickCard
              lecture={lecture}
              cardCount={deck.cards.length}
              summarySnippet={summarySnippet}
            />
            <DeckStatsCard
              masteryPct={masteryPct}
              dueCount={dueCount}
              total={deck.cards.length}
              cardStates={cardStates}
              allCardIds={allCardIds}
            />
            <LumiChatPanel
              lectureId={lecture.id}
              contextLabel={`Deck · ${lecture.title}`}
              variant="deck"
            />
            <DeckNextStepsCard
              lectureId={lecture.id}
              hasSummary={assetSiblings.summary}
              quizId={assetSiblings.quizId}
              mindmapId={assetSiblings.mindmapId}
              dueCount={dueCount}
              onStartDue={() => startSession({ onlyDue: true })}
            />
          </div>
        </aside>
      </div>

      {/* Mobile: drawer com lista de cards */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fechar lista"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          />
          <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-card border-r border-border/60 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Cards do deck</h3>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-secondary/60"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <CardsList
              deck={deck}
              cardStates={cardStates}
              currentIdx={currentIdx}
              sessionStarted={sessionStarted}
              onPick={(i) => {
                if (!sessionStarted) startSession();
                const idxInQueue = queue.indexOf(i);
                if (idxInQueue >= 0) {
                  setPos(idxInQueue);
                  setFlipped(false);
                }
                setMobileSidebarOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Mobile: tabs */}
      <div className="lg:hidden mt-8">
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex border-b border-border/60 bg-secondary/20">
            {(
              [
                { k: "summary", label: "Aula" },
                { k: "stats", label: "Stats" },
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
            {mobileTab === "summary" && (
              <DeckQuickCard
              lecture={lecture}
              cardCount={deck.cards.length}
              summarySnippet={summarySnippet}
            />
            )}
            {mobileTab === "stats" && (
              <DeckStatsCard
                masteryPct={masteryPct}
                dueCount={dueCount}
                total={deck.cards.length}
                cardStates={cardStates}
                allCardIds={allCardIds}
              />
            )}
            {mobileTab === "chat" && (
              <LumiChatPanel
                lectureId={lecture.id}
                contextLabel={`Deck · ${lecture.title}`}
                variant="deck"
              />
            )}
            {mobileTab === "next" && (
              <DeckNextStepsCard
                lectureId={lecture.id}
                hasSummary={assetSiblings.summary}
                quizId={assetSiblings.quizId}
                mindmapId={assetSiblings.mindmapId}
                dueCount={dueCount}
                onStartDue={() => startSession({ onlyDue: true })}
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

type CardStatus = "new" | "due" | "mastered";

function statusOf(state: CardState | undefined): CardStatus {
  if (!state) return "new";
  if (state.reps >= 3 && state.ease >= 2.2) return "mastered";
  const due = new Date(state.next_review).getTime() <= Date.now();
  return due ? "due" : "mastered";
}

function CardsList({
  deck,
  cardStates,
  currentIdx,
  sessionStarted,
  onPick,
}: {
  deck: DeckAsset;
  cardStates: CardState[];
  currentIdx: number | null;
  sessionStarted: boolean;
  onPick: (i: number) => void;
}) {
  const stateMap = useMemo(() => {
    const m = new Map<string, CardState>();
    cardStates.forEach((s) => m.set(s.card_id, s));
    return m;
  }, [cardStates]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
        Todos os cards ({deck.cards.length})
      </div>
      <ol className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
        {deck.cards.map((card, i) => {
          const state = stateMap.get(makeCardId(deck.assetId, i));
          const status = statusOf(state);
          const isActive = sessionStarted && currentIdx === i;
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
                      : "bg-secondary text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1 line-clamp-2 leading-snug pt-0.5">
                  {card.question}
                </span>
                <span
                  className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      status === "mastered"
                        ? "oklch(0.7 0.2 145)"
                        : status === "due"
                          ? "oklch(0.75 0.18 60)"
                          : "oklch(0.7 0.02 270)",
                  }}
                  title={
                    status === "mastered"
                      ? "Dominado"
                      : status === "due"
                        ? "Devido"
                        : "Novo"
                  }
                />
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StudyArea({
  card,
  pos,
  total,
  flipped,
  sessionStarted,
  sessionProgress,
  onFlip,
  onPrev,
  onNext,
  onRate,
  onStart,
  onEnd,
  deckSize,
}: {
  card: Flashcard | null;
  pos: number;
  total: number;
  flipped: boolean;
  sessionStarted: boolean;
  sessionProgress: number;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRate: (q: Quality) => void;
  onStart: () => void;
  onEnd: () => void;
  deckSize: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {sessionStarted
            ? `Card ${pos + 1} de ${total}`
            : `${deckSize} cards prontos`}
        </div>
        {sessionStarted && (
          <Button variant="ghost" size="sm" onClick={onEnd}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar
          </Button>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
            style={{ width: `${sessionProgress}%` }}
          />
        </div>
        <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">
          {sessionProgress}%
        </span>
      </div>

      {/* Card */}
      <div className="relative">
        <div
          className={cn(
            "relative rounded-2xl border-2 transition-all min-h-[300px] flex flex-col",
            flipped
              ? "border-primary/50 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5"
              : "border-border/70 bg-card",
          )}
        >
          <div className="flex items-start justify-between p-4 pb-2">
            <Badge variant="outline" className="gap-1.5 text-[10px]">
              {flipped ? "Verso" : "Frente"}
            </Badge>
            {card?.difficulty && (
              <Badge variant="secondary" className="text-[10px]">
                {card.difficulty === "easy"
                  ? "Fácil"
                  : card.difficulty === "medium"
                    ? "Médio"
                    : "Difícil"}
              </Badge>
            )}
          </div>

          <button
            type="button"
            onClick={sessionStarted ? onFlip : onStart}
            className={cn(
              "flex-1 flex flex-col items-center justify-center px-8 py-6 text-center w-full cursor-pointer",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl",
            )}
          >
            {sessionStarted && card ? (
              !flipped ? (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                    Pergunta
                  </p>
                  <p className="text-lg md:text-2xl font-semibold leading-snug max-w-2xl">
                    {card.question}
                  </p>
                  {card.hint && (
                    <p className="mt-4 text-xs text-muted-foreground italic max-w-md">
                      Dica: {card.hint}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-primary mb-3">
                    Resposta
                  </p>
                  <p className="text-base md:text-xl leading-relaxed max-w-2xl">
                    {card.answer}
                  </p>
                </>
              )
            ) : (
              <>
                <Sparkles className="h-8 w-8 text-primary/40 mb-3" />
                <p className="text-base font-semibold mb-1">
                  Pronto pra estudar
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Clique aqui ou em &quot;Iniciar sessão&quot; pra começar.
                </p>
              </>
            )}
          </button>

          {sessionStarted && (
            <>
              <button
                type="button"
                onClick={onPrev}
                disabled={pos === 0}
                aria-label="Card anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur border border-border/60 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={pos >= total - 1}
                aria-label="Próximo card"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur border border-border/60 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="border-t border-border/40 px-4 py-2.5 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <RotateCw className="h-3 w-3" />
              {sessionStarted
                ? flipped
                  ? "Clique para ver a frente"
                  : "Clique para virar (ou Espaço)"
                : "Aguardando início"}
            </span>
          </div>
        </div>
      </div>

      {/* Difficulty buttons */}
      <div
        className={cn(
          "mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 transition-opacity",
          sessionStarted && flipped && card
            ? "opacity-100"
            : "opacity-40 pointer-events-none",
        )}
      >
        <DifficultyButton
          Icon={Frown}
          label="Não lembro"
          color="rose"
          hotkey="1"
          onClick={() => onRate(0)}
        />
        <DifficultyButton
          Icon={Meh}
          label="Lembrei pouco"
          color="orange"
          hotkey="2"
          onClick={() => onRate(1)}
        />
        <DifficultyButton
          Icon={Smile}
          label="Lembrei bem"
          color="amber"
          hotkey="3"
          onClick={() => onRate(2)}
        />
        <DifficultyButton
          Icon={SmilePlus}
          label="Lembrei muito"
          color="emerald"
          hotkey="4"
          onClick={() => onRate(3)}
        />
      </div>
    </div>
  );
}

function DifficultyButton({
  emoji,
  Icon,
  label,
  color,
  hotkey,
  onClick,
}: {
  emoji?: string;
  Icon?: LucideIcon;
  label: string;
  color: "rose" | "orange" | "amber" | "emerald";
  hotkey: string;
  onClick: () => void;
}) {
  const colorClasses: Record<typeof color, string> = {
    rose: "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/15 text-rose-700 dark:text-rose-300",
    orange:
      "border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/15 text-orange-700 dark:text-orange-300",
    amber:
      "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15 text-amber-700 dark:text-amber-300",
    emerald:
      "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border px-2.5 py-3 text-xs font-medium transition-all hover:-translate-y-0.5 active:translate-y-0",
        colorClasses[color],
      )}
    >
      {Icon ? (
        <Icon className="h-5 w-5 mb-1" aria-hidden />
      ) : emoji ? (
        <span className="text-base mb-1" aria-hidden>
          {emoji}
        </span>
      ) : null}
      <span className="font-semibold leading-tight text-center">{label}</span>
      <kbd className="absolute top-1.5 right-1.5 text-[9px] font-mono opacity-50 px-1 rounded bg-background/50 border border-current/20">
        {hotkey}
      </kbd>
    </button>
  );
}

function ActionCard({
  icon,
  title,
  description,
  coinCost,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  coinCost?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 transition-all p-4 h-full flex flex-col gap-2 group"
    >
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
    </button>
  );
}

function DeckQuickCard({
  lecture,
  cardCount,
  summarySnippet,
}: {
  lecture: Lecture;
  cardCount: number;
  summarySnippet?: string;
}) {
  const raw = summarySnippet
    ? stripMarkdownToPlainText(summarySnippet)
    : "";
  const snippet = raw
    ? raw.length > 180
      ? raw.slice(0, 160) + "…"
      : raw
    : "Este deck foi gerado a partir da aula original.";
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-fuchsia-500/8 p-4">
      <div className="text-[11px] uppercase tracking-wider text-primary/90 font-medium mb-2 inline-flex items-center gap-1.5">
        <Sparkles className="h-3 w-3" /> Aula origem
      </div>
      <p className="text-xs leading-relaxed text-foreground/85 line-clamp-5">
        {snippet}
      </p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{cardCount} cards gerados</span>
        <Link
          href={`/lecture/${lecture.id}`}
          className="font-medium text-primary inline-flex items-center gap-1 hover:gap-1.5 transition-all"
        >
          Ver aula <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function DeckStatsCard({
  masteryPct,
  dueCount,
  total,
  cardStates,
  allCardIds,
}: {
  masteryPct: number;
  dueCount: number;
  total: number;
  cardStates: CardState[];
  allCardIds: string[];
}) {
  const states = useMemo(() => {
    const set = new Set(allCardIds);
    return cardStates.filter((s) => set.has(s.card_id));
  }, [cardStates, allCardIds]);
  const studied = states.length;
  const nextReviewDate = useMemo(() => {
    if (states.length === 0) return null;
    const future = states
      .map((s) => new Date(s.next_review).getTime())
      .filter((t) => t > Date.now())
      .sort((a, b) => a - b);
    if (future.length === 0) return null;
    return new Date(future[0]);
  }, [states]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold mb-3">Estatísticas</div>
      <div className="space-y-3">
        <StatRow
          label="Domínio"
          value={`${masteryPct}%`}
          accent
          icon={<Star className="h-3.5 w-3.5 text-amber-500" />}
        />
        <StatRow
          label="Cards estudados"
          value={`${studied} / ${total}`}
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
        />
        <StatRow
          label="Devidos hoje"
          value={String(dueCount)}
          icon={<Timer className="h-3.5 w-3.5 text-amber-500" />}
        />
        <StatRow
          label="Próxima revisão"
          value={
            nextReviewDate
              ? nextReviewDate.toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })
              : "—"
          }
          icon={<Clock className="h-3.5 w-3.5 text-primary" />}
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

function DeckNextStepsCard({
  lectureId,
  hasSummary,
  quizId,
  mindmapId,
  dueCount,
  onStartDue,
}: {
  lectureId: string;
  hasSummary: boolean;
  quizId: string | null;
  mindmapId: string | null;
  dueCount: number;
  onStartDue: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold mb-3">Próximos passos</div>
      <ul className="space-y-2">
        <StepItem
          done={dueCount === 0}
          label={
            dueCount > 0
              ? `Revisar ${dueCount} cards devidos`
              : "Tudo em dia! Volte amanhã."
          }
          onClick={dueCount > 0 ? onStartDue : undefined}
        />
        <StepItem
          done={hasSummary}
          label="Abrir resumo da aula"
          href={hasSummary ? `/resumo/${lectureId}` : undefined}
        />
        <StepItem
          done={!!quizId}
          label={quizId ? "Abrir banco de questões" : "Gerar quiz desta aula"}
          href={quizId ? `/quiz-banco/${quizId}` : undefined}
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
  onClick,
  href,
}: {
  done: boolean;
  label: string;
  onClick?: () => void;
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
  return (
    <li>
      {href ? (
        <Link href={href}>{body}</Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={!onClick}
          className="w-full text-left"
        >
          {body}
        </button>
      )}
    </li>
  );
}

