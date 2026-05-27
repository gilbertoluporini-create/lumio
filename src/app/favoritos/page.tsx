"use client";

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  Clock,
  FileText,
  Folder,
  GitBranch,
  HelpCircle,
  Layers,
  Mic,
  MoreHorizontal,
  Play,
  Plus,
  Share2,
  Sparkles,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { ContentWizard } from "@/components/ai/content-wizard";
import { NewLectureDialog } from "@/components/documents/new-lecture-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LumiCharacter } from "@/components/brand/lumi";
import {
  useAllDocuments,
  type DocumentItem,
} from "@/hooks/use-all-documents";
import {
  removeFavorite,
  subscribeFavorites,
  type FavoriteEntry,
} from "@/lib/favorites";
import { listSummariesAsync } from "@/lib/summaries";
import { cn, stripMarkdownToPlainText } from "@/lib/utils";
import type { Summary, User } from "@/lib/types";

export default function FavoritosPage() {
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <Favoritos user={user} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

type FavKind = "lecture" | "summary" | "flashcards" | "quiz" | "mindmap" | "subject";

type FavoriteItem = {
  key: string;
  kind: FavKind;
  storeKind: FavoriteEntry["kind"];
  storeId: string;
  title: string;
  subjectName: string | null;
  subjectColor: string | null;
  addedAt: string;
  href: string;
  description: string | null;
  tags: string[];
};

type SortMode = "recent" | "oldest" | "az" | "za";
type TabId = "all" | "lecture" | "summary" | "flashcards" | "quiz";

const KIND_META: Record<FavKind, {
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  cta: string;
  estimateMin: number;
}> = {
  lecture: {
    label: "Aula",
    icon: Play,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-600 dark:text-violet-400",
    cta: "Assistir aula",
    estimateMin: 10,
  },
  summary: {
    label: "Resumo",
    icon: FileText,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    cta: "Abrir resumo",
    estimateMin: 5,
  },
  flashcards: {
    label: "Flashcards",
    icon: Layers,
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-600 dark:text-sky-400",
    cta: "Estudar deck",
    estimateMin: 15,
  },
  quiz: {
    label: "Questões",
    icon: HelpCircle,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
    cta: "Responder quiz",
    estimateMin: 10,
  },
  mindmap: {
    label: "Mapa mental",
    icon: GitBranch,
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-600 dark:text-rose-400",
    cta: "Abrir mapa",
    estimateMin: 5,
  },
  subject: {
    label: "Matéria",
    icon: Folder,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    cta: "Abrir matéria",
    estimateMin: 0,
  },
};

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "recent", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigos" },
  { value: "az", label: "A → Z" },
  { value: "za", label: "Z → A" },
];

const TABS: Array<{ id: TabId; label: string; match: FavKind[] }> = [
  { id: "all", label: "Todos", match: [] },
  { id: "lecture", label: "Aulas", match: ["lecture"] },
  { id: "summary", label: "Resumos", match: ["summary"] },
  { id: "flashcards", label: "Flashcards", match: ["flashcards"] },
  { id: "quiz", label: "Questões", match: ["quiz"] },
];

const PAGE_SIZE = 8;

