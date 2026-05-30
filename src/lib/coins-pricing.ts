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
  mindmap: 20, // mapa mental inclui 1 imagem ilustrativa do tópico central (gpt-image-1)
  chatMessage: 1,
  /**
   * Resposta por voz (ElevenLabs Multilingual v2).
   * Custo real: $0.30/1k chars (Pay-as-you-go). Média 300 chars = R$0,45.
   * Coin vale ~R$0,08-0,19 dependendo do plano (Power tem coin mais barata).
   * Subimos de 3 pra 5 coins pra cobrir margem em Pro/Power; cap diário no
   * /api/tts limita abuso (VOICE_REPLY_DAILY_CAP = 30 por user/24h).
   */
  voiceReply: 5,
  /** Cap diário de voice replies por usuário (anti-abuse + custo controlado). */
  voiceReplyDailyCap: 30,
  /**
   * Sincronização IA de slides ↔ capítulos da transcrição revisada. 1 chamada
   * Haiku (~3K input / ~500 output) por aula. Custo real ~$0.005.
   */
  slideSync: 3,
  /**
   * Custo extra por fonte ADICIONAL acima da primeira.
   * Cada PDF/aula extra que entra na geração aumenta input tokens
   * (e qualidade — vale cobrar). Aplicado quando totalSources > 1.
   * Ex: 3 PDFs num resumo → 10 + 2*3 = 16 coins.
   */
  perExtraSource: 3,
} as const;

export type AIMode = "summary" | "flashcards" | "quiz" | "mindmap";

/**
 * Calcula custo da geração.
 * @param mode tipo de asset
 * @param withImages se inclui imagens (não aplicável a mindmap)
 * @param totalSources nº total de fontes (aulas + PDFs). Cada fonte extra
 *   acima da 1ª adiciona perExtraSource coins. Default 1 mantém compat.
 */
export function computeCost(
  mode: AIMode,
  withImages: boolean,
  totalSources: number = 1,
): number {
  const base = (() => {
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
  })();
  const extras = Math.max(0, (totalSources || 1) - 1);
  return base + extras * COIN_COSTS.perExtraSource;
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
