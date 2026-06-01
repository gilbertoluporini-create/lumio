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
  ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/app/auth-guard";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { AppShell } from "@/components/app/app-shell";
import { BackToHub } from "@/components/app/back-to-hub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentWizard } from "@/components/ai/content-wizard";
import {
  MoveToFolderDialog,
  type MoveTarget,
} from "@/components/documents/move-to-folder-dialog";
import { PdfImagesGallery } from "@/components/documents/pdf-images-gallery";
import {
  deleteDocumentAsync,
  getDocumentAsync,
} from "@/lib/documents";
import { listSummariesAsync } from "@/lib/summaries";
import { listSubjectsAsync } from "@/lib/db";
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Document, Subject, Summary, User } from "@/lib/types";

type DocTab = "content" | "images";

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
  const [activeTab, setActiveTab] = useState<DocTab>("content");
  const [imagesCount, setImagesCount] = useState<number | null>(null);
  const [imagesTriggered, setImagesTriggered] = useState(false);
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

  // Conta imagens extraídas pra exibir badge e decidir auto-trigger.
  // Usa head:true + count:'exact' pra evitar baixar payload.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    (async () => {
      const { count, error } = await supabase
        .from("pdf_extracted_images")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("user_id", user.id);
      if (!active) return;
      if (error) {
        // Silencia: a galeria mostra erro detalhado quando aberta.
        setImagesCount(0);
        return;
      }
      setImagesCount(count ?? 0);
    })();
    return () => {
      active = false;
    };
  }, [user.id, documentId]);

  // Quando a aba "Imagens" é aberta e ainda não há imagens, dispara o
  // endpoint de extração em background (fire-and-forget). O endpoint pode
  // não existir ainda — Wave 2 paralela. Em qualquer falha, silenciar.
  useEffect(() => {
    if (activeTab !== "images") return;
    if (imagesTriggered) return;
    if (imagesCount === null) return; // aguardando count inicial
    if (imagesCount > 0) return; // já tem imagens
    if (!doc?.sourceUrl) return; // sem PDF anexado, nada pra extrair
    setImagesTriggered(true);
    void fetch(`/api/documents/${documentId}/extract-images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    }).catch(() => {
      // silencioso: a galeria já mostra "Nenhuma imagem ainda"
    });
  }, [activeTab, imagesTriggered, imagesCount, doc?.sourceUrl, documentId]);

  // Polling leve: enquanto a aba Imagens estiver ativa e sem imagens,
  // refaz o count a cada 30s, até 10 tentativas (5 min). Para assim que
  // aparecer 1+ imagem.
  useEffect(() => {
    if (activeTab !== "images") return;
    if (imagesCount === null) return;
    if (imagesCount > 0) return;
    const supabase = createClient();
    let attempts = 0;
    const maxAttempts = 10;
    const interval = window.setInterval(async () => {
      attempts += 1;
      const { count } = await supabase
        .from("pdf_extracted_images")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .eq("user_id", user.id);
      const next = count ?? 0;
      if (next > 0) {
        setImagesCount(next);
        window.clearInterval(interval);
        return;
      }
      if (attempts >= maxAttempts) {
        window.clearInterval(interval);
      }
    }, 30_000);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeTab, imagesCount, documentId, user.id]);

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
        // Bucket privado: signed URL com TTL 7d pra persistir em source_url.
        const { data: signed, error: signedErr } = await supabase.storage
          .from("user-documents")
          .createSignedUrl(storageKey, 60 * 60 * 24 * 7);
        if (signedErr) {
          console.warn("[document] createSignedUrl failed", signedErr);
        } else {
          publicUrl = signed?.signedUrl;
        }
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
    const confirmed = await confirmAction({
      title: `Excluir o documento "${doc.title}"?`,
      description: "O resumo gerado a partir dele também será excluído.",
      destructive: true,
      confirmText: "Excluir documento",
    });
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
          {/*
            Botão de anexar / reanexar PDF binário.
            Aparece sempre que faltar source_url no doc — seja porque nunca
            foi anexado (sem source_text) OU porque é um órfão pré-migration
            030 (com source_text mas sem URL no storage). Reusa o mesmo
            handleAttachPdf que faz upsert no storage e atualiza a row.
          */}
          {!doc.sourceUrl && (
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
                {extracting
                  ? "Extraindo texto..."
                  : (doc.sourceText ?? "").trim().length > 0
                    ? "Reanexar arquivo"
                    : "Anexar PDF"}
              </Button>
            </>
          )}
          {/* "Gerar resumo" só pra docs do user (PDF/texto) — não pra
              routine_pdf (que JÁ É um asset gerado pela Lumio). */}
          {doc.sourceKind !== "routine_pdf" &&
            (doc.sourceText ?? "").trim().length > 0 &&
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

      {/* Tabs: Conteúdo (default) | Imagens (galeria de imagens extraídas).
          Pra routine_pdf, só Conteúdo — não faz sentido extrair imagens de
          asset gerado pela própria Lumio. */}
      <div
        role="tablist"
        aria-label="Seções do documento"
        className="mb-5 inline-flex flex-wrap items-center gap-1.5"
      >
        {(
          doc.sourceKind === "routine_pdf"
            ? ([{ id: "content", label: "Conteúdo", icon: FileText }] as const)
            : ([
                { id: "content", label: "Conteúdo", icon: FileText },
                { id: "images", label: "Imagens", icon: ImageIcon },
              ] as const)
        ).map((t) => {
          const isActive = activeTab === t.id;
          const Icon = t.icon;
          const showCount = t.id === "images" && imagesCount !== null && imagesCount > 0;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`doc-panel-${t.id}`}
              id={`doc-tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {showCount && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-mono tabular-nums",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary/60 text-muted-foreground",
                  )}
                >
                  {imagesCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Painel "Imagens" — galeria de imagens extraídas do PDF (Wave 2 Atlas) */}
      {activeTab === "images" && (
        <section
          role="tabpanel"
          id="doc-panel-images"
          aria-labelledby="doc-tab-images"
        >
          {!doc.sourceUrl && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Anexe o PDF acima pra que a gente consiga extrair as imagens.
            </div>
          )}
          {doc.sourceUrl && imagesCount === 0 && imagesTriggered && (
            <div className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs text-sky-700 dark:text-sky-300 inline-flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processando imagens em background — isso pode levar alguns minutos.
            </div>
          )}
          <PdfImagesGallery documentId={documentId} userId={user.id} />
        </section>
      )}

      {/* Painel "Conteúdo" — visualizador do PDF / texto extraído */}
      {activeTab === "content" && (
      <section
        role="tabpanel"
        id="doc-panel-content"
        aria-labelledby="doc-tab-content"
      >
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
      </section>
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
