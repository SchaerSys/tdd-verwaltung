// Minimaler Service-Worker für den Tresen-Kiosk: cached GET-Antworten (App-Shell),
// damit /kiosk bei kurzem Netzausfall lädt. Ausgabe-Erfassung läuft über die
// localStorage-Queue im Client (siehe KioskClient).
const CACHE = "tdd-kiosk-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  // Alte Caches (frühere Versionen) entfernen, damit kein veralteter Stand hängen bleibt.
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // Server-Actions (POST) nie cachen
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
