"use client";

/**
 * /resumo/doc/[summaryId] — visualização de resumo de documento (PDF puro).
 *
 * Esqueleto unificado: usa o mesmo LectureHeader + LiveTranscriptColumn da
 * /lecture/[id]. O LiveTranscriptColumn detecta entries=[]+hasAudio=false e
 * automaticamente força modo "summary" + esconde as tabs de transcrição.
 *
 * Phase 3 (esta versão): ganha 2 features que existem em /lecture/[id]:
 *  1. PDF viewer lateral (SlidesColumn) renderizando o PDF original do `doc`
 *     pra o user ler o resumo enquanto consulta as páginas.
 *  2. Chat Lumi embutido (LumiChatPanel) pra perguntar sobre o resumo.
 *
 * Layout desktop (md+): grid de até 3 colunas — [summary | slides? | chat?].
 * Mobile (<md): empilhado, sem painéis laterais. Slides e chat ficam ocultos
 * por toggles separados (botões na toolbar acima do conteúdo).
 */

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, FileText, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/app/auth-guard";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { AppShell } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import {
  LectureHeader,
  type LectureHeaderView,
} from "@/components/lecture/lecture-header";
import { LiveTranscriptColumn } from "@/components/lecture/live-transcript-column";
import { SlidesColumn } from "@/components/lecture/slides-column";
import { LumiChatPanel } from "@/components/lumi/lumi-chat-panel";
import { ContentWizard } from "@/components/ai/content-wizard";
import {
  deleteSummaryAsync,
  getSummaryAsync,
  updateSummaryAsync,
} from "@/lib/summaries";
import { getDocumentAsync } from "@/lib/documents";
import { getSubjectAsync } from "@/lib/db";
import { renderPdfToImages } from "@/lib/pdf-render";
import type {
  Document as LumioDocument,
  Slide,
  Subject,
  Summary,
  TranscriptMarker,
  User,
} from "@/lib/types";

