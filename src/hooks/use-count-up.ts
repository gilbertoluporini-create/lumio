"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anima um número de um valor anterior até `target` com easeOutCubic.
 * Reanima sempre que `target` muda (ex: saldo carrega de null→valor).
 * Respeita `prefers-reduced-motion`: pula direto pro valor final.
 */
export function useCountUp(
  target: number,
  opts: { durationMs?: number; enabled?: boolean } = {},
): number {
  const { durationMs = 850, enabled = true } = opts;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!enabled || prefersReduced || target === fromRef.current) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, enabled]);

  return display;
}
