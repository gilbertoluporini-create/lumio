"use client";

import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  ArrowUpDown,
  Atom,
  BookOpen,
  Brain,
  Briefcase,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Code,
  Dna,
  Download,
  Dumbbell,
  ExternalLink,
  FileText,
  Folder,
  Filter,
  FlaskConical,
  Gavel,
  Globe,
  HeartPulse,
  Landmark,
  Languages,
  Library,
  Leaf,
  Lightbulb,
  Loader2,
  Microscope,
  MoreVertical,
  Music,
  Palette,
  Pill,
  Plus,
  Scale,
  Search,
  Sigma,
  Sparkles,
  Star,
  Stethoscope,
  Syringe,
  Tag,
  Timer,
  Trash2,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { ContentWizard } from "@/components/ai/content-wizard";
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
import {
  listLecturesAsync,
  listSubjectsAsync,
  updateLectureAsync,
} from "@/lib/db";
import {
  subscribeFavorites,
  toggleFavorite as toggleFavoriteLib,
} from "@/lib/favorites";
import type { Lecture, Subject, User } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Mesma lógica de ícones temáticos do dashboard/gravacoes.
 * Duplicação consciente — quando estabilizar, vira util shared.
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

export default function ResumosPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <ResumosView user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

type SummaryStatus = "completed" | "in_progress" | "not_started";

