"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Imagem clicável que abre em lightbox (Dialog) pra visualização ampliada.
 *
 * Uso típico: dentro de markdown renderizado em resumos/aulas, ou em qualquer
 * lugar que mostre uma imagem ilustrativa que o user pode querer ver melhor.
 *
 * Acessibilidade: foco visível, ESC fecha (vem do Dialog), título acessível
 * obrigatório (alt da imagem).
 */
export function ZoomableImage({
  src,
  alt,
  caption,
  className,
  imgClassName,
}: {
  src: string;
  alt?: string;
  caption?: string;
  /** Wrapper button (que abre o zoom). */
  className?: string;
  /** Imagem em si (thumbnail). */
  imgClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const safeAlt = alt && alt.trim() ? alt : "Ilustração";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block w-full max-w-lg mx-auto my-6 cursor-zoom-in rounded-lg overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          className,
        )}
        aria-label={`Ampliar imagem: ${safeAlt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={safeAlt}
          loading="lazy"
          className={cn(
            "w-full h-auto rounded-lg border border-border/60 block transition-transform group-hover:scale-[1.01]",
            imgClassName,
          )}
        />
        {/* Indicador discreto de "clique pra ampliar" */}
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
          <ZoomIn className="h-3 w-3" />
          Ampliar
        </span>
        {caption && (
          <span className="block mt-1.5 text-center text-[11px] italic text-muted-foreground">
            {caption}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[min(95vw,1400px)] w-fit border-0 bg-background/95 backdrop-blur p-2 sm:p-4 max-h-[95vh] overflow-auto"
          hideClose
        >
          <VisuallyHidden>
            <DialogTitle>{safeAlt}</DialogTitle>
          </VisuallyHidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={safeAlt}
            className="block w-auto h-auto max-w-full max-h-[88vh] rounded-md mx-auto"
          />
          {caption && (
            <p className="mt-3 text-center text-xs italic text-muted-foreground px-4 pb-2">
              {caption}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
