"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { abholstellen, locations, tourStopps, tourVorlageStopps, tourVorlagen, touren } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { geocode, osrmRoute, osrmTrip, zerlegen, zusammensetzen, type Punkt } from "@/lib/geo";

export interface KarteState { ok?: boolean; error?: string; info?: string }

/** Adresse einer Abholstelle oder eines Standorts in Koordinaten aufloesen (Photon). */
export async function geocodieren(_prev: KarteState, fd: FormData): Promise<KarteState> {
  const u = await requirePermission("tour:manage");
  const art = String(fd.get("art")); const id = Number(fd.get("id"));
  if (!id) return { error: "Kein Datensatz." };
  let adresse: string;
  if (art === "abholstelle") {
    const a = (await db().select().from(abholstellen).where(eq(abholstellen.id, id)).limit(1))[0];
    if (!a) return { error: "Nicht gefunden." };
    adresse = [a.strasse, [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  } else {
    const l = (await db().select().from(locations).where(eq(locations.id, id)).limit(1))[0];
    if (!l) return { error: "Nicht gefunden." };
    adresse = [l.strasse, [l.plz, l.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }
  if (!adresse) return { error: "Keine Adresse hinterlegt." };
  const p = await geocode(adresse);
  if (!p) return { error: `Adresse „${adresse}“ nicht gefunden – Straße/Ort prüfen oder Marker von Hand setzen.` };
  if (art === "abholstelle") await db().update(abholstellen).set({ lat: p.lat, lng: p.lng, updatedAt: new Date() }).where(eq(abholstellen.id, id));
  else await db().update(locations).set({ lat: p.lat, lng: p.lng }).where(eq(locations.id, id));
  await audit({ actorUserId: u.id, action: "geo.geocode", entityType: art, entityId: String(id), after: { gefunden: p.anzeige } });
  revalidatePath(art === "abholstelle" ? `/touren/abholstellen/${id}` : "/admin");
  return { ok: true, info: `Gefunden: ${p.anzeige}` };
}

/** Marker von Hand verschoben. */
export async function koordinatenSetzen(art: "abholstelle" | "standort", id: number, p: Punkt): Promise<void> {
  const u = await requirePermission("tour:manage", "admin:manage");
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
  if (art === "abholstelle") await db().update(abholstellen).set({ lat: p.lat, lng: p.lng, updatedAt: new Date() }).where(eq(abholstellen.id, id));
  else await db().update(locations).set({ lat: p.lat, lng: p.lng }).where(eq(locations.id, id));
  await audit({ actorUserId: u.id, action: "geo.manual", entityType: art, entityId: String(id), after: p });
  revalidatePath(art === "abholstelle" ? `/touren/abholstellen/${id}` : "/admin");
}

interface StoppMitKoord { id: string | number; art: string; lat: number | null; lng: number | null; reihenfolge: number }

async function stoppsMitKoordinaten(art: "tour" | "vorlage", id: string | number): Promise<StoppMitKoord[]> {
  if (art === "tour") {
    const rows = await db().select({ id: tourStopps.id, art: tourStopps.art, reihenfolge: tourStopps.reihenfolge, aLat: abholstellen.lat, aLng: abholstellen.lng, lLat: locations.lat, lLng: locations.lng })
      .from(tourStopps).leftJoin(abholstellen, eq(tourStopps.abholstelleId, abholstellen.id)).leftJoin(locations, eq(tourStopps.locationId, locations.id))
      .where(eq(tourStopps.tourId, String(id))).orderBy(asc(tourStopps.reihenfolge));
    return rows.map((r) => ({ id: r.id, art: r.art, reihenfolge: r.reihenfolge, lat: r.art === "ABHOLUNG" ? r.aLat : r.lLat, lng: r.art === "ABHOLUNG" ? r.aLng : r.lLng }));
  }
  const rows = await db().select({ id: tourVorlageStopps.id, art: tourVorlageStopps.art, reihenfolge: tourVorlageStopps.reihenfolge, aLat: abholstellen.lat, aLng: abholstellen.lng, lLat: locations.lat, lLng: locations.lng })
    .from(tourVorlageStopps).leftJoin(abholstellen, eq(tourVorlageStopps.abholstelleId, abholstellen.id)).leftJoin(locations, eq(tourVorlageStopps.locationId, locations.id))
    .where(eq(tourVorlageStopps.vorlageId, Number(id))).orderBy(asc(tourVorlageStopps.reihenfolge));
  return rows.map((r) => ({ id: r.id, art: r.art, reihenfolge: r.reihenfolge, lat: r.art === "ABHOLUNG" ? r.aLat : r.lLat, lng: r.art === "ABHOLUNG" ? r.aLng : r.lLng }));
}

/**
 * Reihenfolge optimieren: Start = Startstandort (falls mit Koordinaten), Ziel = letzte
 * Lieferung, dazwischen die Abholungen in kuerzester Runde (OSRM Trip). Danach
 * Strecke/Fahrzeit an Tour bzw. Vorlage speichern.
 */
export async function optimieren(_prev: KarteState, fd: FormData): Promise<KarteState> {
  const u = await requirePermission("tour:manage");
  const art = String(fd.get("art")) === "vorlage" ? "vorlage" : "tour";
  const id = art === "tour" ? String(fd.get("id") ?? "") : Number(fd.get("id"));
  if (!id) return { error: "Kein Datensatz." };
  const kopf = art === "tour"
    ? (await db().select({ startLocationId: touren.startLocationId, status: touren.status }).from(touren).where(eq(touren.id, String(id))).limit(1))[0]
    : (await db().select({ startLocationId: tourVorlagen.startLocationId }).from(tourVorlagen).where(eq(tourVorlagen.id, Number(id))).limit(1))[0];
  if (!kopf) return { error: "Nicht gefunden." };
  if (art === "tour" && "status" in kopf && kopf.status !== "GEPLANT") return { error: "Nur geplante Touren lassen sich umsortieren." };

  const stopps = await stoppsMitKoordinaten(art, id);
  const { beweglich, ende, ohneKoordinaten } = zerlegen(stopps);
  const start = kopf.startLocationId ? (await db().select({ lat: locations.lat, lng: locations.lng }).from(locations).where(eq(locations.id, kopf.startLocationId)).limit(1))[0] : null;
  const hatStart = !!(start?.lat && start.lng);
  const ziel = ende[ende.length - 1];
  if (beweglich.length < 2) return { error: "Zu wenig Abholungen mit Koordinaten zum Optimieren (mindestens 2). Adressen der Abholstellen geocodieren." };

  const punkte: Punkt[] = [
    ...(hatStart ? [{ lat: start.lat!, lng: start.lng! }] : []),
    ...beweglich.map((s) => ({ lat: s.lat!, lng: s.lng! })),
    ...(ziel ? [{ lat: ziel.lat!, lng: ziel.lng! }] : []),
  ];
  // Ohne festes Ziel nimmt OSRM den letzten beweglichen Punkt als Ziel – dann nur source fest.
  const trip = await osrmTrip(punkte);
  if (!trip) return { error: "Routing-Dienst nicht erreichbar (OSRM). Ist der Kartendienst auf dem Server eingerichtet?" };
  const neu = zusammensetzen(beweglich, trip.reihenfolge, hatStart, ende, ohneKoordinaten);

  if (art === "tour") {
    for (let i = 0; i < neu.length; i++) await db().update(tourStopps).set({ reihenfolge: i + 1 }).where(eq(tourStopps.id, String(neu[i]!.id)));
    await db().update(touren).set({ streckeKm: String(trip.km), fahrzeitMin: trip.minuten, updatedAt: new Date() }).where(eq(touren.id, String(id)));
    revalidatePath(`/touren/${id}`);
  } else {
    for (let i = 0; i < neu.length; i++) await db().update(tourVorlageStopps).set({ reihenfolge: i + 1 }).where(eq(tourVorlageStopps.id, Number(neu[i]!.id)));
    await db().update(tourVorlagen).set({ streckeKm: String(trip.km), fahrzeitMin: trip.minuten }).where(eq(tourVorlagen.id, Number(id)));
    revalidatePath(`/touren/vorlagen/${id}`);
  }
  await audit({ actorUserId: u.id, action: "tour.optimize", entityType: art, entityId: String(id), after: { km: trip.km, min: trip.minuten, ohneKoordinaten: ohneKoordinaten.length } });
  return { ok: true, info: `Optimiert: ${trip.km} km, ca. ${trip.minuten} min${ohneKoordinaten.length ? ` · ${ohneKoordinaten.length} Stopp(s) ohne Koordinaten ans Ende gestellt` : ""}` };
}

/** Strecke in der aktuellen Reihenfolge berechnen (fuer Karte und Kennzahlen). */
export async function streckeBerechnen(art: "tour" | "vorlage", id: string | number): Promise<{ km: number; minuten: number; geometrie: [number, number][] } | null> {
  const kopf = art === "tour"
    ? (await db().select({ startLocationId: touren.startLocationId }).from(touren).where(eq(touren.id, String(id))).limit(1))[0]
    : (await db().select({ startLocationId: tourVorlagen.startLocationId }).from(tourVorlagen).where(eq(tourVorlagen.id, Number(id))).limit(1))[0];
  if (!kopf) return null;
  const stopps = (await stoppsMitKoordinaten(art, id)).filter((s) => s.lat != null && s.lng != null);
  const start = kopf.startLocationId ? (await db().select({ lat: locations.lat, lng: locations.lng }).from(locations).where(eq(locations.id, kopf.startLocationId)).limit(1))[0] : null;
  const punkte: Punkt[] = [...(start?.lat && start.lng ? [{ lat: start.lat, lng: start.lng }] : []), ...stopps.map((s) => ({ lat: s.lat!, lng: s.lng! }))];
  return osrmRoute(punkte);
}
