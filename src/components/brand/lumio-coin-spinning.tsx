"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const SPRITE_URL = "/illustrations/lumio-coin-sprite.webp";
const COLS = 16;
const ROWS = 12;
const TOTAL_FRAMES = 192;
const FPS = 30;
const FRAME_MS = 1000 / FPS;

/**
 * LumioCoinSpinning — moeda Lumio em 3D real, renderizada via sprite sheet.
 *
 * Abandonado o caminho de <video> porque WebM/MOV com alpha trava em loop
 * (codec issue, não emenda). Sprite sheet WebP com 192 frames 192x192:
 * - Loop matemático (currentTime % 192), impossível de travar.
 * - Sem decoder de vídeo, sem buffer.
 * - 248KB transferidos uma única vez.
 * - 30fps controlado por requestAnimationFrame.
 */
export function LumioCoinSpinning({
  size = 260,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    let raf = 0;
    const start = performance.now();

    // Ping-pong loop: 0→191→190→...→1→0→1→... — matematicamente perfeito.
    // O "reset" visível antes era porque o frame 191 não conecta com o frame 0
    // (vídeo source não era loop fechado). Indo e voltando elimina o salto e
    // visualmente parece moeda 3D girando (cara → coroa → cara → coroa).
    const PINGPONG_CYCLE = (TOTAL_FRAMES - 1) * 2;

    function tick(now: number) {
      if (!el) return;
      const elapsed = now - start;
      const t = Math.floor(elapsed / FRAME_MS) % PINGPONG_CYCLE;
      const frame = t < TOTAL_FRAMES ? t : PINGPONG_CYCLE - t;
      const col = frame % COLS;
      const row = Math.floor(frame / COLS);
      el.style.backgroundPosition = `-${col * size}px -${row * size}px`;
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div
      aria-hidden="true"
      className={cn("shrink-0 select-none pointer-events-none", className)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        filter: "drop-shadow(0 18px 32px rgba(124, 58, 237, 0.5))",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundImage: `url(${SPRITE_URL})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${size * COLS}px ${size * ROWS}px`,
          backgroundPosition: "0 0",
          imageRendering: "auto",
        }}
      />
    </div>
  );
}
