"use client";
import { useEffect } from "react";
import { istVeralteterStand } from "@/lib/veraltet";

/**
 * Fehlerseite fuer alle Bereiche. Der Fehler ist serverseitig schon gemeldet
 * (instrumentation.ts); hier zusaetzlich aus dem Browser, und die Kennung wird
 * angezeigt, damit die Person sie der Wartung nennen kann.
 */
export default function FehlerSeite({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Nach einem Deploy fehlen dem offenen Tab die alten Bausteine: einmal automatisch neu laden
    if (istVeralteterStand(error) && !sessionStorage.getItem("app-reload")) {
      sessionStorage.setItem("app-reload", "1");
      location.reload();
      return;
    }
    sessionStorage.removeItem("app-reload");
    try {
      void fetch("/api/ereignis", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ kind: "FEHLER", route: `browser ${location.pathname}`, message: error.message, digest: error.digest, detail: { version: process.env.NEXT_PUBLIC_APP_VERSION, ua: navigator.userAgent, online: navigator.onLine } }),
      });
    } catch { /* offline */ }
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-3">
        <div className="text-lg font-semibold">Da ist etwas schiefgelaufen.</div>
        <p className="text-sm">Der Fehler wurde automatisch an die Wartung gemeldet. Bitte noch einmal versuchen; wenn es bleibt, diese Kennung nennen:</p>
        <code className="mono text-sm select-all p-2 border border-border rounded bg-surface-2">{error.digest ?? "ohne Kennung"}</code>
        <div className="flex gap-2">
          <button className="btn primary" onClick={() => reset()}>Noch einmal versuchen</button>
          <a href="/dashboard" className="btn ghost">Zur Startseite</a>
        </div>
      </div>
    </main>
  );
}
