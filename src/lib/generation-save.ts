/**
 * Persistência final de uma geração de IA — extrai a lógica de save do
 * content-wizard pra um helper reusável.
 *
 * Caller principal: PendingGenerationGuard, que tenta finalizar geração
 * que ficou pela metade após /api/ai/generate retornar mas antes do save
 * client-side completar.
 *
 * Não chama /api/ai/generate. NÃO cobra coins. Apenas materializa o
 * resultado em lecture_assets / summaries (assumindo que o user já pagou).
 */

import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { createLectureAsync } from "@/lib/db";
import { createDocumentAsync } from "@/lib/documents";
import {
  createSummaryAsync,
  upsertSummaryByLectureAsync,
} from "@/lib/summaries";
import type { PendingGeneration } from "@/lib/pending-generation";
import type { LectureSummary } from "@/lib/types";

export type SaveResult = {
  ok: boolean;
  route?: string;
  error?: string;
};

/**
 * Extrai os 6 primeiros bullets sob "## Pontos-chave" pra alimentar
 * o campo highlights do summary (mesmo algoritmo do wizard e do Lumi tools).
 */
function extractHighlights(markdown: string, max: number): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  let inH = false;
  for (const line of lines) {
    if (/^##\s+pontos[- ]chave/i.test(line.trim())) {
      inH = true;
      continue;
    }
    if (inH) {
      if (/^##\s/.test(line)) break;
      const m = line.match(/^\s*-\s+(.+)/);
      if (m) {
        out.push(m[1].replace(/\[\[([^\]]+)\]\]/g, "$1").slice(0, 120));
        if (out.length >= max) break;
      }
    }
  }
  return out;
}

/**
 * Materializa a pending generation no banco. Sem efeitos se Supabase
 * não estiver configurado (retorna ok:false).
 */
export async function savePendingGeneration(
  pending: PendingGeneration,
): Promise<SaveResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase não configurado." };
  }

  try {
    if (pending.mode === "summary") {
      const md =
        typeof pending.content === "object" && pending.content
          ? (pending.content as { markdown?: string }).markdown ?? ""
          : "";
      const summaryContent: LectureSummary = {
        generatedAt: new Date().toISOString(),
        generalSummary: md,
        highlights: extractHighlights(md, 6),
        sections: [],
      };

      // Caso 1: summary linkado a uma lecture existente
      if (pending.source?.kind === "lecture") {
        const sm = await upsertSummaryByLectureAsync({
          userId: pending.userId,
          subjectId: pending.subjectId,
          lectureId: pending.source.lectureId,
          title: pending.title,
          content: summaryContent,
        });
        return {
          ok: true,
          route: `/resumo/${pending.source.lectureId}`,
        };
      }

      // Caso 2: summary de Document (PDF puro, sem aula gravada)
      if (pending.source?.kind === "document") {
        const doc = await createDocumentAsync({
          userId: pending.userId,
          subjectId: pending.subjectId,
          title: pending.source.documentTitle,
          sourceKind: "pdf",
          sourceText: pending.source.documentText,
          pageCount: pending.source.pageCount,
        });
        if (!doc) return { ok: false, error: "Falha criando documento." };
        const sm = await createSummaryAsync({
          userId: pending.userId,
          subjectId: pending.subjectId,
          source: { kind: "document", documentId: doc.id },
          title: pending.title,
          content: summaryContent,
        });
        return {
          ok: true,
          route: sm?.id ? `/resumo/doc/${sm.id}` : "/resumos",
        };
      }

      return { ok: false, error: "Source incompleto pra summary." };
    }

    // Modes flashcards / quiz / mindmap: createLecture + insert lecture_asset
    const lecture = await createLectureAsync(pending.userId, {
      subjectId: pending.subjectId,
      title: pending.title,
    });
    if (!lecture) {
      return { ok: false, error: "Falha criando lecture stub." };
    }

    const supabase = createClient();
    type PayloadShape = Record<string, unknown>;
    let payload: PayloadShape = {
      generatedAt: new Date().toISOString(),
    };
    const content = pending.content as Record<string, unknown>;

    if (pending.mode === "flashcards") {
      payload = {
        ...payload,
        cards: Array.isArray(content?.cards) ? content.cards : [],
        ...(pending.imageUrls && pending.imageUrls.length > 0
          ? { imageUrls: pending.imageUrls }
          : {}),
      };
    } else if (pending.mode === "quiz") {
      payload = {
        ...payload,
        questions: Array.isArray(content?.questions) ? content.questions : [],
        ...(pending.imageUrls && pending.imageUrls.length > 0
          ? { imageUrls: pending.imageUrls }
          : {}),
      };
    } else if (pending.mode === "mindmap") {
      const heroImage =
        pending.imageUrls && pending.imageUrls.length > 0
          ? pending.imageUrls[0]
          : undefined;
      payload = {
        ...payload,
        centralTopic: (content?.centralTopic as string) ?? pending.title,
        branches: Array.isArray(content?.branches) ? content.branches : [],
        ...(heroImage ? { heroImageUrl: heroImage } : {}),
      };
    }

    const { error: insErr } = await supabase.from("lecture_assets").insert({
      lecture_id: lecture.id,
      user_id: pending.userId,
      kind: pending.mode,
      payload,
      coins_spent: pending.coinsCharged ?? null,
    });
    if (insErr) {
      return { ok: false, error: `insert falhou: ${insErr.message}` };
    }

    const routeByMode: Record<string, string> = {
      flashcards: "/flashcards",
      quiz: "/quiz",
      mindmap: `/mapa/${lecture.id}`, // o /mapa busca por assetId, não lectureId — vou ajustar pra route mais segura
    };
    return {
      ok: true,
      route: routeByMode[pending.mode] ?? "/dashboard",
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Erro desconhecido.",
    };
  }
}
