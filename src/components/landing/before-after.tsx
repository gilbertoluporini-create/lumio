"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

export function BeforeAfter() {
  const [pos, setPos] = useState(48);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let dir = 1;
    let cur = 48;
    let auto = true;
    const onDown = () => {
      auto = false;
    };
    window.addEventListener("pointerdown", onDown, { once: true });
    const tick = () => {
      if (auto) {
        cur += 0.15 * dir;
        if (cur > 62) dir = -1;
        if (cur < 36) dir = 1;
        setPos(cur);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [reduce]);

  const updateFromEvent = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setPos(x * 100);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md aspect-[16/9] md:aspect-[2/1] cursor-ew-resize"
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        updateFromEvent(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        updateFromEvent(e.clientX);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
    >
      <div className="absolute inset-0 paper-texture">
        <div className="absolute inset-0 px-6 py-5 md:px-10 md:py-8 overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-2">
            Aula transcrita · bruta
          </p>
          <p className="text-[11px] md:text-xs leading-snug text-foreground/55 font-mono">
            entao galera a suprarrenal direita ela tem aquele formato meio
            piramidal ta ja a esquerda ela é mais semilunar ok hum ambas elas
            ficam ali no espaço retroperitoneal sobre os rins e tao em contato
            com o diafragma deixa eu ver aqui no slide ah sim a vascularização
            vem de três artérias principais a frenica inferior a aorta e a
            renal entao se a gente for olhar pra prova vai cair isso de novo
            como caiu no ano passado…
          </p>
        </div>
      </div>

      <div
        className="absolute inset-y-0 left-0 overflow-hidden bg-gradient-to-br from-background to-secondary/40"
        style={{ width: `${pos}%` }}
      >
        <div className="absolute inset-0 px-6 py-5 md:px-10 md:py-8 w-screen max-w-none">
          <p className="text-[10px] uppercase tracking-wider text-primary font-mono mb-2">
            Resumo Lumio · estruturado
          </p>
          <h4 className="text-base md:text-lg font-semibold tracking-tight mb-2">
            Suprarrenais — pontos-chave
          </h4>
          <ul className="space-y-1.5 text-xs md:text-sm text-foreground/85">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              Direita: <strong className="font-semibold">piramidal</strong>.
              Esquerda: <strong className="font-semibold">semilunar</strong>.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              Localização: retroperitoneal, sobre os rins.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              Contato direto com o diafragma.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              Vascularização: frênica inferior, aorta, renal.
            </li>
          </ul>
        </div>
      </div>

      <div
        className="absolute inset-y-0 z-20 w-px bg-gradient-to-b from-primary/60 via-primary to-primary/60 pointer-events-none"
        style={{ left: `${pos}%` }}
      />
      <div
        className="absolute top-1/2 z-30 -translate-y-1/2 -translate-x-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-background border border-primary/60 shadow-lg cursor-ew-resize"
        style={{ left: `${pos}%` }}
        aria-hidden
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        >
          <path d="M8 6L2 12l6 6" />
          <path d="M16 6l6 6-6 6" />
        </svg>
      </div>

      <div className="absolute top-3 right-3 z-20 inline-flex items-center gap-2 rounded-full bg-background/70 backdrop-blur border border-border/60 px-2.5 py-1 text-[10px] font-medium tracking-tight">
        arraste pra comparar
      </div>
    </div>
  );
}
