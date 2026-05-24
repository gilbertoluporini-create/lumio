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
  duration = 5,
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
        perspective: `${size * 5}px`,
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
          animation: `lumio-coin-tilt ${duration}s ease-in-out infinite`,
          filter: "drop-shadow(0 16px 28px rgba(124, 58, 237, 0.45))",
          willChange: "transform",
        }}
      />
      <style>{`
        @keyframes lumio-coin-tilt {
          0%   { transform: rotateY(-22deg) rotateX(6deg) translateY(0); }
          25%  { transform: rotateY(14deg)  rotateX(-4deg) translateY(-6px); }
          50%  { transform: rotateY(24deg)  rotateX(6deg) translateY(0); }
          75%  { transform: rotateY(-14deg) rotateX(-4deg) translateY(-6px); }
          100% { transform: rotateY(-22deg) rotateX(6deg) translateY(0); }
        }
      `}</style>
    </div>
  );
}
