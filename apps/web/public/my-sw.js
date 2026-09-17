// myTafelwerk: Service-Worker fuer Installierbarkeit und Push. Kein Caching von Fachdaten
// (kein veralteter Stand); nur die App-Huelle wird bei Netzausfall aus dem Cache gezeigt.
const HUELLE = "my-huelle-v1";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(HUELLE).then((c) => c.addAll(["/my-offline.html"]).catch(() => {}))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match("/my-offline.html")));
});
self.addEventListener("push", (e) => {
  let d = { title: "myTafelwerk", body: "", url: "/my", tag: undefined };
  try { d = Object.assign(d, e.data.json()); } catch { d.body = e.data ? e.data.text() : ""; }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "/icon.svg", badge: "/icon.svg", tag: d.tag, data: { url: d.url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/my";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.includes("/my"));
    if (c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
