"use client";

import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";

// Lenis (smooth scroll) é ATIVADO apenas em rotas públicas (landing, pricing).
// Em rotas autenticadas (dashboard, lecture, schedule, account, admin, onboarding)
// usamos scroll nativo do browser pra não conflitar com sidebar fixa, modais e
// scroll containers internos (chat, transcrição, slides).
const LENIS_ALLOWED_PATHS = [
  "/", // landing
  "/pricing",
  "/success",
];

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const allowed = LENIS_ALLOWED_PATHS.includes(pathname ?? "/");
  if (reduce || !allowed) return <>{children}</>;
  return (
    <ReactLenis
      root
      options={{
        // Time-based easing (expo-out) — padrão "buttery" do Lenis.
        // Mais suave que o lerp linear, que dá sensação de catch-up/travado.
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 1,
        touchMultiplier: 1.8,
        infinite: false,
        autoResize: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
