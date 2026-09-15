"use client";
import { useEffect, useState } from "react";

interface NDEFReaderLike {
  scan: () => Promise<void>;
  onreading: ((e: { serialNumber?: string }) => void) | null;
  onreadingerror: (() => void) | null;
}

/**
 * Liest eine NFC-Karte ueber Web NFC (Chrome auf Android) und schreibt die Kennung
 * in das Eingabefeld der Stempelkarte. Gespeichert wird mit dem normalen Speichern-Knopf.
 * Auf Geraeten ohne NFC bleibt das Feld von Hand befuellbar (USB-Leser tippt die Kennung).
 */
export function NfcZuweisen({ feldId }: { feldId: string }) {
  const [stand, setStand] = useState<"pruefe" | "bereit" | "liest" | "gelesen" | "unsupported" | "fehler">("pruefe");
  const [kennung, setKennung] = useState<string | null>(null);

  useEffect(() => {
    setStand("NDEFReader" in window ? "bereit" : "unsupported");
  }, []);

  const auflegen = async () => {
    const R = (window as unknown as { NDEFReader?: new () => NDEFReaderLike }).NDEFReader;
    if (!R) { setStand("unsupported"); return; }
    try {
      const reader = new R();
      await reader.scan();
      setStand("liest");
      reader.onreading = (e) => {
        if (!e.serialNumber) return;
        const norm = e.serialNumber.toUpperCase().replace(/[^0-9A-F]/g, "");
        const feld = document.getElementById(feldId) as HTMLInputElement | null;
        if (feld) {
          feld.value = norm;
          feld.dispatchEvent(new Event("input", { bubbles: true }));
        }
        setKennung(norm);
        setStand("gelesen");
      };
      reader.onreadingerror = () => setStand("fehler");
    } catch {
      setStand("fehler");
    }
  };

  if (stand === "unsupported") {
    return <div className="text-xs text-muted">Zum Auflegen der Karte diese Seite auf dem Android-Tablet in Chrome öffnen. Am PC die Kennung eintippen oder per USB-Leser einlesen.</div>;
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" className="btn sm" onClick={() => void auflegen()} disabled={stand === "liest"}>
        {stand === "liest" ? "📡 Karte jetzt auflegen…" : "📡 Karte auflegen"}
      </button>
      {stand === "gelesen" && kennung ? <span className="pill good"><span className="dot" />Gelesen: <code>{kennung}</code> – jetzt Speichern</span> : null}
      {stand === "fehler" ? <span className="text-xs text-[color:var(--bad)]">NFC konnte nicht gestartet werden – Berechtigung im Browser erteilen.</span> : null}
    </div>
  );
}
