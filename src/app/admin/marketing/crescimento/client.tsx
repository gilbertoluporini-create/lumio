"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Gift,
  Image as ImageIcon,
  Inbox,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// TYPES
// ============================================================================

type Tab = "calendario" | "publicar" | "outbound" | "inbox" | "embaixadores";

type PublishablePost = {
  id: string;
  filename: string;
  order: number;
  type: string;
  dia: string;
  hora: string;
  caption: string;
  image_url: string;
  already_published: boolean;
};

type Draft = {
  id: string;
  platform: string;
  handle: string;
  profile_url: string | null;
  profile_research: Record<string, unknown> | null;
  draft_text: string;
  reasoning: string | null;
  voice: string;
  score: number | null;
  score_reason: string | null;
  status: string;
  approved_at: string | null;
  sent_at: string | null;
  replied_at: string | null;
  reply_text: string | null;
  conversion: boolean;
  created_at: string;
  updated_at: string;
};

type InboxMsg = {
  id: string;
  platform: string;
  from_handle: string;
  message_type: string;
  message_text: string | null;
  received_at: string;
  response_deadline: string;
  reply_draft: string | null;
  reply_text: string | null;
  status: string;
};

type Embaixador = {
  id: string;
  nome: string;
  email: string | null;
  handle_instagram: string | null;
  handle_tiktok: string | null;
  curso: string | null;
  faculdade: string | null;
  cidade: string | null;
  status: string;
  convidado_em: string;
  aceitou_em: string | null;
  ativou_em: string | null;
  pro_concedido: boolean;
  pro_concedido_em: string | null;
  pro_expira_em: string | null;
  divulgacoes_count: number;
  signups_atribuidos: number;
  ultima_divulgacao_em: string | null;
  notas: string | null;
};

// ============================================================================
// MAIN
// ============================================================================

export function CrescimentoClient() {
  const [tab, setTab] = useState<Tab>("calendario");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Crescimento</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Calendário editorial multi-rede + publicação + outbound + inbox + embaixadores.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-border/60 overflow-x-auto">
        <TabBtn active={tab === "calendario"} onClick={() => setTab("calendario")}>
          <Clock className="h-3.5 w-3.5" /> Calendário
        </TabBtn>
        <TabBtn active={tab === "publicar"} onClick={() => setTab("publicar")}>
          <ImageIcon className="h-3.5 w-3.5" /> Warmup IG
        </TabBtn>
        <TabBtn active={tab === "outbound"} onClick={() => setTab("outbound")}>
          <Send className="h-3.5 w-3.5" /> Outbound
        </TabBtn>
        <TabBtn active={tab === "inbox"} onClick={() => setTab("inbox")}>
          <Inbox className="h-3.5 w-3.5" /> Inbox
        </TabBtn>
        <TabBtn
          active={tab === "embaixadores"}
          onClick={() => setTab("embaixadores")}
        >
          <Users className="h-3.5 w-3.5" /> Embaixadores
        </TabBtn>
      </div>

      {tab === "calendario" && <CalendarioPanel />}
      {tab === "publicar" && <PublicarPanel />}
      {tab === "outbound" && <OutboundPanel />}
      {tab === "inbox" && <InboxPanel />}
      {tab === "embaixadores" && <EmbaixadoresPanel />}
    </div>
  );
}

// ============================================================================
// CALENDÁRIO PANEL — posts vindos de content/marketing/posts/ (filesystem)
// Cron */5 * * * * publica automaticamente quando scheduled_for <= now
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