type MarkerFilter = TranscriptMarker | "all";

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
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [doc, setDoc] = useState<LumioDocument | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Header view state. Inicia em "summary" porque a aba relevante aqui é só
  // resumo. LiveTranscriptColumn esconde tabs de transcrição automaticamente
  // (entries=[] + hasAudio=false).
  const [view, setView] = useState<LectureHeaderView>("summary");

  // Props que o LiveTranscriptColumn exige mas que aqui não fazem nada útil.
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<MarkerFilter>("all");

  // ===== PDF viewer state =====
  const [slides, setSlides] = useState<Slide[] | undefined>(undefined);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [renderingPdf, setRenderingPdf] = useState(false);
  // Default: mostra PDF ao lado em desktop quando há PDF disponível. Toggle
  // permite esconder pra ganhar largura no resumo.
  const [showPdfBesides, setShowPdfBesides] = useState(true);

  // ===== Chat state =====
  // Default: chat fechado. User abre quando quer perguntar. Evita poluir a
  // tela de leitura passiva.
  const [showChat, setShowChat] = useState(false);

  // `?from=<rota>` define pra onde Voltar leva — espelhando /lecture/[id].
  // Valores aceitos: "resumos" (default), "planos/<planId>", "documentos".
  const fromParam = searchParams.get("from");
  const backHref =
    fromParam && fromParam.startsWith("planos/")
      ? `/${fromParam}`
      : fromParam === "documentos"
        ? "/documentos"
        : "/resumos";

  useEffect(() => {
    let active = true;
    (async () => {
      const sm = await getSummaryAsync(user.id, summaryId);
      if (!active) return;
      if (!sm) {
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
  }, [user.id, summaryId, router]);

  // ===== Renderiza PDF do doc em slides assim que o doc carrega =====
  // Decisão: SlidesColumn espera `Slide[]` com `imageDataUrl`. Como o doc
  // só tem `sourceUrl` (PDF no Storage), fetchamos o arquivo e rodamos
  // renderPdfToImages (mesma função usada em /lecture pra extrair slides).
  // Acontece em background — se falhar, o painel some silenciosamente
  // (usuário fica só com o resumo + chat).
  useEffect(() => {
    if (!doc?.sourceUrl || doc.sourceKind !== "pdf") return;
    let active = true;
    setRenderingPdf(true);
    (async () => {
      try {
        const res = await fetch(doc.sourceUrl as string);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], doc.title || "document.pdf", {
          type: "application/pdf",
        });
        const rendered = await renderPdfToImages(file);
        if (!active) return;
        const asSlides: Slide[] = rendered.map((r) => ({
          pageNumber: r.pageNumber,
          imageDataUrl: r.imageDataUrl,
          text: "",
        }));
        setSlides(asSlides);
      } catch (err) {
        console.warn("[resumo/doc] render pdf failed", err);
        if (active) setSlides(undefined);
      } finally {
        if (active) setRenderingPdf(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [doc?.sourceUrl, doc?.sourceKind, doc?.title]);

  async function handleRename(nextTitle: string) {
    if (!summary || nextTitle === summary.title) return;
    try {
      const updated = await updateSummaryAsync(user.id, summary.id, {
        title: nextTitle,
      });
      if (updated) {
        setSummary(updated);
        toast.success("Título atualizado.");
      }
    } catch (err) {
      toast.error(`Erro ao renomear: ${(err as Error).message}`);
    }
  }

  function handleShare() {
    if (typeof window === "undefined") return;
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success("Link copiado."))
      .catch(() => toast.error("Não consegui copiar o link."));
  }

  function handleExportPdf() {
    // Placeholder — export PDF ainda não implementado pra resumo-doc canônico.
    // Mantém paridade com versão anterior (que tinha botão `disabled`).
    toast.info("Export PDF em breve nessa tela.");
  }

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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary) return null;

  const hasPdf = !!doc?.sourceUrl && doc.sourceKind === "pdf";
  const showSlidesColumn = hasPdf && showPdfBesides;
  // Grid columns. Só ativa colunas extras no md+ pra preservar mobile sem
  // scroll horizontal — mobile vê só o resumo (toggles ficam disabled).
  const gridCols =
    showSlidesColumn && showChat
      ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_360px]"
      : showSlidesColumn
        ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
        : showChat
          ? "md:grid-cols-[minmax(0,1fr)_360px]"
          : "md:grid-cols-1";

  return (
    <>
      <LectureHeader
        title={summary.title}
        subjectName={subject?.name}
        subjectColor={subject?.color}
        isLive={false}
        durationSec={0}
        view={view}
        hasSummary={true}
        generatingSummary={false}
        onTitleChange={handleRename}
        onToggleRecording={() => {
          // Não há gravação nessa rota (resumo de PDF puro). Botão "Iniciar
          // gravação" do header fica visível por consistência, mas no-op aqui.
          toast.info("Essa tela é só de leitura. Pra gravar aula, vá em Gravações.");
        }}
        onChangeView={(v) => setView(v)}
        onSave={() => {
          // Nada pra salvar — não há transcrição. No-op.
        }}
        onShare={handleShare}
        onExportPdf={handleExportPdf}
        onDelete={handleDelete}
        onBack={() => router.push(backHref)}
      />

      <div className="mx-auto max-w-[1600px] px-4 py-5 space-y-5">
        {/* Toolbar de toggles — só desktop. Mobile fica no resumo simples. */}
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          {hasPdf && (
            <Button
              type="button"
              variant={showPdfBesides ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPdfBesides((v) => !v)}
              className="gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              {showPdfBesides ? "Esconder PDF" : "Mostrar PDF ao lado"}
              {renderingPdf && (
                <Loader2 className="h-3 w-3 animate-spin opacity-60" />
              )}
            </Button>
          )}
          <Button
            type="button"
            variant={showChat ? "default" : "outline"}
            size="sm"
            onClick={() => setShowChat((v) => !v)}
            className="gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {showChat ? "Esconder chat" : "Perguntar ao Lumi"}
          </Button>
          {hasPdf && renderingPdf && !slides && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Carregando PDF original…
            </span>
          )}
        </div>

        <div className={`grid gap-6 grid-cols-1 ${gridCols}`}>
          <LiveTranscriptColumn
            entries={[]}
            interim=""
            isLive={false}
            keyTerms={summary.content.highlights?.slice(0, 8) ?? []}
            topics={[]}
            hasAudio={false}
            search={search}
            activeFilter={activeFilter}
            summary={summary.content}
            generatingSummary={false}
            onGenerateSummary={() => setWizardOpen(true)}
            summaryImages={summary.images}
            onSearchChange={setSearch}
            onFilterChange={setActiveFilter}
            initialViewMode="summary"
          />

          {showSlidesColumn && (
            <div className="hidden md:block min-w-0 md:sticky md:top-4 md:self-start">
              <SlidesColumn
                slides={slides}
                attaching={renderingPdf}
                showPdfBesides={showPdfBesides}
                onTogglePdfBesides={setShowPdfBesides}
                currentIdx={currentSlideIdx}
                onSelect={setCurrentSlideIdx}
                // No-ops aqui — o PDF vem do doc, user não anexa nem remove
                // por essa tela (gerencia em /document/[id]).
                onAttachClick={() => {
                  toast.info("Pra trocar o PDF, edite o documento original.");
                }}
                onRemove={() => {
                  toast.info("Pra remover, exclua o documento em /documentos.");
                }}
              />
            </div>
          )}

          {showChat && (
            <div className="hidden md:block min-w-0 md:sticky md:top-4 md:self-start">
              {/* Como esse resumo é de Document (não Lecture), passamos
                  summaryId direto — o endpoint /api/ai/chat-summary aceita
                  EITHER lectureId OR summaryId e monta o mesmo contexto
                  (generalSummary + highlights + sections) buscando direto
                  na tabela summaries. Assim o Lumi conhece o resumo em vez
                  de cair em modo free. */}
              <LumiChatPanel
                lectureId=""
                summaryId={summary.id}
                variant="summary"
                contextLabel={summary.title}
                placeholder="Pergunte sobre este resumo… (Enter envia)"
                historyHeight={420}
              />
            </div>
          )}
        </div>
      </div>

      <ContentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        mode="summary"
        userId={user.id}
        onCreated={({ summaryId: newId }) => {
          if (newId && newId !== summaryId) {
            router.push(`/resumo/doc/${newId}`);
          }
        }}
      />

      {/* Marker de loading no delete pra evitar duplo clique enquanto navega */}
      {deleting && (
        <div className="fixed inset-0 bg-background/40 backdrop-blur-sm flex items-center justify-center z-50">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}
