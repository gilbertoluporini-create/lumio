import Image, { type ImageProps } from "next/image";
import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// Poses do Lumi que têm versão dedicada pro modo NOTURNO (lumi-<pose>-dark.png,
// Lumi em tons escuros/roxos). As demais usam a versão clara no escuro também.
const DARK_POSES = new Set<string>([
  "default", "waving", "thinking", "studying", "celebrating", "sleeping",
  "recording", "confused", "coins", "reading-pdf", "generating", "dashboard",
  "calendar", "notebook", "trophy", "book-open", "headset", "check", "ideia",
  "study", "teclado", "desk", "laptop", "books", "gear",
]);

function lumiDarkSrc(src: string): string | null {
  const m = src.match(/\/illustrations\/lumi-([a-z-]+)\.png$/);
  if (m && DARK_POSES.has(m[1])) return src.replace(/\.png$/, "-dark.png");
  return null;
}

/**
 * Substituto direto do <Image> pras ilustrações do Lumi. No modo noturno troca
 * sozinho pra versão -dark (quando existe), via Tailwind dark: — sem JS, sem
 * flash. Sem versão dark, comporta-se exatamente como <Image>.
 */
export function LumiImg({ src, className, ...rest }: ImageProps) {
  const darkSrc = typeof src === "string" ? lumiDarkSrc(src) : null;
  if (!darkSrc || typeof src !== "string") {
    return <Image src={src} className={className} {...rest} />;
  }
  return (
    <>
      <Image src={src} className={cn(className, "dark:hidden")} {...rest} />
      <Image
        src={darkSrc}
        className={cn(className, "hidden dark:block")}
        {...rest}
      />
    </>
  );
}

/**
 * Versão pra <img> HTML nativo (usado onde o tamanho vem de CSS, não de
 * width/height). Mesmo comportamento do LumiImg: troca pra -dark no modo
 * noturno quando existe. Drop-in dos <img src="/illustrations/lumi-*"> do app.
 */
export function LumiPic({
  src,
  className,
  alt = "",
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const darkSrc = lumiDarkSrc(src);
  if (!darkSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} {...rest} />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn(className, "dark:hidden")}
        {...rest}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={darkSrc}
        alt={alt}
        className={cn(className, "hidden dark:block")}
        {...rest}
      />
    </>
  );
}

export type LumiMood =
  | "default"
  | "thinking"
  | "studying"
  | "celebrating"
  | "sleeping"
  | "recording"
  | "confused"
  | "waving"
  | "coins"
  | "reading-pdf"
  | "generating";

const MOODS: Record<LumiMood, { src: string; alt: string }> = {
  default: { src: "/illustrations/lumi-default.png", alt: "Lumi, mascote do Lumio" },
  thinking: { src: "/illustrations/lumi-thinking.png", alt: "Lumi pensativo" },
  studying: { src: "/illustrations/lumi-studying.png", alt: "Lumi estudando" },
  celebrating: { src: "/illustrations/lumi-celebrating.png", alt: "Lumi comemorando" },
  sleeping: { src: "/illustrations/lumi-sleeping.png", alt: "Lumi dormindo" },
  recording: { src: "/illustrations/lumi-recording.png", alt: "Lumi gravando" },
  confused: { src: "/illustrations/lumi-confused.png", alt: "Lumi confuso" },
  waving: { src: "/illustrations/lumi-waving.png", alt: "Lumi acenando" },
  coins: { src: "/illustrations/lumi-coins.png", alt: "Lumi com Lumi Coins" },
  "reading-pdf": { src: "/illustrations/lumi-reading-pdf.png", alt: "Lumi lendo PDF" },
  generating: { src: "/illustrations/lumi-generating.png", alt: "Lumi gerando resumo" },
};

const SIZES = {
  xs: 32,
  sm: 48,
  md: 80,
  lg: 140,
  xl: 220,
  hero: 360,
} as const;

export type LumiSize = keyof typeof SIZES;

export function LumiCharacter({
  mood = "default",
  size = "md",
  className,
  priority = false,
  float = false,
}: {
  mood?: LumiMood;
  size?: LumiSize;
  className?: string;
  priority?: boolean;
  float?: boolean;
}) {
  const dim = SIZES[size];
  const { src, alt } = MOODS[mood];
  return (
    <div
      className={cn(
        "relative inline-block select-none pointer-events-none",
        float && "animate-lumi-float",
        className,
      )}
      style={{ width: dim, height: dim }}
      aria-hidden="true"
    >
      <LumiImg
        src={src}
        alt={alt}
        width={dim}
        height={dim}
        priority={priority}
        unoptimized
        className="object-contain drop-shadow-lg"
        draggable={false}
      />
    </div>
  );
}

// ============================================================================
// LumiScene — cenas completas com Lumi + contexto (mesa, calendário, etc)
// ============================================================================
export type LumiSceneKey =
  | "hero-desk"
  | "writing-notes"
  | "calendar"
  | "funnel-summary";

const SCENES: Record<LumiSceneKey, { src: string; alt: string }> = {
  "hero-desk": {
    src: "/illustrations/scene-hero-desk.png",
    alt: "Lumi na mesa de estudo com laptop, anotações e livros",
  },
  "writing-notes": {
    src: "/illustrations/scene-writing-notes.png",
    alt: "Lumi escrevendo em um caderno aberto",
  },
  calendar: {
    src: "/illustrations/scene-calendar.png",
    alt: "Lumi apontando pra um calendário semanal",
  },
  "funnel-summary": {
    src: "/illustrations/scene-funnel-summary.png",
    alt: "Lumi gerando resumo: papers organizando-se em um funil",
  },
};

export function LumiScene({
  scene,
  className,
  priority = false,
  float = false,
}: {
  scene: LumiSceneKey;
  className?: string;
  priority?: boolean;
  float?: boolean;
}) {
  const { src, alt } = SCENES[scene];
  return (
    <div
      className={cn(
        "relative select-none pointer-events-none",
        float && "animate-lumi-float",
        className,
      )}
      aria-hidden="true"
    >
      <Image
        src={src}
        alt={alt}
        width={1024}
        height={scene === "hero-desk" ? 576 : 1024}
        priority={priority}
        unoptimized
        className="w-full h-auto object-contain drop-shadow-2xl"
        draggable={false}
      />
    </div>
  );
}

// ============================================================================
// LumiSticker — decorações 3D (estrelas, lápis, livros, etc)
// ============================================================================
export type LumiStickerKey =
  | "stars-1"
  | "stars-2"
  | "pencils"
  | "books"
  | "coffee"
  | "bulbs"
  | "papers"
  | "stationery";

const STICKERS: Record<LumiStickerKey, string> = {
  "stars-1": "/illustrations/sticker-stars-1.png",
  "stars-2": "/illustrations/sticker-stars-2.png",
  pencils: "/illustrations/sticker-pencils.png",
  books: "/illustrations/sticker-books.png",
  coffee: "/illustrations/sticker-coffee.png",
  bulbs: "/illustrations/sticker-bulbs.png",
  papers: "/illustrations/sticker-papers.png",
  stationery: "/illustrations/sticker-stationery.png",
};

export function LumiSticker({
  sticker,
  size = 80,
  className,
  rotate = 0,
}: {
  sticker: LumiStickerKey;
  size?: number;
  className?: string;
  rotate?: number;
}) {
  return (
    <div
      className={cn("relative select-none pointer-events-none", className)}
      style={{ width: size, height: size, transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
    >
      <Image
        src={STICKERS[sticker]}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="object-contain"
        draggable={false}
      />
    </div>
  );
}
