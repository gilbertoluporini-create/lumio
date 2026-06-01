/* Lumio Web Push Service Worker
 *
 * Responsável por:
 *  1) receber push event → exibir notificação nativa do OS
 *  2) tratar click → abrir/focar a URL do payload
 *
 * Payload esperado (vem do servidor):
 *   { title: string, body: string, payload?: { url?: string, ...} }
 *
 * Ícones vivem em /icons/. Se faltarem, browser usa fallback default.
 */

self.addEventListener("install", function (event) {
  // Ativa imediatamente sem aguardar fechamento de abas antigas.
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    // Fallback: payload texto puro
    data = { title: "Lumi", body: event.data.text() };
  }

  const title = data.title || "Lumi";
  const options = {
    body: data.body || "",
    icon: "/icons/lumi-192.png",
    badge: "/icons/lumi-badge.png",
    data: data.payload || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientsArr) {
        // Se já tiver uma aba do Lumio aberta, foca nela e navega.
        for (const client of clientsArr) {
          if ("focus" in client) {
            client.navigate(target).catch(function () {});
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
      }),
  );
});
