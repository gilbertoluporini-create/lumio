/**
 * MindmapQuickDialog — versão simplificada do ContentWizard pra mapa mental.
 *
 * Antes, gerar mapa mental abria o wizard cheio com 3 etapas (escolher fontes,
 * configurar imagens, revisar). Mas mapa mental tem muito menos parâmetros
 * que summary/quiz/flashcards — só precisa de:
 *   - complexidade (simple/medium/deep)
 *   - foco/instrução opcional (textarea)
 *
 * As fontes vêm automaticamente: TODAS as aulas + documentos da matéria.
 *
 * O caller passa subjectId + lista de fontes; o dialog cuida do POST pra
 * /api/ai/generate, mostra progresso e dispara onCreated com o assetId.
 */
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Network } from "lucide-react";
import { toast } from "sonner";
import { createLectureAsync } from "@/lib/db";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { computeCost } from "@/lib/coins-pricing";
import { Analytics } from "@/lib/analytics";

export type MindmapQuickSource = {
  lectureIds: string[];
  documentIds: string[];
  /** Texto bruto pré-carregado (transcripts + sourceTexts) pra mandar pro endpoint */
  transcripts: string[];
  pdfTexts: string[];
};

type Complexity = "simple" | "medium" | "deep";

export function MindmapQuickDialog({
  open,
  onOpenChange,
  userId,
  subjectId,
  subjectName,
  source,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  subjectId: string;
  subjectName?: string;
  source: MindmapQuickSource;
  onCreated?: (assetId: string, lectureId: string) => void;
}) {
  const [complexity, setComplexity] = useState<Complexity>("medium");
  const [foco, setFoco] = useState("");
  const [generating, setGenerating] = useState(false);

  const totalSources = source.lectureIds.length + source.documentIds.length;
  const cost = computeCost("mindmap", false, Math.max(totalSources, 1));

  const handleGenerate = async () => {
    if (totalSources === 0) {
      toast.error(
        "Esta matéria não tem aula gravada nem documento. Cria um primeiro.",
      );
      return;
    }
    setGenerating(true);
    const tId = "mindmap-quick";
    toast.loading("Gerando mapa mental...", { id: tId });

    try {
      const resp = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "mindmap",
          sources: {
            transcripts: source.transcripts,
            pdfTexts: source.pdfTexts,
          },
          options: {
            complexity,
            withImages: true, // mindmap sempre gera imagem (já embutido no preço)
            userInstructions: foco.trim() || undefined,
          },
        }),
      });
      const json = (await resp.json()) as {
        content?: {
          centralTopic?: string;
          branches?: unknown[];
        };
        imageUrls?: string[];
        coinsCharged?: number;
        error?: string;
        balance?: number;
        required?: number;
      };
      if (!resp.ok) {
        toast.error(json.error ?? "Falha na geração.", { id: tId });
        return;
      }

      Analytics.assetGenerated("mindmap", true);

      const centralTopic = json.content?.centralTopic ?? subjectName ?? "Tópico";
      const title = `Mapa mental — ${centralTopic}`.slice(0, 200);

      // Cria lecture stub pra o asset ficar associado (mesmo padrão do wizard)
      const lecture = await createLectureAsync(userId, { subjectId, title });
      if (!lecture) {
        toast.error("Não consegui salvar o mapa mental.", { id: tId });
        return;
      }

      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const heroImage = Array.isArray(json.imageUrls) && json.imageUrls[0];
        await supabase.from("lecture_assets").insert({
          lecture_id: lecture.id,
          user_id: userId,
          kind: "mindmap",
          payload: {
            generatedAt: new Date().toISOString(),
            centralTopic,
            branches: json.content?.branches ?? [],
            ...(heroImage ? { heroImageUrl: heroImage } : {}),
          },
          coins_spent: json.coinsCharged,
        });
      }

      toast.success("Mapa mental pronto!", { id: tId });
      onCreated?.(lecture.id, lecture.id);
      onOpenChange(false);
      setFoco("");
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`, { id: tId });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={generating ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            Gerar mapa mental
          </DialogTitle>
          <DialogDescription>
            Usa {totalSources} fonte{totalSources !== 1 ? "s" : ""} desta matéria
            como base. Custa {cost} coins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Complexidade</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["simple", "medium", "deep"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setComplexity(c)}
                  className={`rounded-md border px-3 py-2 text-xs transition ${
                    complexity === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 text-muted-foreground hover:border-border"
                  }`}
                  disabled={generating}
                >
                  {c === "simple"
                    ? "Simples"
                    : c === "medium"
                      ? "Médio"
                      : "Profundo"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mindmap-foco" className="text-xs font-medium">
              Foco / instrução (opcional)
            </Label>
            <Textarea
              id="mindmap-foco"
              value={foco}
              onChange={(e) => setFoco(e.target.value.slice(0, 600))}
              placeholder="Ex: foca em fisiopatologia; deixa interconexões com outras vias claras..."
              rows={3}
              disabled={generating}
              className="resize-none text-sm"
            />
            <div className="text-[10px] text-right text-muted-foreground">
              {foco.length}/600
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={generating} variant="gradient">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando...
              </>
            ) : (
              <>Gerar ({cost} coins)</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
