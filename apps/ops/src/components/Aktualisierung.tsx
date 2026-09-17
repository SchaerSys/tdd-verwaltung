"use client";

import { useEffect, useState } from "react";

/**
 * Update-Erkennung: fragt jede Minute den Build-Stand ab. Weicht er vom geladenen ab
 * (Deploy), erscheint ein Hinweis; beim naechsten Klick auf einen Link wird ohnehin neu
 * geladen. So bleibt nach einem Deploy kein Tab mit alten Bausteinen haengen.
 */
export function Aktualisierung() {
  const [neu, setNeu] = useState(false);
  useEffect(() => {
    const eigene = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    const pruefen = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = (await r.json()) as { version?: string };
        if (j.version && j.version !== eigene) setNeu(true);
      } catch { /* offline */ }
    };
    const t = setInterval(() => void pruefen(), 60_000);
    void pruefen();
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!neu) return;
    // Beim naechsten Seitenwechsel komplett neu laden statt Bausteine nachzuladen
    const h = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest("a[href^='/']"); if (a) { e.preventDefault(); location.href = (a as HTMLAnchorElement).href; } };
    document.addEventListener("click", h, true);
    return () => document.removeEventListener("click", h, true);
  }, [neu]);
  if (!neu) return null;
  return (
    <button className="pill warn" onClick={() => location.reload()} title="Eine neue Version wurde ausgerollt – neu laden">
      ↻ Neue Version – neu laden
    </button>
  );
}
