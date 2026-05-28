"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  Dna,
  Dumbbell,
  FlaskConical,
  Frown,
  Gavel,
  Globe,
  HeartPulse,
  Languages,
  Landmark,
  Layers,
  Leaf,
  Library,
  Lightbulb,
  Meh,
  Microscope,
  MoreHorizontal,
  Music,
  Palette,
  Pill,
  Play,
  Plus,
  RotateCw,
  Scale,
  Search,
  Shuffle,
  Sigma,
  Smile,
  SmilePlus,
  Sparkles,
  Stethoscope,
  Syringe,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { listLecturesAsync, listSubjectsAsync } from "@/lib/db";
import {
  countDueForDeck,
  countStudiedToday,
  getDomain,
  getDomainForDeck,
  getDueCards,
  listCardStatesAsync,
  makeCardId,
  nextReview,
  saveCardStateAsync,
  type CardState,
  type Quality,
} from "@/lib/srs";
import { createClient } from "@/lib/supabase/client";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

// =====================================================================
// Tipos locais — flash cards são salvos em lecture_assets.payload
// =====================================================================
type Flashcard = {
  question: string;
  answer: string;
  hint?: string;
  difficulty?: "easy" | "medium" | "hard";
};

type FlashcardsPayload = {
  generatedAt?: string;
  cards: Flashcard[];
};

type FlashcardAssetRow = {
  id: string;
  lecture_id: string;
  user_id: string;
  kind: "flashcards";
  payload: FlashcardsPayload;
  coins_spent: number;
  created_at: string;
  updated_at: string;
};

type Deck = {
  assetId: string;
  lectureId: string;
  lectureTitle: string;
  subjectId: string;
  subjectName: string;
  cards: Flashcard[];
  createdAt: string;
  updatedAt: string;
};

type Level = "Iniciante" | "Intermediário" | "Avançado";

type SessionMode = "srs" | "random" | "sequential";
type SessionOrder = "default" | "random" | "hard-first";

function levelOfDeck(cardCount: number): Level {
  if (cardCount >= 100) return "Avançado";
  if (cardCount >= 50) return "Intermediário";
  return "Iniciante";
}

// =====================================================================
// Subject icon resolver — copiado de dashboard/page.tsx
// =====================================================================
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

// =====================================================================
// Page wrapper
// =====================================================================
export default function FlashcardsPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <FlashcardsHubView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

// =====================================================================
// Greeting
// =====================================================================
function useGreeting() {
  return useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);
}

