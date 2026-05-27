"use client";

/**
 * Helper client-side pra disparar auto-indexação após salvar conteúdo.
 * Roda em background (fire-and-forget) — usuário não espera.
 *
 * Uso:
 *   void indexContentInBackground({
 *     sourceKind: "document",
 *     sourceId: doc.id,
 *     subjectId: doc.subjectId,
 *     text: doc.sourceText,
 *   });
 */

import type { SourceKind, ChunkMetadata } from "./embeddings";

export function indexContentInBackground(args: {
  sourceKind: SourceKind;
  sourceId: string;
  subjectId?: string | null;
  text: string;
  metadata?: ChunkMetadata;
}): Promise<void> {
  // Mínimo de 20 chars senão o endpoint rejeita
  if (!args.text || args.text.trim().length < 20) return Promise.resolve();

  return fetch("/api/embed", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
    keepalive: true,
  })
    .then((r) => {
      if (!r.ok) {
        console.warn(
          `[embeddings-client] indexação falhou (${args.sourceKind}/${args.sourceId})`,
          r.status,
        );
      }
    })
    .catch((err) => {
      console.warn("[embeddings-client] network err", err);
    });
}
