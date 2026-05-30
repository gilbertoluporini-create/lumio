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
  summary: 10,              // produto: resumo estruturado (por tópicos)
  summary_educational: 12,  // resumo educativo estilo artigo + imagens (markdown puro)
  transcript_structure: 15, // revisão + capítulos por IA (Sonnet 4.5) — por chunk de ~25min
  flashcards: 8,            // alinhado com coins-pricing.ts
  quiz: 8,                  // alinhado com coins-pricing.ts
  mindmap: 6,               // alinhado com coins-pricing.ts
  routine: 12,              // rotina de estudo semanal em PDF (Lumio brand)
  study_plan: 8,            // trilha de plano de estudos desenhada pela Lumi
  slide_sync: 3,            // correlaciona slides do PDF anexado com capítulos (Haiku)
} as const;
