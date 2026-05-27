"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureUtmFromUrl } from "@/lib/utm-tracker";

/**
 * Roda no client em todo carregamento + mudança de rota.
 * Single source of truth pra atribuição — só este componente chama captureUtm.
 *
 * Posicionado no root layout depois do AnalyticsScripts (pra garantir que
 * window.posthog já existe quando registrar super properties).
 *
 * Por que rodar em mudança de rota? Next.js SPA-navigates entre páginas; se
 * o user clica um link interno com `?utm_*=...` (raro mas possível), queremos
 * capturar last-touch sem reload.
 */
export function UtmCapture() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    // Pequeno delay garante que o script do PostHog terminou de inicializar
    // antes da gente tentar `posthog.register`. Não-crítico — captureUtmFromUrl
    // é idempotente e tolera PostHog ausente.
    const t = setTimeout(() => {
      captureUtmFromUrl();
    }, 50);
    return () => clearTimeout(t);
  }, [pathname, params]);

  return null;
}
