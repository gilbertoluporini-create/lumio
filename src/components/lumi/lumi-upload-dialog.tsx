"use client";

/**
 * Dialog de upload INVOCADO pelo /lumi — multi-file, subject pré-travada
 * (o Lumi já decidiu qual matéria via tool solicitar_upload). Reusa as
 * helpers de documents/storage do UploadDocumentDialog mas com UX mais
 * direta: drop zone → lista de arquivos → 1 click "Subir N".
 *
 * onUploaded recebe títulos dos docs criados pra o /lumi page enviar uma
 * mensagem automática pro Lumi tipo "subi X, Y e Z em <materia>".
 */

import { useEffect, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
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
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";
import { suggestTitleFromFileName } from "@/lib/document-title";
import { createDocumentAsync } from "@/lib/documents";

export function LumiUploadDialog({
  open,
  onOpenChange,
  userId,
  subjectId,
  subjectName,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  subjectId: string;
  subjectName: string;
  onUploaded?: (info: { count: number; titles: string[] }) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setUploading(false);
    }
  }, [open]);

  function handleAdd(list: FileList | null) {
    if (!list || list.length === 0) return;
    const acc: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > LIMITS.PDF_BYTES) {
        toast.error(`"${f.name}" passa de ${PDF_LIMIT_MB} MB.`);
        continue;
      }
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (!isPdf) {
        toast.error(`"${f.name}" não é PDF (só PDFs por enquanto).`);
        continue;
      }
      acc.push(f);
    }
    if (acc.length === 0) return;
    setFiles((prev) => [...prev, ...acc]);
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function uploadOne(
    file: File,
  ): Promise<{ id: string; title: string } | null> {
    const finalTitle = suggestTitleFromFileName(file.name);
    const doc = await createDocumentAsync({
      userId,
      subjectId,
      folderId: null,
      title: finalTitle,
      sourceKind: "pdf",
    });
    if (!doc) {
      toast.error(`Falha ao criar doc pra "${file.name}".`);
      return null;
    }
    let sourceUrl: string | null = null;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const storageKey = `${userId}/${doc.id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("user-documents")
        .upload(storageKey, file, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("user-documents")
        .getPublicUrl(storageKey);
      sourceUrl = pub?.publicUrl ?? null;
      if (sourceUrl) {
        await supabase
          .from("documents")
          .update({ source_url: sourceUrl })
          .eq("id", doc.id)
          .eq("user_id", userId);
      }
    } catch (err) {
      console.warn("[lumi-upload] storage", err);
    }
    try {
      const { extractPdfText, extractPdfTextFromUrl } = await import(
        "@/lib/pdf-extract"
      );
      const { text, pages } = sourceUrl
        ? await extractPdfTextFromUrl(sourceUrl)
        : await extractPdfText(file);
      if (text) {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        await supabase
          .from("documents")
          .update({ source_text: text, page_count: pages ?? null })
          .eq("id", doc.id)
          .eq("user_id", userId);
      }
    } catch (err) {
      console.warn("[lumi-upload] extract", err);
    }
    fetch(`/api/documents/${doc.id}/extract-images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      keepalive: true,
    }).catch((err) => console.warn("[lumi-upload] atlas", err));
    return { id: doc.id, title: finalTitle };
  }

  async function handleUploadAll() {
    if (files.length === 0) return;
    setUploading(true);
    const titles: string[] = [];
    let okCount = 0;
    for (const f of files) {
      const r = await uploadOne(f);
      if (r) {
        titles.push(r.title);
        okCount++;
      }
    }
    setUploading(false);
    if (okCount > 0) {
      onUploaded?.({ count: okCount, titles });
      toast.success(
        `${okCount} documento${okCount > 1 ? "s" : ""} adicionado${okCount > 1 ? "s" : ""}.`,
      );
      onOpenChange(false);
    } else {
      toast.error("Nenhum arquivo foi adicionado.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !uploading && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Subir arquivos em {subjectName}
          </DialogTitle>
          <DialogDescription>
            PDFs vão direto pra matéria — pode subir vários de uma vez.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-3 min-h-0">
          <label
            htmlFor="lumi-upload-files"
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-card/40 p-6 cursor-pointer hover:border-primary/40 hover:bg-secondary/40 transition-colors"
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Clica pra escolher ou arraste PDFs aqui
            </p>
            <p className="text-[11px] text-muted-foreground/70">
              Até {PDF_LIMIT_MB} MB por arquivo — pode selecionar vários
            </p>
            <input
              id="lumi-upload-files"
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAdd(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-2.5"
                >
                  <FileText className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {(f.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remover arquivo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border/40 px-6 pb-6 pt-3">
          <Button
            variant="ghost"
            disabled={uploading}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            variant="gradient"
            disabled={files.length === 0 || uploading}
            onClick={handleUploadAll}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Subindo{" "}
                {files.length}…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Subir{" "}
                {files.length > 0 ? files.length : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
