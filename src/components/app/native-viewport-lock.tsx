"use client";

import { useEffect } from "react";

/**
 * Só no app nativo (Capacitor): trava o zoom do WebView e marca
 * `<html class="native-app">`. Sem o lock, o iOS dá auto-zoom ao focar
 * inputs com fonte < 16px e não volta. A classe `native-app` permite
 * escopar o CSS de "toque nativo" (sem tap-highlight, sem bounce, sem
 * seleção/lupa em botões) só dentro do app — o site (desktop e web mobile)
 * fica intacto. No browser/PWA é no-op (mantém pinch-zoom pra acessibilidade).
 */
export function NativeViewportLock() {
  useEffect(() => {
    const cap = (
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    document.documentElement.classList.add("native-app");

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
