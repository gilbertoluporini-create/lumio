import { cn } from "@/lib/utils";

/**
 * LumiIcon — ícones 3D oficiais do Lumio (roxos, glossy, com alpha real).
 * Substitui ícones Lucide nos lugares onde queremos destaque visual / personalidade.
 * Pra texto inline e ações secundárias, continue usando Lucide (strokeWidth 1.6).
 *
 * Uso:
 *   <LumiIcon name="mic" size={48} />
 *   <LumiIcon name="sparkle" size={20} className="opacity-70" />
 */

export type LumiIconName =
  | "mic"
  | "sparkle"
  | "layers"
  | "book"
  | "chat"
  | "calendar"
  | "document"
  | "clock"
  | "trophy"
  | "plus"
  | "trash"
  | "settings"
  | "search"
  | "heart"
  | "download"
  | "upload"
  | "bell"
  | "lock";

export const LUMI_ICONS: LumiIconName[] = [
  "mic",
  "sparkle",
  "layers",
  "book",
  "chat",
  "calendar",
  "document",
  "clock",
  "trophy",
  "plus",
  "trash",
  "settings",
  "search",
  "heart",
  "download",
  "upload",
  "bell",
  "lock",
];

export function LumiIcon({
  name,
  size = 24,
  className,
}: {
  name: LumiIconName;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/illustrations/icons/${name}.png`}
      alt=""
      width={size}
      height={size}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        maxWidth: `${size}px`,
        maxHeight: `${size}px`,
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
      }}
      className={cn(
        "shrink-0 select-none pointer-events-none",
        className,
      )}
      aria-hidden="true"
      draggable={false}
    />
  );
}
