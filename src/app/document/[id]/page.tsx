"use client";

/**
 * /document/[id] — Visualização de um Document (PDF/texto uploadado).
 *
 * Mostra metadata, texto extraído, e link pro resumo (se gerado) ou CTA
 * pra gerar um.
 */

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  FolderInput,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/app/auth-guard";
import { AppShell } from "@/components/app/app-shell";
import { BackToHub } from "@/components/app/back-to-hub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentWizard } from "@/components/ai/content-wizard";
import {
  MoveToFolderDialog,
  type MoveTarget,
} from "@/components/documents/move-to-folder-dialog";
import {
  deleteDocumentAsync,
  getDocumentAsync,
} from "@/lib/documents";
import { listSummariesAsync } from "@/lib/summaries";
import { listSubjectsAsync } from "@/lib/db";
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";
import type { Document, Subject, Summary, User } from "@/lib/types";

export default function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGuard>
      {(user) => (
        <AppShell user={user}>
          <DocumentView user={user} documentId={id} />
        </AppShell>
      )}
    </AuthGuard>
  );
}

function DocumentView({
  user,
  documentId,
}: {
  user: User;
  documentId: string;
}) {
  const router = useRouter();
  const [doc, setDoc] = useState<Document | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [d, sums, subs] = await Promise.all([
        getDocumentAsync(user.id, documentId),
        listSummariesAsync(user.id),
        listSubjectsAsync(user.id),
      ]);
      if (!active) return;
      setDoc(d);
      setSubjects(subs);
      const sm =
        sums.find(
          (s) =>
            s.source.kind === "document" && s.source.documentId === documentId,
        ) ?? null;
      setSummary(sm);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user.id, documentId]);

  async function handleAttachPdf(files: FileList | null) {
    if (!files || files.length === 0 || !doc) return;
    const file = files[0];
    if (file.size > LIMITS.PDF_BYTES) {
      toast.error(`Arquivo passa de ${PDF_LIMIT_MB} MB.`);
      return;
    }
    setExtracting(true);
    try {
      const { extractPdfText } = await import("@/lib/pdf-extract");
      const { text, pages } = await extractPdfText(file);

      // Sobe o PDF binário pro Storage pra renderização inline depois.
      const supabase = (await import("@/lib/supabase/client")).createClient();
      let publicUrl: string | undefined;
      const storageKey = `${user.id}/${doc.id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("user-documents")
        .upload(storageKey, file, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) {
        console.warn("[document] storage upload failed", upErr);
      } else {
        const { data: pub } = supabase.storage
          .from("user-documents")
          .getPublicUrl(storageKey);
        publicUrl = pub?.publicUrl;
      }

      const { error } = await supabase
        .from("documents")
        .update({
          source_text: text,
          page_count: pages,
          ...(publicUrl ? { source_url: publicUrl } : {}),
        })
        .eq("id", doc.id);
      if (error) throw error;
      setDoc({
        ...doc,
        sourceText: text,
        pageCount: pages,
        ...(publicUrl ? { sourceUrl: publicUrl } : {}),
      });
      toast.success("PDF salvo. Já pode visualizar e gerar resumo.");

      // Auto-indexa em background pra RAG (Lumi consegue buscar nesse doc)
      const { indexContentInBackground } = await import(
        "@/lib/embeddings-client"
      );
      void indexContentInBackground({
        sourceKind: "document",
        sourceId: doc.id,
        subjectId: doc.subjectId,
        text,
        metadata: { page_count: pages, title: doc.title },
      });
    } catch (err) {
      console.error("[document] pdf extract failed", err);
      toast.error(`Falha ao processar PDF: ${(err as Error).message}`);
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!doc) return;
    const confirmed = window.confirm(
      `Excluir o documento "${doc.title}"?\n\nO resumo gerado a partir dele também será excluído.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteDocumentAsync(user.id, doc.id);
      toast.success("Documento excluído.");
      router.push("/documentos");
    } catch (err) {
      toast.error(`Erro ao excluir: ${(err as Error).message}`);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando documento...
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12 text-center">
        <h1 className="text-2xl font-semibold mb-2">
          Documento não encontrado.
        </h1>
        <Button asChild variant="gradient" className="mt-4">
          <Link href="/documents">
            <ArrowLeft className="h-4 w-4" /> Voltar pra Documentos
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      {/* Voltar pra aba do menu (Meus documentos) */}
      <BackToHub className="mb-4" />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant="secondary"
              className="gap-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 text-[10px] font-mono uppercase tracking-wider"
            >
              <FileText className="h-3 w-3" />
              {doc.sourceKind === "pdf" ? "PDF" : "Texto"}
            </Badge>
            {doc.pageCount && (
              <Badge variant="outline" className="text-[10px]">
                {doc.pageCount} {doc.pageCount === 1 ? "página" : "páginas"}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl heading-display">
            {doc.title}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(doc.sourceText ?? "").trim().length === 0 && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleAttachPdf(e.target.files)}
              />
              <Button
                variant="gradient"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={extracting}
              >
                {extracting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {extracting ? "Extraindo texto..." : "Anexar PDF"}
              </Button>
            </>
          )}
          {(doc.sourceText ?? "").trim().length > 0 &&
            (summary ? (
              <Button asChild variant="gradient" size="sm">
                <Link href={`/resumo/doc/${summary.id}`}>
                  <Sparkles className="h-3.5 w-3.5" /> Abrir resumo
                </Link>
              </Button>
            ) : (
              <Button
                variant="gradient"
                size="sm"
                onClick={() => setWizardOpen(true)}
              >
                <Sparkles className="h-3.5 w-3.5" /> Gerar resumo
              </Button>
            ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMoveOpen(true)}
            className="gap-1.5"
          >
            <FolderInput className="h-3.5 w-3.5" />
            Mover
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="gap-1.5 text-red-600 hover:text-red-700"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Excluir
          </Button>
        </div>
      </div>

      {/* Visualizador do PDF (quando disponível) */}
      {doc.sourceUrl ? (
        <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-card/60">
            <h2 className="text-sm font-semibold tracking-tight inline-flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              PDF
              {doc.pageCount && (
                <span className="text-xs text-muted-foreground font-normal">
                  · {doc.pageCount}{" "}
                  {doc.pageCount === 1 ? "página" : "páginas"}
                </span>
              )}
            </h2>
            <a
              href={doc.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Abrir em nova aba ↗
            </a>
          </div>
          <iframe
            src={doc.sourceUrl}
            title={doc.title}
            className="w-full h-[80vh] bg-secondary/20"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border/70 bg-card p-6">
          <h2 className="text-sm font-semibold tracking-tight mb-3 inline-flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            Texto extraído do PDF
          </h2>
          {doc.sourceText ? (
            <>
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Esse documento foi anexado antes do visualizador de PDF.
                Reanexe o arquivo pra visualizar o PDF original aqui.
              </div>
              <article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/85">
                {doc.sourceText}
              </article>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">
                Este documento ainda não tem PDF anexado.
              </p>
              <p className="text-xs text-muted-foreground/80 max-w-md mx-auto">
                Clique em{" "}
                <span className="font-medium">&ldquo;Anexar PDF&rdquo;</span>{" "}
                acima pra fazer upload e visualizar o arquivo.
              </p>
            </div>
          )}
        </div>
      )}

      <ContentWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        mode="summary"
        userId={user.id}
        initialSubjectId={doc.subjectId}
        onCreated={({ summaryId }) => {
          if (summaryId) router.push(`/resumo/doc/${summaryId}`);
        }}
      />

      {/* Mover este documento entre matérias */}
      <MoveToFolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        userId={user.id}
        subjects={subjects}
        target={
          doc
            ? {
                kind: "document",
                id: doc.id,
                title: doc.title,
                currentSubjectId: doc.subjectId ?? null,
              }
            : null
        }
        onMoved={() => {
          setMoveOpen(false);
          // Reload doc pra refletir o novo subject_id
          void getDocumentAsync(user.id, documentId).then((d) => setDoc(d));
        }}
      />
    </div>
  );
}