function CalendarioPanel() {
  const [drafts, setDrafts] = useState<CalDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
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
    if (
      !confirm(`Publicar "${draft.idea_title || draft.slug}" agora?`)
    )
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
      d.status === "rejected" ||
      (d.sync_error && d.status !== "published"),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Calendário editorial</h2>
          <p className="text-xs text-muted-foreground">
            Posts vivem em{" "}
            <code className="font-mono text-fuchsia-300">
              content/marketing/posts/
            </code>
            . Cron <code className="font-mono">*/5 * * * *</code> publica
            automaticamente.
          </p>
        </div>
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
        <>
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
                label="Com erro"
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
                      publishing={publishingId === d.id}
                    />
                  ))}
                </div>
              ))}

            {view === "erro" &&
              (errored.length === 0 ? (
                <CalEmptyState text="Nenhum post com erro." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {errored.map((d) => (
                    <CalCard
                      key={d.id}
                      draft={d}
                      onPublishNow={handlePublishNow}
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
                      publishing={publishingId === d.id}
                    />
                  ))}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// PLANNER — calendário mensal (grade seg–dom, cor por categoria, redes)
// ============================================================================

const NETWORK_META: Record<string, { label: string; cls: string }> = {
  instagram: { label: "IG", cls: "bg-pink-500/20 text-pink-200" },
  facebook: { label: "FB", cls: "bg-blue-500/20 text-blue-200" },
  tiktok: { label: "TT", cls: "bg-neutral-100/15 text-neutral-100" },
  x: { label: "X", cls: "bg-neutral-500/25 text-neutral-200" },
  linkedin: { label: "in", cls: "bg-sky-600/25 text-sky-200" },
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

const CAT_FALLBACK_CHIP = "border-neutral-600/50 bg-neutral-500/10 text-neutral-300";

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
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month, 1 - startOffset + i));

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
      {/* header: navegação + filtro de rede */}
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

      {/* grade */}
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
                return (
                  <div
                    key={p.id}
                    title={`${p.idea_title || p.slug} · ${p.status}`}
                    className={`text-[9px] leading-tight px-1 py-0.5 rounded border truncate ${
                      cat?.chip || CAT_FALLBACK_CHIP
                    } ${p.status === "published" ? "opacity-55" : ""} ${
                      p.sync_error ? "ring-1 ring-rose-500" : ""
                    }`}
                  >
                    <span className="font-mono font-semibold">
                      {shortId(p.slug)}
                    </span>{" "}
                    <span className="opacity-80">
                      {nets.map((n) => NETWORK_META[n]?.label || n).join(" ")}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* legenda */}
      <div className="flex items-center gap-3 flex-wrap pt-1">
        {usedCategories.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
          >
            <span
              className={`h-2 w-2 rounded-full ${CATEGORY_META[c]?.dot || "bg-neutral-400"}`}
            />
            {CATEGORY_META[c]?.label || c}
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground ml-auto">
          publicado = esmaecido · contorno vermelho = erro
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
  publishing,
}: {
  draft: CalDraft;
  onPublishNow: (d: CalDraft) => void;
  publishing: boolean;
}) {
  const networksTarget = (draft.publish_results as Record<string, unknown> | null)?.networks_target as
    | Record<string, boolean>
    | undefined;
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

        {draft.status !== "published" && (
          <button
            onClick={() => onPublishNow(draft)}
            disabled={publishing}
            className="text-[10px] h-6 px-2 rounded bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white inline-flex items-center gap-1"
          >
            {publishing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Publicar agora
          </button>
        )}
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
// PUBLICAR PANEL — feed warmup IG, 1 clique publica
// ============================================================================

function PublicarPanel() {
  const [posts, setPosts] = useState<PublishablePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/marketing/ig-publish");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "erro");
      setPosts(j.posts);
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const publish = async (post: PublishablePost) => {
    if (
      !confirm(
        `Publicar AGORA "${post.id} — ${post.type}" no @lumioapp.br?\n\nDepois de publicado não tem como deletar daqui — só pelo app do IG.`,
      )
    )
      return;

    setPublishingId(post.id);
    try {
      const r = await fetch("/api/admin/marketing/ig-publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post_id: post.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "erro");
      toast.success(`Publicado! Media ID: ${j.id}`);
      if (j.permalink) window.open(j.permalink, "_blank");
      load();
    } catch (e) {
      toast.error(`Falha ao publicar: ${(e as Error).message}`, {
        duration: 8000,
      });
    } finally {
      setPublishingId(null);
    }
  };

  const publishedCount = posts.filter((p) => p.already_published).length;
  const nextPost = posts.find((p) => !p.already_published);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-fuchsia-400 mt-0.5 shrink-0" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-foreground">
              {publishedCount} / {posts.length} posts publicados no warmup
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Ordem editorial: 01 (lançamento) → 04 → 07 → 06 → 02 → 03 → 05 → 10 → 09 (CTA).
              <br />
              Pico de engagement BR: <b>12h-13h</b> (almoço) e <b>19h-21h</b> (pós-aula).
              Evita domingo.
              {nextPost && (
                <>
                  <br />
                  <b className="text-foreground">Próximo recomendado:</b> {nextPost.id} —{" "}
                  {nextPost.type} ({nextPost.dia} {nextPost.hora}).
                </>
              )}
            </p>
          </div>
          <button
            onClick={load}
            className="ml-auto text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground shrink-0"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {loading && posts.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              isPublishing={publishingId === p.id}
              isDisabled={publishingId !== null && publishingId !== p.id}
              onPublish={() => publish(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  isPublishing,
  isDisabled,
  onPublish,
}: {
  post: PublishablePost;
  isPublishing: boolean;
  isDisabled: boolean;
  onPublish: () => void;
}) {
  const [showFullCaption, setShowFullCaption] = useState(false);
  const truncated =
    post.caption.length > 200 ? post.caption.slice(0, 200) + "…" : post.caption;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex gap-4">
        <div className="shrink-0 relative w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden bg-background border border-border/40">
          <Image
            src={`/instagram/lumi-posts/${post.filename}`}
            alt={post.type}
            fill
            sizes="128px"
            className="object-cover"
          />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-sm font-semibold font-mono">{post.id}</span>
            <span className="text-xs text-muted-foreground">{post.type}</span>
            <span className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
              {post.dia} · {post.hora}
            </span>
            {post.already_published ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-emerald-500/15 text-emerald-200 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Publicado
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-amber-500/15 text-amber-200">
                Pendente
              </span>
            )}
          </div>

          <pre className="text-[11px] whitespace-pre-wrap font-sans leading-relaxed text-foreground/90 bg-background/40 rounded p-2 max-h-[140px] overflow-y-auto">
            {showFullCaption ? post.caption : truncated}
          </pre>

          {post.caption.length > 200 && (
            <button
              onClick={() => setShowFullCaption(!showFullCaption)}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              {showFullCaption ? "Recolher" : "Ver caption completa"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
        {post.already_published ? (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Já tá no feed
          </span>
        ) : (
          <button
            onClick={onPublish}
            disabled={isPublishing || isDisabled}
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-fuchsia-500 text-white hover:bg-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Publicando…
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" /> Publicar agora
              </>
            )}
          </button>
        )}
        <button
          onClick={() => {
            navigator.clipboard.writeText(post.caption);
            toast.success("Caption copiada");
          }}
          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" /> Copiar caption
        </button>
        <a
          href={post.image_url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" /> Ver imagem
        </a>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-fuchsia-500 text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// ============================================================================
// OUTBOUND PANEL
// ============================================================================

function OutboundPanel() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        filter === "all"
          ? "/api/admin/marketing/outbound"
          : `/api/admin/marketing/outbound?status=${filter}`;
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "erro");
      setDrafts(j.drafts);
      setCounts(j.counts);
    } catch (e) {
      toast.error(`Falha ao carregar: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {[
          ["all", "Todos"],
          ["pending", "Pendentes"],
          ["approved", "Aprovados"],
          ["sent", "Enviados"],
          ["replied", "Responderam"],
          ["rejected", "Rejeitados"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              filter === k
                ? "bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}{" "}
            {k !== "all" && counts[k] !== undefined && (
              <span className="ml-1 font-mono text-[10px] opacity-70">
                {counts[k]}
              </span>
            )}
          </button>
        ))}
        <button
          onClick={() => load()}
          className="ml-auto text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
        <button
          onClick={() => setNewOpen(true)}
          className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded bg-fuchsia-500 text-white hover:bg-fuchsia-600"
        >
          <Plus className="h-3 w-3" /> Novo draft
        </button>
      </div>

      {newOpen && (
        <NewDraftForm
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false);
            load();
          }}
        />
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
          Carregando...
        </div>
      ) : drafts.length === 0 ? (
        <EmptyState
          icon={<Send className="h-8 w-8 text-muted-foreground/50" />}
          title="Nenhum draft ainda"
          desc='Clique em "Novo draft" pra adicionar um perfil e a IA gera o texto.'
        />
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewDraftForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [profileHint, setProfileHint] = useState("");
  const [voice, setVoice] = useState<"casual" | "formal" | "adaptive">("casual");
  const [generating, setGenerating] = useState(false);
  const [draftPreview, setDraftPreview] = useState<{
    draft_text: string;
    reasoning: string;
    score: number | null;
    score_reason: string;
  } | null>(null);

  const generate = async () => {
    if (!handle.trim()) {
      toast.error("Handle obrigatório");
      return;
    }
    setGenerating(true);
    try {
      const r = await fetch("/api/admin/marketing/draft-dm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle: handle.trim(),
          platform,
          profile_hint: profileHint.trim(),
          voice,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "erro");
      setDraftPreview(j);
    } catch (e) {
      toast.error(`Falha ao gerar: ${(e as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!draftPreview) {
      toast.error("Gere o draft antes");
      return;
    }
    try {
      const r = await fetch("/api/admin/marketing/outbound", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle: handle.trim(),
          platform,
          draft_text: draftPreview.draft_text,
          reasoning: draftPreview.reasoning,
          score: draftPreview.score,
          score_reason: draftPreview.score_reason,
          voice,
          profile_research: { hint: profileHint.trim() },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "erro");
      toast.success("Draft salvo");
      onCreated();
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Novo draft</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            Handle
          </label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@joaomedicina"
            className="mt-1 w-full text-sm bg-background border border-border/60 rounded px-2.5 py-1.5 outline-none focus:border-fuchsia-500"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            Plataforma
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="mt-1 w-full text-sm bg-background border border-border/60 rounded px-2.5 py-1.5 outline-none focus:border-fuchsia-500"
          >
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
            Voz
          </label>
          <select
            value={voice}
            onChange={(e) =>
              setVoice(e.target.value as "casual" | "formal" | "adaptive")
            }
            className="mt-1 w-full text-sm bg-background border border-border/60 rounded px-2.5 py-1.5 outline-none focus:border-fuchsia-500"
          >
            <option value="casual">Casual (estudante)</option>
            <option value="formal">Formal (mestrado+)</option>
            <option value="adaptive">Adaptativo</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          Contexto do perfil (bio, posts recentes, dor observada — opcional)
        </label>
        <textarea
          value={profileHint}
          onChange={(e) => setProfileHint(e.target.value)}
          placeholder="Ex: medicina UFMG, P2 semana que vem, posta muito de cansaço de anotação"
          rows={3}
          className="mt-1 w-full text-sm bg-background border border-border/60 rounded px-2.5 py-1.5 outline-none focus:border-fuchsia-500 resize-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={generate}
          disabled={generating || !handle.trim()}
          className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-fuchsia-500 text-white hover:bg-fuchsia-600 disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {draftPreview ? "Gerar de novo" : "Gerar DM com IA"}
        </button>
        {draftPreview && (
          <button
            onClick={save}
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Salvar draft
          </button>
        )}
      </div>

      {draftPreview && (
        <div className="rounded-lg border border-border/60 bg-background p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
              Preview
            </span>
            {draftPreview.score !== null && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${scoreClass(
                  draftPreview.score,
                )}`}
              >
                score {draftPreview.score.toFixed(1)}
              </span>
            )}
          </div>
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground">
            {draftPreview.draft_text}
          </pre>
          <div className="text-[11px] text-muted-foreground italic border-t border-border/40 pt-2">
            <b className="text-foreground">Por quê:</b> {draftPreview.reasoning}
          </div>
          {draftPreview.score_reason && (
            <div className="text-[11px] text-muted-foreground italic">
              <b className="text-foreground">Score:</b> {draftPreview.score_reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DraftCard({ draft, onUpdate }: { draft: Draft; onUpdate: () => void }) {
  const [updating, setUpdating] = useState(false);

  const setStatus = async (status: string) => {
    setUpdating(true);
    try {
      const r = await fetch("/api/admin/marketing/outbound", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draft.id, status }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || "erro");
      }
      toast.success(`Marcado: ${status}`);
      onUpdate();
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setUpdating(false);
    }
  };

  const copyText = () => {
    navigator.clipboard.writeText(draft.draft_text);
    toast.success("Copiado");
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-xs font-mono font-semibold">{draft.handle}</span>
        <span className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
          {draft.platform}
        </span>
        {draft.score !== null && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${scoreClass(
              draft.score,
            )}`}
          >
            {draft.score.toFixed(1)}
          </span>
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wider ${statusClass(
            draft.status,
          )}`}
        >
          {draft.status}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground font-mono">
          {formatAgo(draft.created_at)}
        </span>
      </div>

      <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground bg-background/50 rounded p-2.5">
        {draft.draft_text}
      </pre>

      {draft.reasoning && (
        <div className="text-[11px] text-muted-foreground italic">
          {draft.reasoning}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        <ActionBtn onClick={copyText} icon={<Copy className="h-3 w-3" />}>
          Copiar
        </ActionBtn>
        {draft.status === "pending" && (
          <>
            <ActionBtn
              onClick={() => setStatus("approved")}
              disabled={updating}
              variant="emerald"
              icon={<CheckCircle2 className="h-3 w-3" />}
            >
              Aprovar
            </ActionBtn>
            <ActionBtn
              onClick={() => setStatus("rejected")}
              disabled={updating}
              variant="muted"
              icon={<X className="h-3 w-3" />}
            >
              Rejeitar
            </ActionBtn>
          </>
        )}
        {draft.status === "approved" && (
          <ActionBtn
            onClick={() => setStatus("sent")}
            disabled={updating}
            variant="fuchsia"
            icon={<Send className="h-3 w-3" />}
          >
            Marquei como enviada
          </ActionBtn>
        )}
        {draft.status === "sent" && (
          <ActionBtn
            onClick={() => setStatus("replied")}
            disabled={updating}
            variant="emerald"
            icon={<MessageSquare className="h-3 w-3" />}
          >
            Respondeu
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// INBOX PANEL
// ============================================================================

function InboxPanel() {
  const [msgs, setMsgs] = useState<InboxMsg[]>([]);
  const [counts, setCounts] = useState<{ unread: number; urgent: number }>({
    unread: 0,
    urgent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("unread");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        filter === "all"
          ? "/api/admin/marketing/inbox"
          : `/api/admin/marketing/inbox?status=${filter}`;
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "erro");
      setMsgs(j.messages);
      setCounts(j.counts);
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {[
          ["unread", "Não lidas"],
          ["drafted", "Draftadas"],
          ["replied", "Respondidas"],
          ["archived", "Arquivadas"],
          ["all", "Todas"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              filter === k
                ? "bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        {counts.urgent > 0 && (
          <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-200 inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {counts.urgent} urgentes
          </span>
        )}
        <button
          onClick={() => load()}
          className="ml-auto text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
        </div>
      ) : msgs.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8 text-muted-foreground/50" />}
          title="Inbox vazia"
          desc="Mensagens recebidas via Instagram (webhook) aparecem aqui. Janela de 24h pra responder."
        />
      ) : (
        <div className="space-y-3">
          {msgs.map((m) => (
            <InboxCard key={m.id} msg={m} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function InboxCard({ msg, onUpdate }: { msg: InboxMsg; onUpdate: () => void }) {
  const [updating, setUpdating] = useState(false);
  const deadline = new Date(msg.response_deadline).getTime();
  const hoursLeft = Math.max(0, Math.round((deadline - Date.now()) / 3600000));

  const setStatus = async (status: string) => {
    setUpdating(true);
    try {
      const r = await fetch("/api/admin/marketing/inbox", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: msg.id, status }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || "erro");
      }
      onUpdate();
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-xs font-mono font-semibold">{msg.from_handle}</span>
        <span className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
          {msg.platform} · {msg.message_type}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wider ${
            msg.status === "unread"
              ? "bg-fuchsia-500/15 text-fuchsia-200"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {msg.status}
        </span>
        <span
          className={`ml-auto text-[10px] font-mono inline-flex items-center gap-1 ${
            hoursLeft < 6 ? "text-amber-300" : "text-muted-foreground"
          }`}
        >
          <Clock className="h-3 w-3" /> {hoursLeft}h
        </span>
      </div>

      {msg.message_text && (
        <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground bg-background/50 rounded p-2.5">
          {msg.message_text}
        </pre>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {msg.status === "unread" && (
          <ActionBtn
            onClick={() => setStatus("drafted")}
            disabled={updating}
            variant="fuchsia"
            icon={<Sparkles className="h-3 w-3" />}
          >
            Marcar como em rascunho
          </ActionBtn>
        )}
        {msg.status !== "replied" && msg.status !== "archived" && (
          <ActionBtn
            onClick={() => setStatus("replied")}
            disabled={updating}
            variant="emerald"
            icon={<CheckCircle2 className="h-3 w-3" />}
          >
            Marcar como respondida
          </ActionBtn>
        )}
        {msg.status !== "archived" && (
          <ActionBtn
            onClick={() => setStatus("archived")}
            disabled={updating}
            variant="muted"
            icon={<Trash2 className="h-3 w-3" />}
          >
            Arquivar
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// EMBAIXADORES PANEL
// ============================================================================

function EmbaixadoresPanel() {
  const [items, setItems] = useState<Embaixador[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/marketing/embaixadores");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "erro");
      setItems(j.embaixadores);
      setCounts(j.counts);
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground font-mono">
          {Object.entries(counts)
            .map(([k, v]) => `${v} ${k}`)
            .join(" · ") || "—"}
        </span>
        <button
          onClick={() => load()}
          className="ml-auto text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
        <button
          onClick={() => setNewOpen(true)}
          className="text-[11px] inline-flex items-center gap-1 px-2.5 py-1 rounded bg-fuchsia-500 text-white hover:bg-fuchsia-600"
        >
          <Plus className="h-3 w-3" /> Novo embaixador
        </button>
      </div>

      {newOpen && (
        <NewEmbaixadorForm
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false);
            load();
          }}
        />
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8 text-muted-foreground/50" />}
          title="Nenhum embaixador ainda"
          desc='Adicione amigos próximos que podem divulgar — eles recebem Pro grátis por 90d em troca.'
        />
      ) : (
        <div className="space-y-3">
          {items.map((e) => (
            <EmbaixadorCard key={e.id} item={e} onUpdate={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewEmbaixadorForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    nome: "",
    email: "",
    handle_instagram: "",
    curso: "",
    faculdade: "",
    notas: "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/marketing/embaixadores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || "erro");
      }
      toast.success("Embaixador adicionado");
      onCreated();
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Novo embaixador</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormInput
          label="Nome"
          value={form.nome}
          onChange={(v) => setForm({ ...form, nome: v })}
          placeholder="Maria Silva"
        />
        <FormInput
          label="Email"
          value={form.email}
          onChange={(v) => setForm({ ...form, email: v })}
          placeholder="maria@email.com"
        />
        <FormInput
          label="Instagram"
          value={form.handle_instagram}
          onChange={(v) => setForm({ ...form, handle_instagram: v })}
          placeholder="@maria"
        />
        <FormInput
          label="Curso"
          value={form.curso}
          onChange={(v) => setForm({ ...form, curso: v })}
          placeholder="Medicina"
        />
        <FormInput
          label="Faculdade"
          value={form.faculdade}
          onChange={(v) => setForm({ ...form, faculdade: v })}
          placeholder="USP"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
          Notas (privado)
        </label>
        <textarea
          value={form.notas}
          onChange={(e) => setForm({ ...form, notas: e.target.value })}
          rows={2}
          className="mt-1 w-full text-sm bg-background border border-border/60 rounded px-2.5 py-1.5 outline-none focus:border-fuchsia-500 resize-none"
        />
      </div>

      <button
        onClick={save}
        disabled={saving || !form.nome.trim()}
        className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Salvar
      </button>
    </div>
  );
}

function EmbaixadorCard({
  item,
  onUpdate,
}: {
  item: Embaixador;
  onUpdate: () => void;
}) {
  const [updating, setUpdating] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setUpdating(true);
    try {
      const r = await fetch("/api/admin/marketing/embaixadores", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, ...body }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error || "erro");
      }
      onUpdate();
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-sm font-semibold">{item.nome}</span>
        {item.handle_instagram && (
          <span className="text-xs font-mono text-muted-foreground">
            {item.handle_instagram}
          </span>
        )}
        {item.curso && (
          <span className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
            {item.curso}
            {item.faculdade && ` · ${item.faculdade}`}
          </span>
        )}
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wider ${statusClass(
            item.status,
          )}`}
        >
          {item.status}
        </span>
        {item.pro_concedido && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-emerald-500/15 text-emerald-200 inline-flex items-center gap-1">
            <Gift className="h-3 w-3" /> Pro
          </span>
        )}
        <div className="ml-auto text-[10px] font-mono text-muted-foreground">
          {item.divulgacoes_count} div · {item.signups_atribuidos} signups
        </div>
      </div>

      {item.notas && (
        <p className="text-[11px] text-muted-foreground italic">{item.notas}</p>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {item.status === "convidado" && (
          <ActionBtn
            onClick={() => patch({ status: "aceito" })}
            disabled={updating}
            variant="fuchsia"
            icon={<User className="h-3 w-3" />}
          >
            Aceitou
          </ActionBtn>
        )}
        {item.status === "aceito" && (
          <ActionBtn
            onClick={() => patch({ status: "ativo" })}
            disabled={updating}
            variant="emerald"
            icon={<CheckCircle2 className="h-3 w-3" />}
          >
            Primeira divulgação feita
          </ActionBtn>
        )}
        {!item.pro_concedido && item.status !== "convidado" && (
          <ActionBtn
            onClick={() => patch({ pro_concedido: true })}
            disabled={updating}
            variant="emerald"
            icon={<Gift className="h-3 w-3" />}
          >
            Conceder Pro 90d
          </ActionBtn>
        )}
        {item.status === "ativo" && (
          <ActionBtn
            onClick={() =>
              patch({
                divulgacoes_count: item.divulgacoes_count + 1,
                ultima_divulgacao_em: new Date().toISOString(),
              })
            }
            disabled={updating}
            variant="fuchsia"
            icon={<Plus className="h-3 w-3" />}
          >
            +1 divulgação
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// UTILS
// ============================================================================

function SuggestBtn({
  tag,
  label,
  icon,
  activeLoading,
  lastRequested,
  anyLoading,
  onClick,
  primary,
}: {
  tag: string;
  label: string;
  icon?: React.ReactNode;
  activeLoading: boolean;
  lastRequested: string | null;
  anyLoading: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  const wasLast = lastRequested === tag && !anyLoading;

  const baseClass = primary
    ? "bg-fuchsia-500 text-white hover:bg-fuchsia-600 border border-fuchsia-500"
    : wasLast
      ? "bg-fuchsia-500/25 border border-fuchsia-500/60 text-fuchsia-100 ring-1 ring-fuchsia-500/40"
      : "border border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/15";

  return (
    <button
      onClick={onClick}
      disabled={anyLoading}
      className={`text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded transition-colors disabled:opacity-50 ${baseClass}`}
    >
      {activeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      {label}
      {wasLast && !primary && (
        <span className="ml-0.5 text-[9px]">✓</span>
      )}
    </button>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full text-sm bg-background border border-border/60 rounded px-2.5 py-1.5 outline-none focus:border-fuchsia-500"
      />
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  variant = "default",
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "emerald" | "fuchsia" | "muted";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls: Record<string, string> = {
    default:
      "border border-border/60 text-foreground hover:bg-secondary/40",
    emerald:
      "bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25",
    fuchsia:
      "bg-fuchsia-500/15 border border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/25",
    muted:
      "border border-border/60 text-muted-foreground hover:text-foreground",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded transition-colors disabled:opacity-50 ${cls[variant]}`}
    >
      {icon}
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="text-center py-10 border border-dashed border-border/60 rounded-xl">
      <div className="inline-flex items-center justify-center mb-2">{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
        {desc}
      </p>
    </div>
  );
}

function scoreClass(score: number) {
  if (score >= 8) return "bg-emerald-500/15 text-emerald-200";
  if (score >= 6) return "bg-fuchsia-500/15 text-fuchsia-200";
  if (score >= 4) return "bg-amber-500/15 text-amber-200";
  return "bg-neutral-500/15 text-neutral-300";
}

function statusClass(status: string) {
  switch (status) {
    case "pending":
    case "convidado":
    case "unread":
      return "bg-amber-500/15 text-amber-200";
    case "approved":
    case "aceito":
    case "drafted":
      return "bg-sky-500/15 text-sky-200";
    case "sent":
    case "ativo":
    case "replied":
      return "bg-emerald-500/15 text-emerald-200";
    case "rejected":
    case "cancelado":
    case "archived":
    case "expired":
      return "bg-neutral-500/15 text-neutral-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s`;
  if (diff < 3600) return `${Math.round(diff / 60)}min`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}
