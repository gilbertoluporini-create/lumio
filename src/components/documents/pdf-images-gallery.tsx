"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MoreHorizontal, Trash2, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { LumiCharacter } from "@/components/brand/lumi";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type PdfExtractedImage = {
  id: string;
  documentId: string;
  pageNumber: number;
  imageUrl: string;
  caption: string | null;
  classification: string | null; // 'histology' | 'anatomy' | 'radiology' | 'diagram' | 'other'
  createdAt: string;
};

type ClassificationKey =
  | "histology"
  | "anatomy"
  | "radiology"
  | "diagram"
  | "other";

const CLASSIFICATION_META: Record<
  ClassificationKey,
  { label: string; className: string }
> = {
  histology: {
    label: "Histologia",
    className: "bg-pink-500/10 text-pink-600",
  },
  anatomy: {
    label: "Anatomia",
    className: "bg-blue-500/10 text-blue-600",
  },
  radiology: {
    label: "Imagem",
    className: "bg-amber-500/10 text-amber-600",
  },
  diagram: {
    label: "Diagrama",
    className: "bg-violet-500/10 text-violet-600",
  },
  other: {
    label: "Outro",
    className: "bg-secondary/40 text-muted-foreground",
  },
};

function getClassificationMeta(value: string | null) {
  const key = (value ?? "other") as ClassificationKey;
  return CLASSIFICATION_META[key] ?? CLASSIFICATION_META.other;
}

type RawRow = {
  id: string;
  document_id: string;
  page_number: number | null;
  caption_text: string | null;
  classification: string | null;
  created_at: string;
};

function mapRow(row: RawRow): PdfExtractedImage {
  return {
    id: row.id,
    documentId: row.document_id,
    pageNumber: row.page_number ?? 0,
    // image_url no DB pode estar null (após o fix de signed URL strategy) ou
    // conter signed URL legado (expirando em 24h). Sempre proxiamos via
    // /api/atlas/img/[id] que regenera a URL on-demand.
    imageUrl: `/api/atlas/img/${row.id}`,
    caption: row.caption_text,
    classification: row.classification,
    createdAt: row.created_at,
  };
}

export function PdfImagesGallery({
  documentId,
  userId,
  className,
}: {
  documentId: string;
  userId: string;
  className?: string;
}) {
  const [images, setImages] = useState<PdfExtractedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("pdf_extracted_images")
        .select(
          "id, document_id, page_number, caption_text, classification, created_at",
        )
        .eq("document_id", documentId)
        .eq("user_id", userId)
        .order("page_number", { ascending: true })
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;
      const rows = (data ?? []) as RawRow[];
      setImages(rows.map(mapRow));
    } catch (err) {
      const message = (err as Error).message || "Erro ao carregar imagens.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [supabase, documentId, userId]);

  useEffect(() => {
    void fetchImages();
  }, [fetchImages]);

  const handleDelete = useCallback(
    async (image: PdfExtractedImage) => {
      if (deletingId) return;
      setDeletingId(image.id);
      // optimistic update
      const previous = images;
      setImages((prev) => prev.filter((i) => i.id !== image.id));
      if (previewId === image.id) setPreviewId(null);

      try {
        const { error: deleteError } = await supabase
          .from("pdf_extracted_images")
          .delete()
          .eq("id", image.id)
          .eq("user_id", userId);
        if (deleteError) throw deleteError;
        toast.success("Imagem removida da galeria.");
      } catch (err) {
        // rollback
        setImages(previous);
        toast.error(`Erro ao excluir: ${(err as Error).message}`);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, images, previewId, supabase, userId],
  );

  const preview = previewId
    ? images.find((i) => i.id === previewId) ?? null
    : null;

  if (loading) {
    return (
      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3",
          className,
        )}
        aria-busy="true"
        aria-label="Carregando imagens extraídas"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/60 overflow-hidden bg-card"
          >
            <div className="aspect-square w-full bg-secondary/50 animate-pulse" />
            <div className="p-2 space-y-2">
              <div className="h-3 w-3/4 rounded bg-secondary/60 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-secondary/40 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive",
          className,
        )}
      >
        Não consegui carregar as imagens: {error}
        <button
          type="button"
          onClick={() => void fetchImages()}
          className="ml-2 underline underline-offset-2 hover:text-destructive/80"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-secondary/20 py-10 px-4 text-center",
          className,
        )}
      >
        <LumiCharacter mood="sleeping" size="md" />
        <p className="text-sm text-muted-foreground max-w-xs">
          Nenhuma imagem extraída ainda. O processamento pode levar alguns
          minutos após o upload.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3",
          className,
        )}
      >
        {images.map((image) => {
          const meta = getClassificationMeta(image.classification);
          const isDeleting = deletingId === image.id;
          return (
            <article
              key={image.id}
              className={cn(
                "group lift-card relative flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card",
                isDeleting && "opacity-50 pointer-events-none",
              )}
            >
              <button
                type="button"
                onClick={() => setPreviewId(image.id)}
                className="relative block w-full aspect-square overflow-hidden bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                aria-label={`Ampliar imagem da página ${image.pageNumber}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.imageUrl}
                  alt={image.caption ?? `Imagem extraída página ${image.pageNumber}`}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                  <ZoomIn className="h-3 w-3" />
                  Ampliar
                </span>
              </button>

              <div className="flex-1 p-2.5 flex flex-col gap-2">
                {image.caption ? (
                  <p
                    className="text-xs text-foreground/80 leading-snug overflow-hidden"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                    title={image.caption}
                  >
                    {image.caption}
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Sem legenda
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                      p. {image.pageNumber}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium truncate",
                        meta.className,
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label="Mais ações da imagem"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setPreviewId(image.id);
                        }}
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                        Ver maior
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          void handleDelete(image);
                        }}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null);
        }}
      >
        <DialogContent
          className="max-w-[min(95vw,1400px)] w-fit border-0 bg-background/95 backdrop-blur p-2 sm:p-4 max-h-[95vh] overflow-auto"
          hideClose
        >
          <VisuallyHidden>
            <DialogTitle>
              {preview?.caption ?? `Imagem extraída página ${preview?.pageNumber ?? ""}`}
            </DialogTitle>
          </VisuallyHidden>
          {preview && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.imageUrl}
                alt={
                  preview.caption ??
                  `Imagem extraída página ${preview.pageNumber}`
                }
                className="block w-auto h-auto max-w-full max-h-[80vh] rounded-md mx-auto"
              />
              <div className="mt-3 px-4 pb-2 flex flex-col items-center gap-2 text-center">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    p. {preview.pageNumber}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 font-medium",
                      getClassificationMeta(preview.classification).className,
                    )}
                  >
                    {getClassificationMeta(preview.classification).label}
                  </span>
                </div>
                {preview.caption && (
                  <p className="text-xs italic text-muted-foreground max-w-2xl">
                    {preview.caption}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
