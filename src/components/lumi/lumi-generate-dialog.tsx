"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
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

const KIND_META: Record<
  LumiGenerateKind,
  { label: string; description: string; Icon: typeof FileText; tone: string; cost: number }
> = {
  summary: {
    label: "Gerar resumo",
    description: "Resumo estruturado em markdown com pontos-chave de revisão.",
    Icon: FileText,
    tone: "from-violet-500/20 to-violet-500/5 text-violet-600",
    cost: 10,
  },
  flashcards: {
    label: "Criar flashcards",
    description: "Deck de cards pergunta/resposta otimizado pra revisão ativa.",
    Icon: Layers,
    tone: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-600",
    cost: 12,
  },
  quiz: {
    label: "Gerar quiz",
    description: "Questões de múltipla escolha com explicação da resposta certa.",
    Icon: Sparkles,
    tone: "from-emerald-500/20 to-emerald-500/5 text-emerald-600",
    cost: 15,
  },
  mindmap: {
    label: "Mapa mental",
    description: "Mapa hierárquico do tema com ramos e sub-ramos.",
    Icon: Network,
    tone: "from-sky-500/20 to-sky-500/5 text-sky-600",
    cost: 20,
  },
};

type Props = {
  open: boolean;
  kind: LumiGenerateKind | null;
  contextLabel?: string | null;
  hasLecture: boolean;
  hasMessages: boolean;
  coinBalance: number | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function LumiGenerateDialog({
  open,
  kind,
  contextLabel,
  hasLecture,
  hasMessages,
  coinBalance,
  loading,
  onConfirm,
  onClose,
}: Props) {
  const meta = kind ? KIND_META[kind] : null;

  const sourceLabel = useMemo(() => {
    if (hasLecture && contextLabel) return contextLabel;
    if (hasMessages) return "Conversa atual com o Lumi";
    return null;
  }, [hasLecture, hasMessages, contextLabel]);

  const blocked = !hasLecture && !hasMessages;
  const insufficient =
    !!meta && coinBalance !== null && coinBalance < meta.cost;

  if (!meta) return null;
  const { Icon } = meta;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !loading) onClose();
      }}
    >
      <DialogContent className="max-w-md">
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
          <div className="rounded-xl border border-border/60 bg-secondary/30 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fonte do conteúdo
            </div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {sourceLabel ?? "(Nenhuma fonte disponível)"}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 p-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Custo da geração
              </div>
              <div className="mt-0.5 text-base font-semibold text-foreground">
                {meta.cost} coins
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Coins className="h-3.5 w-3.5 text-amber-500" />
              Saldo: {coinBalance ?? "—"}
            </div>
          </div>

          {blocked && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Selecione uma aula no contexto ou converse com o Lumi antes de gerar.
              </div>
            </div>
          )}

          {!blocked && insufficient && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Saldo insuficiente. Você precisa de {meta.cost} coins.
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
              if (blocked) {
                toast.error(
                  "Selecione uma aula no contexto ou converse antes de gerar.",
                );
                return;
              }
              onConfirm();
            }}
            disabled={loading || blocked || insufficient}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Gerar agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
