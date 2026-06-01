"use client";

/**
 * useExamRelevance — hook que descobre se um asset (lecture / document /
 * summary) cai numa prova marcada do user em <7 dias.
 *
 * Fonte: endpoint GET /api/exam-relevance?asset_type=X&asset_id=Y. O endpoint
 * lê a tabela `exam_lecture_relevance` populada pelo cron diário
 * `exam-relevance` (vercel.json — 0 3 * * *).
 *
 * Cache: in-memory por process com TTL de 1h. Dedup de in-flight requests
 * pra evitar N chamadas idênticas quando o feed renderiza várias rows.
 *
 * Retorna `null` quando não há relevância (asset sem prova próxima OU user
 * sem prova marcada). O componente que consome deve esconder o badge nesse
 * caso (não renderiza nada).
 */

import { useEffect, useState } from "react";

export type ExamRelevance = {
  exam_id: string;
  exam_title: string;
  /** Pode ser 0 (hoje) ou negativo se prova passou — caller decide. */
  days_until: number;
  /** 0–1, cosine similarity. */
  relevance_score: number;
};

export type AssetType = "lecture" | "document" | "summary";

const TTL_MS = 60 * 60 * 1000; // 1h

type CacheEntry = {
  at: number;
  value: ExamRelevance | null;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ExamRelevance | null>>();

function cacheKey(assetType: AssetType, assetId: string): string {
  return `${assetType}:${assetId}`;
}

async function fetchRelevance(
  assetType: AssetType,
  assetId: string,
): Promise<ExamRelevance | null> {
  const url = `/api/exam-relevance?asset_type=${encodeURIComponent(assetType)}&asset_id=${encodeURIComponent(assetId)}`;
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return null;
    const json = (await r.json()) as { relevance?: ExamRelevance | null };
    return json.relevance ?? null;
  } catch {
    return null;
  }
}

/**
 * Limpa cache (testes / dev). Não exposto pra UI.
 */
export function __clearExamRelevanceCache() {
  cache.clear();
  inflight.clear();
}

export function useExamRelevance(
  assetType: AssetType | null | undefined,
  assetId: string | null | undefined,
): ExamRelevance | null {
  const [value, setValue] = useState<ExamRelevance | null>(() => {
    if (!assetType || !assetId) return null;
    const hit = cache.get(cacheKey(assetType, assetId));
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    return null;
  });

  useEffect(() => {
    if (!assetType || !assetId) {
      setValue(null);
      return;
    }
    const key = cacheKey(assetType, assetId);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      setValue(hit.value);
      return;
    }

    let mounted = true;
    let p = inflight.get(key);
    if (!p) {
      p = fetchRelevance(assetType, assetId).then((v) => {
        cache.set(key, { at: Date.now(), value: v });
        inflight.delete(key);
        return v;
      });
      inflight.set(key, p);
    }
    p.then((v) => {
      if (mounted) setValue(v);
    });
    return () => {
      mounted = false;
    };
  }, [assetType, assetId]);

  return value;
}
