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
        className="absolute inset-x-0 bottom-[8%] h-[42%] -z-0 rounded-[2px]"
        style={{
          background:
            "linear-gradient(120deg, oklch(0.88 0.18 90 / 0.7), oklch(0.82 0.18 70 / 0.7))",
          transformOrigin: "left center",
        }}
        initial={{ scaleX: 0 }}
        animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.7, delay, ease: [0.65, 0, 0.35, 1] }}
      />
      <span className="relative z-10">{children}</span>
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
