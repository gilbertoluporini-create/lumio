"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const SUBJECTS = [
  { label: "Anatomia", emoji: "🫀" },
  { label: "Cardiologia", emoji: "💓" },
  { label: "Bioquímica", emoji: "🧬" },
  { label: "Farmacologia", emoji: "💊" },
  { label: "Direito Civil", emoji: "⚖️" },
  { label: "Processo Penal", emoji: "📜" },
  { label: "Cálculo I", emoji: "∫" },
  { label: "Mecânica dos Sólidos", emoji: "🏗️" },
  { label: "Histologia", emoji: "🔬" },
  { label: "Constitucional", emoji: "🏛️" },
  { label: "Tributário", emoji: "💰" },
  { label: "Termodinâmica", emoji: "🔥" },
  { label: "Patologia", emoji: "🧫" },
  { label: "Embriologia", emoji: "🥚" },
  { label: "Sinais e Sistemas", emoji: "📡" },
  { label: "Eletromagnetismo", emoji: "⚡" },
];

export function SubjectsMarquee({
  speed = 38,
  reverse = false,
  className,
}: {
  speed?: number;
  reverse?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const dup = [...SUBJECTS, ...SUBJECTS];
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        "[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
        className,
      )}
    >
      <div
        className="flex gap-3 whitespace-nowrap will-change-transform motion-reduce:!animate-none"
        style={{
          animation: reduce
            ? "none"
            : `subjects-marquee ${speed}s linear infinite${reverse ? " reverse" : ""}`,
        }}
      >
        {dup.map((s, i) => (
          <span
            key={`${s.label}-${i}`}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 backdrop-blur px-4 py-2 text-sm font-medium tracking-tight text-foreground/85 shadow-sm"
          >
            <span aria-hidden className="text-base leading-none">
              {s.emoji}
            </span>
            {s.label}
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes subjects-marquee {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(-50%, 0, 0);
          }
        }
      `}</style>
    </div>
  );
}
