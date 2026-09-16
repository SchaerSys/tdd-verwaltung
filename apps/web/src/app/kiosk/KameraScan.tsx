"use client";
import { useEffect, useRef, useState } from "react";

interface DetectorLike { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
interface DetectorCtor { new (opts: { formats: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> }

/**
 * Barcode mit der Tablet-Kamera lesen (BarcodeDetector, Chrome auf Android).
 * Fuer den Pilot am Tresen: kein USB-Scanner noetig. EAN-13 (neue Karten) und
 * Code 128/39 (alte 6-stellige Familien-IDs). Ohne Kamera-API bleibt der Knopf weg.
 */
export function KameraScan({ onCode }: { onCode: (code: string) => void }) {
  const [verfuegbar, setVerfuegbar] = useState(false);
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { setVerfuegbar("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia); }, []);

  useEffect(() => {
    if (!offen) return;
    const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    const video = videoRef.current;
    if (!Ctor || !video) return;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let fertig = false;
    void (async () => {
      try {
        const detector = new Ctor({ formats: ["ean_13", "code_128", "code_39", "qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
        video.srcObject = stream;
        await video.play();
        const lesen = async () => {
          if (fertig) return;
          try {
            const codes = await detector.detect(video);
            const c = codes.find((x) => x.rawValue && x.rawValue.trim());
            if (c) { fertig = true; setOffen(false); onCode(c.rawValue.trim()); return; }
          } catch { /* Frame nicht lesbar – weiter */ }
          timer = window.setTimeout(() => void lesen(), 150);
        };
        void lesen();
      } catch (e) {
        setFehler(e instanceof Error && e.name === "NotAllowedError" ? "Kamera-Zugriff wurde abgelehnt – in den Browser-Einstellungen erlauben." : "Kamera konnte nicht gestartet werden.");
        setOffen(false);
      }
    })();
    return () => {
      fertig = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [offen, onCode]);

  if (!verfuegbar) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {!offen ? <button type="button" className="btn" onClick={() => { setFehler(null); setOffen(true); }}>📷 Mit Kamera scannen</button> : (
        <div style={{ position: "relative", width: "100%", maxWidth: 420 }}>
          <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 12, background: "#000" }} />
          <div style={{ position: "absolute", inset: "30% 10%", border: "3px solid rgba(255,255,255,.8)", borderRadius: 8, pointerEvents: "none" }} />
          <button type="button" className="btn ghost sm" style={{ position: "absolute", top: 8, right: 8 }} onClick={() => setOffen(false)}>✕</button>
        </div>
      )}
      {fehler ? <div className="text-xs" style={{ color: "var(--bad)" }}>{fehler}</div> : null}
    </div>
  );
}