function getStatus(lecture: Lecture): SummaryStatus {
  if (lecture.summary) return "completed";
  if (lecture.transcript && lecture.transcript.trim().length > 0)
    return "in_progress";
  return "not_started";
}

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDurationMin(seconds: number): string {
  if (seconds <= 0) return "—";
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/**
 * Retorna um snippet limpo do resumo: primeiro tenta `generalSummary`,
 * cai pra concatenar primeiros `highlights`, e por último o início do
 * primeiro `sections[].spokenContent`.
 */
function getSummarySnippet(lecture: Lecture, maxLen = 360): string {
  const s = lecture.summary;
  if (!s) return "";
  if (s.generalSummary && s.generalSummary.trim().length > 0) {
    return s.generalSummary.length > maxLen
      ? `${s.generalSummary.slice(0, maxLen).trim()}…`
      : s.generalSummary;
  }
  if (s.highlights && s.highlights.length > 0) {
    const joined = s.highlights.slice(0, 4).join(" · ");
    return joined.length > maxLen ? `${joined.slice(0, maxLen).trim()}…` : joined;
  }
  if (s.sections && s.sections.length > 0) {
    const first = s.sections[0].spokenContent ?? "";
    return first.length > maxLen ? `${first.slice(0, maxLen).trim()}…` : first;
  }
  return "";
}

/**
 * Tags representativas pro resumo. Usa `highlights` (o que existe no
 * tipo atual). Trunca cada uma pra não estourar a linha.
 */
function getSummaryTags(lecture: Lecture, max = 3): string[] {
  const s = lecture.summary;
  if (!s?.highlights) return [];
  return s.highlights.slice(0, max).map((h) => {
    const trimmed = h.trim();
    return trimmed.length > 28 ? `${trimmed.slice(0, 26)}…` : trimmed;
  });
}

/* -------------------------------------------------------------------------- */
/*  Favorites — delega pra src/lib/favorites.ts (compartilhado com /favoritos) */
/* -------------------------------------------------------------------------- */

type StatusFilter = "all" | SummaryStatus;
type SortOrder = "recent" | "oldest" | "az";

function ResumosView({ user }: { user: User }) {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [newSummaryOpen, setNewSummaryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setNewSummaryOpen(true);
      router.replace("/resumos");
    }
  }, [searchParams, router]);

  useEffect(() => {
    let active = true;
    Promise.all([listSubjectsAsync(user.id), listLecturesAsync(user.id)])
      .then(([s, l]) => {
        if (!active) return;
        setSubjects(s);
        setLectures(l);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id]);

  // Hydrate favorites + assina mudanças (sincroniza com /favoritos e outras abas)
  useEffect(() => {
    return subscribeFavorites(user.id, (entries) => {
      setFavorites(
        entries.filter((f) => f.kind === "summary").map((f) => f.id),
      );
    });
  }, [user.id]);

  const toggleFavorite = useCallback(
    (lectureId: string) => {
      const nowFavorited = toggleFavoriteLib(user.id, "summary", lectureId);
      toast.success(
        nowFavorited
          ? "Adicionado aos favoritos"
          : "Removido dos favoritos",
      );
      // setFavorites é atualizado pelo subscribeFavorites listener
    },
    [user.id],
  );

  const handleDeleteSummary = useCallback(
    async (lecture: Lecture) => {
      if (!lecture.summary) return;
      const confirmed =
        typeof window !== "undefined"
          ? window.confirm(
              `Excluir o resumo de "${lecture.title}"?\n\nA aula e a transcrição serão mantidas; apenas o resumo será removido.`,
            )
          : true;
      if (!confirmed) return;
      setDeletingId(lecture.id);
      try {
        // Passamos `summary: null` cast pra Partial<Lecture> — o backend
        // (Supabase) aceita null e o local storage faz spread normalmente.
        await updateLectureAsync(user.id, lecture.id, {
          summary: null as unknown as Lecture["summary"],
        });
        setLectures((prev) =>
          prev.map((l) =>
            l.id === lecture.id ? { ...l, summary: undefined } : l,
          ),
        );
        toast.success("Resumo excluído.");
      } catch (err) {
        toast.error(`Erro ao excluir: ${(err as Error).message}`);
      } finally {
        setDeletingId(null);
      }
    },
    [user.id],
  );

  const subjectById = useMemo(() => {
    const map: Record<string, Subject> = {};
    for (const s of subjects) map[s.id] = s;
    return map;
  }, [subjects]);

  const firstName = user.name.split(" ")[0];
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  // Ordenação base por mais recente (updatedAt)
  const sortedLectures = useMemo(() => {
    const arr = lectures.slice();
    arr.sort((a, b) => {
      if (sortOrder === "az") return a.title.localeCompare(b.title, "pt-BR");
      const ta = new Date(a.updatedAt).getTime();
      const tb = new Date(b.updatedAt).getTime();
      return sortOrder === "oldest" ? ta - tb : tb - ta;
    });
    return arr;
  }, [lectures, sortOrder]);

  const filteredLectures = useMemo(() => {
    return sortedLectures.filter((l) => {
      if (filterSubject !== "all" && l.subjectId !== filterSubject) return false;
      if (filterStatus !== "all" && getStatus(l) !== filterStatus) return false;
      // filterType: por enquanto só "resumo" — qualquer valor diferente de "all"
      // ainda passa porque todas as aulas são tratadas como tipo resumo.
      if (filterType !== "all" && filterType !== "resumo") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const subjName = subjectById[l.subjectId]?.name.toLowerCase() ?? "";
        const summaryText = l.summary?.generalSummary?.toLowerCase() ?? "";
        const highlights =
          l.summary?.highlights?.join(" ").toLowerCase() ?? "";
        const sectionTitles =
          l.summary?.sections
            ?.map((sec) => sec.slideTitle ?? "")
            .join(" ")
            .toLowerCase() ?? "";
        return (
          l.title.toLowerCase().includes(q) ||
          subjName.includes(q) ||
          summaryText.includes(q) ||
          highlights.includes(q) ||
          sectionTitles.includes(q)
        );
      }
      return true;
    });
  }, [sortedLectures, filterSubject, filterStatus, filterType, search, subjectById]);

  // Resumo em destaque = aula mais recente que JÁ tem summary
  const featuredLecture = useMemo(
    () =>
      lectures
        .slice()
        .filter((l) => !!l.summary)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0],
    [lectures],
  );
  const featuredSubject = featuredLecture
    ? subjectById[featuredLecture.subjectId]
    : undefined;

  // Limita a tabela "Resumos recentes" às 8 mais recentes
  const tableLectures = useMemo(() => filteredLectures.slice(0, 8), [filteredLectures]);

  // Stats sidebar
  const stats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    for (const l of lectures) {
      const st = getStatus(l);
      if (st === "completed") completed++;
      else if (st === "in_progress") inProgress++;
      else notStarted++;
    }
    // Conta apenas favoritos que ainda existem como lectures
    const lectureIds = new Set(lectures.map((l) => l.id));
    const favoritesCount = favorites.filter((id) => lectureIds.has(id)).length;
    return {
      total: completed, // "total de resumos" = aulas com summary
      completed,
      inProgress,
      notStarted,
      favorites: favoritesCount,
    };
  }, [lectures, favorites]);

  // Subjects com counts (só conta lectures com summary)
  const subjectCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of lectures) {
      if (!l.summary) continue;
      map[l.subjectId] = (map[l.subjectId] ?? 0) + 1;
    }
    return map;
  }, [lectures]);

  const statusFilterLabel: Record<StatusFilter, string> = {
    all: "Todos os status",
    completed: "Concluído",
    in_progress: "Em andamento",
    not_started: "Não iniciado",
  };
  const sortLabel: Record<SortOrder, string> = {
    recent: "Mais recentes",
    oldest: "Mais antigos",
    az: "Ordem alfabética",
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground mb-1">
            {greeting}, {firstName}
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Biblioteca de resumos
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Organize, revise e aprofunde seus estudos com resumos inteligentes.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <Plus className="h-4 w-4" /> Nova matéria
            </Link>
          </Button>
          <Button
            variant="gradient"
            onClick={() => setNewSummaryOpen(true)}
            title="Gerar resumo a partir de uma aula"
          >
            <Sparkles className="h-4 w-4" /> Novo resumo
          </Button>
        </div>
      </div>

      {/* Filter row */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {/* Matérias */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {filterSubject === "all"
                ? "Todas as matérias"
                : subjectById[filterSubject]?.name ?? "Matéria"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[300px] overflow-auto">
            <DropdownMenuItem onClick={() => setFilterSubject("all")}>
              Todas as matérias
            </DropdownMenuItem>
            {subjects.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => setFilterSubject(s.id)}>
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {statusFilterLabel[filterStatus]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setFilterStatus("all")}>
              Todos os status
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus("completed")}>
              Concluído
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus("in_progress")}>
              Em andamento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus("not_started")}>
              Não iniciado
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tipos — placeholder, só "Resumo" disponível */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              {filterType === "all" ? "Todos os tipos" : "Resumo"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setFilterType("all")}>
              Todos os tipos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterType("resumo")}>
              Resumo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Spacer empurra busca + ordenação pra direita em telas largas */}
        <div className="flex-1 hidden sm:block" />

        {/* Search */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar resumos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Ordenar por:</span>{" "}
              {sortLabel[sortOrder]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortOrder("recent")}>
              Mais recentes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOrder("oldest")}>
              Mais antigos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortOrder("az")}>
              Ordem alfabética
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active filter chip — quando filtrando por matéria via sidebar */}
      {filterSubject !== "all" && subjectById[filterSubject] && (
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Filtrando por:</span>
          <Badge
            variant="secondary"
            className="gap-1 bg-primary/10 text-primary border-primary/20"
          >
            <Folder className="h-3 w-3" />
            {subjectById[filterSubject].name}
            <button
              type="button"
              onClick={() => setFilterSubject("all")}
              className="ml-1 -mr-0.5 hover:text-primary/70"
              aria-label="Limpar filtro de matéria"
            >
              ×
            </button>
          </Badge>
        </div>
      )}

      {/* Grid: conteúdo (9) + sidebar (3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-9 space-y-6">
          {/* Featured */}
          {featuredLecture ? (
            <FeaturedSummaryCard
              lecture={featuredLecture}
              subject={featuredSubject}
            />
          ) : (
            <FeaturedEmptyState onCreate={() => setNewSummaryOpen(true)} />
          )}

          {/* Recent table */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Resumos recentes</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Suas aulas com transcrição e resumo, organizadas por data.
                </p>
              </div>
            </div>

            {/* Headers — desktop only */}
            <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_110px_90px_minmax(0,1.4fr)_120px_44px] gap-3 px-5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50 bg-secondary/20">
              <div>Resumo</div>
              <div>Matéria</div>
              <div>Data</div>
              <div>Tempo</div>
              <div>Tags</div>
              <div>Status</div>
              <div className="text-right">Ações</div>
            </div>

            {tableLectures.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                {lectures.length === 0
                  ? "Você ainda não tem resumos. Comece criando uma aula no dashboard."
                  : "Nenhum resumo encontrado com esses filtros."}
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {tableLectures.map((l) => (
                  <SummaryTableRow
                    key={l.id}
                    lecture={l}
                    subject={subjectById[l.subjectId]}
                    isFavorite={favorites.includes(l.id)}
                    isDeleting={deletingId === l.id}
                    onToggleFavorite={toggleFavorite}
                    onDeleteSummary={handleDeleteSummary}
                  />
                ))}
              </div>
            )}

            {filteredLectures.length > tableLectures.length && (
              <div className="px-5 py-3 border-t border-border/50 bg-secondary/10 flex items-center justify-end">
                <Link
                  href="/gravacoes"
                  className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
                >
                  Ver todos os resumos <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-5">
          <FoldersCard
            subjects={subjects}
            subjectCounts={subjectCounts}
            activeSubjectId={filterSubject}
            onSelectSubject={(id) => setFilterSubject(id)}
          />
          <StatsCard stats={stats} />
        </div>
      </div>

      {/* Wizard: gera novo resumo end-to-end */}
      <ContentWizard
        open={newSummaryOpen}
        onOpenChange={setNewSummaryOpen}
        mode="summary"
        userId={user.id}
        onCreated={({ lectureId }) => {
          // Wizard mode="summary" cria o resumo — leva direto pra tela rica.
          router.push(`/resumo/${lectureId}`);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Featured summary                                                          */
/* -------------------------------------------------------------------------- */

function FeaturedSummaryCard({
  lecture,
  subject,
}: {
  lecture: Lecture;
  subject: Subject | undefined;
}) {
  const iconComp = subject ? getSubjectIcon(subject.name) : FileText;
  const date = new Date(lecture.updatedAt);
  const dateLabel = formatDateBR(date);
  const tags = getSummaryTags(lecture, 3);
  const snippet = getSummarySnippet(lecture, 360);
  // Featured card aponta pra tela rica de visualização do resumo.
  const href = `/resumo/${lecture.id}`;

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* Esquerda: detalhes */}
        <div className="p-6 md:border-r border-border/50">
          <Badge
            variant="secondary"
            className="gap-1 bg-primary/15 text-primary border-primary/20"
          >
            <Star className="h-3 w-3 fill-primary" />
            Resumo em destaque
          </Badge>

          <Link href={href} className="block group mt-3">
            <h2 className="text-2xl font-semibold tracking-tight leading-tight group-hover:text-primary transition-colors line-clamp-2">
              {lecture.title}
            </h2>
          </Link>

          <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {subject && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-6 w-6 rounded-md bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                  {createElement(iconComp, {
                    className: "h-3.5 w-3.5 text-primary",
                    strokeWidth: 2.2,
                  })}
                </span>
                <span className="font-medium text-foreground/80">
                  {subject.name}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock className="h-3 w-3" />
              {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Timer className="h-3 w-3" />
              {formatDurationMin(lecture.durationSec)}
            </span>
          </div>

          {tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {tags.map((t, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[11px] border-border/60 bg-background/60"
                >
                  {t}
                </Badge>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button asChild variant="gradient" size="sm">
              <Link href={href}>
                Continuar leitura <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={href}>Ver resumo completo</Link>
            </Button>
          </div>
        </div>

        {/* Direita: snippet */}
        <div className="p-6 bg-background/40">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3 inline-flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-primary" />
            Trecho do resumo
          </div>

          <div className="relative">
            <p className="text-sm text-foreground/85 leading-relaxed line-clamp-6 whitespace-pre-line">
              {snippet || "Resumo gerado, mas sem prévia textual disponível."}
            </p>
            {/* fade-out */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
          </div>

          <Link
            href={href}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:gap-1.5 transition-all"
          >
            Ver resumo completo <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeaturedEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
      <div className="flex justify-center mb-3">
        <LumiCharacter mood="sleeping" size="lg" float />
      </div>
      <h3 className="text-lg font-semibold">Sem resumos por enquanto</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Os resumos são gerados a partir das aulas que você grava. Comece criando
        sua primeira aula — o Lumio cuida do resto.
      </p>
      <Button variant="gradient" size="lg" className="mt-6" onClick={onCreate}>
        <Sparkles className="h-4 w-4" /> Criar primeiro resumo
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Summary table row                                                         */
/* -------------------------------------------------------------------------- */

function StatusPill({ status }: { status: SummaryStatus }) {
  if (status === "completed") {
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/15"
      >
        <CheckCircle2 className="h-2.5 w-2.5" />
        Concluído
      </Badge>
    );
  }
  if (status === "in_progress") {
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/15"
      >
        <Timer className="h-2.5 w-2.5" />
        Em andamento
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
      <Circle className="h-2.5 w-2.5" />
      Não iniciado
    </Badge>
  );
}

function SummaryTableRow({
  lecture,
  subject,
  isFavorite,
  isDeleting,
  onToggleFavorite,
  onDeleteSummary,
}: {
  lecture: Lecture;
  subject: Subject | undefined;
  isFavorite: boolean;
  isDeleting: boolean;
  onToggleFavorite: (id: string) => void;
  onDeleteSummary: (lecture: Lecture) => void;
}) {
  const status = getStatus(lecture);
  const date = new Date(lecture.updatedAt);
  const dateLabel = formatDateBR(date);
  const tags = getSummaryTags(lecture, 2);
  // Row da tabela leva pra tela rica do resumo (mantém /lecture só pra "Abrir aula original").
  const href = `/resumo/${lecture.id}`;
  const subjectIconComp = subject ? getSubjectIcon(subject.name) : FileText;
  const hasSummary = !!lecture.summary;

  return (
    <Link
      href={href}
      className={cn(
        "group grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_110px_90px_minmax(0,1.4fr)_120px_44px] grid-cols-[1fr_auto] gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors items-center",
        isDeleting && "opacity-50 pointer-events-none",
      )}
    >
      {/* Resumo (título + ícone + estrela) */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
          {createElement(subjectIconComp, {
            className: "h-4 w-4 text-primary",
            strokeWidth: 2.2,
          })}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
            {lecture.title}
          </div>
          {/* Em mobile mostra matéria abaixo do título */}
          <div className="md:hidden text-xs text-muted-foreground truncate">
            {subject?.name ?? "—"} · {dateLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(lecture.id);
          }}
          className={cn(
            "shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors",
            isFavorite
              ? "text-amber-500 hover:bg-amber-500/10"
              : "text-muted-foreground/60 hover:text-amber-500 hover:bg-amber-500/10",
          )}
          title={isFavorite ? "Remover dos favoritos" : "Favoritar resumo"}
          aria-label={isFavorite ? "Remover dos favoritos" : "Favoritar resumo"}
          aria-pressed={isFavorite}
        >
          <Star
            className={cn("h-3.5 w-3.5", isFavorite && "fill-amber-500")}
          />
        </button>
      </div>

      {/* Matéria */}
      <div className="hidden md:block min-w-0">
        <div className="text-xs text-foreground/80 truncate">
          {subject?.name ?? "—"}
        </div>
      </div>

      {/* Data */}
      <div className="hidden md:block text-xs font-mono tabular-nums text-muted-foreground">
        {dateLabel}
      </div>

      {/* Tempo */}
      <div className="hidden md:block text-xs font-mono tabular-nums text-muted-foreground">
        {formatDurationMin(lecture.durationSec)}
      </div>

      {/* Tags */}
      <div className="hidden md:flex flex-wrap gap-1 min-w-0">
        {tags.length === 0 ? (
          <span className="text-xs text-muted-foreground/60">—</span>
        ) : (
          tags.map((t, i) => (
            <Badge
              key={i}
              variant="outline"
              className="text-[10px] border-border/60 bg-background/60 max-w-full truncate"
            >
              <span className="truncate">{t}</span>
            </Badge>
          ))
        )}
      </div>

      {/* Status */}
      <div className="hidden md:block">
        <StatusPill status={status} />
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1 justify-end shrink-0">
        <span className="md:hidden">
          <StatusPill status={status} />
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-secondary/60"
              aria-label="Mais ações"
            >
              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={href} className="gap-2 cursor-pointer">
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir resumo
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onToggleFavorite(lecture.id);
              }}
              className="gap-2"
            >
              <Star
                className={cn(
                  "h-3.5 w-3.5",
                  isFavorite && "fill-amber-500 text-amber-500",
                )}
              />
              {isFavorite ? "Remover favorito" : "Marcar como favorito"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toast("Exportar PDF — em breve", {
                  description: "Estamos finalizando o gerador de PDF.",
                });
              }}
              className="gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                if (!hasSummary) {
                  toast.error("Esta aula ainda não tem resumo.");
                  return;
                }
                onDeleteSummary(lecture);
              }}
              className="gap-2 text-red-600 focus:text-red-700"
              disabled={!hasSummary || isDeleting}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir resumo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sidebar cards                                                             */
/* -------------------------------------------------------------------------- */

function FoldersCard({
  subjects,
  subjectCounts,
  activeSubjectId,
  onSelectSubject,
}: {
  subjects: Subject[];
  subjectCounts: Record<string, number>;
  activeSubjectId: string;
  onSelectSubject: (id: string) => void;
}) {
  const visible = subjects.slice(0, 6);
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold">Minhas pastas</div>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link href="/dashboard">
            <Plus className="h-3.5 w-3.5" /> Nova
          </Link>
        </Button>
      </div>

      {subjects.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Crie sua primeira matéria no dashboard pra começar.
        </p>
      ) : (
        <ul className="space-y-1">
          {visible.map((s) => {
            const Icon = getSubjectIcon(s.name);
            const count = subjectCounts[s.id] ?? 0;
            const isActive = activeSubjectId === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectSubject(isActive ? "all" : s.id)}
                  className={cn(
                    "group w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left",
                    isActive
                      ? "bg-primary/10 hover:bg-primary/15"
                      : "hover:bg-secondary/40",
                  )}
                  aria-pressed={isActive}
                >
                  <div
                    className={cn(
                      "h-8 w-8 shrink-0 rounded-md flex items-center justify-center",
                      isActive
                        ? "bg-primary/20"
                        : "bg-primary/10 dark:bg-primary/15",
                    )}
                  >
                    <Folder className="h-3.5 w-3.5 text-primary" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "text-sm font-medium truncate transition-colors flex items-center gap-1.5",
                        isActive
                          ? "text-primary"
                          : "group-hover:text-primary",
                      )}
                    >
                      <Icon
                        className="h-3 w-3 text-muted-foreground shrink-0"
                        strokeWidth={2.2}
                      />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {count} {count === 1 ? "resumo" : "resumos"}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {subjects.length > visible.length && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <Link
            href="/dashboard"
            className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:gap-1.5 transition-all"
          >
            Ver todas as pastas <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

function StatsCard({
  stats,
}: {
  stats: {
    total: number;
    completed: number;
    inProgress: number;
    favorites: number;
  };
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="text-sm font-semibold mb-4">Estatísticas</div>
      <dl className="space-y-3">
        <StatLine
          label="Total de resumos"
          value={stats.total}
          icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
        />
        <StatLine
          label="Resumos concluídos"
          value={stats.completed}
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
        />
        <StatLine
          label="Em andamento"
          value={stats.inProgress}
          icon={<Timer className="h-3.5 w-3.5 text-amber-500" />}
        />
        <StatLine
          label="Favoritos"
          value={stats.favorites}
          icon={
            <Star
              className={cn(
                "h-3.5 w-3.5",
                stats.favorites > 0
                  ? "fill-amber-500 text-amber-500"
                  : "text-muted-foreground",
              )}
            />
          }
          muted={stats.favorites === 0}
        />
      </dl>

      <div className="mt-4 pt-3 border-t border-border/40">
        <button
          type="button"
          onClick={() =>
            toast("Relatório completo — em breve", {
              description:
                "Estamos preparando uma visão consolidada do seu estudo.",
            })
          }
          className="text-xs font-medium inline-flex items-center gap-1 text-primary hover:gap-1.5 transition-all"
        >
          Ver relatório completo <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function StatLine({
  label,
  value,
  icon,
  muted = false,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-6 w-6 shrink-0 rounded-md bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
          {icon}
        </span>
        <dt
          className={cn(
            "text-xs truncate",
            muted ? "text-muted-foreground/70" : "text-foreground/80",
          )}
        >
          {label}
        </dt>
      </div>
      <dd
        className={cn(
          "text-sm font-semibold tabular-nums shrink-0",
          muted ? "text-muted-foreground" : "",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