// =====================================================================
// Helpers de fila de sessão (aplicados aos cards de um deck)
// =====================================================================
function buildSessionQueue(
  deck: Deck,
  mode: SessionMode,
  order: SessionOrder,
  states: CardState[],
  limit: number,
  onlyDue: boolean = false,
): number[] {
  const allIds = deck.cards.map((_, i) => makeCardId(deck.assetId, i));
  const stateById = new Map<string, CardState>(states.map((s) => [s.card_id, s]));
  const dueIds = new Set(getDueCards(states, allIds));

  let indices = deck.cards.map((_, i) => i);

  if (mode === "srs" || onlyDue) {
    // SRS: due first, depois o resto. Ordem dentro de cada grupo segue o `order`.
    const due: number[] = [];
    const rest: number[] = [];
    for (const i of indices) {
      const id = allIds[i];
      if (dueIds.has(id)) due.push(i);
      else rest.push(i);
    }
    indices = onlyDue ? due : [...due, ...rest];
  } else if (mode === "random") {
    indices = shuffle(indices);
  }
  // sequential = mantém indices na ordem natural

  // Aplicar `order` como tiebreaker (mas SRS já priorizou due → respeitamos)
  if (order === "random" && mode !== "random") {
    indices = shuffle(indices);
  } else if (order === "hard-first") {
    indices = [...indices].sort((a, b) => {
      const sa = stateById.get(allIds[a]);
      const sb = stateById.get(allIds[b]);
      // Menor ease = mais difícil = primeiro. Sem estado = neutro (2.5).
      const ea = sa?.ease ?? 2.5;
      const eb = sb?.ease ?? 2.5;
      return ea - eb;
    });
  }

  return indices.slice(0, Math.max(1, limit));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =====================================================================
// Main view
// =====================================================================
function FlashcardsHubView({ user }: { user: User }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const greeting = useGreeting();
  const firstName = user.name.split(" ")[0] || "estudante";

  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);

  // SRS state
  const [cardStates, setCardStates] = useState<CardState[]>([]);

  // Filtros
  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Sessão ativa
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [sessionQueue, setSessionQueue] = useState<number[]>([]);
  const [queuePos, setQueuePos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  // Config de sessão
  const [mode, setMode] = useState<SessionMode>("srs");
  const [order, setOrder] = useState<SessionOrder>("default");
  const [cardsPerSession, setCardsPerSession] = useState<number>(20);

  // Dialogs
  const [newDeckOpen, setNewDeckOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setNewDeckOpen(true);
      router.replace("/flashcards");
    }
  }, [searchParams, router]);

  // =====================================================================
  // Carga: subjects + lectures + flashcards + SRS states
  // =====================================================================
  const reload = useCallback(async () => {
    const [subjectsRes, lecturesRes, statesRes] = await Promise.all([
      listSubjectsAsync(user.id),
      listLecturesAsync(user.id),
      listCardStatesAsync(user.id),
    ]);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("lecture_assets")
      .select("*")
      .eq("user_id", user.id)
      .eq("kind", "flashcards")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Erro buscando flashcards:", error);
      toast.error("Não consegui carregar seus decks.");
      return;
    }

    const rows = (data ?? []) as FlashcardAssetRow[];
    const subjectMap = new Map<string, Subject>(
      subjectsRes.map((s) => [s.id, s]),
    );
    const lectureMap = new Map<string, Lecture>(
      lecturesRes.map((l) => [l.id, l]),
    );

    const built: Deck[] = rows
      .map((row) => {
        const lecture = lectureMap.get(row.lecture_id);
        if (!lecture) return null;
        const subject = subjectMap.get(lecture.subjectId);
        const cards = Array.isArray(row.payload?.cards)
          ? row.payload.cards
          : [];
        return {
          assetId: row.id,
          lectureId: row.lecture_id,
          lectureTitle: lecture.title,
          subjectId: lecture.subjectId,
          subjectName: subject?.name ?? "Sem matéria",
          cards,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        } as Deck;
      })
      .filter((d): d is Deck => d !== null && d.cards.length > 0);

    setDecks(built);
    setCardStates(statesRes);
  }, [user.id]);

  useEffect(() => {
    let mounted = true;
    reload()
      .catch((err) => {
        console.error(err);
        if (mounted) toast.error(`Erro: ${(err as Error).message}`);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [reload]);

  // =====================================================================
  // Lista de matérias únicas
  // =====================================================================
  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of decks) map.set(d.subjectId, d.subjectName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [decks]);

  // =====================================================================
  // Filtragem
  // =====================================================================
  const filteredDecks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return decks.filter((d) => {
      if (deckFilter !== "all" && d.assetId !== deckFilter) return false;
      if (subjectFilter !== "all" && d.subjectId !== subjectFilter) return false;
      if (levelFilter !== "all" && levelOfDeck(d.cards.length) !== levelFilter)
        return false;
      if (
        q &&
        !(
          d.lectureTitle.toLowerCase().includes(q) ||
          d.subjectName.toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [decks, deckFilter, subjectFilter, levelFilter, search]);

  // =====================================================================
  // IDs globais de todos os cards (pra stats globais)
  // =====================================================================
  const allCardIds = useMemo(() => {
    const ids: string[] = [];
    for (const d of decks) {
      for (let i = 0; i < d.cards.length; i++) {
        ids.push(makeCardId(d.assetId, i));
      }
    }
    return ids;
  }, [decks]);

  // =====================================================================
  // Stats REAIS baseados em SRS
  // =====================================================================
  const stats = useMemo(() => {
    const totalCards = allCardIds.length;
    const totalDecks = decks.length;
    const decksWithCards = decks.filter((d) => d.cards.length > 0).length;
    const masteryPct = Math.round(getDomain(cardStates) * 100);
    const studiedToday = countStudiedToday(cardStates);
    const dueIds = getDueCards(cardStates, allCardIds);
    const duePending = dueIds.length;
    return {
      totalDecks,
      decksWithCards,
      totalCards,
      masteryPct,
      studiedToday,
      duePending,
    };
  }, [decks, allCardIds, cardStates]);

  // =====================================================================
  // Sessão helpers
  // =====================================================================
  const currentCardIdx =
    sessionStarted && activeDeck && sessionQueue.length > 0
      ? sessionQueue[queuePos] ?? null
      : null;
  const currentCard =
    activeDeck && currentCardIdx !== null
      ? (activeDeck.cards[currentCardIdx] ?? null)
      : null;
  const sessionTotal = sessionStarted ? sessionQueue.length : 0;

  const pickDeckForStudy = useCallback((d: Deck) => {
    setActiveDeck(d);
    setSessionStarted(false);
    setSessionQueue([]);
    setQueuePos(0);
    setFlipped(false);
  }, []);

  const startSession = useCallback(
    (opts?: { onlyDue?: boolean; shuffle?: boolean }) => {
      if (!activeDeck) {
        toast.info("Selecione um deck na tabela abaixo pra começar.");
        return;
      }
      const effectiveOrder = opts?.shuffle ? "random" : order;
      const queue = buildSessionQueue(
        activeDeck,
        mode,
        effectiveOrder,
        cardStates,
        cardsPerSession,
        opts?.onlyDue ?? false,
      );
      if (queue.length === 0) {
        toast.info("Nenhum card pra estudar com essas configurações.");
        return;
      }
      setSessionQueue(queue);
      setQueuePos(0);
      setFlipped(false);
      setSessionStarted(true);
      toast.success(`Sessão iniciada — ${queue.length} cards`);
    },
    [activeDeck, mode, order, cardsPerSession, cardStates],
  );

  const nextCard = useCallback(() => {
    if (!sessionStarted) return;
    setQueuePos((i) => Math.min(i + 1, sessionQueue.length - 1));
    setFlipped(false);
  }, [sessionStarted, sessionQueue.length]);

  const prevCard = useCallback(() => {
    if (!sessionStarted) return;
    setQueuePos((i) => Math.max(i - 1, 0));
    setFlipped(false);
  }, [sessionStarted]);

  const resetSession = useCallback(() => {
    setQueuePos(0);
    setFlipped(false);
  }, []);

  const endSession = useCallback(() => {
    setSessionStarted(false);
    setSessionQueue([]);
    setQueuePos(0);
    setFlipped(false);
    toast.success("Sessão finalizada — bom trabalho!");
  }, []);

  const rateCurrentCard = useCallback(
    async (quality: Quality) => {
      if (!activeDeck || currentCardIdx === null) return;
      const cardId = makeCardId(activeDeck.assetId, currentCardIdx);
      const existing = cardStates.find((s) => s.card_id === cardId) ?? null;
      const updated = nextReview(existing, quality, cardId, user.id);
      // Atualiza state local
      setCardStates((prev) => {
        const idx = prev.findIndex((s) => s.card_id === cardId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        }
        return [...prev, updated];
      });
      // Persiste
      await saveCardStateAsync(updated);
      // Avança
      const isLast = queuePos >= sessionQueue.length - 1;
      if (isLast) {
        endSession();
      } else {
        nextCard();
      }
    },
    [
      activeDeck,
      currentCardIdx,
      cardStates,
      user.id,
      queuePos,
      sessionQueue.length,
      endSession,
      nextCard,
    ],
  );

  // Cards devidos no deck ativo (pra mostrar contagem em "Revisar pendentes")
  const activeDeckPending = useMemo(() => {
    if (!activeDeck) return 0;
    const ids = activeDeck.cards.map((_, i) => makeCardId(activeDeck.assetId, i));
    return countDueForDeck(cardStates, ids);
  }, [activeDeck, cardStates]);

  // Atalhos de teclado durante a sessão
  useEffect(() => {
    if (!sessionStarted) return;
    function onKey(e: KeyboardEvent) {
      // Ignora se está escrevendo em input
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
        e.preventDefault();
        prevCard();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextCard();
      } else if (flipped && e.key >= "1" && e.key <= "4") {
        e.preventDefault();
        const q = (parseInt(e.key, 10) - 1) as Quality;
        void rateCurrentCard(q);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionStarted, flipped, nextCard, prevCard, rateCurrentCard]);

  // =====================================================================
  // Loading skeleton
  // =====================================================================
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-4 w-32 rounded bg-secondary/40 animate-pulse mb-2" />
        <div className="h-9 w-56 rounded-md bg-secondary/50 animate-pulse mb-2" />
        <div className="h-4 w-96 rounded bg-secondary/40 animate-pulse mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 rounded-2xl bg-secondary/30 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 h-96 rounded-2xl bg-secondary/30 animate-pulse" />
          <div className="h-96 rounded-2xl bg-secondary/30 animate-pulse" />
        </div>
      </div>
    );
  }

  // =====================================================================
  // Empty state
  // =====================================================================
  if (decks.length === 0) {
    return (
      <>
        <div className="mx-auto max-w-2xl px-5 py-16 text-center">
          <div className="flex justify-center mb-3">
            <LumiCharacter mood="sleeping" size="lg" float />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Nenhum deck por enquanto
          </h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
            Os flash cards são gerados a partir das suas aulas. Abra uma aula
            com transcrição e clique em &quot;Gerar flash cards&quot; pra criar
            seu primeiro deck.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button
              variant="gradient"
              size="lg"
              onClick={() => setNewDeckOpen(true)}
            >
              <Plus className="h-4 w-4" /> Criar primeiro deck
            </Button>
          </div>
        </div>
        <ContentWizard
          open={newDeckOpen}
          onOpenChange={setNewDeckOpen}
          mode="flashcards"
          userId={user.id}
          onCreated={({ summaryId }) => {
            // Deck recém-criado aparece no topo da lista; recarrega via reload().
            if (summaryId) router.push(`/resumo/doc/${summaryId}`);
            else void reload();
          }}
        />
      </>
    );
  }

  // Meta diária heurística — 120 cards ou 30% do total (o maior)
  const dailyGoal = Math.max(120, Math.round(stats.totalCards * 0.3));

  return (
    <>
      <div className="mx-auto max-w-7xl px-5 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-7">
          <div className="flex min-w-0 items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/lumi-book-open.png"
              alt="Lumi"
              className="hidden h-20 w-auto shrink-0 object-contain drop-shadow-sm sm:block md:h-24"
            />
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground mb-1">
                {greeting}, {firstName}
              </div>
              <h1 className="text-3xl md:text-4xl heading-display">
                Flashcards
              </h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl">
                Reforce sua memória com repetição espaçada e estude com
                eficiência.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="gradient" onClick={() => setNewDeckOpen(true)}>
              <Plus className="h-4 w-4" /> Novo deck
            </Button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={deckFilter}
              onChange={setDeckFilter}
              options={[
                { value: "all", label: "Todos os decks" },
                ...decks.map((d) => ({
                  value: d.assetId,
                  label: d.lectureTitle,
                })),
              ]}
            />
            <FilterSelect
              value={subjectFilter}
              onChange={setSubjectFilter}
              options={[
                { value: "all", label: "Todas as matérias" },
                ...subjectOptions.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <FilterSelect
              value={levelFilter}
              onChange={setLevelFilter}
              options={[
                { value: "all", label: "Todos os níveis" },
                { value: "Iniciante", label: "Iniciante" },
                { value: "Intermediário", label: "Intermediário" },
                { value: "Avançado", label: "Avançado" },
              ]}
            />
          </div>
          <div className="relative md:w-72 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar decks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* 4 stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
          <ProgressDonutCard
            value={stats.masteryPct}
            hasData={cardStates.length > 0}
          />
          <StudiedTodayCard
            studied={stats.studiedToday}
            total={stats.totalCards}
            goal={dailyGoal}
          />
          <ActiveDecksCard
            active={stats.decksWithCards}
            total={stats.totalDecks}
          />
          <PendingReviewsCard
            pending={stats.duePending}
            total={stats.totalCards}
          />
        </div>

        {/* Main 2-col area: sessão (left) + sidebar (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          {/* Sessão de estudo (col-span-2) */}
          <div className="lg:col-span-2">
            <StudySessionCard
              deck={activeDeck}
              card={currentCard}
              idx={queuePos}
              total={sessionTotal}
              flipped={flipped}
              sessionStarted={sessionStarted}
              onFlip={() => setFlipped((v) => !v)}
              onPrev={prevCard}
              onNext={nextCard}
              onReset={resetSession}
              onRate={(q) => void rateCurrentCard(q)}
              onEnd={endSession}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <SessionConfigCard
              mode={mode}
              order={order}
              cardsPerSession={cardsPerSession}
              onModeChange={setMode}
              onOrderChange={setOrder}
              onCardsChange={setCardsPerSession}
              onStart={() => startSession()}
              onReviewDue={() => startSession({ onlyDue: true })}
              onShuffle={() => startSession({ shuffle: true })}
              pending={activeDeckPending}
              hasActiveDeck={!!activeDeck}
              activeDeckTitle={activeDeck?.lectureTitle ?? null}
            />
            <DueTodayCard
              total={stats.duePending}
              onClick={() => {
                if (!activeDeck) {
                  toast.info(
                    "Selecione um deck primeiro pra revisar os cards devidos.",
                  );
                  return;
                }
                startSession({ onlyDue: true });
              }}
            />
          </div>
        </div>

        {/* Seus decks */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Seus decks
            </h2>
            <Link
              href="/dashboard"
              className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
            >
              Ver todos os decks <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <DeckTable
            decks={filteredDecks}
            cardStates={cardStates}
            activeDeckId={activeDeck?.assetId ?? null}
            onSelect={(d) => {
              pickDeckForStudy(d);
              if (typeof window !== "undefined") {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            onOpen={(d) => router.push(`/deck/${d.assetId}`)}
          />
        </div>
      </div>

      <ContentWizard
        open={newDeckOpen}
        onOpenChange={setNewDeckOpen}
        mode="flashcards"
        userId={user.id}
        onCreated={() => {
          // Recarrega a lista pra mostrar o novo deck.
          void reload();
        }}
      />
    </>
  );
}

// =====================================================================
// Filter select
// =====================================================================
function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none h-9 rounded-md border border-border bg-background pl-3 pr-9 text-sm font-medium hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors cursor-pointer max-w-[200px] truncate"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground rotate-90 pointer-events-none" />
    </div>
  );
}

// =====================================================================
// Stat card 1: progresso geral (donut)
// =====================================================================
function ProgressDonutCard({
  value,
  hasData,
}: {
  value: number;
  hasData: boolean;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const msg =
    !hasData
      ? "Inicie sessões pra ver progresso"
      : value >= 80
        ? "Excelente! Continue revisando pra manter."
        : value >= 50
          ? "Continue assim! Você está indo muito bem."
          : value >= 20
            ? "Bom começo — consistência é tudo."
            : "Comece com uma sessão SRS hoje.";

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        Progresso geral
      </div>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <svg
            viewBox="0 0 70 70"
            className="-rotate-90 h-full w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id="donut-grad" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.6 0.25 290)" />
                <stop offset="100%" stopColor="oklch(0.65 0.25 330)" />
              </linearGradient>
            </defs>
            <circle
              cx="35"
              cy="35"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="7"
              className="text-secondary"
            />
            <circle
              cx="35"
              cy="35"
              r={radius}
              fill="none"
              stroke="url(#donut-grad)"
              strokeWidth="7"
              strokeDasharray={circumference}
              strokeDashoffset={hasData ? offset : circumference}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-semibold tabular-nums">
              {hasData ? `${value}%` : "—"}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {hasData ? "Domínio médio" : "Sem dados"}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
            {msg}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Stat card 2: cards estudados hoje
// =====================================================================
function StudiedTodayCard({
  studied,
  total,
  goal,
}: {
  studied: number;
  total: number;
  goal: number;
}) {
  const pct = goal > 0 ? Math.min(100, (studied / goal) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        Cards estudados hoje
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{studied}</span>
        <span className="text-sm text-muted-foreground">de {total} cards</span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        Meta diária: {goal} cards — {Math.round(pct)}%
      </div>
    </div>
  );
}

// =====================================================================
// Stat card 3: decks ativos
// =====================================================================
function ActiveDecksCard({
  active,
  total,
}: {
  active: number;
  total: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 flex flex-col">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        Decks ativos
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{active}</span>
        <span className="text-sm text-muted-foreground">
          de {total} deck{total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-auto pt-3">
        <Link
          href="/dashboard"
          className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
        >
          Ver todos os decks <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

// =====================================================================
// Stat card 4: revisões de hoje
// =====================================================================
function PendingReviewsCard({
  pending,
  total,
}: {
  pending: number;
  total: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 flex flex-col">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        Revisões de hoje
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{pending}</span>
        <span className="text-sm text-muted-foreground">
          de {total} pendentes
        </span>
      </div>
      <div className="mt-auto pt-3">
        <span className="text-xs text-primary font-medium inline-flex items-center gap-1">
          Ver revisões <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

// =====================================================================
// Study session card
// =====================================================================
function StudySessionCard({
  deck,
  card,
  idx,
  total,
  flipped,
  sessionStarted,
  onFlip,
  onPrev,
  onNext,
  onReset,
  onRate,
  onEnd,
}: {
  deck: Deck | null;
  card: Flashcard | null;
  idx: number;
  total: number;
  flipped: boolean;
  sessionStarted: boolean;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onRate: (q: Quality) => void;
  onEnd: () => void;
}) {
  const hasSession = sessionStarted && !!deck && total > 0 && !!card;
  const progress = hasSession ? ((idx + 1) / total) * 100 : 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center shrink-0">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {deck ? deck.lectureTitle : "Sessão de estudo"}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {deck
                ? sessionStarted
                  ? `${deck.subjectName} · sessão ativa`
                  : `${deck.subjectName} · pronto pra começar`
                : "Nenhum deck selecionado"}
            </div>
          </div>
        </div>
        {hasSession && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="text-xs"
            >
              <RotateCw className="h-3.5 w-3.5" /> Recomeçar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEnd}
              className="text-xs"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Finalizar
            </Button>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">
          {hasSession ? idx + 1 : 0} / {total}
        </span>
      </div>

      {/* Card flip area */}
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
            onClick={hasSession ? onFlip : undefined}
            disabled={!hasSession}
            className={cn(
              "flex-1 flex flex-col items-center justify-center px-12 py-6 text-center w-full",
              hasSession
                ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
                : "cursor-default",
            )}
          >
            {hasSession && card ? (
              !flipped ? (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                    Pergunta
                  </p>
                  <p className="text-xl md:text-2xl font-semibold leading-snug max-w-2xl">
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
                  <p className="text-lg md:text-xl leading-relaxed max-w-2xl">
                    {card.answer}
                  </p>
                </>
              )
            ) : (
              <p className="text-sm text-muted-foreground max-w-sm">
                {deck
                  ? `Configure sua sessão à direita e clique em "Iniciar sessão" pra estudar ${deck.lectureTitle}.`
                  : "Selecione um deck na tabela abaixo pra começar a estudar."}
              </p>
            )}
          </button>

          {/* Side chevrons */}
          {hasSession && (
            <>
              <button
                type="button"
                onClick={onPrev}
                disabled={idx === 0}
                aria-label="Card anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur border border-border/60 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={idx >= total - 1}
                aria-label="Próximo card"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-full bg-background/80 backdrop-blur border border-border/60 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div className="border-t border-border/40 px-4 py-2.5 flex items-center justify-center">
            <button
              type="button"
              onClick={hasSession ? onFlip : undefined}
              disabled={!hasSession}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed"
            >
              <RotateCw className="h-3 w-3" />
              {hasSession
                ? flipped
                  ? "Clique para ver a frente"
                  : "Clique para virar o card (ou Espaço)"
                : "Sem card ativo"}
            </button>
          </div>
        </div>
      </div>

      {/* Difficulty buttons — só aparecem após virar pra resposta */}
      <div
        className={cn(
          "mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 transition-opacity",
          hasSession && flipped
            ? "opacity-100"
            : "opacity-40 pointer-events-none",
        )}
      >
        <DifficultyButton
          Icon={Frown}
          label="Não lembro"
          range="0–10%"
          color="rose"
          hotkey="1"
          disabled={!hasSession || !flipped}
          onClick={() => onRate(0)}
        />
        <DifficultyButton
          Icon={Meh}
          label="Lembrei pouco"
          range="10–40%"
          color="orange"
          hotkey="2"
          disabled={!hasSession || !flipped}
          onClick={() => onRate(1)}
        />
        <DifficultyButton
          Icon={Smile}
          label="Lembrei bem"
          range="40–70%"
          color="amber"
          hotkey="3"
          disabled={!hasSession || !flipped}
          onClick={() => onRate(2)}
        />
        <DifficultyButton
          Icon={SmilePlus}
          label="Lembrei muito bem"
          range="70–100%"
          color="emerald"
          hotkey="4"
          disabled={!hasSession || !flipped}
          onClick={() => onRate(3)}
        />
      </div>

      {hasSession && !flipped && (
        <p className="mt-2 text-[11px] text-center text-muted-foreground">
          Vire o card pra avaliar sua memória
        </p>
      )}
    </div>
  );
}

// =====================================================================
// Difficulty button
// =====================================================================
function DifficultyButton({
  emoji,
  Icon,
  label,
  range,
  color,
  hotkey,
  disabled,
  onClick,
}: {
  emoji?: string;
  Icon?: LucideIcon;
  label: string;
  range: string;
  color: "rose" | "orange" | "amber" | "emerald";
  hotkey: string;
  disabled?: boolean;
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
      disabled={disabled}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border px-3 py-3 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed",
        "hover:-translate-y-0.5 active:translate-y-0",
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
      <span className="font-semibold leading-tight">{label}</span>
      <span className="text-[10px] font-mono opacity-70 mt-0.5">{range}</span>
      <kbd className="absolute top-1.5 right-1.5 text-[9px] font-mono opacity-50 px-1 rounded bg-background/50 border border-current/20">
        {hotkey}
      </kbd>
    </button>
  );
}

// =====================================================================
// Session config sidebar card
// =====================================================================
function SessionConfigCard({
  mode,
  order,
  cardsPerSession,
  onModeChange,
  onOrderChange,
  onCardsChange,
  onStart,
  onReviewDue,
  onShuffle,
  pending,
  hasActiveDeck,
  activeDeckTitle,
}: {
  mode: SessionMode;
  order: SessionOrder;
  cardsPerSession: number;
  onModeChange: (v: SessionMode) => void;
  onOrderChange: (v: SessionOrder) => void;
  onCardsChange: (v: number) => void;
  onStart: () => void;
  onReviewDue: () => void;
  onShuffle: () => void;
  pending: number;
  hasActiveDeck: boolean;
  activeDeckTitle: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Play className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Sessão de estudo
        </span>
      </div>

      {hasActiveDeck && activeDeckTitle && (
        <div className="mb-3 rounded-lg bg-primary/5 border border-primary/15 px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-primary/80 mb-0.5">
            Deck ativo
          </div>
          <div className="text-xs font-medium truncate">{activeDeckTitle}</div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Modo de estudo
          </label>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as SessionMode)}
            className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="srs">Repetição espaçada</option>
            <option value="random">Aleatório</option>
            <option value="sequential">Sequencial</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Ordem dos cards
          </label>
          <select
            value={order}
            onChange={(e) => onOrderChange(e.target.value as SessionOrder)}
            className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="default">Padrão</option>
            <option value="random">Aleatório</option>
            <option value="hard-first">Mais difíceis primeiro</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Cards desta sessão
          </label>
          <select
            value={cardsPerSession}
            onChange={(e) =>
              onCardsChange(parseInt(e.target.value, 10) || 20)
            }
            className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={10}>10 cards</option>
            <option value={20}>20 cards</option>
            <option value={50}>50 cards</option>
            <option value={100}>100 cards</option>
          </select>
        </div>
      </div>

      <Button
        variant="gradient"
        className="w-full mt-4"
        size="lg"
        onClick={onStart}
        disabled={!hasActiveDeck}
      >
        <Play className="h-4 w-4" /> Iniciar sessão
      </Button>

      <div className="mt-2 flex flex-col gap-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={onReviewDue}
          disabled={!hasActiveDeck || pending === 0}
        >
          Revisar pendentes ({pending})
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={onShuffle}
          disabled={!hasActiveDeck}
        >
          <Shuffle className="h-4 w-4" /> Embaralhar deck
        </Button>
      </div>

      {!hasActiveDeck && (
        <p className="mt-3 text-[11px] text-center text-muted-foreground">
          Selecione um deck na tabela abaixo
        </p>
      )}
    </div>
  );
}

// =====================================================================
// Due today card
// =====================================================================
function DueTodayCard({
  total,
  onClick,
}: {
  total: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left block rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
    >
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        Devido hoje
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-3xl font-semibold tabular-nums leading-none">
            {total}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {total === 1 ? "card para revisar" : "cards para revisar"}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
}

// =====================================================================
// Deck table
// =====================================================================
function DeckTable({
  decks,
  cardStates,
  activeDeckId,
  onSelect,
  onOpen,
}: {
  decks: Deck[];
  cardStates: CardState[];
  activeDeckId: string | null;
  onSelect: (d: Deck) => void;
  onOpen: (d: Deck) => void;
}) {
  if (decks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card/40 px-8 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum deck bate com os filtros atuais.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header (desktop only) */}
      <div className="hidden md:grid grid-cols-[1.5fr_1fr_70px_1.5fr_80px_120px_40px] gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40 bg-secondary/20">
        <div>Deck</div>
        <div>Matéria</div>
        <div className="text-right">Cards</div>
        <div>Domínio</div>
        <div className="text-right">Hoje</div>
        <div>Nível</div>
        <div />
      </div>
      <div className="divide-y divide-border/40">
        {decks.map((d) => (
          <DeckRow
            key={d.assetId}
            deck={d}
            cardStates={cardStates}
            active={d.assetId === activeDeckId}
            onSelect={() => onSelect(d)}
            onOpen={() => onOpen(d)}
          />
        ))}
      </div>
    </div>
  );
}

function DeckRow({
  deck,
  cardStates,
  active,
  onSelect,
  onOpen,
}: {
  deck: Deck;
  cardStates: CardState[];
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const Icon = getSubjectIcon(deck.subjectName);
  const level = levelOfDeck(deck.cards.length);

  const { masteryPct, dueToday } = useMemo(() => {
    const ids = deck.cards.map((_, i) => makeCardId(deck.assetId, i));
    return {
      masteryPct: Math.round(getDomainForDeck(cardStates, ids) * 100),
      dueToday: countDueForDeck(cardStates, ids),
    };
  }, [deck.assetId, deck.cards, cardStates]);

  const levelDot: Record<Level, string> = {
    Iniciante: "bg-sky-500",
    Intermediário: "bg-amber-500",
    Avançado: "bg-emerald-500",
  };

  return (
    <div
      className={cn(
        "grid md:grid-cols-[1.5fr_1fr_70px_1.5fr_80px_120px_40px] grid-cols-[1fr_40px] gap-3 px-4 py-3 items-center transition-colors hover:bg-secondary/20",
        active && "bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2.5 min-w-0 text-left"
      >
        <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {deck.lectureTitle}
          </div>
          <div className="md:hidden text-[11px] text-muted-foreground truncate">
            {deck.subjectName} · {deck.cards.length} cards · {level}
          </div>
        </div>
      </button>

      <div className="hidden md:block text-sm text-muted-foreground truncate">
        {deck.subjectName}
      </div>

      <div className="hidden md:block text-right text-sm font-mono tabular-nums">
        {deck.cards.length}
      </div>

      <div className="hidden md:flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
            style={{ width: `${masteryPct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0 w-8 text-right">
          {masteryPct}%
        </span>
      </div>

      <div
        className={cn(
          "hidden md:block text-right text-sm font-mono tabular-nums",
          dueToday > 0 ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {dueToday}
      </div>

      <div className="hidden md:flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", levelDot[level])} />
        <span className="text-xs">{level}</span>
      </div>

      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-secondary"
              aria-label="Ações do deck"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSelect}>
              <Play className="h-4 w-4" /> Estudar agora
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpen}>
              <Sparkles className="h-4 w-4" /> Abrir na aula
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast.info("Em breve.")}>
              <Clock className="h-4 w-4" /> Histórico de revisões
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

