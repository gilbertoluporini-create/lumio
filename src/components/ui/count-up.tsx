"use client";

import { useCountUp } from "@/hooks/use-count-up";

/**
 * Número animado (count-up) com prefixo/sufixo opcionais.
 * Usa `tabular-nums` por padrão pra não dançar a largura enquanto conta.
 */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  durationMs,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const display = useCountUp(value, { durationMs });
  return (
    <span className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
