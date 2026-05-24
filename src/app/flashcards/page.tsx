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
  ChevronLeft,
  ChevronRight,
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
  Sparkles,
  Stethoscope,
  Syringe,
  Upload,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { LumiCharacter } from "@/components/brand/lumi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listLecturesAsync, listSubjectsAsync } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

// =====================================================================
// Tipos locais — flash cards são salvos em lecture_assets.payload
// Verifiquei flashcards-view.tsx: payload é { generatedAt, cards: [...] }
// Cada card: { question, answer, hint?, difficulty? }
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
// Greeting (mesma lógica do dashboard)
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
// Main view
// =====================================================================
function FlashcardsHubView({ user }: { user: User }) {
  const router = useRouter();
  const greeting = useGreeting();
  const firstName = user.name.split(" ")[0] || "estudante";

  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [deckFilter, setDeckFilter] = useState<string>("all"); // all | <assetId>
  const [subjectFilter, setSubjectFilter] = useState<string>("all"); // all | <subjectId>
  const [levelFilter, setLevelFilter] = useState<string>("all"); // all | Iniciante | Intermediário | Avançado
  const [search, setSearch] = useState("");

  // Sessão de estudo
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Config de sessão
  const [mode, setMode] = useState<"srs" | "random" | "sequential">("srs");
  const [order, setOrder] = useState<"default" | "hard-first">("default");
  const [cardsPerSession, setCardsPerSession] = useState<number>(20);

  // =====================================================================
  // Carga inicial: subjects + lectures + lecture_assets (flashcards)
  // =====================================================================
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [subjectsRes, lecturesRes] = await Promise.all([
          listSubjectsAsync(user.id),
          listLecturesAsync(user.id),
        ]);

        const supabase = createClient();
        const { data, error } = await supabase
          .from("lecture_assets")
          .select("*")
          .eq("user_id", user.id)
          .eq("kind", "flashcards")
          .order("updated_at", { ascending: false });

        if (error) {
          console.error("Erro buscando flashcards:", error);
          if (mounted) {
            toast.error("Não consegui carregar seus decks.");
            setLoading(false);
          }
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

        if (mounted) {
          setDecks(built);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (mounted) {
          toast.error(`Erro: ${(err as Error).message}`);
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [user.id]);

  // =====================================================================
  // Lista de matérias únicas (vindo dos decks)
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
      if (q && !d.lectureTitle.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [decks, deckFilter, subjectFilter, levelFilter, search]);

  // =====================================================================
  // Stats globais (honestos — sem SRS data)
  // =====================================================================
  const stats = useMemo(() => {
    const totalDecks = decks.length;
    const decksWithCards = decks.filter((d) => d.cards.length > 0).length;
    const totalCards = decks.reduce((acc, d) => acc + d.cards.length, 0);
    const mastery =
      totalDecks > 0 ? Math.round((decksWithCards / totalDecks) * 100) : 0;
    return {
      totalDecks,
      decksWithCards,
      totalCards,
      mastery,
    };
  }, [decks]);

  // =====================================================================
  // Sessão helpers
  // =====================================================================
  const sessionTotal = activeDeck ? activeDeck.cards.length : 0;
  const currentCard =
    activeDeck && sessionTotal > 0 ? activeDeck.cards[cardIdx] : null;

  function pickDeckForStudy(d: Deck) {
    setActiveDeck(d);
    setCardIdx(0);
    setFlipped(false);
  }

  function nextCard() {
    if (!activeDeck) return;
    setCardIdx((i) => Math.min(i + 1, activeDeck.cards.length - 1));
    setFlipped(false);
  }
  function prevCard() {
    if (!activeDeck) return;
    setCardIdx((i) => Math.max(i - 1, 0));
    setFlipped(false);
  }
  function resetSession() {
    setCardIdx(0);
    setFlipped(false);
  }

  function startSession() {
    if (!activeDeck) {
      toast.info("Selecione um deck na tabela abaixo pra começar.");
      return;
    }
    toast.message("Repetição espaçada em breve.", {
      description:
        "A sessão SRS completa ainda está sendo construída. Por enquanto, você pode navegar pelos cards manualmente.",
    });
  }

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
  // Empty state honesto
  // =====================================================================
  if (decks.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center">
        <div className="flex justify-center mb-3">
          <LumiCharacter mood="sleeping" size="lg" float />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nenhum deck por enquanto
        </h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
          Os flash cards são gerados a partir das suas aulas. Abra uma aula com
          transcrição e clique em &quot;Gerar flash cards&quot; pra criar seu primeiro
          deck.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="gradient" size="lg">
            <Link href="/dashboard">
              <Plus className="h-4 w-4" /> Criar primeiro deck
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-7">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground mb-1">
            {greeting}, {firstName} 👋
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Flashcards
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Reforce sua memória com repetição espaçada e estude com eficiência.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="outline"
            disabled
            title="Decks são gerados a partir das suas aulas"
          >
            <Plus className="h-4 w-4" /> Novo deck
          </Button>
          <Button
            variant="gradient"
            disabled
            title="Em breve"
          >
            <Upload className="h-4 w-4" /> Importar deck
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
              ...decks.map((d) => ({ value: d.assetId, label: d.lectureTitle })),
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
          value={stats.mastery}
          totalDecks={stats.totalDecks}
          hasData={stats.totalDecks > 0}
        />
        <StudiedTodayCard total={stats.totalCards} />
        <ActiveDecksCard
          active={stats.decksWithCards}
          total={stats.totalDecks}
        />
        <PendingReviewsCard total={stats.totalCards} />
      </div>

      {/* Main 2-col area: sessão (left) + sidebar (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Sessão de estudo (col-span-2) */}
        <div className="lg:col-span-2">
          <StudySessionCard
            deck={activeDeck}
            card={currentCard}
            idx={cardIdx}
            total={sessionTotal}
            flipped={flipped}
            onFlip={() => setFlipped((v) => !v)}
            onPrev={prevCard}
            onNext={nextCard}
            onReset={resetSession}
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
            onStart={startSession}
            pending={0}
          />
          <DueTodayCard total={0} />
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
          activeDeckId={activeDeck?.assetId ?? null}
          onSelect={(d) => {
            pickDeckForStudy(d);
            // scroll into the study card
            if (typeof window !== "undefined") {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
          onOpen={(d) => router.push(`/lecture/${d.lectureId}/products`)}
        />
      </div>
    </div>
  );
}

// =====================================================================
// Filter select (native <select> wrapped pra ficar consistente)
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
  totalDecks,
  hasData,
}: {
  value: number;
  totalDecks: number;
  hasData: boolean;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

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
              stroke="oklch(0.6 0.25 290)"
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
            {hasData
              ? `${totalDecks} deck${totalDecks === 1 ? "" : "s"} ativo${totalDecks === 1 ? "" : "s"}`
              : "Inicie sessões pra ver progresso"}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Stat card 2: cards estudados hoje
// =====================================================================
function StudiedTodayCard({ total }: { total: number }) {
  const studied = 0; // sem tracking diário ainda
  const goal = 120;
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
        Meta diária: {goal} cards
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
function PendingReviewsCard({ total }: { total: number }) {
  const pending = 0; // sem SRS ainda
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
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          Em breve <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

// =====================================================================
// Study session card (big center card)
// =====================================================================
function StudySessionCard({
  deck,
  card,
  idx,
  total,
  flipped,
  onFlip,
  onPrev,
  onNext,
  onReset,
}: {
  deck: Deck | null;
  card: Flashcard | null;
  idx: number;
  total: number;
  flipped: boolean;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
}) {
  const hasSession = !!deck && total > 0;
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
              {deck ? deck.subjectName : "Nenhum deck selecionado"}
            </div>
          </div>
        </div>
        {hasSession && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-xs shrink-0"
          >
            <RotateCw className="h-3.5 w-3.5" /> Recomeçar
          </Button>
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
            "relative rounded-2xl border-2 transition-all min-h-[280px] flex flex-col",
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
              "flex-1 flex flex-col items-center justify-center px-8 py-6 text-center w-full",
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
                Selecione um deck na tabela abaixo pra começar a estudar.
              </p>
            )}
          </button>

          {/* Side chevrons (absolute) */}
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
              {hasSession ? "Clique para virar o card" : "Sem card ativo"}
            </button>
          </div>
        </div>
      </div>

      {/* Difficulty buttons */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        <DifficultyButton
          label="Não lembro"
          range="0–10%"
          color="rose"
          disabled={!hasSession}
          onClick={() => {
            toast.info("Repetição espaçada em breve.");
            onNext();
          }}
        />
        <DifficultyButton
          label="Lembrei pouco"
          range="10–40%"
          color="orange"
          disabled={!hasSession}
          onClick={() => {
            toast.info("Repetição espaçada em breve.");
            onNext();
          }}
        />
        <DifficultyButton
          label="Lembrei bem"
          range="40–70%"
          color="amber"
          disabled={!hasSession}
          onClick={() => {
            toast.info("Repetição espaçada em breve.");
            onNext();
          }}
        />
        <DifficultyButton
          label="Lembrei muito bem"
          range="70–100%"
          color="emerald"
          disabled={!hasSession}
          onClick={() => {
            toast.info("Repetição espaçada em breve.");
            onNext();
          }}
        />
      </div>
    </div>
  );
}

// =====================================================================
// Difficulty button
// =====================================================================
function DifficultyButton({
  label,
  range,
  color,
  disabled,
  onClick,
}: {
  label: string;
  range: string;
  color: "rose" | "orange" | "amber" | "emerald";
  disabled?: boolean;
  onClick: () => void;
}) {
  const colorClasses: Record<typeof color, string> = {
    rose: "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 text-rose-700 dark:text-rose-300",
    orange:
      "border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 text-orange-700 dark:text-orange-300",
    amber:
      "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300",
    emerald:
      "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        colorClasses[color],
      )}
    >
      <span className="font-semibold leading-tight">{label}</span>
      <span className="text-[10px] font-mono opacity-70 mt-0.5">{range}</span>
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
  pending,
}: {
  mode: "srs" | "random" | "sequential";
  order: "default" | "hard-first";
  cardsPerSession: number;
  onModeChange: (v: "srs" | "random" | "sequential") => void;
  onOrderChange: (v: "default" | "hard-first") => void;
  onCardsChange: (v: number) => void;
  onStart: () => void;
  pending: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
        Sessão de estudo
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Modo
          </label>
          <select
            value={mode}
            onChange={(e) =>
              onModeChange(e.target.value as "srs" | "random" | "sequential")
            }
            className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="srs">Repetição espaçada</option>
            <option value="random">Aleatório</option>
            <option value="sequential">Sequencial</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Ordem
          </label>
          <select
            value={order}
            onChange={(e) =>
              onOrderChange(e.target.value as "default" | "hard-first")
            }
            className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="default">Padrão</option>
            <option value="hard-first">Difíceis primeiro</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">
            Cards por sessão
          </label>
          <Input
            type="number"
            min={1}
            max={500}
            value={cardsPerSession}
            onChange={(e) =>
              onCardsChange(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
          />
        </div>
      </div>

      <Button
        variant="gradient"
        className="w-full mt-4"
        onClick={onStart}
      >
        <Play className="h-4 w-4" /> Iniciar sessão
      </Button>

      <div className="mt-2 flex flex-col gap-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => toast.info("Repetição espaçada em breve.")}
        >
          Revisar pendentes ({pending})
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => toast.info("Em breve.")}
        >
          <Shuffle className="h-4 w-4" /> Embaralhar deck
        </Button>
      </div>
    </div>
  );
}

// =====================================================================
// Due today card
// =====================================================================
function DueTodayCard({ total }: { total: number }) {
  return (
    <Link
      href="#"
      onClick={(e) => {
        e.preventDefault();
        toast.info("Repetição espaçada em breve.");
      }}
      className="block rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors group"
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
            cards para revisar
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
    </Link>
  );
}

// =====================================================================
// Deck table
// =====================================================================
function DeckTable({
  decks,
  activeDeckId,
  onSelect,
  onOpen,
}: {
  decks: Deck[];
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
  active,
  onSelect,
  onOpen,
}: {
  deck: Deck;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const Icon = getSubjectIcon(deck.subjectName);
  const level = levelOfDeck(deck.cards.length);
  // Domínio: placeholder estável por deck (sem SRS data ainda). Usa hash do id pra ficar consistente.
  const masteryPct = 0;

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
            className="h-full bg-gradient-to-r from-primary to-fuchsia-500"
            style={{ width: `${masteryPct}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0 w-8 text-right">
          {masteryPct}%
        </span>
      </div>

      <div className="hidden md:block text-right text-sm font-mono tabular-nums text-muted-foreground">
        0
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
            <DropdownMenuItem
              onClick={() => toast.info("Em breve.")}
            >
              <Clock className="h-4 w-4" /> Histórico de revisões
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
