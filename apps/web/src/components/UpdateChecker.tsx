"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Zeigt einen Hinweis, wenn seit dem Laden dieser Seite eine neue Server-Version
 * bereitgestellt wurde. Vergleicht die beim ersten Laden gesehene Version mit den
 * späteren Abfragen von /api/version – KEIN Rückgriff auf eine eingebackene
 * Client-Konstante (die zwischen Deploys sonst dauerhaft abweichen konnte).
 */
export function UpdateChecker() {
  const initial = useRef<string | null>(null);
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { version } = (await r.json()) as { version?: string };
        if (!version || !alive) return;
        if (initial.current === null) { initial.current = version; return; } // erste Antwort = Referenz
        if (version !== initial.current) setStale(true);
      } catch { /* offline – ignorieren */ }
    };
    check();
    const id = setInterval(check, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!stale || dismissed) return null;

  const reload = async () => {
    // Service-Worker & Caches verwerfen, damit garantiert die neue Version geladen wird.
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* egal – trotzdem neu laden */ }
    location.reload();
  };

  return (
    <div className="update-banner">
      <span>🔄 Eine neue Version ist verfügbar.</span>
      <div className="flex gap-2 items-center">
        <button type="button" className="btn primary sm" onClick={reload}>Jetzt neu laden</button>
        <button type="button" className="btn ghost sm" onClick={() => setDismissed(true)}>Später</button>
      </div>
    </div>
  );
}
