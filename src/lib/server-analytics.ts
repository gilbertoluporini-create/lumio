import crypto from "crypto";

/**
 * Server-side tracking: dispara conversões via Meta Conversions API + GA4
 * Measurement Protocol. Importante pra capturar eventos que o client poderia
 * perder (user fechou tab antes do /success carregar, adblock bloqueando Pixel,
 * iOS ITP cortando cookies).
 *
 * Falha silenciosa: nunca quebra o fluxo principal. Loga erro e segue.
 */

type ServerEventPayload = {
  /** ID do evento (deduplica com client) — usar mesmo ID nos dois lados. */
  eventId?: string;
  /** Nome canônico interno (purchase, sign_up, generate_lead, etc). */
  name: string;
  /** Valor em currency units (ex: 39 pra R$ 39). */
  value?: number;
  currency?: string;
  /** Email do user pra advanced matching (será hasheado SHA-256). */
  email?: string;
  /** ID interno (Supabase user.id) — hasheado pra Meta, raw pra GA4. */
  externalId?: string;
  /** URL onde o evento aconteceu (default APP_URL). */
  eventSourceUrl?: string;
  /** IP do client (pra Meta matching). */
  clientIp?: string;
  /** User-Agent do client. */
  userAgent?: string;
  /** Custom data adicional. */
  custom?: Record<string, string | number | boolean>;
};

const META_STANDARD: Record<string, string> = {
  sign_up: "CompleteRegistration",
  log_in: "Login",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
  generate_lead: "Lead",
  view_item: "ViewContent",
};

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}

function appsecretProof(token: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

/** Envia evento ao Meta Conversions API. */
async function sendMetaCapi(p: ServerEventPayload): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_ACCESS_TOKEN;
  const secret = process.env.META_APP_SECRET;
  if (!pixelId || !token || !secret) return;

  const metaEventName = META_STANDARD[p.name] ?? p.name;
  const userData: Record<string, string | string[]> = {};
  if (p.email) userData.em = [sha256(p.email)];
  if (p.externalId) userData.external_id = [sha256(p.externalId)];
  if (p.clientIp) userData.client_ip_address = p.clientIp;
  if (p.userAgent) userData.client_user_agent = p.userAgent;

  const customData: Record<string, unknown> = { ...(p.custom ?? {}) };
  if (typeof p.value === "number") customData.value = p.value;
  if (p.currency) customData.currency = p.currency;

  const body = {
    data: [
      {
        event_name: metaEventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: p.eventId,
        action_source: "website",
        event_source_url:
          p.eventSourceUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.lumioapp.net",
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  const proof = appsecretProof(token, secret);
  const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}&appsecret_proof=${proof}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[server-analytics] meta CAPI failed", res.status, text);
    }
  } catch (err) {
    console.error("[server-analytics] meta CAPI threw", err);
  }
}

/** Envia evento ao GA4 via Measurement Protocol. */
async function sendGa4(p: ServerEventPayload): Promise<void> {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_MEASUREMENT_PROTOCOL_SECRET;
  if (!measurementId || !apiSecret) return;

  // client_id: GA4 espera UUID-ish. Se temos externalId (user.id), derivamos
  // determinístico via hash; senão geramos random (perde continuidade mas
  // evento entra).
  const clientId = p.externalId
    ? crypto.createHash("md5").update(p.externalId).digest("hex").slice(0, 24)
    : crypto.randomUUID();

  const params: Record<string, unknown> = { ...(p.custom ?? {}) };
  if (typeof p.value === "number") params.value = p.value;
  if (p.currency) params.currency = p.currency;
  // GA4 reserva "engagement_time_msec" — sinaliza sessão ativa
  params.engagement_time_msec = 1;
  if (p.eventId) params.transaction_id = p.eventId;

  const body = {
    client_id: clientId,
    user_id: p.externalId,
    events: [{ name: p.name, params }],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[server-analytics] ga4 MP failed", res.status, text);
    }
  } catch (err) {
    console.error("[server-analytics] ga4 MP threw", err);
  }
}

/** Fan-out server-side: Meta CAPI + GA4 MP em paralelo, falha silenciosa. */
export async function trackServerEvent(payload: ServerEventPayload): Promise<void> {
  await Promise.allSettled([sendMetaCapi(payload), sendGa4(payload)]);
}

/** Helper específico pra compra confirmada via Stripe. */
export async function trackPurchaseServer(opts: {
  userId: string;
  email?: string;
  plan: string;
  value: number;
  currency?: string;
  sessionId: string;
  clientIp?: string;
  userAgent?: string;
}): Promise<void> {
  await trackServerEvent({
    name: "purchase",
    eventId: opts.sessionId,
    value: opts.value,
    currency: opts.currency ?? "BRL",
    email: opts.email,
    externalId: opts.userId,
    clientIp: opts.clientIp,
    userAgent: opts.userAgent,
    custom: { plan: opts.plan },
  });
}
