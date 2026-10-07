/**
 * Minimal service worker for Chrome/Android PWA installability, plus Web Push
 * for the shop 提醒 lock-screen notifications (报修 / 报问题 / 已修好).
 * Network pass-through only — not an offline shell or sync layer.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "提醒";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      tag: payload.tag,
      icon: "/icons/192.png",
      badge: "/icons/192.png",
      data: { url: payload.url || "/shop/alerts" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/shop/alerts",
    self.location.origin
  ).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client) {
            return client.focus().then((focused) =>
              "navigate" in focused ? focused.navigate(target) : focused
            );
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
