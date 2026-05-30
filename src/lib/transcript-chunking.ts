import type { TranscriptEntry } from "@/lib/types";

/**
 * Tamanho-alvo de cada chunk em segundos. ~25min escolhido porque:
 *   - Sonnet 4.5 processa 25min de transcrição em ~60-120s confortavelmente.
 *   - Boundaries naturais (intervalos de aulas, mudança de tópico) geralmente
 *     acontecem em janelas de 20-30min — chunks dessa escala raramente cortam
 *     no meio de uma explicação.
 *   - Custa 5 coins por chunk → uma aula de 1h vira 2 chunks = 10c, 1h30 vira
 *     3 chunks = 15c. Pricing legível.
 */
const TARGET_CHUNK_SEC = 25 * 60;

/**
 * Limite mínimo pra evitar último chunk minúsculo (ex: 2min isolados depois
 * de 50min). Se o resíduo seria menor que isso, junta com o chunk anterior.
 */
const MIN_TAIL_SEC = 8 * 60;

export type TranscriptChunk = {
  /** Índice 0-based do chunk no array. */
  index: number;
  /** Início em segundos relativos à aula inteira. */
  startSec: number;
  /** Fim (último entry.endSec). */
  endSec: number;
  /** Entries contidos. */
  entries: TranscriptEntry[];
};

/**
 * Divide uma lista de entries em chunks de ~TARGET_CHUNK_SEC.
 *
 * Garantia: cada chunk começa na fronteira de um entry (nunca corta no
 * meio de uma frase). Implementação simples — vai consumindo entries
 * até passar do limite e fecha o chunk no próximo entry.
 *
 * Retorna [] se entries estiver vazio. Retorna um único chunk se a aula
 * inteira é menor que TARGET_CHUNK_SEC.
 */
export function splitIntoChunks(entries: TranscriptEntry[]): TranscriptChunk[] {
  if (entries.length === 0) return [];

  const totalSec = entries[entries.length - 1].endSec;
  // Aula curta: tudo num chunk só.
  if (totalSec <= TARGET_CHUNK_SEC) {
    return [
      {
        index: 0,
        startSec: 0,
        endSec: totalSec,
        entries: [...entries],
      },
    ];
  }

  const chunks: TranscriptChunk[] = [];
  let current: TranscriptEntry[] = [];
  let chunkStart = entries[0].startSec;
  let nextBoundary = chunkStart + TARGET_CHUNK_SEC;

  for (const e of entries) {
    // Fecha chunk antes desse entry se já passou da boundary.
    if (current.length > 0 && e.startSec >= nextBoundary) {
      chunks.push({
        index: chunks.length,
        startSec: chunkStart,
        endSec: current[current.length - 1].endSec,
        entries: current,
      });
      current = [];
      chunkStart = e.startSec;
      nextBoundary = chunkStart + TARGET_CHUNK_SEC;
    }
    current.push(e);
  }

  // Resíduo: junta no chunk anterior se for muito curto, senão vira chunk novo.
  if (current.length > 0) {
    const tailDuration =
      current[current.length - 1].endSec - current[0].startSec;
    if (chunks.length > 0 && tailDuration < MIN_TAIL_SEC) {
      const last = chunks[chunks.length - 1];
      last.entries = [...last.entries, ...current];
      last.endSec = current[current.length - 1].endSec;
    } else {
      chunks.push({
        index: chunks.length,
        startSec: chunkStart,
        endSec: current[current.length - 1].endSec,
        entries: current,
      });
    }
  }

  return chunks;
}

/**
 * Calcula quantos chunks uma transcrição vai gerar SEM precisar instanciar
 * os arrays. Útil pra UI mostrar custo estimado antes de o user clicar.
 */
export function estimateChunkCount(entries: TranscriptEntry[]): number {
  if (entries.length === 0) return 0;
  const totalSec = entries[entries.length - 1].endSec;
  if (totalSec <= TARGET_CHUNK_SEC) return 1;
  // Aproximação: ceil(total / target), mas se o último pedaço seria <MIN_TAIL,
  // ele é absorvido pelo anterior.
  const naive = Math.ceil(totalSec / TARGET_CHUNK_SEC);
  const residual = totalSec - (naive - 1) * TARGET_CHUNK_SEC;
  if (naive > 1 && residual < MIN_TAIL_SEC) return naive - 1;
  return naive;
}
