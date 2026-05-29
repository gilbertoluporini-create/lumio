"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

export function Highlighter({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30%" });
  return (
    <span ref={ref} className={cn("relative inline-block whitespace-nowrap", className)}>
      <motion.span
        className="absolute inset-x-[-0.12em] inset-y-[6%] -z-0 rounded-[3px]"
        style={{
          background:
            "linear-gradient(120deg, oklch(0.9 0.19 92 / 0.95), oklch(0.84 0.19 72 / 0.95))",
          transformOrigin: "left center",
        }}
        initial={{ scaleX: 0 }}
        animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.75, delay, ease: [0.65, 0, 0.35, 1] }}
      />
      {/* Ink bleed dots — micro particles falling off the marker trace */}
      {inView && (
        <span className="pointer-events-none absolute inset-0 -z-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.span
              key={i}
              className="absolute h-[3px] w-[3px] rounded-full"
              style={{
                background: i % 2 === 0 ? "oklch(0.82 0.18 80)" : "oklch(0.78 0.18 70)",
                left: `${15 + i * 18}%`,
                bottom: "0%",
              }}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0], y: [0, 8 + i * 1.5, 12], scale: [0.5, 1, 0.4] }}
              transition={{
                duration: 0.7,
                delay: delay + 0.4 + i * 0.05,
                ease: "easeOut",
              }}
            />
          ))}
        </span>
      )}
      <span className="relative z-10 text-zinc-900">{children}</span>
    </span>
  );
}

export function PencilUnderline({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30%" });
  return (
    <span ref={ref} className={cn("relative inline-block", className)}>
      <span>{children}</span>
      <motion.svg
        viewBox="0 0 200 6"
        preserveAspectRatio="none"
        className="absolute left-0 -bottom-1 w-full h-[6px] overflow-visible"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={inView ? { pathLength: 1, opacity: 0.85 } : {}}
        transition={{ duration: 0.9, delay, ease: "easeOut" }}
      >
        <motion.path
          d="M2 3 Q 50 0 100 3 T 198 3"
          stroke="currentColor"
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : {}}
          transition={{ duration: 0.9, delay, ease: "easeOut" }}
        />
      </motion.svg>
    </span>
  );
}
