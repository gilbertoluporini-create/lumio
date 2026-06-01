"use client";

/**
 * useNotificationPermission
 *
 * Hook client-side pra gerenciar Web Push Notifications no Lumio.
 *
 * Fluxo `requestAndSubscribe`:
 *  1) Notification.requestPermission() — popup nativo do browser.
 *  2) Se granted → registra `/sw.js` no Service Worker registry.
 *  3) pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
 *     usando NEXT_PUBLIC_VAPID_PUBLIC_KEY (base64url → Uint8Array).
 *  4) POST `/api/notifications/subscribe` com endpoint + keys + UA.
 *
 * Fluxo `unsubscribe`:
 *  1) Pega sub atual via registration.pushManager.getSubscription().
 *  2) sub.unsubscribe() no browser.
 *  3) DELETE `/api/notifications/subscribe` com endpoint.
 *
 * Estado exposto:
 *   permission   — 'default' | 'granted' | 'denied' | 'unsupported'
 *   subscribed   — boolean (tem PushSubscription ativa nesse browser)
 *   loading      — true durante request/unsubscribe
 *   request()    — dispara o flow de subscribe
 *   unsubscribe()— remove a sub
 */
import { useCallback, useEffect, useState } from "react";

type PermissionState = "default" | "granted" | "denied" | "unsupported";

/** Converte VAPID public key base64url → Uint8Array (formato exigido pelo
 *  pushManager.subscribe). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** ArrayBuffer → base64 (sem URL-safe). Used pra serializar keys
 *  p256dh/auth da subscription pro nosso backend. */
function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function detectSupport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export type UsePushPermission = {
  permission: PermissionState;
  subscribed: boolean;
  loading: boolean;
  supported: boolean;
  request: () => Promise<{ permission: PermissionState; subscribed: boolean }>;
  unsubscribe: () => Promise<void>;
};

export function useNotificationPermission(): UsePushPermission {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const sup = detectSupport();
    setSupported(sup);
    if (!sup) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);

    // Verifica se já existe sub ativa nesse browser (caso o user já tenha
    // ativado em outra sessão).
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {
        /* silencioso — first-time user pode não ter SW ainda */
      }
    })();
  }, []);

  const request = useCallback(async (): Promise<{
    permission: PermissionState;
    subscribed: boolean;
  }> => {
    if (!detectSupport()) {
      return { permission: "unsupported", subscribed: false };
    }
    setLoading(true);
    try {
      const perm = (await Notification.requestPermission()) as PermissionState;
      setPermission(perm);
      if (perm !== "granted") {
        return { permission: perm, subscribed: false };
      }

      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapid) {
        console.error(
          "[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY ausente — não dá pra subscribe.",
        );
        return { permission: perm, subscribed: false };
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      // Garante que o SW está pronto antes de subscribe (evita race em
      // first-install do worker).
      await navigator.serviceWorker.ready;

      // Se já houver sub, reusa em vez de criar dupla.
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // applicationServerKey espera BufferSource. Passa o .buffer pra
        // contornar variância de tipos do Uint8Array entre versões do TS lib
        // dom (Uint8Array<ArrayBufferLike> vs BufferSource).
        const vapidKey = urlBase64ToUint8Array(vapid);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey.buffer as ArrayBuffer,
        });
      }

      const subJson = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const endpoint = subJson.endpoint ?? sub.endpoint;
      const p256dh =
        subJson.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
      const authKey =
        subJson.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));

      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint,
          p256dh,
          auth_key: authKey,
          user_agent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        console.error("[push] subscribe POST failed", res.status);
        return { permission: perm, subscribed: false };
      }

      setSubscribed(true);
      return { permission: perm, subscribed: true };
    } catch (err) {
      console.error("[push] request failed", (err as Error).message);
      return { permission: "denied", subscribed: false };
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!detectSupport()) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) {
        setSubscribed(false);
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setSubscribed(false);
        return;
      }
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try {
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      } catch (err) {
        console.warn("[push] backend delete failed", (err as Error).message);
      }
      setSubscribed(false);
    } catch (err) {
      console.error("[push] unsubscribe failed", (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permission,
    subscribed,
    loading,
    supported,
    request,
    unsubscribe,
  };
}
