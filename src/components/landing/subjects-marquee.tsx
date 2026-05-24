"use client";

import { useReducedMotion } from "framer-motion";
import { getSubjectIcon } from "@/lib/subject-icon";
import { cn } from "@/lib/utils";

const SUBJECTS = [
  { label: "Anatomia" },
  { label: "Cardiologia" },
  { label: "Bioquímica" },
  { label: "Farmacologia" },
  { label: "Direito Civil" },
  { label: "Processo Penal" },
  { label: "Cálculo I" },
  { label: "Mecânica dos Sólidos" },
  { label: "Histologia" },
  { label: "Constitucional" },
  { label: "Tributário" },
  { label: "Termodinâmica" },
  { label: "Patologia" },
  { label: "Embriologia" },
  { label: "Sinais e Sistemas" },
  { label: "Eletromagnetismo" },
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
        {dup.map((s, i) => {
          const Icon = getSubjectIcon(s.label);
          return (
            <span
              key={`${s.label}-${i}`}
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 backdrop-blur px-4 py-2 text-sm font-medium tracking-tight text-foreground/85 shadow-sm"
            >
              <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
              {s.label}
            </span>
          );
        })}
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
