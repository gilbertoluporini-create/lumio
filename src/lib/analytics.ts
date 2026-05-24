/**
 * Analytics helpers — fan-out de eventos pra GA4, Meta Pixel, PostHog.
 *
 * Cada provider é opcional via env. Se a chave não estiver setada, o
 * provider é silenciosamente ignorado (não quebra o app).
 *
 * Eventos padronizados:
 *   - page_view (automático via Script tag)
 *   - sign_up / log_in
 *   - begin_checkout / purchase
 *   - generate_lead (waitlist, embaixador form)
 *   - asset_generated (resumo, flashcards, quiz, mapa, voice)
 *
 * Use sempre pelos helpers (ex: trackSignup) pra manter naming consistente.
 */

type EventPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (
      command: "event" | "config" | "consent",
      eventNameOrId: string,
      params?: EventPayload,
    ) => void;
    fbq?: (
      command: "track" | "trackCustom" | "init",
      eventName: string,
      params?: EventPayload,
    ) => void;
    posthog?: {
      capture: (event: string, props?: EventPayload) => void;
      identify: (id: string, props?: EventPayload) => void;
    };
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Helper genérico: dispara um evento em todos os providers ativos. */
export function trackEvent(name: string, payload: EventPayload = {}): void {
  if (!isBrowser()) return;
  try {
    window.gtag?.("event", name, payload);
  } catch {
    /* ignore */
  }
  try {
    // Meta Pixel: eventos padrão (PageView, Lead, CompleteRegistration, Purchase)
    // são "track"; eventos custom são "trackCustom". Mapeamos abaixo.
    const META_STANDARD: Record<string, string> = {
      sign_up: "CompleteRegistration",
      log_in: "Login",
      begin_checkout: "InitiateCheckout",
      purchase: "Purchase",
      generate_lead: "Lead",
      view_item: "ViewContent",
    };
    const metaEvent = META_STANDARD[name];
    if (metaEvent) {
      window.fbq?.("track", metaEvent, payload);
    } else {
      window.fbq?.("trackCustom", name, payload);
    }
  } catch {
    /* ignore */
  }
  try {
    window.posthog?.capture(name, payload);
  } catch {
    /* ignore */
  }
}

/** Identifica o user nos providers (após login). */
export function identifyUser(opts: {
  id: string;
  email?: string;
  plan?: string;
  name?: string;
}): void {
  if (!isBrowser()) return;
  try {
    window.gtag?.("config", process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "", {
      user_id: opts.id,
    });
  } catch {
    /* ignore */
  }
  try {
    window.posthog?.identify(opts.id, {
      email: opts.email,
      plan: opts.plan,
      name: opts.name,
    });
  } catch {
    /* ignore */
  }
  // Meta Pixel não tem identify "puro" — passa email/external_id como advanced matching no init.
}

/** Helpers nomeados — facilita audit + busca por uso. */
export const Analytics = {
  pageView(path: string) {
    trackEvent("page_view", { path });
  },
  signUp(method: "google" | "password" | "magic_link") {
    trackEvent("sign_up", { method });
  },
  logIn(method: "google" | "password" | "magic_link") {
    trackEvent("log_in", { method });
  },
  beginCheckout(plan: string, value: number, currency: string = "BRL") {
    trackEvent("begin_checkout", { plan, value, currency });
  },
  purchase(plan: string, value: number, currency: string = "BRL") {
    trackEvent("purchase", { plan, value, currency });
  },
  generateLead(source: string) {
    trackEvent("generate_lead", { source });
  },
  assetGenerated(kind: "summary" | "flashcards" | "quiz" | "mindmap" | "voice", withImages?: boolean) {
    trackEvent("asset_generated", { kind, withImages: withImages ?? false });
  },
  viewItem(item: string) {
    trackEvent("view_item", { item });
  },
};
