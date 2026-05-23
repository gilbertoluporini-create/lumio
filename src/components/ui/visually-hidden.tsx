/**
 * VisuallyHidden — acessível pra screen readers, invisível visualmente.
 * Usado pra labels/titles de Dialogs que não devem aparecer visualmente.
 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        border: 0,
        clip: "rect(0 0 0 0)",
        height: "1px",
        margin: "-1px",
        overflow: "hidden",
        padding: 0,
        position: "absolute",
        whiteSpace: "nowrap",
        width: "1px",
      }}
    >
      {children}
    </span>
  );
}
