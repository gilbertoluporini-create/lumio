"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Barra de progresso 0→100 pra operações longas (upload, extração por IA,
 * geração de asset).
 *
 * POR QUE SIMULADO: quase nenhuma dessas operações reporta progresso real —
 * é uma chamada HTTP que fica pendurada até responder. Um spinner sem fim faz
 * o usuário achar que travou; uma barra que ANDA comunica "tá trabalhando".
 *
 * Curva: progresso cresce rápido no começo e desacelera assintoticamente até
 * o teto (90% por padrão) — nunca finge que acabou. Quando `done` vira true,
 * corre pra 100% e segura. Se a operação passar do tempo estimado, a barra
 * continua rastejando (nunca congela), o que mantém a sensação de atividade.
 */

export type ProgressBarProps = {
  /** Enquanto true, a barra avança sozinha. */
  active: boolean;
  /** Quando vira true, corre pra 100%. */
  done?: boolean;
  /** Tempo típico da operação em ms — calibra a velocidade da curva. */
  estimatedMs?: number;
  /** Teto do avanço simulado (0-100). Default 90. */
  ceiling?: number;
  /** Texto acima da barra (ex: "Lendo sua grade…"). */
  label?: string;
  /** Frases que rotacionam durante a espera, dando sinal de vida. */
  steps?: string[];
  /** Mostra o número percentual à direita. Default true. */
  showPercent?: boolean;
  className?: string;
};

const TICK_MS = 120;
const STEP_ROTATE_MS = 2600;

export function useSimulatedProgress({
  active,
  done = false,
  estimatedMs = 12000,
  ceiling = 90,
}: {
  active: boolean;
  done?: boolean;
  estimatedMs?: number;
  ceiling?: number;
}): number {
  const [value, setValue] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active && !done) {
      startedAt.current = null;
      setValue(0);
      return;
    }
    if (done) {
      setValue(100);
      return;
    }
    if (startedAt.current === null) startedAt.current = Date.now();

    const id = window.setInterval(() => {
      const started = startedAt.current;
      if (started === null) return;
      const elapsed = Date.now() - started;
      // Exponencial invertida: 63% do teto em `estimatedMs`, desacelerando.
      const eased = ceiling * (1 - Math.exp(-elapsed / estimatedMs));
      // Rastejo pós-teto: +0.6%/s do que falta, pra nunca parecer travada.
      const overtime = Math.max(0, elapsed - estimatedMs) / 1000;
      const crawl = (ceiling - eased) * Math.min(0.9, overtime * 0.006);
      setValue(Math.min(ceiling + 4, eased + crawl));
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [active, done, estimatedMs, ceiling]);

  return value;
}

export function ProgressBar({
  active,
  done = false,
  estimatedMs = 12000,
  ceiling = 90,
  label,
  steps,
  showPercent = true,
  className,
}: ProgressBarProps) {
  const value = useSimulatedProgress({ active, done, estimatedMs, ceiling });
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!steps || steps.length <= 1 || !active || done) return;
    const id = window.setInterval(
      () => setStepIdx((i) => (i + 1) % steps.length),
      STEP_ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, [steps, active, done]);

  const caption = done
    ? "Pronto"
    : (steps && steps.length > 0 ? steps[stepIdx % steps.length] : label);

  return (
    <div className={cn("w-full", className)}>
      {(caption || showPercent) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {caption && (
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {caption}
            </span>
          )}
          {showPercent && (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {Math.round(value)}%
            </span>
          )}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-label={label ?? "Progresso"}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-fuchsia-500 transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Bloco pronto pra estados de carregamento dentro de dialogs: barra + legenda
 * centralizada, no lugar do spinner sem fim.
 */
export function ProgressPanel({
  label,
  steps,
  estimatedMs,
  done,
  hint,
  className,
}: {
  label: string;
  steps?: string[];
  estimatedMs?: number;
  done?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col justify-center gap-3 py-10", className)}>
      <ProgressBar
        active
        done={done}
        estimatedMs={estimatedMs}
        label={label}
        steps={steps}
      />
      {hint && (
        <p className="text-center text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
