"use client";

import { useEffect, useState } from "react";
import { istVeralteterStand } from "@/lib/veraltet";

/**
 * Fehlerseite der Wartungsplattform. Haeufigster Fall: nach einem Deploy fehlen dem offenen
 * Tab die alten Bausteine ("Application error: a client-side exception") – dann wird einmal
 * automatisch neu geladen. Sonst Meldung mit Kennung und Neu-Versuch.
 */
export default function FehlerSeite({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [neuLaden, setNeuLaden] = useState(false);
  useEffect(() => {
    if (istVeralteterStand(error) && !sessionStorage.getItem("ops-reload")) {
      sessionStorage.setItem("ops-reload", "1");
      setNeuLaden(true);
      location.reload();
    }
    sessionStorage.removeItem("ops-reload");
  }, [error]);
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="panel" style={{ maxWidth: 480, padding: 20 }}>
        <div className="text-lg font-semibold mb-2">{neuLaden ? "Neue Version – Seite wird neu geladen …" : "Da ist etwas schiefgelaufen."}</div>
        {!neuLaden ? (
          <>
            <p className="text-sm text-muted mb-2">Kennung: <code className="mono">{error.digest ?? error.message?.slice(0, 80) ?? "ohne Kennung"}</code></p>
            <div className="flex gap-2">
              <button className="btn sm" onClick={() => reset()}>Noch einmal versuchen</button>
              <button className="btn ghost sm" onClick={() => location.reload()}>Seite neu laden</button>
              <a href="/" className="btn ghost sm">Zur Startseite</a>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
