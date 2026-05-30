"use client";

/**
 * RotinaWizardDialog — perguntas que o /api/lumi/routine precisa pra
 * gerar uma rotina (PDF cronograma semanal) decente.
 *
 * Coleta: tópicos a estudar (campo livre, pode ser bullets) + horas/semana.
 * subjectId, dataProva e título vêm do contexto do plano (props), não pergunta.
 *
 * Pensado pra ser reusável também pelo Lumi assistente — quando a tool
 * `gerar_rotina_estudo` precisar das mesmas infos, abrir esse dialog.
 */

import { useState } from "react";
import { CalendarDays, Clock3, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type RotinaWizardSubmit = {
  conteudo: string;
  horasSemanais: number;
};

export function RotinaWizardDialog({
  open,
  onOpenChange,
  subjectName,
  examDateLabel,
  /** Título sugerido pra mostrar no header do dialog (read-only). */
  itemTitle,
  /** Conteúdo pré-preenchido (ex: vem da descrição do item). */
  initialConteudo = "",
  initialHoras = 10,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subjectName: string;
  examDateLabel: string | null;
  itemTitle: string;
  initialConteudo?: string;
  initialHoras?: number;
  onSubmit: (data: RotinaWizardSubmit) => Promise<void>;
}) {
  const [conteudo, setConteudo] = useState(initialConteudo);
  const [horas, setHoras] = useState<number>(initialHoras);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const trimmed = conteudo.trim();
    if (trimmed.length < 8) {
      toast.error("Diz pelo menos um tópico (ex: 'tireoide, suprarrenal').");
      return;
    }
    if (horas < 1 || horas > 60) {
      toast.error("Horas/semana entre 1 e 60.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ conteudo: trimmed, horasSemanais: horas });
      onOpenChange(false);
      // Reset campos pra próxima vez
      setConteudo(initialConteudo);
      setHoras(initialHoras);
    } catch {
      // erro tratado pelo caller (toast lá)
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Gerar rotina (PDF · 12 coins)
          </DialogTitle>
          <DialogDescription>
            Vou montar um cronograma semanal{" "}
            {examDateLabel ? `até ${examDateLabel}` : ""} pra{" "}
            <strong>{subjectName}</strong>. Me conta o que precisa entrar.
          </DialogDescription>
        </DialogHeader>

        {/* Context pill */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{itemTitle}</span>
          {examDateLabel && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {examDateLabel}
              </span>
            </>
          )}
        </div>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rotina-conteudo">
              O que estudar?
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                (tópicos, capítulos, aulas — quanto mais específico, melhor)
              </span>
            </Label>
            <Textarea
              id="rotina-conteudo"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder={`Ex:\n- Tireoide (anatomia, fisiologia, hormônios)\n- Suprarrenais (cortex e medula)\n- Hipófise e hipotálamo\n- Pâncreas endócrino e diabetes`}
              maxLength={4000}
              rows={7}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {conteudo.length}/4000 caracteres
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label
              htmlFor="rotina-horas"
              className="inline-flex items-center gap-1"
            >
              <Clock3 className="h-3.5 w-3.5" />
              Horas por semana
            </Label>
            <Input
              id="rotina-horas"
              type="number"
              min={1}
              max={60}
              step={1}
              value={horas}
              onChange={(e) =>
                setHoras(Math.max(1, Math.min(60, Number(e.target.value) || 0)))
              }
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground">
              Quanto tempo por semana você consegue dedicar até a prova.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Gerar rotina
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
