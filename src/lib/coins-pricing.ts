/**
 * Pricing do wizard genérico de geração AI.
 *
 * Convive com src/lib/coins.ts (que tem o pricing legacy por aula).
 * Aqui ficam os custos NOVOS, que consideram opção de imagens (Imagen 3).
 *
 * Mantemos consts hardcoded — facilita auditoria e mudanças rápidas.
 */

export const COIN_COSTS = {
  summary: 10,
  summaryWithImages: 30, // +20 pra imagens (3-4 ilustrações)
  flashcards: 8,
  flashcardsWithImages: 25, // +17
  quiz: 8,
  quizWithImages: 25, // +17
  mindmap: 6, // mapa mental não usa imagens
  chatMessage: 1,
} as const;

export type AIMode = "summary" | "flashcards" | "quiz" | "mindmap";

export function computeCost(mode: AIMode, withImages: boolean): number {
  switch (mode) {
    case "summary":
      return withImages ? COIN_COSTS.summaryWithImages : COIN_COSTS.summary;
    case "flashcards":
      return withImages
        ? COIN_COSTS.flashcardsWithImages
        : COIN_COSTS.flashcards;
    case "quiz":
      return withImages ? COIN_COSTS.quizWithImages : COIN_COSTS.quiz;
    case "mindmap":
      return COIN_COSTS.mindmap;
  }
}

export function modeLabel(mode: AIMode): string {
  switch (mode) {
    case "summary":
      return "Resumo";
    case "flashcards":
      return "Deck de flashcards";
    case "quiz":
      return "Quiz";
    case "mindmap":
      return "Mapa mental";
  }
}

export function modeLabelPlural(mode: AIMode): string {
  switch (mode) {
    case "summary":
      return "resumos";
    case "flashcards":
      return "decks";
    case "quiz":
      return "quizzes";
    case "mindmap":
      return "mapas mentais";
  }
}
