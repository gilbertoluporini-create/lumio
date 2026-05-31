"use client";

/**
 * AttachSlidesDialog — dialog do botão "Anexar PDF" da tela /lecture/[id].
 *
 * 2 caminhos:
 *  1. Subir novo PDF do computador (file picker)
 *  2. Escolher da biblioteca /documentos da mesma matéria da aula
 *     (filtra docs com source_url + source_text válido).
 *
 * Em ambos, devolve um `File` pro caller via onFile(file). O caller (page.tsx)
 * já tem o pipeline `handleSlidesFile(file)` que renderiza/extrai slides.
 *
 * Pro caminho 2, baixamos o binário direto do source_url (URL pública do
 * bucket user-documents) e convertemos pra File, reusando o pipeline do
 * upload local sem mudar nada.
 */

import { useEffect, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listDocumentsAsync } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { PDF_LIMIT_MB } from "@/lib/api-security";
import type { Document } from "@/lib/types";

export function AttachSlidesDialog({
  open,
  onOpenChange,
  userId,
  subjectId,
  onFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Matéria da aula — usa pra filtrar documentos da biblioteca. */
  subjectId: string | null | undefined;
  onFile: (file: File) => void;
}) {
  const [tab, setTab] = useState<"upload" | "library">("upload");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [fetchingDoc, setFetchingDoc] = useState<string | null>(null);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setTab("upload");
    setFetchingDoc(null);
  }, [open]);

  // Carrega documentos da matéria quando entra na tab biblioteca
  useEffect(() => {
    if (!open || tab !== "library" || !subjectId) return;
    let cancelled = false;
    setLoadingDocs(true);
    listDocumentsAsync(userId, subjectId)
      .then((docs) => {
        if (!cancelled) setDocuments(docs);
      })
      .finally(() => {
        if (!cancelled) setLoadingDocs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, userId, subjectId]);

  function handleFilePick(file: File) {
    onFile(file);
    onOpenChange(false);
  }

  async function handlePickFromLibrary(doc: Document) {
    if (!doc.sourceUrl) {
      toast.error("PDF sem arquivo salvo — re-suba ele primeiro.");
      return;
    }
    setFetchingDoc(doc.id);
    try {
      const resp = await fetch(doc.sourceUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const fileName = `${doc.title.replace(/\.pdf$/i, "")}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });
      handleFilePick(file);
    } catch (err) {
      toast.error(`Erro ao buscar PDF: ${(err as Error).message}`);
    } finally {
      setFetchingDoc(null);
    }
  }

  // Filtra docs que têm conteúdo utilizável (binário no storage + texto extraído).
  // Docs órfãos (sem source_url) são mostrados disabled pra dar feedback ao user.
  const usableDocs = documents;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Anexar PDF
          </DialogTitle>
          <DialogDescription>
            O PDF vira slides da aula pra IA correlacionar com a transcrição.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-md bg-secondary/40 p-0.5 w-fit">
          <button
            onClick={() => setTab("upload")}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5",
              tab === "upload"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Upload className="h-3 w-3" />
            Subir novo
          </button>
          <button
            onClick={() => setTab("library")}
            disabled={!subjectId}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded transition-colors inline-flex items-center gap-1.5",
              tab === "library"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
              !subjectId && "opacity-50 cursor-not-allowed",
            )}
            title={
              subjectId ? undefined : "Aula sem matéria — só upload novo disponível"
            }
          >
            <FileText className="h-3 w-3" />
            Meus documentos
          </button>
        </div>

        {tab === "upload" ? (
          <label
            htmlFor="lecture-attach-upload"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-card/40 p-6 cursor-pointer hover:border-primary/40 hover:bg-secondary/40 transition-colors"
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">Clica ou arraste o PDF aqui</p>
            <p className="text-[11px] text-muted-foreground">
              Até {PDF_LIMIT_MB} MB
            </p>
            <input
              id="lecture-attach-upload"
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) handleFilePick(f);
              }}
            />
          </label>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto -mx-1 px-1">
            {loadingDocs ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : usableDocs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-card/40 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum PDF nesta matéria. Use &quot;Subir novo&quot; ou abra
                  /documentos pra adicionar.
                </p>
              </div>
            ) : (
              usableDocs.map((d) => {
                const orphan = !d.sourceUrl;
                const fetching = fetchingDoc === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={orphan || fetching}
                    onClick={() => handlePickFromLibrary(d)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      orphan
                        ? "opacity-50 cursor-not-allowed border-border/40 bg-muted/30"
                        : "border-border/60 bg-card hover:border-primary/40",
                    )}
                  >
                    <span className="h-8 w-8 rounded-md bg-sky-500/10 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{d.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {orphan
                          ? "Sem arquivo salvo — re-suba"
                          : d.pageCount
                            ? `${d.pageCount} páginas`
                            : "PDF"}
                      </div>
                    </div>
                    {fetching && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
