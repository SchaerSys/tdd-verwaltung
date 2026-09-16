import { and, asc, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { abholstellen, locations, staff, tourEreignisse, tourStopps, touren } from "@tdd/db";
import { db } from "./db";
import { audit } from "./audit";
import { aufenthalte, ausgelassen, distanzM, naechsteStelle, positionBrauchbar, stillstand, STILLSTAND_RADIUS_M, uebergaenge, type Position, type Stelle } from "./geofence";

/** Stellen einer Tour: alle Stopps mit Koordinaten plus das Lager (Startstandort). */
export async function stellenDerTour(tourId: string, startLocationId: number | null): Promise<Stelle[]> {
  const rows = await db().select({
    id: tourStopps.id, aId: abholstellen.id, aName: abholstellen.name, aLat: abholstellen.lat, aLng: abholstellen.lng, aR: abholstellen.geofenceM,
    lId: locations.id, lName: locations.name, lLat: locations.lat, lLng: locations.lng, lR: locations.geofenceM,
  }).from(tourStopps).leftJoin(abholstellen, eq(tourStopps.abholstelleId, abholstellen.id)).leftJoin(locations, eq(tourStopps.locationId, locations.id))
    .where(eq(tourStopps.tourId, tourId)).orderBy(asc(tourStopps.reihenfolge));
  const stellen: Stelle[] = [];
  for (const r of rows) {
    if (r.aId != null && r.aLat != null && r.aLng != null) stellen.push({ key: `stopp:${r.id}`, name: r.aName!, lat: r.aLat, lng: r.aLng, radiusM: r.aR ?? 150, typ: "ABHOLSTELLE", stoppId: r.id });
    else if (r.lId != null && r.lLat != null && r.lLng != null) stellen.push({ key: `stopp:${r.id}`, name: r.lName!, lat: r.lLat, lng: r.lLng, radiusM: r.lR ?? 150, typ: "STANDORT", stoppId: r.id });
  }
  if (startLocationId != null) {
    const l = (await db().select({ id: locations.id, name: locations.name, lat: locations.lat, lng: locations.lng, r: locations.geofenceM }).from(locations).where(eq(locations.id, startLocationId)).limit(1))[0];
    if (l && l.lat != null && l.lng != null) stellen.push({ key: `lager:${l.id}`, name: l.name, lat: l.lat, lng: l.lng, radiusM: l.r ?? 150, typ: "STANDORT", lager: true });
  }
  return stellen;
}

/** Zustand "drinnen" aus den bisherigen Ereignissen der Tour ableiten. */
function drinnenAus(ereignisse: { art: string; stoppId: string | null; stelleId: number | null; at: Date }[]): Set<string> {
  const stand = new Map<string, boolean>();
  for (const e of [...ereignisse].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const key = e.stoppId ? `stopp:${e.stoppId}` : e.stelleId != null ? `lager:${e.stelleId}` : null;
    if (!key) continue;
    if (e.art === "ANKUNFT" || e.art === "LAGER_ANKUNFT") stand.set(key, true);
    if (e.art === "ABFAHRT" || e.art === "LAGER_ABFAHRT") stand.set(key, false);
  }
  return new Set([...stand.entries()].filter(([, v]) => v).map(([k]) => k));
}

export interface MeldeErgebnis {
  ortung: boolean; grund?: string;
  drinnen: string[]; naechste: { name: string; distanzM: number } | null; amLager: boolean;
  ereignisse: { art: string; name: string | null; at: string }[];
}

/** Position vom Tablet verarbeiten: Uebergaenge erkennen, Ereignisse speichern, letzte Position merken. */
export async function positionMelden(tourId: string, pos: Position): Promise<MeldeErgebnis> {
  const t = (await db().select().from(touren).where(eq(touren.id, tourId)).limit(1))[0];
  if (!t || t.status !== "UNTERWEGS") return { ortung: false, grund: "Tour nicht unterwegs", drinnen: [], naechste: null, amLager: false, ereignisse: [] };
  const zustimmung = t.fahrerId ? (await db().select({ z: staff.ortungZustimmungAm }).from(staff).where(eq(staff.id, t.fahrerId)).limit(1))[0]?.z : null;
  if (!zustimmung) return { ortung: false, grund: "Keine Zustimmung zur Ortung hinterlegt", drinnen: [], naechste: null, amLager: false, ereignisse: [] };
  if (!positionBrauchbar(pos)) return await ergebnis(t.id, true, pos, [], null, false);

  const stellen = await stellenDerTour(t.id, t.startLocationId);
  const bisher = await db().select({ art: tourEreignisse.art, stoppId: tourEreignisse.stoppId, stelleId: tourEreignisse.stelleId, at: tourEreignisse.at }).from(tourEreignisse).where(eq(tourEreignisse.tourId, t.id));
  const z = uebergaenge(drinnenAus(bisher), pos, stellen);
  type Neu = typeof tourEreignisse.$inferInsert;
  const neue: Neu[] = z.ereignisse.map((e) => ({
    tourId: t.id, stoppId: e.stelle.stoppId ?? null, art: e.stelle.lager ? (e.art === "ANKUNFT" ? "LAGER_ANKUNFT" : "LAGER_ABFAHRT") : e.art,
    stelleTyp: e.stelle.typ, stelleId: e.stelle.lager ? Number(e.stelle.key.split(":")[1]) : null, stelleName: e.stelle.name,
    at: pos.at, lat: pos.lat, lng: pos.lng, genauigkeitM: pos.genauigkeitM,
  }));

  // Bewegung / Stillstand
  const vorher = t.positionLat != null && t.positionLng != null ? { lat: t.positionLat, lng: t.positionLng } : null;
  const bewegt = !vorher || distanzM(vorher, pos) > STILLSTAND_RADIUS_M;
  const bewegungAt = bewegt || !t.bewegungAt ? pos.at : t.bewegungAt;
  if (!bewegt && stillstand({ lat: pos.lat, lng: pos.lng, at: bewegungAt, genauigkeitM: null }, pos, z.drinnen)) {
    const letzter = bisher.filter((e) => e.art === "STILLSTAND").sort((a, b) => b.at.getTime() - a.at.getTime())[0];
    if (!letzter || (pos.at.getTime() - letzter.at.getTime()) / 60000 >= 30) {
      const n = naechsteStelle(pos, stellen);
      neue.push({ tourId: t.id, stoppId: null, art: "STILLSTAND", stelleTyp: null, stelleId: null, stelleName: n ? `bei ${n.stelle.name} (${Math.round(n.distanzM / 100) / 10} km)` : null, at: pos.at, lat: pos.lat, lng: pos.lng, genauigkeitM: pos.genauigkeitM });
    }
  }
  if (neue.length) await db().insert(tourEreignisse).values(neue);
  await db().update(touren).set({ positionLat: pos.lat, positionLng: pos.lng, positionAt: pos.at, positionGenauigkeitM: pos.genauigkeitM, bewegungAt }).where(eq(touren.id, t.id));
  return await ergebnis(t.id, true, pos, stellen, z.drinnen, z.drinnen.has(`lager:${t.startLocationId}`) && bisher.length + neue.length > 1);
}

async function ergebnis(tourId: string, ortung: boolean, pos: Position, stellen: Stelle[], drinnen: Set<string> | null, amLager: boolean): Promise<MeldeErgebnis> {
  const letzte = await db().select({ art: tourEreignisse.art, name: tourEreignisse.stelleName, at: tourEreignisse.at }).from(tourEreignisse).where(eq(tourEreignisse.tourId, tourId)).orderBy(desc(tourEreignisse.at)).limit(6);
  const n = stellen.length ? naechsteStelle(pos, stellen) : null;
  return {
    ortung, drinnen: drinnen ? stellen.filter((s) => drinnen.has(s.key)).map((s) => s.name) : [],
    naechste: n ? { name: n.stelle.name, distanzM: n.distanzM } : null, amLager,
    ereignisse: letzte.map((e) => ({ art: e.art, name: e.name, at: e.at.toISOString() })),
  };
}

/** Buero: Zeitleiste einer Tour mit Aufenthalten und ausgelassenen Stopps. */
export async function tourZeitleiste(tourId: string) {
  const [ev, stopps] = await Promise.all([
    db().select().from(tourEreignisse).where(eq(tourEreignisse.tourId, tourId)).orderBy(asc(tourEreignisse.at)),
    db().select({ id: tourStopps.id }).from(tourStopps).where(eq(tourStopps.tourId, tourId)).orderBy(asc(tourStopps.reihenfolge)),
  ]);
  const zeilen = ev.map((e) => ({ art: e.art, stoppId: e.stoppId, stelleName: e.stelleName, at: e.at }));
  return { ereignisse: ev, aufenthalte: aufenthalte(zeilen, new Date()), ausgelassen: ausgelassen(stopps.map((s) => s.id), zeilen) };
}

/** Abholstelle: durchschnittliche Aufenthaltsdauer und letzte Ankunftszeiten (90 Tage). */
export async function abholstelleStatistik(abholstelleId: number): Promise<{ n: number; schnittMin: number | null; letzte: { datum: Date; minuten: number }[] }> {
  const seit = new Date(Date.now() - 90 * 864e5);
  const stoppIds = (await db().select({ id: tourStopps.id }).from(tourStopps).where(eq(tourStopps.abholstelleId, abholstelleId))).map((s) => s.id);
  if (!stoppIds.length) return { n: 0, schnittMin: null, letzte: [] };
  const ev = await db().select({ art: tourEreignisse.art, stoppId: tourEreignisse.stoppId, stelleName: tourEreignisse.stelleName, at: tourEreignisse.at })
    .from(tourEreignisse).where(and(inArray(tourEreignisse.stoppId, stoppIds), gte(tourEreignisse.at, seit)));
  const a = aufenthalte(ev, new Date()).filter((x) => x.abfahrt);
  const schnitt = a.length ? Math.round(a.reduce((s, x) => s + x.minuten, 0) / a.length) : null;
  return { n: a.length, schnittMin: schnitt, letzte: a.slice(-5).reverse().map((x) => ({ datum: x.ankunft, minuten: x.minuten })) };
}

/** Tourende: letzte Position loeschen (kein Bewegungsprofil ueber die Tour hinaus). */
export async function positionLoeschen(tourId: string): Promise<void> {
  await db().update(touren).set({ positionLat: null, positionLng: null, positionAt: null, positionGenauigkeitM: null, bewegungAt: null }).where(eq(touren.id, tourId));
}

/** Retention: Ereignisse aelter als n Tage loeschen, Positionen nicht laufender Touren leeren. */
export async function geofenceAufraeumen(tage: number): Promise<number> {
  const grenze = new Date(Date.now() - tage * 864e5);
  const r = await db().delete(tourEreignisse).where(lt(tourEreignisse.at, grenze)).returning({ id: tourEreignisse.id });
  await db().update(touren).set({ positionLat: null, positionLng: null, positionAt: null, positionGenauigkeitM: null, bewegungAt: null }).where(and(ne(touren.status, "UNTERWEGS"), gte(touren.positionAt, new Date(0))));
  await audit({ action: "job.geofence", entityType: "job", after: { geloescht: r.length, tage } });
  return r.length;
}
