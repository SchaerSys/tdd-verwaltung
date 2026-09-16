"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Ergebnis = { ortung: boolean; grund?: string; drinnen: string[]; naechste: { name: string; distanzM: number } | null; amLager: boolean; ereignisse: { art: string; name: string | null; at: string }[] };
const ART: Record<string, string> = { ANKUNFT: "Ankunft", ABFAHRT: "Abfahrt", LAGER_ANKUNFT: "Ankunft Lager", LAGER_ABFAHRT: "Abfahrt Lager", STILLSTAND: "Stillstand" };
const hm = (iso: string) => new Date(iso).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Vienna" });

/**
 * Geofencing am Tablet: waehrend die Tour unterwegs ist, wird die Position per Browser-Standort
 * alle ~20 s (oder ab 25 m Bewegung) an den Server gemeldet. Nur Ankunft/Abfahrt werden gespeichert.
 * Ohne Zustimmung der fahrenden Person meldet der Server ortung=false und die Ueberwachung stoppt.
 */
export function Ortung({ tourId }: { tourId: string }) {
  const [stand, setStand] = useState<Ergebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [aktiv, setAktiv] = useState(true);
  const letzte = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const bekannt = useRef<number>(0);
  const router = useRouter();

  useEffect(() => {
    if (!aktiv || typeof navigator === "undefined" || !("geolocation" in navigator)) { if (aktiv) setFehler("Kein Standortdienst auf diesem Gerät."); return; }
    let laufend = false;
    const melden = async (p: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = p.coords;
      const jetzt = Date.now();
      const l = letzte.current;
      const dist = l ? Math.hypot((lat - l.lat) * 111000, (lng - l.lng) * 111000 * Math.cos((lat * Math.PI) / 180)) : Infinity;
      if (l && jetzt - l.t < 20000 && dist < 25) return; // nichts Neues
      if (laufend) return; laufend = true;
      try {
        const res = await fetch("/api/geofence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tourId, lat, lng, genauigkeitM: Math.round(accuracy) }) });
        const r = (await res.json()) as Ergebnis;
        letzte.current = { lat, lng, t: jetzt };
        setStand(r); setFehler(null);
        if (!r.ortung) setAktiv(false);
        else if (r.ereignisse.length !== bekannt.current) { bekannt.current = r.ereignisse.length; router.refresh(); }
      } catch { setFehler("Meldung fehlgeschlagen (kein Netz?) – wird wiederholt."); }
      finally { laufend = false; }
    };
    const id = navigator.geolocation.watchPosition((p) => void melden(p), (e) => setFehler(e.code === 1 ? "Standortfreigabe verweigert – in den Browser-Einstellungen erlauben." : "Standort derzeit nicht verfügbar."), { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [tourId, aktiv, router]);

  if (stand && !stand.ortung) return <div className="p-2 text-xs text-muted border-b border-[color:var(--border)]">Ortung aus{stand.grund ? ` – ${stand.grund}` : ""}. Stopps bitte von Hand abhaken.</div>;
  return (
    <div className="p-2 border-b border-[color:var(--border)] text-sm flex flex-col gap-1" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="pill good"><span className="dot" />📍 Ortung aktiv</span>
        {stand?.drinnen.length ? <b>Bei {stand.drinnen.join(", ")}</b> : stand?.naechste ? <span className="text-muted">nächste Stelle: {stand.naechste.name} · {stand.naechste.distanzM >= 1000 ? `${Math.round(stand.naechste.distanzM / 100) / 10} km` : `${stand.naechste.distanzM} m`}</span> : <span className="text-muted">Position wird ermittelt…</span>}
        {stand?.amLager ? <span className="pill warn">Am Lager – Tour beenden?</span> : null}
      </div>
      {stand?.ereignisse.length ? <div className="text-xs text-muted">{stand.ereignisse.slice(0, 3).map((e, i) => <span key={i} className="mr-3">{ART[e.art] ?? e.art} {e.name ?? ""} {hm(e.at)}</span>)}</div> : null}
      {fehler ? <div className="text-xs" style={{ color: "var(--warn)" }}>{fehler}</div> : null}
    </div>
  );
}
