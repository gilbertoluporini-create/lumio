"use client";

import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * SpotlightCursor — Soft radial glow that follows the cursor.
 * Mounts a single layer that listens on window.
 */
export function SpotlightCursor() {
  const reduce = useReducedMotion();
  const x = useMotionValue(-500);
  const y = useMotionValue(-500);
  const springX = useSpring(x, { stiffness: 80, damping: 18, mass: 0.4 });
  const springY = useSpring(y, { stiffness: 80, damping: 18, mass: 0.4 });
  const [visible, setVisible] = useState(false);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    if (isCoarse) {
      setCoarse(true);
      return;
    }
    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setVisible(true);
    };
    const onLeave = () => setVisible(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [reduce, x, y]);

  if (reduce || coarse) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[1] mix-blend-overlay"
      style={{
        x: springX,
        y: springY,
        opacity: visible ? 1 : 0,
        transition: "opacity 300ms",
      }}
    >
      <div
        className="h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.75 0.22 290 / 0.16), transparent 70%)",
          filter: "blur(20px)",
        }}
      />
    </motion.div>
  );
}

/**
 * SpotlightCard — Cards that emit a radial highlight where the user hovers.
 * Wrap with this and place a child with className="spotlight-card" or just rely
 * on this component handling everything.
 */
export function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const x = useMotionValue<number | null>(null);
  const y = useMotionValue<number | null>(null);
  const reduce = useReducedMotion();
  return (
    <div
      onMouseMove={(e) => {
        if (reduce) return;
        const rect = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - rect.left);
        y.set(e.clientY - rect.top);
      }}
      onMouseLeave={() => {
        x.set(null);
        y.set(null);
      }}
      className={`group relative overflow-hidden ${className ?? ""}`}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: x.get() === null
            ? undefined
            : `radial-gradient(360px circle at ${x.get()}px ${y.get()}px, oklch(0.7 0.2 290 / 0.12), transparent 60%)`,
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        // Reactive overlay using motion values
        ref={(el) => {
          if (!el) return;
          const unsub1 = x.on("change", (vx) => {
            const vy = y.get();
            if (vx === null || vy === null) {
              el.style.background = "";
              return;
            }
            el.style.background = `radial-gradient(360px circle at ${vx}px ${vy}px, oklch(0.7 0.2 290 / 0.12), transparent 60%)`;
          });
          const unsub2 = y.on("change", () => {
            const vx = x.get();
            const vy = y.get();
            if (vx === null || vy === null) {
              el.style.background = "";
              return;
            }
            el.style.background = `radial-gradient(360px circle at ${vx}px ${vy}px, oklch(0.7 0.2 290 / 0.12), transparent 60%)`;
          });
          // store unsubscribe on element
          (el as unknown as { _unsubs?: Array<() => void> })._unsubs = [unsub1, unsub2];
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
