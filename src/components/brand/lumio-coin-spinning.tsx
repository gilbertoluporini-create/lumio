"use client";

import { cn } from "@/lib/utils";

/**
 * LumioCoinSpinning — moeda Lumio girando via CSS 3D (PNG transparente +
 * rotateY infinito). Leve (~10KB da PNG), sem fundo, funciona em qualquer
 * cor de container. Usar em destaques (card de saldo, hero state).
 *
 * Pra ícone pequeno (header, palette, badges), continua usando <LumioCoin />
 * estática — não tem por que animar em 16px.
 */
export function LumioCoinSpinning({
  size = 180,
  duration = 3.2,
  className,
}: {
  size?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 select-none pointer-events-none",
        className,
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        perspective: `${size * 6}px`,
      }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/illustrations/lumio-coin.png"
        alt=""
        width={size}
        height={size}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transformOrigin: "center center",
          animation: `lumio-coin-spin ${duration}s linear infinite`,
          filter: "drop-shadow(0 12px 24px rgba(124, 58, 237, 0.35))",
          willChange: "transform",
        }}
      />
      <style>{`
        @keyframes lumio-coin-spin {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>
    </div>
  );
}