function Favoritos({ user }: { user: User }) {
  const router = useRouter();
  const { documents, subjects, lectures, loading } = useAllDocuments(user.id);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);

  useEffect(() => {
    let active = true;
    listSummariesAsync(user.id).then((sm) => {
      if (active) setSummaries(sm);
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  const summaryByLectureId = useMemo(() => {
    const map: Record<string, Summary> = {};
    for (const sm of summaries) {
      if (sm.source.kind === "lecture") map[sm.source.lectureId] = sm;
    }
    return map;
  }, [summaries]);
  const [tab, setTab] = useState<TabId>("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newLectureOpen, setNewLectureOpen] = useState(false);

  useEffect(() => {
    return subscribeFavorites(user.id, setFavorites);
  }, [user.id]);

  const firstName = user.name.split(" ")[0];
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return "Boa madrugada";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  const items: FavoriteItem[] = useMemo(() => {
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const lectureById = new Map(lectures.map((l) => [l.id, l]));
    const docByLectureKind = new Map<string, DocumentItem>();
    for (const d of documents) {
      docByLectureKind.set(`${d.kind}:${d.lectureId}`, d);
    }

    const out: FavoriteItem[] = [];
    for (const entry of favorites) {
      if (entry.kind === "subject") {
        const subject = subjectById.get(entry.id);
        if (!subject) continue;
        const lectureCount = lectures.filter(
          (l) => l.subjectId === subject.id,
        ).length;
        out.push({
          key: `subject:${entry.id}`,
          kind: "subject",
          storeKind: "subject",
          storeId: entry.id,
          title: subject.name,
          subjectName: subject.name,
          subjectColor: subject.color,
          addedAt: entry.addedAt,
          href: `/subject/${subject.id}`,
          description: `${lectureCount} ${lectureCount === 1 ? "aula" : "aulas"} dentro dessa matéria.`,
          tags: [],
        });
      } else if (entry.kind === "lecture") {
        const lecture = lectureById.get(entry.id);
        if (!lecture) continue;
        const subject = lecture.subjectId
          ? subjectById.get(lecture.subjectId)
          : null;
        const lectureSummary = summaryByLectureId[lecture.id];
        const rawSnippet = lectureSummary?.content.generalSummary;
        const summarySnippet = rawSnippet
          ? stripMarkdownToPlainText(rawSnippet)
          : null;
        out.push({
          key: `lecture:${entry.id}`,
          kind: "lecture",
          storeKind: "lecture",
          storeId: entry.id,
          title: lecture.title || "Aula sem título",
          subjectName: subject?.name ?? null,
          subjectColor: subject?.color ?? null,
          addedAt: entry.addedAt,
          href: `/lecture/${lecture.id}`,
          description: summarySnippet
            ? summarySnippet.slice(0, 140)
            : "Transcrição e materiais gerados a partir dessa aula.",
          tags: lectureSummary ? ["Com resumo"] : ["Aula gravada"],
        });
      } else if (entry.kind === "summary") {
        const doc = docByLectureKind.get(`summary:${entry.id}`);
        const lecture = lectureById.get(entry.id);
        const subject = lecture?.subjectId
          ? subjectById.get(lecture.subjectId)
          : null;
        const title =
          doc?.title ??
          (lecture ? `Resumo — ${lecture.title}` : "Resumo favoritado");
        const rawDesc =
          lecture && summaryByLectureId[lecture.id]?.content.generalSummary;
        const desc = rawDesc ? stripMarkdownToPlainText(rawDesc) : null;
        out.push({
          key: `summary:${entry.id}`,
          kind: "summary",
          storeKind: "summary",
          storeId: entry.id,
          title,
          subjectName: subject?.name ?? null,
          subjectColor: subject?.color ?? null,
          addedAt: entry.addedAt,
          href: `/resumo/${entry.id}`,
          description: desc ? desc.slice(0, 140) : "Resumo gerado pelo Lumio.",
          tags: ["Gerado pelo Lumio"],
        });
      }
    }

    return out;
  }, [favorites, subjects, lectures, documents, summaryByLectureId]);

  const counts = useMemo(() => {
    const c = {
      all: items.length,
      lecture: 0,
      summary: 0,
      flashcards: 0,
      quiz: 0,
    } as Record<TabId, number>;
    for (const it of items) {
      if (it.kind === "lecture") c.lecture++;
      else if (it.kind === "summary") c.summary++;
      else if (it.kind === "flashcards") c.flashcards++;
      else if (it.kind === "quiz") c.quiz++;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const tabDef = TABS.find((t) => t.id === tab);
    const base =
      tabDef && tabDef.match.length > 0
        ? items.filter((it) => tabDef.match.includes(it.kind))
        : items;
    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sort === "recent") {
        return (
          new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
        );
      }
      if (sort === "oldest") {
        return (
          new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
        );
      }
      if (sort === "az") return a.title.localeCompare(b.title, "pt-BR");
      return b.title.localeCompare(a.title, "pt-BR");
    });
    return sorted;
  }, [items, tab, sort]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [tab, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const featured = filtered[0] ?? null;

  const stats = useMemo(() => {
    let totalMin = 0;
    let oldest: number | null = null;
    for (const it of items) {
      totalMin += KIND_META[it.kind].estimateMin;
      const t = new Date(it.addedAt).getTime();
      if (!Number.isNaN(t)) {
        if (oldest === null || t < oldest) oldest = t;
      }
    }
    const daysSince =
      oldest !== null
        ? Math.max(
            0,
            Math.floor((Date.now() - oldest) / (1000 * 60 * 60 * 24)),
          )
        : 0;
    return {
      total: items.length,
      reviewTimeLabel: formatMinutes(totalMin),
      daysSince,
    };
  }, [items]);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === pageItems.length && pageItems.length > 0) {
        return new Set();
      }
      return new Set(pageItems.map((it) => it.key));
    });
  }, [pageItems]);

  const toggleSelectOne = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleRemove = useCallback(
    (item: FavoriteItem) => {
      removeFavorite(user.id, item.storeKind, item.storeId);
      toast.success("Removido dos favoritos.");
    },
    [user.id],
  );

  const handleShare = useCallback((item: FavoriteItem) => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${item.href}`
        : item.href;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => toast.success("Link copiado pra área de transferência."))
        .catch(() => toast.error("Não consegui copiar o link."));
    } else {
      toast(url);
    }
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="h-4 w-32 rounded-md bg-secondary/40 animate-pulse mb-3" />
        <div className="h-8 w-48 rounded-md bg-secondary/50 animate-pulse mb-2" />
        <div className="h-4 w-72 rounded-md bg-secondary/40 animate-pulse mb-8" />
        <div className="h-10 w-full max-w-md rounded-full bg-secondary/30 animate-pulse mb-6" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="h-48 rounded-2xl bg-secondary/25 animate-pulse" />
            <div className="h-80 rounded-2xl bg-secondary/25 animate-pulse" />
          </div>
          <div className="h-80 rounded-2xl bg-secondary/25 animate-pulse" />
        </div>
      </div>
    );
  }

  const isEmpty = items.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground mb-2">
            {greeting}, {firstName}
          </div>
          <h1 className="text-3xl heading-display">Favoritos</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl">
            Seus conteúdos salvos para revisar quando quiser.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4" /> Nova matéria
          </Button>
          <Button onClick={() => setNewLectureOpen(true)}>
            <Mic className="h-4 w-4" /> Nova aula
          </Button>
        </div>
      </header>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Filtros de favoritos"
          className="inline-flex flex-wrap items-center gap-1.5"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            const count = counts[t.id];
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-mono tabular-nums",
                    active
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary/60 text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              {SORT_OPTIONS.find((o) => o.value === sort)?.label}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORT_OPTIONS.map((o) => (
              <DropdownMenuItem
                key={o.value}
                onClick={() => setSort(o.value)}
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {isEmpty ? (
            <EmptyFavorites
              onDashboard={() => router.push("/dashboard")}
              onExplore={() => router.push("/documentos")}
            />
          ) : (
            <>
              {featured && (
                <FeaturedCard
                  item={featured}
                  onOpen={() => router.push(featured.href)}
                />
              )}

              <FavoritesTable
                items={pageItems}
                selected={selected}
                onToggleAll={toggleSelectAll}
                onToggleOne={toggleSelectOne}
                onRemove={handleRemove}
                onShare={handleShare}
              />

              <TableFooter
                page={safePage}
                totalPages={totalPages}
                pageStart={pageStart + 1}
                pageEnd={Math.min(filtered.length, pageStart + PAGE_SIZE)}
                total={filtered.length}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 self-start">
          <SummarySidebar stats={stats} />
        </aside>
      </div>

      <ContentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        mode="summary"
        userId={user.id}
        onCreated={({ lectureId, summaryId }) => {
          if (lectureId) router.push(`/resumo/${lectureId}`);
          else if (summaryId) router.push(`/resumo/doc/${summaryId}`);
        }}
      />

      <NewLectureDialog
        open={newLectureOpen}
        onOpenChange={setNewLectureOpen}
        userId={user.id}
        subjects={subjects}
      />
    </div>
  );
}

function FeaturedCard({
  item,
  onOpen,
}: {
  item: FavoriteItem;
  onOpen: () => void;
}) {
  const meta = KIND_META[item.kind];
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6">
      <div className="grid gap-6 md:grid-cols-[1fr_180px] md:items-center">
        <div className="min-w-0">
          <Badge className="bg-primary/10 text-primary border-transparent uppercase tracking-wider text-[10px]">
            Em destaque
          </Badge>
          <h3 className="mt-3 text-xl font-semibold leading-tight line-clamp-2">
            {item.title}
          </h3>
          {item.subjectName && (
            <div className="mt-1 text-xs text-muted-foreground">
              {item.subjectName}
            </div>
          )}
          {item.description && (
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-2">
              {item.description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">
              {meta.label}
            </Badge>
            {item.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px]"
              >
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-5">
            <Button onClick={onOpen} className="gap-1.5">
              {createElement(meta.icon, { className: "h-4 w-4" })}
              {meta.cta}
            </Button>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative hidden md:flex items-center justify-center h-40 rounded-xl bg-primary/5 border border-primary/15 overflow-hidden"
        >
          <div className="absolute inset-0 opacity-40">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(99,102,241,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.08) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
            />
          </div>
          <div
            className={cn(
              "relative h-20 w-20 rounded-2xl flex items-center justify-center",
              meta.iconBg,
            )}
          >
            {createElement(meta.icon, {
              className: cn("h-10 w-10", meta.iconColor),
              strokeWidth: 1.8,
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function FavoritesTable({
  items,
  selected,
  onToggleAll,
  onToggleOne,
  onRemove,
  onShare,
}: {
  items: FavoriteItem[];
  selected: Set<string>;
  onToggleAll: () => void;
  onToggleOne: (key: string) => void;
  onRemove: (item: FavoriteItem) => void;
  onShare: (item: FavoriteItem) => void;
}) {
  const allChecked = items.length > 0 && selected.size === items.length;
  const someChecked = selected.size > 0 && selected.size < items.length;

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">
        Nenhum favorito nesta categoria ainda.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="hidden md:grid grid-cols-[32px_minmax(0,3fr)_minmax(0,1.4fr)_140px_minmax(0,1.4fr)_88px] gap-3 px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-secondary/30">
        <div className="flex items-center">
          <CheckboxInput
            checked={allChecked}
            indeterminate={someChecked}
            onChange={onToggleAll}
            ariaLabel="Selecionar todos"
          />
        </div>
        <div>Item</div>
        <div>Matéria</div>
        <div>Salvo em</div>
        <div>Tags</div>
        <div className="text-right">Ações</div>
      </div>

      <ul className="divide-y divide-border/50">
        {items.map((it) => (
          <FavoriteRow
            key={it.key}
            item={it}
            checked={selected.has(it.key)}
            onToggle={() => onToggleOne(it.key)}
            onRemove={() => onRemove(it)}
            onShare={() => onShare(it)}
          />
        ))}
      </ul>
    </div>
  );
}

function FavoriteRow({
  item,
  checked,
  onToggle,
  onRemove,
  onShare,
}: {
  item: FavoriteItem;
  checked: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onShare: () => void;
}) {
  const meta = KIND_META[item.kind];
  const visibleTags = item.tags.slice(0, 2);
  const overflowTags = Math.max(0, item.tags.length - visibleTags.length);

  return (
    <li className="group relative">
      <div className="grid grid-cols-1 md:grid-cols-[32px_minmax(0,3fr)_minmax(0,1.4fr)_140px_minmax(0,1.4fr)_88px] gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors">
        <div className="flex items-center order-1">
          <CheckboxInput
            checked={checked}
            onChange={onToggle}
            ariaLabel={`Selecionar ${item.title}`}
          />
        </div>

        <Link
          href={item.href}
          className="flex items-center gap-3 min-w-0 order-2 md:order-2"
        >
          <span
            className={cn(
              "h-9 w-9 rounded-md flex items-center justify-center shrink-0",
              meta.iconBg,
            )}
          >
            {createElement(meta.icon, {
              className: cn("h-4 w-4", meta.iconColor),
              strokeWidth: 2.2,
            })}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium truncate group-hover:text-primary transition-colors">
              {item.title}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {meta.label}
            </span>
          </span>
        </Link>

        <div className="min-w-0 flex items-center text-sm text-muted-foreground order-3 truncate">
          {item.subjectName ?? "—"}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground order-4">
          <Calendar className="h-3 w-3" />
          <span className="tabular-nums">{formatDate(item.addedAt)}</span>
        </div>

        <div className="flex items-center flex-wrap gap-1 order-5">
          {visibleTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[10px]"
            >
              {tag}
            </Badge>
          ))}
          {overflowTags > 0 && (
            <Badge variant="outline" className="text-[10px]">
              +{overflowTags}
            </Badge>
          )}
          {visibleTags.length === 0 && overflowTags === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        <div className="flex items-center justify-end gap-1 order-6">
          <Link
            href={item.href}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md",
              meta.iconColor,
              "hover:bg-secondary/60 transition-colors",
            )}
            aria-label={meta.cta}
            title={meta.cta}
          >
            {createElement(meta.icon, {
              className: "h-4 w-4",
              strokeWidth: 2.2,
            })}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 transition-colors"
                aria-label="Mais ações"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onShare}>
                <Share2 className="h-3.5 w-3.5" /> Compartilhar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onRemove}
                className="text-red-600 dark:text-red-400 focus:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

function TableFooter({
  page,
  totalPages,
  pageStart,
  pageEnd,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-muted-foreground">
      <span>
        Mostrando {pageStart}-{pageEnd} de {total}{" "}
        {total === 1 ? "item" : "itens"}
      </span>
      <div className="flex items-center gap-2">
        {totalPages > 1 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onPrev}
              disabled={page <= 1}
              className="h-8"
            >
              Anterior
            </Button>
            <span className="text-[11px] tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={page >= totalPages}
              className="h-8"
            >
              Próxima
            </Button>
          </>
        )}
        <Link
          href="/documentos"
          className="inline-flex items-center gap-1 text-primary font-medium hover:gap-1.5 transition-all"
        >
          Ver todos os favoritos <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function SummarySidebar({
  stats,
}: {
  stats: { total: number; reviewTimeLabel: string; daysSince: number };
}) {
  const rows = [
    {
      icon: Star,
      iconClass: "text-amber-500 bg-amber-500/10",
      value: stats.total.toString(),
      label: stats.total === 1 ? "item salvo" : "itens salvos",
    },
    {
      icon: Clock,
      iconClass: "text-primary bg-primary/10",
      value: stats.reviewTimeLabel,
      label: "tempo estimado de revisão",
    },
    {
      icon: Calendar,
      iconClass: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
      value:
        stats.total === 0
          ? "—"
          : `${stats.daysSince} ${stats.daysSince === 1 ? "dia" : "dias"}`,
      label: "desde o primeiro favorito",
    },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <header className="mb-4">
        <h3 className="text-sm font-semibold">Seu resumo de favoritos</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Uma visão rápida do que você guardou.
        </p>
      </header>
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3">
            <span
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                row.iconClass,
              )}
            >
              {createElement(row.icon, { className: "h-4 w-4" })}
            </span>
            <div className="min-w-0">
              <div className="text-xl font-semibold leading-none tabular-nums">
                {row.value}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {row.label}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 pt-4 border-t border-border/60">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 text-xs text-primary font-medium opacity-60 cursor-not-allowed"
          title="Em breve"
        >
          Ver estatísticas completas <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}

function EmptyFavorites({
  onDashboard,
  onExplore,
}: {
  onDashboard: () => void;
  onExplore: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 px-8 py-14 text-center">
      <div className="flex justify-center mb-4">
        <LumiCharacter mood="default" size="lg" float />
      </div>
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
        <Star className="h-6 w-6 fill-current" />
      </div>
      <h2 className="text-lg font-semibold">Nada favoritado ainda</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Clique na estrelinha em qualquer matéria, aula ou resumo pra encontrar
        tudo aqui depois.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onDashboard}>
          Ir pro dashboard <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={onExplore}>
          <Sparkles className="h-4 w-4" /> Explorar matérias
        </Button>
      </div>
    </div>
  );
}

function CheckboxInput({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate;
      }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-border text-primary focus:ring-1 focus:ring-primary/40 cursor-pointer"
    />
  );
}

function formatMinutes(totalMin: number): string {
  if (totalMin <= 0) return "0min";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

