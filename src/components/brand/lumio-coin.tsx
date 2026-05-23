import { cn } from "@/lib/utils";

/**
 * LumioCoin — moeda 3D oficial. Único ícone canônico de moeda em todo o app.
 * Usa <img> puro com tamanho forçado via inline style pra funcionar em qualquer container.
 */
export function LumioCoin({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/illustrations/lumio-coin.png"
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
