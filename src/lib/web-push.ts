/**
 * src/lib/web-push.ts
 *
 * Helper centralizado pra disparo de Web Push Notifications via lib `web-push`.
 *
 * Fluxo do `sendPushToUser`:
 *  1) SELECT todas as `push_subscriptions` do user.
 *  2) Pra cada sub, envia o payload via webpush.sendNotification.
 *  3) Se a sub retornar 404/410 (gone) → DELETE da row (browser/device removeu).
 *  4) INSERT em `notifications_log` com status 'sent' (ou 'failed' se tudo deu erro).
 *
 * VAPID keys ficam em env vars:
 *   - VAPID_PUBLIC_KEY            (server, pra setVapidDetails)
 *   - VAPID_PRIVATE_KEY           (server, pra setVapidDetails)
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY (client, pra pushManager.subscribe)
 *
 * Pra gerar as keys (uma vez só): `npx web-push generate-vapid-keys`.
 *
 * ATENÇÃO: a lib `web-push` precisa estar instalada. Como não rodamos
 * `npm install` aqui, o import é dinâmico — se a lib faltar, falha controlada.
 */
import type { createAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;

type SendPushParams = {
  admin: AdminClient;
  userId: string;
  title: string;
  body: string;
  /** Tipo da notif (ex: 'exam_reminder', 'new_summary'). Vai pro notifications_log. */
  type?: string;
  /** Payload custom enviado pro service worker (ex: { url: '/planos/abc', plan_id }). */
  payload?: Record<string, unknown>;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

/**
 * Configura VAPID details lazy — só na primeira chamada. Evita crash em
 * cold start quando as env vars não estão setadas (dev local).
 */
let vapidConfigured = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWebPush(): Promise<any> {
  // Dynamic import: lib é opcional em runtime. Se não tiver, lança erro
  // legível em vez de quebrar build.
  let mod;
  try {
    // @ts-expect-error — `web-push` é dep opcional (sem @types instalados);
    // build/runtime conferem em getWebPush antes de chamar.
    mod = await import("web-push");
  } catch (err) {
    throw new Error(
      `web-push não está instalado. Rode \`npm install web-push\` no projeto. (${(err as Error).message})`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webpush = (mod as any).default ?? mod;

  if (!vapidConfigured) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      throw new Error(
        "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configuradas. Gere com `npx web-push generate-vapid-keys`.",
      );
    }
    webpush.setVapidDetails("mailto:contato@lumioapp.net", pub, priv);
    vapidConfigured = true;
  }

  return webpush;
}

export type SendPushResult = {
  totalSubs: number;
  sent: number;
  removed: number;
  failed: number;
};

/**
 * Envia push pra TODOS os devices/browsers do user (uma sub por device).
 * Trata 404/410 como sub morta — limpa do DB. Outros erros vão pro log
 * em status 'failed'. Não lança — devolve um summary.
 */
export async function sendPushToUser(
  params: SendPushParams,
): Promise<SendPushResult> {
  const { admin, userId, title, body, type = "general", payload = {} } = params;
  const result: SendPushResult = {
    totalSubs: 0,
    sent: 0,
    removed: 0,
    failed: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webpush: any;
  try {
    webpush = await getWebPush();
  } catch (err) {
    console.error("[web-push] init failed", (err as Error).message);
    // Log como failed pra dar visibilidade no admin
    await admin.from("notifications_log").insert({
      user_id: userId,
      type,
      title,
      body,
      payload,
      status: "failed",
    });
    return result;
  }

  const { data: subs, error: subsErr } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId);

  if (subsErr) {
    console.error("[web-push] select subs failed", subsErr);
    return result;
  }

  const subList = (subs ?? []) as PushSubscriptionRow[];
  result.totalSubs = subList.length;

  if (subList.length === 0) {
    // Sem sub = sem como entregar. Não loga como sent.
    return result;
  }

  const serialized = JSON.stringify({ title, body, payload });

  for (const sub of subList) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        serialized,
      );
      result.sent++;
    } catch (err) {
      const statusCode =
        (err as { statusCode?: number; status?: number }).statusCode ??
        (err as { statusCode?: number; status?: number }).status ??
        0;
      if (statusCode === 404 || statusCode === 410) {
        // Sub morta — remove
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("id", sub.id);
        result.removed++;
      } else {
        console.warn(
          "[web-push] send failed",
          statusCode,
          (err as Error).message,
        );
        result.failed++;
      }
    }
  }

  // Loga 1 row por envio (representa a notificação lógica, não por device).
  // Status 'sent' se pelo menos 1 device recebeu; 'failed' se 0 devices.
  await admin.from("notifications_log").insert({
    user_id: userId,
    type,
    title,
    body,
    payload,
    status: result.sent > 0 ? "sent" : "failed",
  });

  return result;
}
