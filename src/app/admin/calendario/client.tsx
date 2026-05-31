"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Archive,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// TYPES
// ============================================================================

type CalDraft = {
  id: string;
  slug: string;
  idea_title: string | null;
  category: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  content_per_network: Record<string, Record<string, unknown>>;
  images: Record<string, { url: string } | undefined>;
  publish_results: Record<string, unknown> | null;
  sync_error: string | null;
  updated_at: string;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const NETWORK_META: Record<
  string,
  { label: string; cls: string; chipCls: string; dot: string }
> = {
  instagram: {
    label: "IG",
    cls: "bg-pink-500/20 text-pink-200",
    chipCls: "bg-pink-500/25 text-pink-100 border-pink-500/40",
    dot: "bg-pink-400",
  },
  facebook: {
    label: "FB",
    cls: "bg-blue-500/20 text-blue-200",
    chipCls: "bg-blue-600/30 text-blue-100 border-blue-500/40",
    dot: "bg-blue-400",
  },
  tiktok: {
    label: "TT",
    cls: "bg-neutral-100/15 text-neutral-100",
    chipCls: "bg-neutral-100/15 text-neutral-100 border-neutral-300/40",
    dot: "bg-neutral-200",
  },
  x: {
    label: "X",
    cls: "bg-neutral-500/25 text-neutral-200",
    chipCls: "bg-neutral-700/60 text-neutral-100 border-neutral-500/50",
    dot: "bg-neutral-400",
  },
  linkedin: {
    label: "in",
    cls: "bg-sky-600/25 text-sky-200",
    chipCls: "bg-sky-700/40 text-sky-100 border-sky-500/40",
    dot: "bg-sky-400",
  },
};

const CATEGORY_META: Record<
  string,
  { label: string; dot: string; chip: string }
> = {
  curiosidade: {
    label: "Curiosidade",
    dot: "bg-sky-400",
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  },
  pesquisa: {
    label: "Pesquisa",
    dot: "bg-violet-400",
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  },
  opiniao: {
    label: "Opinião",
    dot: "bg-amber-400",
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  },
  educacional: {
    label: "Educacional",
    dot: "bg-emerald-400",
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  dados: {
    label: "Dados",
    dot: "bg-cyan-400",
    chip: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
  },
  bts: {
    label: "Produto/BTS",
    dot: "bg-fuchsia-400",
    chip: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200",
  },
};

const CAT_FALLBACK_CHIP =
  "border-neutral-600/50 bg-neutral-500/10 text-neutral-300";

// ============================================================================
// MAIN
// ============================================================================

export function CalendarioClient() {
  const [drafts, setDrafts] = useState<CalDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<CalDraft | null>(null);
  const [view, setView] = useState<
    "calendario" | "agendados" | "erro" | "publicados"
  >("calendario");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        "/api/admin/marketing/content/drafts?source=filesystem&limit=500",
      );
      const j = await r.json();
      setDrafts((j.drafts || []) as CalDraft[]);
    } catch {
      toast.error("erro ao carregar drafts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await fetch("/api/admin/marketing/content/sync", {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || "sync falhou");
        return;
      }
      const parts: string[] = [`${j.synced.length} ok`];
      if (j.errors.length) parts.push(`${j.errors.length} erro(s)`);
      if (j.orphaned.length) parts.push(`${j.orphaned.length} órfão(s)`);
      toast.success(`sync: ${parts.join(", ")}`);
      if (j.errors.length) {
        console.error("[sync errors]", j.errors);
      }
      load();
    } catch {
      toast.error("erro de rede");
    } finally {
      setSyncing(false);
    }
  }

  async function handlePublishNow(draft: CalDraft) {
    if (!confirm(`Publicar "${draft.idea_title || draft.slug}" agora?`))
      return;
    setPublishingId(draft.id);
    try {
      const r = await fetch("/api/admin/marketing/content/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft_id: draft.id }),
      });
      const j = await r.json();
      if (j.ok) {
        toast.success(`publicado em ${Object.keys(j.results).join(", ")}`);
      } else {
        const e = j.errors || {};
        const msg = Object.entries(e)
          .map(([n, m]) => `${n}: ${m}`)
          .join(" | ");
        toast.error(`falhou: ${msg || j.error || "desconhecido"}`);
      }
      load();
    } catch {
      toast.error("erro de rede");
    } finally {
      setPublishingId(null);
    }
  }

  async function handleArchive(draft: CalDraft) {
    if (!confirm(`Arquivar "${draft.idea_title || draft.slug}"?`)) return;
    try {
      const r = await fetch("/api/admin/marketing/content/drafts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, status: "rejected" }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || "falhou");
        return;
      }
      toast.success("Arquivado");
      load();
    } catch {
      toast.error("erro de rede");
    }
  }

  async function handleUnarchive(draft: CalDraft) {
    try {
      const next = draft.scheduled_for ? "scheduled" : "drafted";
      const r = await fetch("/api/admin/marketing/content/drafts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, status: next }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || "falhou");
        return;
      }
      toast.success("Desarquivado");
      load();
    } catch {
      toast.error("erro de rede");
    }
  }

  async function handleDelete(draft: CalDraft) {
    if (
      !confirm(
        `Apagar "${draft.idea_title || draft.slug}" PERMANENTEMENTE?\n\nIsso só remove do banco — a pasta em content/marketing/posts/ continua. Pra evitar re-sync, apague a pasta também.`,
      )
    )
      return;
    try {
      const r = await fetch(
        `/api/admin/marketing/content/drafts?id=${encodeURIComponent(draft.id)}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || "falhou");
        return;
      }
      toast.success("Apagado");
      load();
    } catch {
      toast.error("erro de rede");
    }
  }

  async function handleSaveEdit(
    draft: CalDraft,
    updates: { scheduled_for: string | null; content_per_network: Record<string, Record<string, unknown>> },
  ) {
    try {
      const r = await fetch("/api/admin/marketing/content/drafts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, ...updates }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || "falhou");
        return false;
      }
      toast.success("Salvo");
      setEditingDraft(null);
      load();
      return true;
    } catch {
      toast.error("erro de rede");
      return false;
    }
  }

  const upcoming = drafts
    .filter((d) => d.status === "scheduled")
    .sort((a, b) =>
      (a.scheduled_for || "").localeCompare(b.scheduled_for || ""),
    );
  const published = drafts
    .filter((d) => d.status === "published")
    .sort((a, b) =>
      (b.published_at || "").localeCompare(a.published_at || ""),
    )
    .slice(0, 30);
  const errored = drafts.filter(
    (d) =>
      d.status === "rejected" || (d.sync_error && d.status !== "published"),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Calendário de posts</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Posts vivem em{" "}
          <code className="font-mono text-fuchsia-300">
            content/marketing/posts/
          </code>
          . Cron <code className="font-mono">*/5 * * * *</code> publica
          automaticamente.
        </p>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Sincronize a pasta sempre que adicionar/editar posts no filesystem.
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-xs font-medium text-white"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Sincronizar pasta
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border/60 p-8 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-1 border-b border-border/60 flex-wrap">
            <ListTab
              label="Calendário"
              active={view === "calendario"}
              onClick={() => setView("calendario")}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
            />
            <ListTab
              label="Agendados"
              count={upcoming.length}
              active={view === "agendados"}
              onClick={() => setView("agendados")}
              icon={<Clock className="h-3.5 w-3.5" />}
            />
            <ListTab
              label="Arquivados / Erro"
              count={errored.length}
              danger
              active={view === "erro"}
              onClick={() => setView("erro")}
              icon={<AlertCircle className="h-3.5 w-3.5" />}
            />
            <ListTab
              label="Publicados"
              count={published.length}
              active={view === "publicados"}
              onClick={() => setView("publicados")}
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            />
          </div>

          {view === "calendario" && <PlannerCalendar drafts={drafts} />}

          {view === "agendados" &&
            (upcoming.length === 0 ? (
              <CalEmptyState text="Nenhum post agendado. Crie pastas em content/marketing/posts/ e clique em Sincronizar." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {upcoming.map((d) => (
                  <CalCard
                    key={d.id}
                    draft={d}
                    onPublishNow={handlePublishNow}
                    onEdit={setEditingDraft}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
                    onDelete={handleDelete}
                    publishing={publishingId === d.id}
                  />
                ))}
              </div>
            ))}

          {view === "erro" &&
            (errored.length === 0 ? (
              <CalEmptyState text="Nenhum post arquivado ou com erro." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {errored.map((d) => (
                  <CalCard
                    key={d.id}
                    draft={d}
                    onPublishNow={handlePublishNow}
                    onEdit={setEditingDraft}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
                    onDelete={handleDelete}
                    publishing={publishingId === d.id}
                  />
                ))}
              </div>
            ))}

          {view === "publicados" &&
            (published.length === 0 ? (
              <CalEmptyState text="Nenhum publicado ainda." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {published.map((d) => (
                  <CalCard
                    key={d.id}
                    draft={d}
                    onPublishNow={handlePublishNow}
                    onEdit={setEditingDraft}
                    onArchive={handleArchive}
                    onUnarchive={handleUnarchive}
                    onDelete={handleDelete}
                    publishing={publishingId === d.id}
                  />
                ))}
              </div>
            ))}
        </div>
      )}

      {editingDraft && (
        <EditDraftModal
          draft={editingDraft}
          onClose={() => setEditingDraft(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}

// ============================================================================
// PLANNER — calendário mensal (grade seg–dom, cor por categoria, redes)
// ============================================================================

function planDate(d: CalDraft): Date | null {
  const iso = d.scheduled_for || d.published_at;
  return iso ? new Date(iso) : null;
}

function networksOf(d: CalDraft): string[] {
  const keys = Object.keys(d.content_per_network || {});
  if (keys.length) return keys;
  const nt = (d.publish_results as Record<string, unknown> | null)
    ?.networks_target;
  return nt && typeof nt === "object" ? Object.keys(nt as object) : [];
}

function shortId(slug: string): string {
  const m = slug.match(/^(\d+)/);
  return m ? m[1] : slug.slice(0, 4);
}

function dayKey(dt: Date): string {
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

function PlannerCalendar({ drafts }: { drafts: CalDraft[] }) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [netFilter, setNetFilter] = useState<string>("todas");

  const allNetworks = useMemo(() => {
    const s = new Set<string>();
    drafts.forEach((d) => networksOf(d).forEach((n) => s.add(n)));
    return Array.from(s);
  }, [drafts]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalDraft[]>();
    for (const d of drafts) {
      if (netFilter !== "todas" && !networksOf(d).includes(netFilter)) continue;
      const dt = planDate(d);
      if (!dt) continue;
      const k = dayKey(dt);
      const arr = map.get(k) || [];
      arr.push(d);
      map.set(k, arr);
    }
    return map;
  }, [drafts, netFilter]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // segunda = início
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++)
    cells.push(new Date(year, month, 1 - startOffset + i));

  const todayKey = dayKey(new Date());
  const monthLabel = cursor.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const goMonth = (delta: number) =>
    setCursor(new Date(year, month + delta, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  const usedCategories = useMemo(() => {
    const s = new Set<string>();
    drafts.forEach((d) => d.category && s.add(d.category));
    return Array.from(s);
  }, [drafts]);

  const weekdays = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goMonth(-1)}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 hover:bg-muted/40 text-xs"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <span className="text-sm font-semibold capitalize min-w-[140px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => goMonth(1)}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 hover:bg-muted/40 text-xs"
            aria-label="Próximo mês"
          >
            ›
          </button>
          <button
            onClick={goToday}
            className="h-7 px-2 inline-flex items-center rounded-md border border-border/60 hover:bg-muted/40 text-[11px]"
          >
            hoje
          </button>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <NetChip
            label="todas"
            active={netFilter === "todas"}
            onClick={() => setNetFilter("todas")}
          />
          {allNetworks.map((n) => (
            <NetChip
              key={n}
              label={NETWORK_META[n]?.label || n}
              active={netFilter === n}
              onClick={() => setNetFilter(n)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px rounded-md overflow-hidden bg-border/40">
        {weekdays.map((w) => (
          <div
            key={w}
            className="bg-card px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-center"
          >
            {w}
          </div>
        ))}
        {cells.map((cell) => {
          const inMonth = cell.getMonth() === month;
          const isToday = dayKey(cell) === todayKey;
          const posts = byDay.get(dayKey(cell)) || [];
          return (
            <div
              key={cell.toISOString()}
              className={`bg-card min-h-[78px] p-1 flex flex-col gap-0.5 ${
                inMonth ? "" : "opacity-35"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-mono ${
                    isToday
                      ? "bg-fuchsia-600 text-white rounded px-1"
                      : "text-muted-foreground"
                  }`}
                >
                  {cell.getDate()}
                </span>
              </div>
              {posts.map((p) => {
                const cat = CATEGORY_META[p.category || ""];
                const nets = networksOf(p);
                const archived = p.status === "rejected";
                return (
                  <div
                    key={p.id}
                    title={`${p.idea_title || p.slug} · ${p.status}${archived ? " (arquivado)" : ""}`}
                    className={`text-[9px] leading-tight px-1 py-0.5 rounded border bg-card flex items-center gap-1 ${
                      cat?.chip || CAT_FALLBACK_CHIP
                    } ${p.status === "published" ? "opacity-55" : ""} ${
                      archived ? "opacity-40 line-through" : ""
                    } ${p.sync_error ? "ring-1 ring-rose-500" : ""}`}
                  >
                    <span className="font-mono font-semibold shrink-0">
                      {shortId(p.slug)}
                    </span>
                    <span className="flex items-center gap-0.5 min-w-0 overflow-hidden">
                      {nets.map((n) => {
                        const meta = NETWORK_META[n];
                        return (
                          <span
                            key={n}
                            className={`text-[8px] leading-none px-1 py-[1px] rounded border font-mono ${meta?.chipCls || "bg-muted text-muted-foreground border-border/60"}`}
                          >
                            {meta?.label || n}
                          </span>
                        );
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap pt-1 text-[10px] text-muted-foreground">
        <span className="font-medium">Redes:</span>
        {allNetworks.map((n) => {
          const meta = NETWORK_META[n];
          return (
            <span key={n} className="inline-flex items-center gap-1">
              <span
                className={`h-2 w-2 rounded-full ${meta?.dot || "bg-neutral-400"}`}
              />
              {meta?.label || n}
            </span>
          );
        })}
        {usedCategories.length > 0 && (
          <>
            <span className="opacity-50">·</span>
            <span className="font-medium">Categorias (borda):</span>
            {usedCategories.map((c) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span
                  className={`h-2 w-2 rounded-full ${CATEGORY_META[c]?.dot || "bg-neutral-400"}`}
                />
                {CATEGORY_META[c]?.label || c}
              </span>
            ))}
          </>
        )}
        <span className="ml-auto">
          publicado=esmaecido · arquivado=riscado · contorno vermelho=erro
        </span>
      </div>
    </div>
  );
}

function NetChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2 rounded-md text-[11px] border transition-colors ${
        active
          ? "border-fuchsia-500 bg-fuchsia-600/20 text-fuchsia-200"
          : "border-border/60 text-muted-foreground hover:bg-muted/40"
      }`}
    >
      {label}
    </button>
  );
}

function ListTab({
  label,
  count,
  active,
  danger,
  icon,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  const countCls =
    danger && (count ?? 0) > 0 ? "text-rose-400" : "text-muted-foreground";
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-fuchsia-500 text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {label}
      {count !== undefined && (
        <span
          className={`font-mono text-[10px] ${active ? "text-fuchsia-300" : countCls}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function CalEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function CalCard({
  draft,
  onPublishNow,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
  publishing,
}: {
  draft: CalDraft;
  onPublishNow: (d: CalDraft) => void;
  onEdit: (d: CalDraft) => void;
  onArchive: (d: CalDraft) => void;
  onUnarchive: (d: CalDraft) => void;
  onDelete: (d: CalDraft) => void;
  publishing: boolean;
}) {
  const networksTarget = (
    draft.publish_results as Record<string, unknown> | null
  )?.networks_target as Record<string, boolean> | undefined;
  const networks = networksTarget
    ? Object.keys(networksTarget)
    : Object.keys(draft.content_per_network || {});
  const img = draft.images.ratio_1x1?.url;

  const dt = draft.scheduled_for ? new Date(draft.scheduled_for) : null;
  const when = dt
    ? dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "—";

  const publishLinks = draft.publish_results
    ? Object.entries(draft.publish_results).filter(
        ([k]) => k !== "networks_target",
      )
    : [];

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 flex gap-3">
      {img ? (
        <Image
          src={img}
          alt=""
          width={80}
          height={80}
          className="w-20 h-20 rounded-md object-cover flex-shrink-0"
          unoptimized
        />
      ) : (
        <div className="w-20 h-20 rounded-md bg-muted flex-shrink-0 flex items-center justify-center">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">
              {draft.idea_title || draft.slug}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              {draft.slug}
            </div>
          </div>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${draftStatusClass(draft.status)} flex-shrink-0`}
          >
            {draft.status}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {when}
          </span>
          {draft.category && (
            <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-300">
              {draft.category}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {networks.map((n) => (
            <span
              key={n}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
            >
              {n}
            </span>
          ))}
        </div>

        {draft.sync_error && (
          <div className="text-[10px] text-rose-300 flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{draft.sync_error}</span>
          </div>
        )}

        {publishLinks.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {publishLinks.map(([net, info]) => {
              const r = info as { permalink?: string | null };
              if (!r?.permalink) return null;
              return (
                <a
                  key={net}
                  href={r.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-fuchsia-300 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> {net}
                </a>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-1 flex-wrap pt-1">
          {draft.status !== "rejected" && (
            <button
              onClick={() => onPublishNow(draft)}
              disabled={publishing}
              className="text-[10px] h-6 px-2 rounded bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white inline-flex items-center gap-1"
              title={
                draft.status === "published"
                  ? "Republicar (cria novo post nas redes)"
                  : "Publicar agora"
              }
            >
              {publishing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              {draft.status === "published" ? "Republicar" : "Publicar"}
            </button>
          )}
          {draft.status !== "published" && (
            <button
              onClick={() => onEdit(draft)}
              className="text-[10px] h-6 px-2 rounded border border-border/60 hover:bg-muted/40 inline-flex items-center gap-1"
              title="Editar caption e agendamento"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
          {draft.status === "rejected" ? (
            <button
              onClick={() => onUnarchive(draft)}
              className="text-[10px] h-6 px-2 rounded border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 inline-flex items-center gap-1"
              title="Desarquivar"
            >
              <RotateCcw className="h-3 w-3" /> Desarquivar
            </button>
          ) : draft.status !== "published" ? (
            <button
              onClick={() => onArchive(draft)}
              className="text-[10px] h-6 px-2 rounded border border-border/60 hover:bg-muted/40 inline-flex items-center gap-1 text-muted-foreground"
              title="Arquivar (não publica mais)"
            >
              <Archive className="h-3 w-3" /> Arquivar
            </button>
          ) : null}
          <button
            onClick={() => onDelete(draft)}
            className="text-[10px] h-6 px-2 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 inline-flex items-center gap-1 ml-auto"
            title="Apagar permanentemente"
          >
            <Trash2 className="h-3 w-3" /> Apagar
          </button>
        </div>
      </div>
    </div>
  );
}

function draftStatusClass(status: string) {
  switch (status) {
    case "idea":
      return "bg-neutral-500/15 text-neutral-300";
    case "drafted":
      return "bg-sky-500/15 text-sky-200";
    case "approved":
      return "bg-fuchsia-500/15 text-fuchsia-200";
    case "scheduled":
      return "bg-amber-500/15 text-amber-200";
    case "published":
      return "bg-emerald-500/15 text-emerald-200";
    case "rejected":
      return "bg-neutral-500/15 text-neutral-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ============================================================================
// EDIT MODAL — caption por rede + scheduled_for
// ============================================================================

function EditDraftModal({
  draft,
  onClose,
  onSave,
}: {
  draft: CalDraft;
  onClose: () => void;
  onSave: (
    draft: CalDraft,
    updates: {
      scheduled_for: string | null;
      content_per_network: Record<string, Record<string, unknown>>;
    },
  ) => Promise<boolean>;
}) {
  const initialDateLocal = useMemo(() => {
    if (!draft.scheduled_for) return "";
    const d = new Date(draft.scheduled_for);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [draft.scheduled_for]);

  const networks = useMemo(
    () => Object.keys(draft.content_per_network || {}),
    [draft.content_per_network],
  );

  const [scheduled, setScheduled] = useState(initialDateLocal);
  const [captions, setCaptions] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const n of networks) {
      const v = draft.content_per_network?.[n]?.caption;
      out[n] = typeof v === "string" ? v : "";
    }
    return out;
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const nextCpn: Record<string, Record<string, unknown>> = {};
    for (const n of networks) {
      nextCpn[n] = {
        ...(draft.content_per_network?.[n] || {}),
        caption: captions[n],
      };
    }
    const nextScheduled = scheduled
      ? new Date(scheduled).toISOString()
      : null;
    await onSave(draft, {
      scheduled_for: nextScheduled,
      content_per_network: nextCpn,
    });
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/60 rounded-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-card z-10">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">
              Editar: {draft.idea_title || draft.slug}
            </h3>
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {draft.slug}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-muted/40 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Data/hora de publicação
            </label>
            <input
              type="datetime-local"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className="w-full h-9 px-2 rounded-md bg-background border border-border/60 text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Deixe vazio pra remover agendamento.
            </p>
          </div>

          {networks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Nenhuma rede configurada neste post.
            </p>
          ) : (
            networks.map((n) => {
              const meta = NETWORK_META[n];
              return (
                <div key={n}>
                  <label className="text-[11px] font-medium flex items-center gap-1 mb-1">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${meta?.chipCls || "bg-muted text-muted-foreground border-border/60"}`}
                    >
                      {meta?.label || n}
                    </span>
                    <span className="text-muted-foreground">caption</span>
                  </label>
                  <textarea
                    value={captions[n] || ""}
                    onChange={(e) =>
                      setCaptions((s) => ({ ...s, [n]: e.target.value }))
                    }
                    rows={5}
                    className="w-full px-2 py-1.5 rounded-md bg-background border border-border/60 text-xs font-mono resize-y"
                    placeholder="Caption do post nessa rede..."
                  />
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/60 sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-xs h-8 px-3 rounded border border-border/60 hover:bg-muted/40"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-xs h-8 px-3 rounded bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white inline-flex items-center gap-1"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
