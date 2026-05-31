"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Indicador de "pensando" do Lumi com rotação de mensagens estilo Claude
 * (Thinking… / Contemplating… / etc). Mensagens trocam a cada ~2.4s com
 * crossfade. Sequência semi-aleatória pra não parecer scriptado.
 */

const PHASES: readonly string[] = [
  "Pensando",
  "Analisando seu contexto",
  "Conectando ideias",
  "Lendo seu material",
  "Buscando referências",
  "Organizando a resposta",
  "Refinando explicação",
  "Quase lá",
];

const ROTATE_MS = 2400;
const FADE_MS = 180;

type Variant = "inline" | "card";

export function LumiThinking({
  variant = "inline",
  className = "",
}: {
  variant?: Variant;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      // Fade out → troca → fade in
      setVisible(false);
      setTimeout(() => {
        setIdx((prev) => {
          // Pula pra próxima sem repetir a imediatamente anterior
          let next = (prev + 1) % PHASES.length;
          if (next === prev && PHASES.length > 1) next = (next + 1) % PHASES.length;
          return next;
        });
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  if (variant === "card") {
    return (
      <div className={`flex items-center gap-3 text-sm text-muted-foreground ${className}`}>
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/lumi-thinking.png"
            alt="Lumi pensando"
            className="h-10 w-10 animate-pulse object-contain"
          />
        </div>
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span
            className="inline-block transition-opacity ease-out"
            style={{
              transitionDuration: `${FADE_MS}ms`,
              opacity: visible ? 1 : 0,
            }}
          >
            Lumi {PHASES[idx]}…
          </span>
        </span>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span
        className="inline-block transition-opacity ease-out"
        style={{
          transitionDuration: `${FADE_MS}ms`,
          opacity: visible ? 1 : 0,
        }}
      >
        Lumi {PHASES[idx]}…
      </span>
    </span>
  );
}
