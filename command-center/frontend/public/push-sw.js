// Web Push handlers for the installed PWA.
//
// Workbox's generated service worker importScripts() this file (see
// vite.config.ts -> workbox.importScripts), so these listeners register in the
// same SW scope as the precache / runtime caching. Kept as a plain static file
// in public/ (copied to the site root as /push-sw.js) so it isn't bundled.
//
// The backend sends a JSON payload { title, body, url, icon }; we surface it as
// a notification and focus (or open) the app when it's tapped. iOS requires a
// user-visible notification for every push, which showNotification satisfies.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Command Center", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Command Center";
  const options = {
    body: data.body || "",
    icon: data.icon || "/android-chrome-192x192.png",
    badge: "/favicon-32x32.png",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(target);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      }),
  );
});
