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
        duration: 0.85,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1.3,
        touchMultiplier: 2,
        infinite: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}
