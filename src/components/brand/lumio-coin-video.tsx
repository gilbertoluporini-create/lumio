"use client";

import { cn } from "@/lib/utils";

/**
 * LumioCoinVideo — versão animada (vídeo) da moeda Lumio.
 * Usar APENAS em destaques (card de saldo, hero state). Pra ícone pequeno
 * em header/palette/badges continua usando <LumioCoin />.
 *
 * Fallback: se o vídeo falhar, mostra a PNG estática como poster.
 */
export function LumioCoinVideo({
  size = 180,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <video
      src="/illustrations/lumio-coin.mp4"
      poster="/illustrations/lumio-coin.png"
      width={size}
      height={size}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: "contain",
      }}
      className={cn(
        "shrink-0 select-none pointer-events-none",
        className,
      )}
    />
  );
}
