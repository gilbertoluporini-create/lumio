"use client";

import { useEffect } from "react";

/**
 * Só no app nativo (Capacitor): trava o zoom do WebView.
 * Sem isso, o iOS dá auto-zoom ao focar inputs com fonte < 16px (ex: text-sm
 * do nosso Input) e não volta — a tela "entra zoomada" depois de digitar.
 * No browser/PWA é no-op (mantém pinch-zoom pra acessibilidade).
 */
export function NativeViewportLock() {
  useEffect(() => {
    const cap = (
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    let meta = document.querySelector(
      'meta[name="viewport"]',
    ) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );
  }, []);

  return null;
}
