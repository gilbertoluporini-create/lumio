import type { MetadataRoute } from "next";

/**
 * PWA manifest — base pra futuro wrapper iOS/Android (PWABuilder, Capacitor,
 * ou submissão direta como TWA na PlayStore).
 *
 * Quando a gente publicar nas lojas:
 * - Google Play: PWABuilder gera TWA (.aab) a partir desse manifest
 * - App Store: precisa de wrapper Capacitor/Cordova (Apple não aceita PWA puro)
 *
 * Por enquanto, esse manifest faz o "Adicionar à tela inicial" funcionar
 * de verdade no iOS e Android com ícone, splash, standalone mode.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lumio",
    short_name: "Lumio",
    description:
      "Transcreva aulas, gere resumos, flashcards e quizzes com IA. Por matéria.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    lang: "pt-BR",
    dir: "ltr",
    scope: "/",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Nova aula",
        short_name: "Aula",
        description: "Comece uma transcrição agora",
        url: "/dashboard?action=new-lecture",
        icons: [{ src: "/icon.png", sizes: "192x192" }],
      },
      {
        name: "Assistente Lumi",
        short_name: "Lumi",
        description: "Fale com o Lumi",
        url: "/lumi",
        icons: [{ src: "/icon.png", sizes: "192x192" }],
      },
    ],
  };
}
