/**
 * Lumio SRS — algoritmo SM-2 simplificado.
 *
 * Persistência:
 * - localStorage chave `lumio.srs.${userId}` (array de CardState)
 * - Hoje NÃO existe tabela `flashcard_reviews` em supabase/migrations.sql.
 *   Quando ela for criada, basta plugar nos helpers `*Async` abaixo.
 *
 * card_id é composto: `${assetId}:${cardIndex}` (estável por deck+posição).
 */

export type Quality = 0 | 1 | 2 | 3;

export type CardState = {
  card_id: string;
  user_id: string;
  ease: number;
  interval_days: number;
  reps: number;
  last_reviewed: string; // ISO
  next_review: string; // ISO
};

const MIN_EASE = 1.3;
const MAX_EASE = 2.5;
const DEFAULT_EASE = 2.5;

function clampEase(ease: number): number {
  if (Number.isNaN(ease)) return DEFAULT_EASE;
  return Math.max(MIN_EASE, Math.min(MAX_EASE, ease));
}

function nowIso(): string {
  return new Date().toISOString();
}

function addDaysIso(fromIso: string, days: number): string {
  const ms = new Date(fromIso).getTime();
  const safeDays = Number.isFinite(days) && days > 0 ? days : 1;
  // Suporta frações de dia (próximas revisões podem ser em horas pra qualidade 0)
  return new Date(ms + safeDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * SM-2 simplificado.
 * - quality 0 (não lembro): interval=1, reps=0, ease-=0.2
 * - quality 1 (pouco):       interval=1, reps+=1, ease-=0.1
 * - quality 2 (bem):         interval = reps===0?1 : reps===1?3 : interval*ease, reps+=1
 * - quality 3 (muito bem):   interval = reps===0?4 : interval*ease*1.3, reps+=1, ease+=0.1
 */
export function nextReview(
  state: CardState | null,
  quality: Quality,
  cardId?: string,
  userId?: string,
): CardState {
  const prev: CardState = state ?? {
    card_id: cardId ?? "",
    user_id: userId ?? "",
    ease: DEFAULT_EASE,
    interval_days: 0,
    reps: 0,
    last_reviewed: nowIso(),
    next_review: nowIso(),
  };

  let ease = prev.ease;
  let interval = prev.interval_days;
  let reps = prev.reps;

  switch (quality) {
    case 0:
      ease -= 0.2;
      reps = 0;
      interval = 1;
      break;
    case 1:
      ease -= 0.1;
      reps = reps + 1;
      interval = 1;
      break;
    case 2:
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 3;
      else interval = Math.max(1, Math.round(interval * ease));
      reps = reps + 1;
      break;
    case 3:
      if (reps === 0) interval = 4;
      else interval = Math.max(1, Math.round(interval * ease * 1.3));
      reps = reps + 1;
      ease += 0.1;
      break;
  }

  ease = clampEase(ease);
  const last = nowIso();
  const next = addDaysIso(last, interval);

  return {
    card_id: prev.card_id || cardId || "",
    user_id: prev.user_id || userId || "",
    ease,
    interval_days: interval,
    reps,
    last_reviewed: last,
    next_review: next,
  };
}

// ============================================================================
// Persistência — localStorage (única fonte de verdade hoje)
// ============================================================================

function storageKey(userId: string): string {
  return `lumio.srs.${userId}`;
}

function readAll(userId: string): CardState[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Validação defensiva
    return parsed.filter(
      (x): x is CardState =>
        !!x &&
        typeof x === "object" &&
        typeof (x as CardState).card_id === "string" &&
        typeof (x as CardState).ease === "number" &&
        typeof (x as CardState).interval_days === "number" &&
        typeof (x as CardState).reps === "number" &&
        typeof (x as CardState).last_reviewed === "string" &&
        typeof (x as CardState).next_review === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(userId: string, states: CardState[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(states));
  } catch {
    // Silencioso — pode falhar em modo privado ou cota cheia
  }
}

export async function listCardStatesAsync(userId: string): Promise<CardState[]> {
  // Mantemos Promise pra deixar a porta aberta pra Supabase no futuro
  return readAll(userId);
}

export async function saveCardStateAsync(state: CardState): Promise<void> {
  if (!state.user_id || !state.card_id) return;
  const all = readAll(state.user_id);
  const idx = all.findIndex((s) => s.card_id === state.card_id);
  if (idx >= 0) all[idx] = state;
  else all.push(state);
  writeAll(state.user_id, all);
}

// ============================================================================
// Helpers de seleção / agregação
// ============================================================================

export function getDueCards(states: CardState[], allCardIds: string[]): string[] {
  const now = Date.now();
  const map = new Map<string, CardState>(states.map((s) => [s.card_id, s]));
  const due: string[] = [];

  for (const id of allCardIds) {
    const s = map.get(id);
    // Card sem estado = nunca foi estudado → conta como "due"
    if (!s) {
      due.push(id);
      continue;
    }
    if (new Date(s.next_review).getTime() <= now) {
      due.push(id);
    }
  }
  return due;
}

/**
 * Domínio: média ponderada baseada em reps + ease.
 * Retorna 0..1.
 *
 * Heurística: cada card contribui com `min(1, reps/5)` ajustado por (ease - 1.3) / 1.2.
 * Cards nunca estudados contam zero. Cards com reps>=5 e ease alta contam ~1.
 */
export function getDomain(states: CardState[]): number {
  if (states.length === 0) return 0;
  let sum = 0;
  for (const s of states) {
    const repFactor = Math.min(1, s.reps / 5);
    const easeFactor = (s.ease - MIN_EASE) / (MAX_EASE - MIN_EASE); // 0..1
    sum += repFactor * 0.7 + easeFactor * 0.3;
  }
  return Math.max(0, Math.min(1, sum / states.length));
}

/**
 * Quantos cards foram estudados hoje (last_reviewed na data local atual).
 */
export function countStudiedToday(states: CardState[]): number {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  return states.filter((s) => {
    const dt = new Date(s.last_reviewed);
    return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
  }).length;
}

/**
 * Domínio por subconjunto de cardIds (pra mostrar % por deck).
 * Trata cards sem estado como 0.
 */
export function getDomainForDeck(
  states: CardState[],
  cardIds: string[],
): number {
  if (cardIds.length === 0) return 0;
  const map = new Map<string, CardState>(states.map((s) => [s.card_id, s]));
  let sum = 0;
  for (const id of cardIds) {
    const s = map.get(id);
    if (!s) continue;
    const repFactor = Math.min(1, s.reps / 5);
    const easeFactor = (s.ease - MIN_EASE) / (MAX_EASE - MIN_EASE);
    sum += repFactor * 0.7 + easeFactor * 0.3;
  }
  return Math.max(0, Math.min(1, sum / cardIds.length));
}

/**
 * Cards devidos pra revisão hoje dentro de um deck específico.
 */
export function countDueForDeck(
  states: CardState[],
  cardIds: string[],
): number {
  return getDueCards(states, cardIds).length;
}

/**
 * Compose card_id pra um par (assetId, index).
 */
export function makeCardId(assetId: string, index: number): string {
  return `${assetId}:${index}`;
}
