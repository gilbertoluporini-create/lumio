"use client";

/**
 * Delete helper unificado pros 5 kinds da lista /documentos e /subject/[id].
 *
 * - pdf-upload       → documents row (também cascade em summaries vinculados)
 * - summary          → summaries row (soft-delete via deleted_at)
 * - flashcards       → lecture_assets row
 * - quiz             → lecture_assets row
 * - mindmap          → lecture_assets row
 * - transcription    → bloqueado (transcrição é parte da aula; pra apagar, apague a aula)
 */

import { createClient } from "@/lib/supabase/client";
import { deleteDocumentAsync } from "@/lib/documents";
import { deleteSummaryAsync } from "@/lib/summaries";
import type { DocumentItem } from "@/hooks/use-all-documents";

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteDocumentItemAsync(
  userId: string,
  item: DocumentItem,
): Promise<DeleteResult> {
  try {
    switch (item.kind) {
      case "pdf-upload": {
        // documents.id é o próprio item.id quando origin=upload
        if (!item.documentId && item.id) {
          await deleteDocumentAsync(userId, item.id);
        } else if (item.documentId) {
          await deleteDocumentAsync(userId, item.documentId);
        } else {
          return { ok: false, error: "ID do documento ausente." };
        }
        return { ok: true };
      }
      case "summary": {
        await deleteSummaryAsync(userId, item.id);
        return { ok: true };
      }
      case "flashcards":
      case "quiz":
      case "mindmap": {
        const supabase = createClient();
        const { error } = await supabase
          .from("lecture_assets")
          .delete()
          .eq("id", item.id)
          .eq("user_id", userId);
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      }
      case "transcription":
        return {
          ok: false,
          error:
            "Pra apagar a transcrição, exclua a aula gravada inteira em /gravacoes.",
        };
      default:
        return { ok: false, error: `Tipo desconhecido: ${item.kind}` };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Mensagem amigável pra confirm() antes de deletar, por kind. */
export function deletePromptText(item: DocumentItem): {
  title: string;
  description: string;
} {
  switch (item.kind) {
    case "pdf-upload":
      return {
        title: `Excluir o PDF "${item.title}"?`,
        description:
          "O arquivo e qualquer resumo gerado a partir dele também serão removidos.",
      };
    case "summary":
      return {
        title: `Excluir o resumo "${item.title}"?`,
        description: "Apenas o resumo será removido. A fonte original permanece.",
      };
    case "flashcards":
      return {
        title: `Excluir esse conjunto de flashcards?`,
        description: "As cartas e o progresso de estudo serão removidos.",
      };
    case "quiz":
      return {
        title: `Excluir esse quiz?`,
        description: "As questões e suas tentativas serão removidas.",
      };
    case "mindmap":
      return {
        title: `Excluir esse mapa mental?`,
        description: "O mapa será removido. A fonte original permanece.",
      };
    case "transcription":
      return {
        title: `Não dá pra excluir só a transcrição`,
        description: "Vá em /gravacoes e exclua a aula inteira.",
      };
  }
}
