/* Manejador de notificaciones push. Se inyecta en el service worker
   generado por vite-plugin-pwa (workbox.importScripts). */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Camberas Org", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Camberas Org", {
      body: data.body || "",
      icon: "/org-icon-192.png",
      badge: "/org-icon-192.png",
      tag: data.tag || "camberas-org",
      renotify: true,
      data: { url: data.url || "/org" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/org";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Si la app ya está abierta, la traemos al frente
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
