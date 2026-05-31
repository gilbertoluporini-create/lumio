"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  Loader2,
  Upload,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocumentAsync } from "@/lib/documents";
import { listFoldersBySubjectAsync } from "@/lib/folders";
import { getSubjectIcon } from "@/lib/subject-icon";
import { cn } from "@/lib/utils";
import { LIMITS, PDF_LIMIT_MB } from "@/lib/api-security";
import { suggestTitleFromFileName } from "@/lib/document-title";
import type { Folder, Subject } from "@/lib/types";

/**
 * Achata pastas em lista plana com profundidade pra render hierárquico.
 */
function flattenWithDepth(folders: Folder[]): Array<Folder & { depth: number }> {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parentFolderId ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(f);
    byParent.set(key, arr);
  }
  for (const [, arr] of byParent) {
    arr.sort((a, b) =>
      a.position !== b.position
        ? a.position - b.position
        : a.name.localeCompare(b.name, "pt-BR"),
    );
  }
  const out: Array<Folder & { depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    for (const f of byParent.get(parentId) ?? []) {
      out.push({ ...f, depth });
      walk(f.id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  userId,
  subjects,
  /** Pré-seleciona uma matéria (ex.: aberto a partir de /subject/[id]). */
  defaultSubjectId,
  /** Pré-seleciona uma pasta (só faz sentido com defaultSubjectId). */
  defaultFolderId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjects: Subject[];
  defaultSubjectId?: string | null;
  defaultFolderId?: string | null;
  onUploaded?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  // null = "Sem matéria" (fica na biblioteca global). undefined = ainda não escolhido.
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Reset ao abrir, aplicando defaults se fornecidos.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTitle("");
    setSubjectId(defaultSubjectId ?? null);
    setFolderId(defaultFolderId ?? null);
    setFolders([]);
  }, [open, defaultSubjectId, defaultFolderId]);

  // Carrega pastas da matéria escolhida.
  useEffect(() => {
    if (!open || !subjectId) {
      setFolders([]);
      return;
    }
    let cancelled = false;
    setLoadingFolders(true);
    listFoldersBySubjectAsync(userId, subjectId)
      .then((fld) => {
        if (!cancelled) setFolders(fld);
      })
      .finally(() => {
        if (!cancelled) setLoadingFolders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, subjectId, open]);

  const flatFolders = useMemo(() => flattenWithDepth(folders), [folders]);

  function handlePick(f: File) {
    if (f.size > LIMITS.PDF_BYTES) {
      toast.error(`"${f.name}" passa de ${PDF_LIMIT_MB} MB.`);
      return;
    }
    const isPdf =
      f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!isPdf) {
      toast.error("Por enquanto só PDFs. Áudio externo: use 'Nova aula' → subir áudio.");
      return;
    }
    setFile(f);
    if (!title.trim()) {
      setTitle(suggestTitleFromFileName(f.name));
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      // 1) Extrai texto (pra que IA depois consiga usar como contexto).
      const { extractPdfText } = await import("@/lib/pdf-extract");
      let sourceText = "";
      let pageCount: number | undefined;
      try {
        const { text, pages } = await extractPdfText(file);
        sourceText = text ?? "";
        pageCount = pages;
      } catch (err) {
        console.warn("[upload-doc] pdf text extract failed", err);
        // Segue mesmo sem texto — o arquivo binário ainda fica salvo.
      }

      // 2) Cria document row.
      const doc = await createDocumentAsync({
        userId,
        subjectId: subjectId ?? null,
        folderId: subjectId ? folderId : null, // folder só faz sentido com subject
        title: title.trim() || suggestTitleFromFileName(file.name),
        sourceKind: "pdf",
        sourceText: sourceText || undefined,
        pageCount,
      });
      if (!doc) {
        toast.error("Falha ao criar documento.");
        return;
      }

      // 3) Sobe binário pro Storage.
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
        if (pub?.publicUrl) {
          // updateDocumentAsync não expõe source_url; atualiza direto via supabase.
          const { error: urlErr } = await supabase
            .from("documents")
            .update({ source_url: pub.publicUrl })
            .eq("id", doc.id)
            .eq("user_id", userId);
          if (urlErr) console.warn("[upload-doc] source_url update", urlErr);
        }
      } catch (err) {
        console.warn("[upload-doc] storage upload failed", err);
        toast.warning("Documento criado, mas o arquivo não subiu pro storage.");
      }

      onUploaded?.();
      onOpenChange(false);
      toast.success("Documento adicionado.");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Subir documento
          </DialogTitle>
          <DialogDescription>
            PDFs vão pra biblioteca. Atribua matéria/pasta — ou deixe livre.
          </DialogDescription>
        </DialogHeader>

        {/* Arquivo */}
        <div className="space-y-1.5">
          <Label htmlFor="upload-file">Arquivo (PDF)</Label>
          {!file ? (
            <label
              htmlFor="upload-file"
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-card/40 p-6 cursor-pointer hover:border-primary/40 hover:bg-secondary/40 transition-colors"
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Clica pra escolher ou arraste o PDF aqui
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                Até {PDF_LIMIT_MB} MB
              </p>
              <input
                id="upload-file"
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePick(f);
                  e.target.value = "";
                }}
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3">
              <span className="h-9 w-9 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Trocar
              </button>
            </div>
          )}
        </div>

        {/* Título */}
        <div className="space-y-1.5">
          <Label htmlFor="upload-title">Título</Label>
          <Input
            id="upload-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Como esse documento se chama?"
          />
        </div>

        {/* Matéria */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
            Matéria (opcional)
          </p>
          <div className="space-y-1 max-h-[180px] overflow-y-auto -mx-1 px-1">
            <SubjectPickItem
              label="Sem matéria"
              hint="Fica na biblioteca, sem categoria"
              selected={subjectId === null}
              onClick={() => {
                setSubjectId(null);
                setFolderId(null);
              }}
              icon={
                <FileText className="h-4 w-4 text-muted-foreground" strokeWidth={2.2} />
              }
            />
            {subjects.map((s) => {
              const sel = subjectId === s.id;
              return (
                <SubjectPickItem
                  key={s.id}
                  label={s.name}
                  selected={sel}
                  onClick={() => {
                    setSubjectId(s.id);
                    setFolderId(null);
                  }}
                  icon={createElement(getSubjectIcon(s.name), {
                    className: "h-4 w-4 text-primary",
                    strokeWidth: 2.2,
                  })}
                />
              );
            })}
          </div>
        </div>

        {/* Pasta (só ativa se matéria escolhida) */}
        {subjectId && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
              Pasta (opcional)
            </p>
            {loadingFolders ? (
              <div className="py-3 text-center">
                <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1 max-h-[160px] overflow-y-auto -mx-1 px-1">
                <FolderPickItem
                  label="Raiz da matéria"
                  depth={0}
                  selected={folderId === null}
                  onClick={() => setFolderId(null)}
                />
                {flatFolders.map((f) => (
                  <FolderPickItem
                    key={f.id}
                    label={f.name}
                    depth={f.depth}
                    selected={folderId === f.id}
                    onClick={() => setFolderId(f.id)}
                  />
                ))}
                {flatFolders.length === 0 && (
                  <p className="text-[11px] text-muted-foreground py-1">
                    Esta matéria ainda não tem pastas.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="gradient"
            disabled={!file || uploading}
            onClick={handleUpload}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Subir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubjectPickItem({
  label,
  hint,
  selected,
  onClick,
  icon,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors text-sm",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-secondary/50",
      )}
      aria-pressed={selected}
    >
      <span className="h-8 w-8 rounded-lg shrink-0 bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{label}</div>
        {hint && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
        )}
      </div>
      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
    </button>
  );
}

function FolderPickItem({
  label,
  depth,
  selected,
  onClick,
}: {
  label: string;
  depth: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 rounded-md border px-3 py-1.5 text-left transition-colors text-sm",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-secondary/50",
      )}
      aria-pressed={selected}
      style={{ paddingLeft: `${depth * 16 + 12}px` }}
    >
      {depth > 0 && (
        <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
      )}
      <FolderIcon
        className={cn(
          "h-4 w-4 shrink-0",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
    </button>
  );
}
