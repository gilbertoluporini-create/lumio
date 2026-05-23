import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * LumioMark — usa o personagem Lumi como ícone do logo (versão pequena).
 * Pra contextos onde precisa de SVG escalável (favicons, OG image fallback),
 * usar LumioMarkSVG abaixo.
 */
export function LumioMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative h-8 w-8 shrink-0 select-none pointer-events-none",
        className,
      )}
      aria-hidden="true"
    >
      <Image
        src="/illustrations/lumi-default.png"
        alt=""
        width={64}
        height={64}
        unoptimized
        className="object-contain"
        draggable={false}
        priority
      />
    </div>
  );
}

/**
 * Versão SVG do mark (fallback / favicon / OG). Mantém a estética anterior
 * pra quando o PNG não pode ser usado.
 */
export function LumioMarkSVG({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lumio-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="oklch(0.55 0.22 280)" />
          <stop offset="50%" stopColor="oklch(0.6 0.22 310)" />
          <stop offset="100%" stopColor="oklch(0.65 0.2 340)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="8" fill="url(#lumio-grad)" />
      <path
        d="M9 8.5C9 7.67157 9.67157 7 10.5 7C11.3284 7 12 7.67157 12 8.5V21H20.5C21.3284 21 22 21.6716 22 22.5C22 23.3284 21.3284 24 20.5 24H10.5C9.67157 24 9 23.3284 9 22.5V8.5Z"
        fill="white"
        fillOpacity="0.95"
      />
      <circle cx="22" cy="10" r="3" fill="white" fillOpacity="0.95" />
    </svg>
  );
}

export function LumioWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LumioMark className="h-8 w-8" />
      <span
        className="text-xl font-semibold tracking-tight"
        style={{ letterSpacing: "-0.02em" }}
      >
        Lumio
      </span>
    </div>
  );
}
