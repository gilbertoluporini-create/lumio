"use client";

import Link from "next/link";
import { Folder, Loader2 } from "lucide-react";

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
};

export function AssetsSection({
  assets,
  onMoveFolder,
  disabled,
}: AssetsSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {assets.map((a) => (
        <AssetCard
          key={a.kind}
          asset={a}
          onMoveFolder={onMoveFolder}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function AssetCard({
  asset,
  onMoveFolder,
  disabled,
}: {
  asset: AssetMeta;
  onMoveFolder?: (kind: AssetKind) => void;
  disabled?: boolean;
}) {
  const isLoading = asset.status === "loading";
  const isReady = asset.status === "ready";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors",
        isReady && "border-emerald-500/40 bg-emerald-500/5",
      )}
    >
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
