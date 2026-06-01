"use client";

import Link from "next/link";
import { Eye, EyeOff, Folder, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AssetKind = "summary" | "flashcards" | "quiz" | "mindmap";
export type AssetStatus = "missing" | "ready" | "loading";

export type AssetMeta = {
  kind: AssetKind;
  label: string;
  icon: React.ReactNode;
  status: AssetStatus;
  /** Se ready, rota onde o user vê o asset gerado. */
  href?: string;
  /** Disparado quando o user clica em "Gerar". */
  onGenerate: () => void;
};

export type AssetsSectionProps = {
  assets: AssetMeta[];
  /**
   * TODO: outro agent integra com <MoveToFolderDialog>.
   * Quando definido, mostra ícone de pasta no card "ready" pra mover o asset.
   */
  onMoveFolder?: (kind: AssetKind) => void;
  /** Desabilita botões "Gerar" globalmente (ex.: transcrição vazia). */
  disabled?: boolean;
  /** Kinds que o user escolheu esconder. Filtrados antes de renderizar. */
  hiddenKinds?: AssetKind[];
  /** Disparado quando o user clica em "Esconder este card". */
  onHide?: (kind: AssetKind) => void;
  /** Disparado quando o user clica em "Mostrar X cards escondidos". */
  onShowAll?: () => void;
};

export function AssetsSection({
  assets,
  onMoveFolder,
  disabled,
  hiddenKinds,
  onHide,
  onShowAll,
}: AssetsSectionProps) {
  const hiddenSet = hiddenKinds ?? [];
  const visible = assets.filter((a) => !hiddenSet.includes(a.kind));
  const hiddenCount = assets.length - visible.length;
  const allHidden = assets.length > 0 && visible.length === 0;

  if (allHidden) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/50 p-6">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onShowAll?.()}
          className="gap-2 text-xs"
        >
          <Eye className="h-4 w-4" />
          Mostrar {hiddenCount} {hiddenCount === 1 ? "card escondido" : "cards escondidos"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((a) => (
          <AssetCard
            key={a.kind}
            asset={a}
            onMoveFolder={onMoveFolder}
            onHide={onHide}
            disabled={disabled}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onShowAll?.()}
            className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" />
            Mostrar {hiddenCount} {hiddenCount === 1 ? "card escondido" : "cards escondidos"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  onMoveFolder,
  onHide,
  disabled,
}: {
  asset: AssetMeta;
  onMoveFolder?: (kind: AssetKind) => void;
  onHide?: (kind: AssetKind) => void;
  disabled?: boolean;
}) {
  const isLoading = asset.status === "loading";
  const isReady = asset.status === "ready";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors",
        isReady && "border-emerald-500/40 bg-emerald-500/5",
      )}
    >
      {onHide && (
        <button
          type="button"
          onClick={() => onHide(asset.kind)}
          aria-label={`Esconder ${asset.label}`}
          title="Esconder este card"
          className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      )}
      <span
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground",
          isReady && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        )}
        aria-hidden
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          asset.icon
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{asset.label}</p>
          {isReady && (
            <Badge variant="success" className="px-1.5 py-0 text-[10px]">
              pronto
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {isLoading
            ? "Gerando..."
            : isReady
              ? "Disponível pra consultar"
              : "Ainda não gerado"}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isReady ? (
          <>
            {asset.href ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs"
              >
                <Link href={asset.href} aria-label={`Ver ${asset.label}`}>
                  Ver
                </Link>
              </Button>
            ) : null}
            {onMoveFolder && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onMoveFolder(asset.kind)}
                aria-label={`Mover ${asset.label} para pasta`}
                title="Mover para pasta"
              >
                <Folder className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-8 px-3 text-xs"
            disabled={isLoading || disabled}
            onClick={asset.onGenerate}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Gerando
              </>
            ) : (
              "Gerar"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
