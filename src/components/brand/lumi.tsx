import Image from "next/image";
import { cn } from "@/lib/utils";

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
  coins: { src: "/illustrations/lumi-coins.png", alt: "Lumi com Lumio Coins" },
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
      <Image
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
