/**
 * COIN_COSTS — tabela de preços de cada operação, isolada das funções
 * server-side de `coins.ts`. Mantida em arquivo próprio pra ser importável
 * em client components sem puxar `next/headers` na cadeia.
 *
 * Valores alinhados com `coins-pricing.ts` (fonte de verdade do wizard).
 */
export const COIN_COSTS = {
  chat_message: 0,          // grátis — incluído no plano
  extract_slides: 0,        // grátis — incluído no plano
  transcript_refine: 0,     // grátis — incluído no plano
  extract_schedule: 0,      // grátis no onboarding
  // summary/summary_educational disparam summary-images. Pós-refator
  // 2026-05-31 usam chatgpt-image-latest quality:high (~$0.167/img × 3
  // ≈ $0.50/geração). Preços abaixo cobrem Sonnet + 3 imagens + margem.
  summary: 14,              // produto: resumo estruturado (por tópicos) — fixo
  summary_educational: 25,  // resumo educativo + 3 imagens chatgpt-image-latest high
  summary_educational_cross: 40, // educativo + PDFs da matéria cruzados (+15 coins extras)
  summary_atlas: 50,        // educativo cruzado + imagens REAIS extraídas dos PDFs do user (+10 coins)
  transcript_structure: 15, // revisão + capítulos por IA (Sonnet 4.5) — por chunk de ~25min
  flashcards: 8,            // alinhado com coins-pricing.ts
  quiz: 8,                  // alinhado com coins-pricing.ts
  mindmap: 6,               // alinhado com coins-pricing.ts
  routine: 12,              // rotina de estudo semanal em PDF (Lumio brand)
  study_plan: 8,            // trilha de plano de estudos desenhada pela Lumi
  slide_sync: 3,            // correlaciona slides do PDF anexado com capítulos (Haiku)
} as const;

/**
 * Preço dinâmico do RESUMO no plano de estudos, proporcional ao tamanho
 * do material-fonte (texto extraído do PDF ou transcript da aula).
 *
 * Fórmula linear: ~1 coin a cada 10.000 chars (~2.500 tokens estimados),
 * com piso de 5 coins (cobre o overhead fixo do prompt) e teto de 30 coins
 * (evita explosão em PDFs gigantes — o LLM trunca em 60k chars no worker).
 *
 *   chars  | coins
 *      0   |  5
 *  10.000  |  5
 *  20.000  |  5
 *  30.000  |  5    (3 coins linear, mas piso = 5)
 *  50.000  |  5    (5 coins, no limite do piso)
 *  60.000  |  6
 * 100.000  | 10
 * 200.000  | 20
 * 300.000+ | 30    (saturou no teto)
 */
export function calculateSummaryCoins(charCount: number): number {
  const MIN = 5;
  const MAX = 30;
  const CHARS_PER_COIN = 10_000;
  if (!charCount || charCount < 1) return MIN;
  const linear = Math.ceil(charCount / CHARS_PER_COIN);
  return Math.max(MIN, Math.min(MAX, linear));
}
