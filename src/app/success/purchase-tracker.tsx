"use client";

import { useEffect, useRef } from "react";
import { Analytics } from "@/lib/analytics";

/**
 * Dispara evento `purchase` em GA4/Meta/PostHog quando a /success monta.
 * Antifire: usa sessionStorage pra não disparar 2x no mesmo session_id (Stripe webhook
 * é a fonte de verdade pra MRR; isso é só pra tracking de conversão).
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
    fired.current = true;
    try {
      const key = `lumio.purchase_tracked.${sessionId ?? "unknown"}`;
      if (sessionId && sessionStorage.getItem(key)) return;
      Analytics.purchase(plan ?? "unknown", valueBrl ?? 0, "BRL");
      if (sessionId) sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [sessionId, plan, valueBrl]);
  return null;
}
