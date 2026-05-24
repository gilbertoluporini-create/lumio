"use client";

import { cn } from "@/lib/utils";

/**
 * LumioCoinSpinning — moeda Lumio em 3D real (vídeo com canal alpha).
 *
 * Dois formatos pra cobrir todos os browsers:
 *   - WebM (VP9 + alpha) → Chrome, Firefox, Edge
 *   - MOV (HEVC + alpha) → Safari (macOS/iOS)
 *
 * Poster fallback: PNG transparente — renderiza imediatamente enquanto
 * o vídeo carrega e serve de fallback se nenhum codec for suportado.
 *
 * Usar APENAS em destaques grandes (card de saldo, hero). Pra ícones
 * pequenos (header, palette, badges) continua usando <LumioCoin /> PNG.
 */
export function LumioCoinSpinning({
  size = 200,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <video
      width={size}
      height={size}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster="/illustrations/lumio-coin.png"
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "contain",
        filter: "drop-shadow(0 16px 28px rgba(124, 58, 237, 0.45))",
      }}
      className={cn(
        "shrink-0 select-none pointer-events-none",
        className,
      )}
    >
      {/* Safari (HEVC com alpha) */}
      <source src="/illustrations/lumio-coin.mov" type='video/mp4; codecs="hvc1"' />
      {/* Chrome / Firefox (VP9 com alpha) */}
      <source src="/illustrations/lumio-coin.webm" type="video/webm" />
    </video>
  );
}
