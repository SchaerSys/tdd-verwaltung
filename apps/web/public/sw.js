// Minimaler Service-Worker für die Installierbarkeit als App (PWA).
// Bewusst OHNE Caching (kein Stale-Content), reiner Pass-through-fetch-Handler.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* Netzwerk wie gewohnt – nur Präsenz zählt für Installierbarkeit */ });
