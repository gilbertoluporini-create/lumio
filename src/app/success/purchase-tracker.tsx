"use client";

import { useEffect, useRef } from "react";
import { Analytics } from "@/lib/analytics";

/**
 * Dispara evento `purchase` em GA4/Meta/PostHog quando a /success monta.
 *
 * Antifire: sessionStorage por session_id pra não duplicar.
 *
 * Robustez: aguarda window.posthog estar disponível antes de capturar (o
 * snippet do PostHog é async — sem isso, o capture pode ser perdido em
 * cold loads).
 */
export function PurchaseTracker({
  sessionId,
  plan,
  valueBrl,
}: {
  sessionId?: string;
  plan?: string;
  valueBrl?: number;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;

    const key = `lumio.purchase_tracked.${sessionId ?? "unknown"}`;
    try {
      if (sessionId && sessionStorage.getItem(key)) return;
    } catch {
      /* ignore */
    }

    const dispatch = () => {
      if (fired.current) return;
      fired.current = true;
      try {
        Analytics.purchase(plan ?? "unknown", valueBrl ?? 0, "BRL");
        if (sessionId) sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    };

    // PostHog snippet expõe o stub imediatamente, mas o `capture` real só
    // funciona após array.js carregar. Aguardamos até 2s, dispara mesmo se
    // não confirmar (GA4/Pixel não dependem disso).
    const start = Date.now();
    const tick = () => {
      type PostHogStub = { _i?: unknown; capture?: (e: string, p?: unknown) => void };
      const ph = (window as { posthog?: PostHogStub }).posthog;
      const ready = ph && (!ph._i || typeof ph.capture === "function");
      if (ready || Date.now() - start > 2000) {
        dispatch();
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  }, [sessionId, plan, valueBrl]);

  return null;
}
