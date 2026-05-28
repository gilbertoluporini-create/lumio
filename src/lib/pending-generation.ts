/**
 * Persistência de geração de IA em localStorage.
 *
 * PROBLEMA QUE RESOLVE: usuário gera resumo/flashcards/quiz/mindmap →
 * /api/ai/generate retorna OK (coins cobrados!) → cliente AINDA precisa
 * fazer createLecture + insert lecture_assets + storage.upload → se
 * navegar/crashar/Supabase pendurar nesse trecho, a geração SOME e os
 * coins ficam gastos sem asset criado.
 *
 * SOLUÇÃO: depois que /api/ai/generate retorna, salvamos o resultado
 * em localStorage IMEDIATAMENTE. O save normal continua acontecendo;
 * se tudo der certo, limpamos. Se navegar antes / o save falhar, no
 * próximo mount do app o PendingGenerationGuard detecta e oferece
 * recuperação ("vi que sua última geração ficou pela metade — quer
 * salvar?").
 *
 * LIMITAÇÃO: não cobre o caso de o user navegar ENQUANTO o /api/ai/generate
 * ainda tá rodando (antes da resposta voltar). Esse caso precisa Service
 * Worker / fetch.keepalive. Mas pelos logs e relatos, o caso mais comum
 * é o save pós-API travar — esse aqui resolve.
 */

const STORAGE_KEY = "lumio.pending_generation_v1";
const MAX_AGE_MS = 30 * 60 * 1000; // 30 min — depois disso considera lixo

export type GenerationMode = "summary" | "flashcards" | "quiz" | "mindmap";

export type PendingGenerationContent = {
  // Mode + contexto
  mode: GenerationMode;
  subjectId: string;
  userId: string;
  title: string;

  // Quando a geração foi pra uma lecture já existente, salvamos o id.
  // Se for null/undefined, o save vai criar uma lecture stub OU um
  // Document + Summary (no caso de mode=summary com só PDF).
  lectureId?: string | null;

  // Source kind pra mode=summary: lecture-linked vs document-only
  source?:
    | { kind: "lecture"; lectureId: string }
    | { kind: "document"; documentText: string; documentTitle: string; pageCount?: number };

  // Resultado bruto do /api/ai/generate
  content: unknown; // { markdown? } | { cards? } | { questions? } | { centralTopic?, branches? }
  imageUrls?: string[];
  coinsCharged?: number;
};

export type PendingGeneration = PendingGenerationContent & {
  savedAt: string; // ISO
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Salva resultado da geração pra possível recuperação posterior. */
export function markPendingGeneration(data: PendingGenerationContent): void {
  if (!isBrowser()) return;
  const payload: PendingGeneration = {
    ...data,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage cheio / desabilitado — silencioso, não bloqueia fluxo
  }
}

/**
 * Retorna a geração pendente SE existir e for recente (< MAX_AGE_MS).
 * Limpa registros expirados automaticamente.
 */
export function getPendingGeneration(): PendingGeneration | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingGeneration;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_MS || age < 0) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (!parsed.mode || !parsed.subjectId || !parsed.userId) {
      // Payload inválido — limpa
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Remove a geração pendente (após save bem sucedido ou descarte explícito). */
export function clearPendingGeneration(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
