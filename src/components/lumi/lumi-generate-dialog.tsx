"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Coins,
  FileText,
  Layers,
  Loader2,
  Network,
  Sparkles,
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
import { cn } from "@/lib/utils";

export type LumiGenerateKind = "summary" | "flashcards" | "quiz" | "mindmap";
export type LumiGenerateChoice = "context" | "wizard";

const KIND_META: Record<
  LumiGenerateKind,
  {
    label: string;
    description: string;
    Icon: typeof FileText;
    tone: string;
    cost: number;
    wizardCta: string;
  }
> = {
  summary: {
    label: "Gerar resumo",
    description: "Resumo estruturado em markdown com pontos-chave de revisão.",
    Icon: FileText,
    tone: "from-violet-500/20 to-violet-500/5 text-violet-600",
    cost: 8,
    wizardCta: "Abrir wizard de resumo",
  },
  flashcards: {
    label: "Criar flashcards",
    description: "Deck de cards pergunta/resposta otimizado pra revisão ativa.",
    Icon: Layers,
    tone: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-600",
    cost: 12,
    wizardCta: "Abrir wizard de flashcards",
  },
  quiz: {
    label: "Gerar quiz",
    description: "Questões de múltipla escolha com explicação da resposta certa.",
    Icon: Sparkles,
    tone: "from-emerald-500/20 to-emerald-500/5 text-emerald-600",
    cost: 15,
    wizardCta: "Abrir wizard de quiz",
  },
  mindmap: {
    label: "Mapa mental",
    description: "Mapa hierárquico do tema com ramos e sub-ramos.",
    Icon: Network,
    tone: "from-sky-500/20 to-sky-500/5 text-sky-600",
    cost: 20,
    wizardCta: "Abrir wizard de mapa mental",
  },
};

type Props = {
  open: boolean;
  kind: LumiGenerateKind | null;
  contextLabel?: string | null;
  hasLecture: boolean;
  hasMessages: boolean;
  attachmentCount: number;
  coinBalance: number | null;
  loading: boolean;
  onConfirm: (choice: LumiGenerateChoice) => void;
  onClose: () => void;
};

export function LumiGenerateDialog({
  open,
  kind,
  contextLabel,
  hasLecture,
  hasMessages,
  attachmentCount,
  coinBalance,
  loading,
  onConfirm,
  onClose,
}: Props) {
  const meta = kind ? KIND_META[kind] : null;
  const [choice, setChoice] = useState<LumiGenerateChoice>("context");

  useEffect(() => {
    if (open) setChoice("context");
  }, [open, kind]);

  const sourceLabel = useMemo(() => {
    const parts: string[] = [];
    if (hasLecture && contextLabel) parts.push(contextLabel);
    if (hasMessages) parts.push("Conversa atual");
    if (attachmentCount > 0) {
      parts.push(
        `${attachmentCount} anexo${attachmentCount === 1 ? "" : "s"}`,
      );
    }
    if (parts.length === 0) return null;
    return parts.join(" · ");
  }, [hasLecture, hasMessages, contextLabel, attachmentCount]);

  const blocked = !hasLecture && !hasMessages && attachmentCount === 0;
  const insufficient =
    choice === "context" &&
    !!meta &&
    coinBalance !== null &&
    coinBalance < meta.cost;

  if (!meta) return null;
  const { Icon } = meta;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !loading) onClose();
      }}
    >
      <DialogContent mobileSheet className="md:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br",
                meta.tone,
              )}
            >
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle>{meta.label}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {meta.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setChoice("context")}
              disabled={loading || blocked}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition-all",
                choice === "context"
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-primary/30",
                (loading || blocked) && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    choice === "context"
                      ? "border-primary"
                      : "border-muted-foreground/40",
                  )}
                >
                  {choice === "context" && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">
                      Usar contexto da conversa atual
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 tabular-nums">
                      <Coins className="h-3 w-3" />
                      {meta.cost}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Inclui as mensagens trocadas e qualquer arquivo anexado.
                  </div>
                  {sourceLabel && (
                    <div className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
                      Fonte: {sourceLabel}
                    </div>
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setChoice("wizard")}
              disabled={loading}
              className={cn(
                "w-full rounded-xl border p-3 text-left transition-all",
                choice === "wizard"
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-primary/30",
                loading && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    choice === "wizard"
                      ? "border-primary"
                      : "border-muted-foreground/40",
                  )}
                >
                  {choice === "wizard" && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">
                      Modo wizard completo
                    </div>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Custo variável
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Te leva pra tela dedicada pra escolher transcrição, slides
                    e arquivos múltiplos.
                  </div>
                </div>
              </div>
            </button>
          </div>

          {blocked && choice === "context" && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Selecione uma aula, anexe um arquivo ou converse antes de gerar.
              </div>
            </div>
          )}

          {!blocked && insufficient && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Saldo insuficiente. Você precisa de {meta.cost} coins. Saldo
                atual: {coinBalance ?? "—"}.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="gradient"
            onClick={() => {
              if (choice === "context" && blocked) {
                toast.error(
                  "Anexe um arquivo, selecione uma aula ou converse antes.",
                );
                return;
              }
              onConfirm(choice);
            }}
            disabled={loading || (choice === "context" && (blocked || insufficient))}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : choice === "wizard" ? (
              <>
                {meta.wizardCta}
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Gerar com contexto
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
