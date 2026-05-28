/**
 * PendingGenerationGuard — monta em qualquer página pós-login.
 *
 * Verifica no mount se há uma geração pendente em localStorage (resultado
 * que voltou do /api/ai/generate mas não foi materializado no banco —
 * tipicamente porque o user navegou ou o save travou).
 *
 * Se há, mostra um sonner toast persistente com 2 ações:
 *   - "Salvar agora": chama savePendingGeneration → marca como concluído
 *   - "Descartar": limpa localStorage sem salvar
 *
 * Só dispara uma vez por sessão do app (não fica perseguindo o user).
 */
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getPendingGeneration,
  clearPendingGeneration,
} from "@/lib/pending-generation";
import { savePendingGeneration } from "@/lib/generation-save";

const MODE_LABEL: Record<string, string> = {
  summary: "resumo",
  flashcards: "deck de flashcards",
  quiz: "quiz",
  mindmap: "mapa mental",
};

export function PendingGenerationGuard({ userId }: { userId: string }) {
  const router = useRouter();
  const shownOnce = useRef(false);

  useEffect(() => {
    if (shownOnce.current) return;
    const pending = getPendingGeneration();
    if (!pending) return;
    if (pending.userId !== userId) {
      // Conta diferente — limpa pra não vazar entre logins
      clearPendingGeneration();
      return;
    }
    shownOnce.current = true;

    const modeLabel = MODE_LABEL[pending.mode] ?? "asset";
    const t = toast(
      `Sua última geração de ${modeLabel} ficou pela metade. Quer salvar agora? (coins já foram cobrados)`,
      {
        duration: Infinity,
        action: {
          label: "Salvar",
          onClick: async () => {
            const tid = toast.loading("Salvando...");
            const res = await savePendingGeneration(pending);
            if (res.ok) {
              clearPendingGeneration();
              toast.success("Salvo!", { id: tid });
              if (res.route) router.push(res.route);
            } else {
              toast.error(`Falha: ${res.error}`, { id: tid });
            }
          },
        },
        cancel: {
          label: "Descartar",
          onClick: () => {
            clearPendingGeneration();
            toast.dismiss(t);
          },
        },
      },
    );
  }, [userId, router]);

  return null;
}
