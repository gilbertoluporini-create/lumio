"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * LumioCoinSpinning — moeda Lumio em 3D real (vídeo com canal alpha).
 *
 * Dois formatos pra cobrir todos os browsers:
 *   - WebM (VP9 + alpha) → Chrome, Firefox, Edge
 *   - MOV (HEVC + alpha) → Safari (macOS/iOS)
 *
 * Loop forçado via timeupdate handler — alguns browsers (notadamente Safari
 * em alguns cenários) deixam o vídeo travar no último frame antes do `loop`
 * disparar. Reiniciamos manualmente quando passa de 99% do duration.
 *
 * Poster fallback: PNG transparente — renderiza imediatamente enquanto
 * o vídeo carrega e serve de fallback se nenhum codec for suportado.
 */
export function LumioCoinSpinning({
  size = 260,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let raf = 0;

    function tick() {
      if (!v || !v.duration || Number.isNaN(v.duration)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // Reinicia ANTES do último frame pra não pegar o congelamento.
      // requestAnimationFrame roda a ~60fps então captura no frame certo.
      const margin = 0.15; // segundos
      if (v.currentTime >= v.duration - margin) {
        v.currentTime = 0;
        // garante que continua tocando (alguns browsers pausam ao reset)
        if (v.paused) void v.play().catch(() => {});
      }
      raf = requestAnimationFrame(tick);
    }

    // dispara play e começa o monitor
    void v.play().catch(() => {});
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <video
      ref={videoRef}
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
        filter: "drop-shadow(0 18px 32px rgba(124, 58, 237, 0.5))",
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
