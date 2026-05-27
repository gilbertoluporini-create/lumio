"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
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

type Tab = "publicar" | "outbound" | "inbox" | "embaixadores";

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
  const [tab, setTab] = useState<Tab>("publicar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Crescimento</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Publicar no IG, fazer outbound, gerenciar inbox e embaixadores — tudo num lugar.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-border/60 overflow-x-auto">
        <TabBtn active={tab === "publicar"} onClick={() => setTab("publicar")}>
          <ImageIcon className="h-3.5 w-3.5" /> Publicar IG
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

      {tab === "publicar" && <PublicarPanel />}
      {tab === "outbound" && <OutboundPanel />}
      {tab === "inbox" && <InboxPanel />}
      {tab === "embaixadores" && <EmbaixadoresPanel />}
    </div>
  );
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
