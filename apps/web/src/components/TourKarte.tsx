"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export interface KartenPunkt { lat: number; lng: number; nr: string; label: string; farbe?: string; untertitel?: string }

/**
 * Leaflet-Karte (OpenStreetMap-Kacheln) mit nummerierten Stopps und optionaler Route.
 * Leaflet selbst kommt aus dem eigenen Bundle; nur die Kartenkacheln werden von
 * tile.openstreetmap.org geladen (OpenStreetMap Foundation, keine Konten, kein Tracking).
 */
export function TourKarte({ punkte, route, hoehe = 360, onVerschoben }: {
  punkte: KartenPunkt[]; route?: [number, number][]; hoehe?: number;
  /** Nur bei genau einem Punkt: Marker verschiebbar, meldet neue Koordinaten. */
  onVerschoben?: (p: { lat: number; lng: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let map: import("leaflet").Map | null = null;
    void (async () => {
      const L = (await import("leaflet")).default;
      map = L.map(el, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      const bounds: [number, number][] = [];
      for (const p of punkte) {
        const icon = L.divIcon({
          className: "", iconSize: [28, 28], iconAnchor: [14, 14],
          html: `<div style="width:28px;height:28px;border-radius:50%;background:${p.farbe ?? "#981313"};color:#fff;font:700 12px system-ui;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${p.nr}</div>`,
        });
        const m = L.marker([p.lat, p.lng], { icon, draggable: !!onVerschoben && punkte.length === 1 }).addTo(map);
        m.bindPopup(`<b>${p.label}</b>${p.untertitel ? `<br>${p.untertitel}` : ""}`);
        if (onVerschoben) m.on("dragend", () => { const ll = m.getLatLng(); onVerschoben({ lat: ll.lat, lng: ll.lng }); });
        bounds.push([p.lat, p.lng]);
      }
      if (route && route.length > 1) {
        L.polyline(route, { color: "#1d4ed8", weight: 4, opacity: .8 }).addTo(map);
        for (const r of route) bounds.push(r);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
      else if (bounds[0]) map.setView(bounds[0], 15);
      else map.setView([47.4, 9.75], 10);
    })();
    return () => { map?.remove(); };
  }, [punkte, route, onVerschoben]);

  return <div ref={ref} style={{ height: hoehe, width: "100%", borderRadius: 10, overflow: "hidden", background: "var(--surface-2)" }} />;
}
