/**
 * Karte fuer A4: Geocoding und Routing.
 *  - Geocoding: Photon (komoot, Server in Deutschland, OpenStreetMap-Daten). Nur
 *    Betriebs- und Standortadressen, nie Personen. Bias auf Vorarlberg.
 *  - Routing/Optimierung: eigener OSRM auf dem TDD-Server (docker/osrm), Auszug
 *    Vorarlberg. Kein Fremddienst, keine Adressdaten verlassen den Server.
 */
export interface Punkt { lat: number; lng: number }

const PHOTON = process.env.PHOTON_URL ?? "https://photon.komoot.io";
const OSRM = () => process.env.OSRM_URL ?? "http://osrm:5000";
const VORARLBERG: Punkt = { lat: 47.35, lng: 9.75 };

export async function geocode(adresse: string): Promise<(Punkt & { anzeige: string }) | null> {
  const q = adresse.trim();
  if (!q) return null;
  try {
    const u = `${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=1&lang=de&lat=${VORARLBERG.lat}&lon=${VORARLBERG.lng}`;
    const r = await fetch(u, { headers: { "User-Agent": "Tafelwerk/1.0 (Tischlein deck dich Vorarlberg)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: { name?: string; street?: string; housenumber?: string; postcode?: string; city?: string } }[] };
    const f = j.features?.[0];
    if (!f) return null;
    const p = f.properties;
    const anzeige = [p.street ? `${p.street} ${p.housenumber ?? ""}`.trim() : p.name, [p.postcode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], anzeige };
  } catch {
    return null;
  }
}

export interface RouteErgebnis { km: number; minuten: number; geometrie: [number, number][] /* [lat,lng] */ }

/** Strecke in gegebener Reihenfolge (fuer Anzeige und Kennzahlen). */
export async function osrmRoute(punkte: Punkt[]): Promise<RouteErgebnis | null> {
  if (punkte.length < 2) return null;
  try {
    const coords = punkte.map((p) => `${p.lng},${p.lat}`).join(";");
    const r = await fetch(`${OSRM()}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { code: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
    const rt = j.routes?.[0];
    if (j.code !== "Ok" || !rt) return null;
    return { km: Math.round(rt.distance / 100) / 10, minuten: Math.round(rt.duration / 60), geometrie: rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]) };
  } catch {
    return null;
  }
}

/**
 * Optimale Reihenfolge der Zwischenstopps: erster Punkt fest (Start), letzter fest (Ziel),
 * dazwischen frei. Liefert die Indizes der Eingabe in Fahr-Reihenfolge.
 */
export async function osrmTrip(punkte: Punkt[]): Promise<{ reihenfolge: number[]; km: number; minuten: number } | null> {
  if (punkte.length < 3) return punkte.length ? { reihenfolge: punkte.map((_, i) => i), km: 0, minuten: 0 } : null;
  try {
    const coords = punkte.map((p) => `${p.lng},${p.lat}`).join(";");
    const r = await fetch(`${OSRM()}/trip/v1/driving/${coords}?source=first&destination=last&roundtrip=false&overview=false`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { code: string; waypoints?: { waypoint_index: number }[]; trips?: { distance: number; duration: number }[] };
    if (j.code !== "Ok" || !j.waypoints || !j.trips?.[0]) return null;
    // waypoints[i].waypoint_index = Position des i-ten Eingabepunkts in der Fahrt
    const reihenfolge = new Array<number>(j.waypoints.length);
    j.waypoints.forEach((w, i) => { reihenfolge[w.waypoint_index] = i; });
    return { reihenfolge, km: Math.round(j.trips[0].distance / 100) / 10, minuten: Math.round(j.trips[0].duration / 60) };
  } catch {
    return null;
  }
}

export async function osrmVerfuegbar(): Promise<boolean> {
  try {
    const r = await fetch(`${OSRM()}/nearest/v1/driving/9.75,47.35`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    return r.ok;
  } catch { return false; }
}

/**
 * Reine Zerlegung einer Stoppliste fuer die Optimierung: Start (optional), die
 * beweglichen Abholungen mit Koordinaten, das feste Ende (letzte Lieferung), und
 * alles, was nicht optimiert werden kann (ohne Koordinaten). Testbar ohne OSRM.
 */
export interface OptStopp { id: string | number; art: string; lat: number | null; lng: number | null }
export function zerlegen<T extends OptStopp>(stopps: T[]): { beweglich: T[]; ende: T[]; ohneKoordinaten: T[] } {
  const ohneKoordinaten = stopps.filter((s) => s.lat == null || s.lng == null);
  const mit = stopps.filter((s) => s.lat != null && s.lng != null);
  // Lieferungen bleiben in ihrer Reihenfolge am Schluss – zuerst wird eingesammelt, dann abgeliefert.
  const ende = mit.filter((s) => s.art === "LIEFERUNG");
  const beweglich = mit.filter((s) => s.art !== "LIEFERUNG");
  return { beweglich, ende, ohneKoordinaten };
}

/** Neue Gesamtreihenfolge aus Trip-Ergebnis zusammensetzen (Start ist Punkt 0, Ziel der letzte Punkt). */
export function zusammensetzen<T extends OptStopp>(beweglich: T[], reihenfolge: number[], hatStart: boolean, ende: T[], ohneKoordinaten: T[]): T[] {
  // reihenfolge enthaelt Indizes in [start?, ...beweglich, ziel]; nur die beweglichen herausziehen
  const offset = hatStart ? 1 : 0;
  const sortiert = reihenfolge.map((i) => i - offset).filter((i) => i >= 0 && i < beweglich.length).map((i) => beweglich[i]!);
  return [...sortiert, ...ende, ...ohneKoordinaten];
}
