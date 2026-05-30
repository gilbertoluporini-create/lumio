"use client";

/**
 * /resumo/doc/[summaryId] — Visualização rica de resumo de Document.
 *
 * Layout 2 colunas:
 *  - Main (flex-1): conteúdo do resumo com markdown render
 *  - Sidebar (320px sticky): resumo rápido + ações rápidas + link pro documento
 *
 * Replica o visual da página /resumo/[lectureId] adaptado para origem = Document
 * (sem TTS, sem related lectures, sem "abrir aula original").
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  MoreVertical,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { AuthGuard } from "@/components/app/auth-guard";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { AppShell } from "@/components/app/app-shell";
import { BackToHub } from "@/components/app/back-to-hub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContentWizard } from "@/components/ai/content-wizard";
import {
  deleteSummaryAsync,
  getSummaryAsync,
} from "@/lib/summaries";
import { getDocumentAsync } from "@/lib/documents";
import { getSubjectAsync } from "@/lib/db";
import { getSubjectIcon } from "@/lib/subject-icon";
import {
  subscribeFavorites,
  toggleFavorite as toggleFavoriteLib,
} from "@/lib/favorites";
import { cn, stripMarkdownToPlainText } from "@/lib/utils";
import type {
  Document as LumioDocument,
  Subject,
  Summary,
  User,
} from "@/lib/types";

function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ResumoDocPage({
  params,
}: {
  params: Promise<{ summaryId: string }>;
}) {
  const { summaryId } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <ResumoDocView user={user} summaryId={summaryId} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function ResumoDocView({
  user,
  summaryId,
}: {
  user: User;
  summaryId: string;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [doc, setDoc] = useState<LumioDocument | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [readingPct, setReadingPct] = useState(0);

  // Restaura preferência de collapse da sidebar
  useEffect(() => {
    try {
      const stored = localStorage.getItem("lumio:summary-sidebar-collapsed");
      if (stored === "1") setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Progress de leitura — calcula % de scroll dentro do main
  useEffect(() => {
    function onScroll() {
      const el = contentRef.current;
      if (!el) return;
      const winH = window.innerHeight;
      const rect = el.getBoundingClientRect();
      const totalScrollable = rect.height - winH + 200;
      if (totalScrollable <= 0) {
        setReadingPct(100);
        return;
      }
      const scrolled = Math.max(0, -rect.top + 200);
      const pct = Math.min(100, Math.max(0, (scrolled / totalScrollable) * 100));
      setReadingPct(Math.round(pct));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [summary]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(
          "lumio:summary-sidebar-collapsed",
          next ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const sm = await getSummaryAsync(user.id, summaryId);
      if (!active) return;
      if (!sm) {
        // Não mostra fallback "Resumo não encontrado" — só atrapalha UX.
        // Quem chega aqui veio de link antigo / acabou de deletar / acesso
        // negado. Em todos os casos /resumos é o destino correto.
        toast.info("Esse resumo não existe mais.");
        router.replace("/resumos");
        return;
      }
      setSummary(sm);
      const [d, sj] = await Promise.all([
        sm.source.kind === "document"
          ? getDocumentAsync(user.id, sm.source.documentId)
          : null,
        sm.subjectId ? getSubjectAsync(user.id, sm.subjectId) : null,
      ]);
      if (!active) return;
      setDoc(d);
      setSubject(sj);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user.id, summaryId]);

  useEffect(() => {
    return subscribeFavorites(user.id, (entries) => {
      setIsFavorite(
        entries.some((f) => f.kind === "summary" && f.id === summaryId),
      );
    });
  }, [user.id, summaryId]);

  const handleToggleFavorite = () => {
    const now = toggleFavoriteLib(user.id, "summary", summaryId);
    toast.success(now ? "Adicionado aos favoritos" : "Removido dos favoritos");
  };

  async function handleDelete() {
    if (!summary) return;
    const confirmed = await confirmAction({
      title: `Excluir o resumo "${summary.title}"?`,
      description: "O documento original será mantido.",
      destructive: true,
      confirmText: "Excluir resumo",
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteSummaryAsync(user.id, summary.id);
      toast.success("Resumo excluído.");
      router.push("/resumos");
    } catch (err) {
      toast.error(`Erro ao excluir: ${(err as Error).message}`);
      setDeleting(false);
    }
  }

  const SubjectIcon = subject ? getSubjectIcon(subject.name) : FileText;

  const cleanGeneral = useMemo(
    () => stripMarkdownToPlainText(summary?.content.generalSummary ?? ""),
    [summary],
  );
  const quickSnippet =
    cleanGeneral.length > 220
      ? cleanGeneral.slice(0, 200).trim() + "…"
      : cleanGeneral;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 text-center">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <h1 className="mt-4 text-xl font-semibold">Resumo não encontrado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pode ter sido excluído ou você não tem acesso.
        </p>
        <Button asChild variant="gradient" className="mt-6">
          <Link href="/resumos">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
      </div>
    );
  }

  const content = summary.content;
  const dateLabel = formatDateBR(new Date(summary.updatedAt));
  const tags = (content.highlights?.slice(0, 4) ?? []).map(
    stripMarkdownToPlainText,
  );

  return (
    <>
      {/* Barra de progresso fixa no topo — sempre visível durante scroll */}
      <div
        className="fixed top-[60px] left-0 right-0 z-30 h-1 bg-secondary/40 pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="h-full bg-gradient-to-r from-primary via-fuchsia-500 to-primary transition-all duration-150"
          style={{ width: `${readingPct}%` }}
        />
      </div>
    <div className="mx-auto max-w-[1600px] px-4 md:px-6 lg:px-8 py-6 md:py-8">
      {/* Voltar pra aba do menu */}
      <BackToHub className="mb-3" />

      {/* Breadcrumb */}
      <nav className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <Link href="/resumos" className="hover:text-foreground transition-colors">
          Biblioteca de resumos
        </Link>
        <ChevronRight className="h-3 w-3" />
        {subject ? (
          <Link
            href={`/resumos?subject=${subject.id}`}
            className="hover:text-foreground transition-colors"
          >
            {subject.name}
          </Link>
        ) : (
          <span>—</span>
        )}
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge
              variant="secondary"
              className="gap-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 text-[10px] font-mono uppercase tracking-wider"
            >
              <FileText className="h-3 w-3" />
              De documento
            </Badge>
            {doc?.pageCount && (
              <Badge variant="outline" className="text-[10px]">
                {doc.pageCount} {doc.pageCount === 1 ? "página" : "páginas"}
              </Badge>
            )}
          </div>

          <div className="flex items-start gap-2">
            <h1 className="text-2xl md:text-3xl heading-display">
              {summary.title}
            </h1>
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={cn(
                "shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md transition-colors mt-1",
                isFavorite
                  ? "text-amber-500 hover:bg-amber-500/10"
                  : "text-muted-foreground/60 hover:text-amber-500 hover:bg-amber-500/10",
              )}
              aria-label={isFavorite ? "Remover favorito" : "Favoritar"}
              aria-pressed={isFavorite}
            >
              <Star
                className={cn("h-5 w-5", isFavorite && "fill-amber-500")}
              />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {subject && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 dark:bg-primary/15 px-2.5 py-1 text-primary font-medium">
                <SubjectIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
                {subject.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Clock className="h-3 w-3" /> {dateLabel}
            </span>
            {doc && (
              <span className="inline-flex items-center gap-1 truncate max-w-[260px]">
                a partir de{" "}
                <span className="font-medium text-foreground/85 truncate">
                  {doc.title}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled>
          <Download className="h-3.5 w-3.5" /> Exportar PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handleToggleFavorite}>
          <Star
            className={cn(
              "h-3.5 w-3.5",
              isFavorite && "fill-amber-500 text-amber-500",
            )}
          />
          {isFavorite ? "Favoritado" : "Favoritar"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mais ações">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setWizardOpen(true)}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-gerar resumo
            </DropdownMenuItem>
            {doc && (
              <DropdownMenuItem asChild>
                <Link href={`/document/${doc.id}`}>
                  <FileText className="h-3.5 w-3.5" /> Abrir documento original
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 focus:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir resumo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grid 2-col — sidebar collapsable */}
      <div
        className={`grid grid-cols-1 gap-8 ${
          sidebarCollapsed
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[minmax(0,1fr)_320px]"
        }`}
      >
        {/* CENTER */}
        <main ref={contentRef} className="min-w-0 space-y-6">
          {/* Resumo geral */}
          <div className="rounded-xl border border-border/70 bg-gradient-to-br from-primary/5 via-card to-fuchsia-500/5 p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 shadow">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <h2 className="text-base font-semibold tracking-tight">
                Visão geral
              </h2>
            </div>
            <article className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content.generalSummary || "Sem texto gerado."}
              </ReactMarkdown>
            </article>
          </div>

          {/* Highlights */}
          {content.highlights && content.highlights.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-card p-6">
              <h3 className="text-sm font-semibold tracking-tight mb-3">
                Pontos-chave
              </h3>
              <ul className="space-y-2">
                {content.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span className="text-foreground/85">
                      {stripMarkdownToPlainText(h)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Sections */}
          {content.sections && content.sections.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold tracking-tight">Seções</h3>
              {content.sections.map((sec, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border/70 bg-card p-5"
                >
                  {(sec.slideTitle || sec.slideNumber) && (
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      {sec.slideNumber ? `Seção ${sec.slideNumber}` : ""}
                      {sec.slideTitle ? ` · ${sec.slideTitle}` : ""}
                    </p>
                  )}
                  <article className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {sec.spokenContent}
                    </ReactMarkdown>
                  </article>
                  {sec.relatedQA && sec.relatedQA.length > 0 && (
                    <>
                      <Separator className="my-3" />
                      <div className="space-y-2">
                        {sec.relatedQA.map((qa, j) => (
                          <div key={j} className="text-xs">
                            <p className="font-medium text-foreground/85">
                              P: {qa.question}
                            </p>
                            <p className="text-muted-foreground mt-0.5">
                              R: {qa.answer}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>

        {/* SIDEBAR — esconde quando collapsed */}
        <aside
          className={`space-y-4 lg:sticky lg:top-[80px] lg:self-start ${
            sidebarCollapsed ? "hidden" : ""
          }`}
        >
          {/* Toggle de collapse */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              title="Recolher painel lateral"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
              Recolher
            </button>
          </div>
          {/* Resumo rápido */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-fuchsia-500/8 p-4">
            <div className="text-[11px] uppercase tracking-wider text-primary/90 font-medium mb-2 inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Resumo rápido
            </div>
            <p className="text-xs leading-relaxed text-foreground/85 line-clamp-5">
              {quickSnippet || "Sem prévia disponível."}
            </p>
          </div>

          {/* Documento original */}
          {doc && (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="text-sm font-semibold mb-2">Documento original</div>
              <Link
                href={`/document/${doc.id}`}
                className="group flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 hover:border-primary/40 transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-sky-500/10 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate group-hover:text-primary">
                    {doc.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    PDF
                    {doc.pageCount
                      ? ` · ${doc.pageCount} ${doc.pageCount === 1 ? "página" : "páginas"}`
                      : ""}
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </Link>
            </div>
          )}

          {/* Tags (highlights) */}
          {tags.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="text-sm font-semibold mb-3">Conceitos-chave</div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="text-[10px] border-border/60 bg-background/60 max-w-full"
                  >
                    <span className="truncate">{t}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Botão flutuante pra reabrir sidebar quando collapsed (desktop only) */}
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden lg:inline-flex fixed right-4 top-1/2 -translate-y-1/2 z-40 items-center gap-2 rounded-full border border-border/60 bg-card/95 backdrop-blur px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 shadow-lg transition-all"
          title="Mostrar painel lateral"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Painel
        </button>
      )}

      <ContentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        mode="summary"
        userId={user.id}
        onCreated={({ summaryId: newId }) => {
          if (newId) router.push(`/resumo/doc/${newId}`);
        }}
      />
    </div>
    </>
  );
}
