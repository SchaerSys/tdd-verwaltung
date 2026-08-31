"use client";

import { useEffect, useState } from "react";

// Version, mit der DIESE Seite geladen wurde (zur Build-Zeit eingebacken).
const BUILT = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/** Prüft periodisch die Server-Version; zeigt einen Hinweis, wenn ein Update bereitsteht. */
export function UpdateChecker() {
  const [latest, setLatest] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { version?: string };
        if (alive && j.version) setLatest(j.version);
      } catch { /* offline o. Ä. – ignorieren */ }
    };
    check();
    const id = setInterval(check, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const stale = latest !== null && latest !== BUILT;
  if (!stale || dismissed) return null;

  return (
    <div className="update-banner">
      <span>🔄 Eine neue Version ist verfügbar.</span>
      <div className="flex gap-2 items-center">
        <button type="button" className="btn primary sm" onClick={() => location.reload()}>Jetzt neu laden</button>
        <button type="button" className="btn ghost sm" onClick={() => setDismissed(true)}>Später</button>
      </div>
    </div>
  );
}
