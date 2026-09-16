/**
 * Geofencing – reine Logik ohne Datenbank.
 *
 * Eine Stelle (Abholstelle, Standort, Lager) hat einen Kreis mit Radius r. Das Tablet meldet
 * Positionen; aus dem Wechsel drinnen/draussen entstehen Ereignisse ANKUNFT/ABFAHRT.
 * Hysterese: Eintritt bei d <= r, Austritt erst bei d > r * 1.3 (kein Flackern am Rand).
 * Ungenaue Positionen (Genauigkeit > 150 m) werden verworfen. Stillstand: ueber `stillstandMin`
 * Minuten keine Bewegung (> 40 m) und ausserhalb jeder Stelle.
 */

export interface Punkt { lat: number; lng: number }
export interface Stelle { key: string; name: string; lat: number; lng: number; radiusM: number; typ: "ABHOLSTELLE" | "STANDORT"; stoppId?: string | null; lager?: boolean }
export interface Position extends Punkt { at: Date; genauigkeitM: number | null }

export const MAX_GENAUIGKEIT_M = 150;
export const HYSTERESE = 1.3;
export const STILLSTAND_MIN = 30;
export const STILLSTAND_RADIUS_M = 40;

/** Entfernung in Metern (Haversine). */
export function distanzM(a: Punkt, b: Punkt): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function positionBrauchbar(p: Position): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && (p.genauigkeitM == null || p.genauigkeitM <= MAX_GENAUIGKEIT_M);
}

export interface GeofenceEreignis { art: "ANKUNFT" | "ABFAHRT"; stelle: Stelle; distanzM: number }

/**
 * Uebergaenge berechnen: `drinnen` = Stellen-Keys, in denen sich das Fahrzeug laut letztem Stand befindet.
 * Liefert neue Ereignisse und den neuen Zustand.
 */
export function uebergaenge(drinnen: Set<string>, pos: Punkt, stellen: Stelle[]): { ereignisse: GeofenceEreignis[]; drinnen: Set<string> } {
  const neu = new Set(drinnen);
  const ereignisse: GeofenceEreignis[] = [];
  for (const s of stellen) {
    const d = distanzM(pos, s);
    const war = drinnen.has(s.key);
    if (!war && d <= s.radiusM) { neu.add(s.key); ereignisse.push({ art: "ANKUNFT", stelle: s, distanzM: Math.round(d) }); }
    else if (war && d > s.radiusM * HYSTERESE) { neu.delete(s.key); ereignisse.push({ art: "ABFAHRT", stelle: s, distanzM: Math.round(d) }); }
  }
  return { ereignisse, drinnen: neu };
}

/** Stillstand: seit `seit` (letzte Position, die sich bewegt hat) mehr als STILLSTAND_MIN Minuten ohne Bewegung und ausserhalb aller Stellen. */
export function stillstand(letzteBewegung: Position | null, jetzt: Position, drinnen: Set<string>): boolean {
  if (!letzteBewegung || drinnen.size > 0) return false;
  if (distanzM(letzteBewegung, jetzt) > STILLSTAND_RADIUS_M) return false;
  return (jetzt.at.getTime() - letzteBewegung.at.getTime()) / 60000 >= STILLSTAND_MIN;
}

/** Naechste Stelle zur Position (fuer die Anzeige "in der Naehe von"). */
export function naechsteStelle(pos: Punkt, stellen: Stelle[]): { stelle: Stelle; distanzM: number } | null {
  let best: { stelle: Stelle; distanzM: number } | null = null;
  for (const s of stellen) { const d = distanzM(pos, s); if (!best || d < best.distanzM) best = { stelle: s, distanzM: Math.round(d) }; }
  return best;
}

export interface EreignisZeile { art: string; stoppId: string | null; stelleName: string | null; at: Date }

/** Aufenthaltsdauern je Stopp aus ANKUNFT/ABFAHRT-Paaren (Minuten); offene Aufenthalte bis `jetzt`. */
export function aufenthalte(ereignisse: EreignisZeile[], jetzt: Date): { stoppId: string | null; stelleName: string | null; ankunft: Date; abfahrt: Date | null; minuten: number }[] {
  const out: { stoppId: string | null; stelleName: string | null; ankunft: Date; abfahrt: Date | null; minuten: number }[] = [];
  const offen = new Map<string, { stoppId: string | null; stelleName: string | null; ankunft: Date }>();
  for (const e of [...ereignisse].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const key = e.stoppId ?? e.stelleName ?? "?";
    if (e.art === "ANKUNFT" || e.art === "LAGER_ANKUNFT") offen.set(key, { stoppId: e.stoppId, stelleName: e.stelleName, ankunft: e.at });
    else if (e.art === "ABFAHRT" || e.art === "LAGER_ABFAHRT") {
      const a = offen.get(key); if (!a) continue; offen.delete(key);
      out.push({ ...a, abfahrt: e.at, minuten: Math.round((e.at.getTime() - a.ankunft.getTime()) / 60000) });
    }
  }
  for (const a of offen.values()) out.push({ ...a, abfahrt: null, minuten: Math.round((jetzt.getTime() - a.ankunft.getTime()) / 60000) });
  return out.sort((a, b) => a.ankunft.getTime() - b.ankunft.getTime());
}

/** Stopps, die laut Plan vor dem zuletzt besuchten liegen, aber nie eine Ankunft hatten (ausgelassen). */
export function ausgelassen(stoppReihenfolge: string[], ereignisse: EreignisZeile[]): string[] {
  const besucht = new Set(ereignisse.filter((e) => e.art === "ANKUNFT" && e.stoppId).map((e) => e.stoppId!));
  let letzterIndex = -1;
  stoppReihenfolge.forEach((id, i) => { if (besucht.has(id)) letzterIndex = i; });
  return stoppReihenfolge.filter((id, i) => i < letzterIndex && !besucht.has(id));
}
