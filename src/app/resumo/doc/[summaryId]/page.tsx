"use client";

/**
 * /resumo/doc/[summaryId] — visualização de resumo de documento (PDF puro).
 *
 * Esqueleto unificado: usa o mesmo LectureHeader + LiveTranscriptColumn da
 * /lecture/[id]. O LiveTranscriptColumn detecta entries=[]+hasAudio=false e
 * automaticamente força modo "summary" + esconde as tabs de transcrição.
 *
 * Phase 2 do esqueleto unificado (apos Phase 1 que cuidou do summary do plano
 * com lecture vinculada via redirect pra /lecture/[id]?tab=summary).
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/app/auth-guard";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { AppShell } from "@/components/app/app-shell";
import {
  LectureHeader,
  type LectureHeaderView,
} from "@/components/lecture/lecture-header";
import { LiveTranscriptColumn } from "@/components/lecture/live-transcript-column";
import { ContentWizard } from "@/components/ai/content-wizard";
import {
  deleteSummaryAsync,
  getSummaryAsync,
  updateSummaryAsync,
} from "@/lib/summaries";
import { getDocumentAsync } from "@/lib/documents";
import { getSubjectAsync } from "@/lib/db";
import type {
  Document as LumioDocument,
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
        onBack={() => router.push("/resumos")}
      />

      <div className="mx-auto max-w-[1600px] px-4 py-5 space-y-5">
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
