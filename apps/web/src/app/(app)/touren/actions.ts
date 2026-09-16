"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { abholstellen, abwesenheiten, angeboteEingang, fahrzeuge, locations, staff, tourStopps, tourVorlageStopps, tourVorlagen, touren } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission, tryPermission } from "@/lib/guard";
import { geraetAusCookie, kopplungscodeErzeugen, geraetTrennen } from "@/lib/geraet";
import { wochentag } from "@/lib/touren";
import { geocode } from "@/lib/geo";

const str = (fd: FormData, k: string): string | null => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
const num = (fd: FormData, k: string): number | null => { const v = str(fd, k); if (!v) return null; const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const tage = (fd: FormData, k: string): number[] => fd.getAll(k).map(Number).filter((n) => n >= 1 && n <= 7);
const ABHOL_ARTEN = ["SUPERMARKT", "BAECKEREI", "GROSSHANDEL", "GASTRO", "LANDWIRT", "SONSTIGES"];

// ── Fahrzeuge ─────────────────────────────────────────────────────────────
function fahrzeugWerte(fd: FormData) {
  return {
    kennzeichen: (str(fd, "kennzeichen") ?? "").toUpperCase().replace(/\s+/g, " "), bezeichnung: str(fd, "bezeichnung") ?? "",
    kuehlung: fd.get("kuehlung") === "on", elektrisch: fd.get("elektrisch") === "on", reichweiteKm: num(fd, "reichweiteKm"),
    ladevolumen: str(fd, "ladevolumen"), locationId: num(fd, "locationId"), pickerlBis: str(fd, "pickerlBis"),
    ausserBetriebVon: str(fd, "ausserBetriebVon"), ausserBetriebBis: str(fd, "ausserBetriebBis"), hinweise: str(fd, "hinweise"),
    isActive: fd.get("isActive") !== "off", updatedAt: new Date(),
  };
}
export async function fahrzeugAnlegen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const w = fahrzeugWerte(fd);
  if (!w.kennzeichen || !w.bezeichnung) throw new Error("Kennzeichen und Bezeichnung sind Pflicht.");
  const r = await db().insert(fahrzeuge).values(w).returning({ id: fahrzeuge.id });
  await audit({ actorUserId: u.id, action: "fahrzeug.create", entityType: "fahrzeug", entityId: String(r[0]!.id), after: { kennzeichen: w.kennzeichen } });
  revalidatePath("/touren/fahrzeuge");
}
export async function fahrzeugSpeichern(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = Number(fd.get("id"));
  const w = fahrzeugWerte(fd);
  if (!id || !w.kennzeichen || !w.bezeichnung) throw new Error("Kennzeichen und Bezeichnung sind Pflicht.");
  w.isActive = fd.get("isActive") === "on";
  await db().update(fahrzeuge).set(w).where(eq(fahrzeuge.id, id));
  await audit({ actorUserId: u.id, action: "fahrzeug.update", entityType: "fahrzeug", entityId: String(id) });
  revalidatePath("/touren/fahrzeuge");
}

// ── Abholstellen ──────────────────────────────────────────────────────────
function abholstelleWerte(fd: FormData) {
  const art = str(fd, "art") ?? "SONSTIGES";
  return {
    name: str(fd, "name") ?? "", art: ABHOL_ARTEN.includes(art) ? art : "SONSTIGES",
    strasse: str(fd, "strasse"), plz: str(fd, "plz"), ort: str(fd, "ort"),
    ansprechperson: str(fd, "ansprechperson"), telefon: str(fd, "telefon"), email: str(fd, "email"),
    kuehlbedarf: fd.get("kuehlbedarf") === "on", abholtage: tage(fd, "abholtage"),
    fensterVon: str(fd, "fensterVon"), fensterBis: str(fd, "fensterBis"), hinweise: str(fd, "hinweise"), updatedAt: new Date(),
    geofenceM: Math.min(1000, Math.max(30, num(fd, "geofenceM") ?? 150)),
  };
}
export async function abholstelleAnlegen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const w = abholstelleWerte(fd);
  if (!w.name) throw new Error("Name ist Pflicht.");
  const geo = await geocode([w.strasse, [w.plz, w.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "));
  const r = await db().insert(abholstellen).values({ ...w, lat: geo?.lat ?? null, lng: geo?.lng ?? null }).returning({ id: abholstellen.id });
  await audit({ actorUserId: u.id, action: "abholstelle.create", entityType: "abholstelle", entityId: String(r[0]!.id), after: { geocodiert: !!geo } });
  revalidatePath("/touren/abholstellen");
  redirect(`/touren/abholstellen/${r[0]!.id}`);
}
export async function abholstelleSpeichern(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = Number(fd.get("id"));
  const w = abholstelleWerte(fd);
  if (!id || !w.name) throw new Error("Name ist Pflicht.");
  // Adresse geaendert -> Koordinaten neu suchen (von Hand gesetzte Marker bleiben sonst stehen).
  const alt = (await db().select({ strasse: abholstellen.strasse, plz: abholstellen.plz, ort: abholstellen.ort, lat: abholstellen.lat }).from(abholstellen).where(eq(abholstellen.id, id)).limit(1))[0];
  const adresseNeu = !alt || alt.strasse !== w.strasse || alt.plz !== w.plz || alt.ort !== w.ort || alt.lat == null;
  const geo = adresseNeu ? await geocode([w.strasse, [w.plz, w.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")) : null;
  await db().update(abholstellen).set({ ...w, isActive: fd.get("isActive") === "on", ...(geo ? { lat: geo.lat, lng: geo.lng } : {}) }).where(eq(abholstellen.id, id));
  await audit({ actorUserId: u.id, action: "abholstelle.update", entityType: "abholstelle", entityId: String(id) });
  revalidatePath("/touren/abholstellen");
  revalidatePath(`/touren/abholstellen/${id}`);
}

// ── Wochenplan (Vorlagen) ─────────────────────────────────────────────────
/** Start jeder Tour ist das Lager (Vandans), wenn nichts anderes gewaehlt wird. */
async function lagerId(): Promise<number | null> {
  const l = (await db().select({ id: locations.id }).from(locations).where(and(eq(locations.type, "LAGER"), eq(locations.isActive, true))).limit(1))[0];
  return l?.id ?? null;
}

export async function vorlageAnlegen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const name = str(fd, "name"); const wt = num(fd, "wochentag");
  if (!name || !wt || wt < 1 || wt > 7) throw new Error("Name und Wochentag sind Pflicht.");
  const r = await db().insert(tourVorlagen).values({
    name, wochentag: wt, startzeit: str(fd, "startzeit"), startLocationId: num(fd, "startLocationId") ?? (await lagerId()),
    fahrzeugId: num(fd, "fahrzeugId"), fahrerId: str(fd, "fahrerId"), hinweise: str(fd, "hinweise"),
  }).returning({ id: tourVorlagen.id });
  await audit({ actorUserId: u.id, action: "tourvorlage.create", entityType: "tourvorlage", entityId: String(r[0]!.id) });
  redirect(`/touren/vorlagen/${r[0]!.id}`);
}
export async function vorlageSpeichern(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = Number(fd.get("id")); const name = str(fd, "name"); const wt = num(fd, "wochentag");
  if (!id || !name || !wt) throw new Error("Name und Wochentag sind Pflicht.");
  await db().update(tourVorlagen).set({
    name, wochentag: wt, startzeit: str(fd, "startzeit"), startLocationId: num(fd, "startLocationId"),
    fahrzeugId: num(fd, "fahrzeugId"), fahrerId: str(fd, "fahrerId"), hinweise: str(fd, "hinweise"), isActive: fd.get("isActive") === "on",
  }).where(eq(tourVorlagen.id, id));
  await audit({ actorUserId: u.id, action: "tourvorlage.update", entityType: "tourvorlage", entityId: String(id) });
  revalidatePath(`/touren/vorlagen/${id}`);
  revalidatePath("/touren/vorlagen");
}
export async function vorlageStoppHinzufuegen(fd: FormData): Promise<void> {
  await requirePermission("tour:manage");
  const vorlageId = Number(fd.get("vorlageId"));
  const art = str(fd, "art") === "LIEFERUNG" ? "LIEFERUNG" : "ABHOLUNG";
  const abholstelleId = art === "ABHOLUNG" ? num(fd, "abholstelleId") : null;
  const locationId = art === "LIEFERUNG" ? num(fd, "locationId") : null;
  if (!vorlageId || (art === "ABHOLUNG" && !abholstelleId) || (art === "LIEFERUNG" && !locationId)) throw new Error("Ziel fehlt.");
  const m = await db().select({ m: max(tourVorlageStopps.reihenfolge) }).from(tourVorlageStopps).where(eq(tourVorlageStopps.vorlageId, vorlageId));
  await db().insert(tourVorlageStopps).values({ vorlageId, reihenfolge: (m[0]?.m ?? 0) + 1, art, abholstelleId, locationId, hinweis: str(fd, "hinweis") });
  revalidatePath(`/touren/vorlagen/${vorlageId}`);
}
export async function vorlageStoppEntfernen(fd: FormData): Promise<void> {
  await requirePermission("tour:manage");
  const id = Number(fd.get("id")); const vorlageId = Number(fd.get("vorlageId"));
  await db().delete(tourVorlageStopps).where(eq(tourVorlageStopps.id, id));
  await reihenfolgeNormieren(vorlageId);
  revalidatePath(`/touren/vorlagen/${vorlageId}`);
}
/** Stopp eine Position nach oben/unten (Tausch mit dem Nachbarn). */
export async function vorlageStoppVerschieben(fd: FormData): Promise<void> {
  await requirePermission("tour:manage");
  const id = Number(fd.get("id")); const vorlageId = Number(fd.get("vorlageId")); const richtung = String(fd.get("richtung")) === "hoch" ? -1 : 1;
  const liste = await db().select().from(tourVorlageStopps).where(eq(tourVorlageStopps.vorlageId, vorlageId)).orderBy(asc(tourVorlageStopps.reihenfolge));
  const i = liste.findIndex((s) => s.id === id); const j = i + richtung;
  if (i < 0 || j < 0 || j >= liste.length) return;
  await db().update(tourVorlageStopps).set({ reihenfolge: liste[j]!.reihenfolge }).where(eq(tourVorlageStopps.id, liste[i]!.id));
  await db().update(tourVorlageStopps).set({ reihenfolge: liste[i]!.reihenfolge }).where(eq(tourVorlageStopps.id, liste[j]!.id));
  revalidatePath(`/touren/vorlagen/${vorlageId}`);
}
async function reihenfolgeNormieren(vorlageId: number): Promise<void> {
  const liste = await db().select({ id: tourVorlageStopps.id }).from(tourVorlageStopps).where(eq(tourVorlageStopps.vorlageId, vorlageId)).orderBy(asc(tourVorlageStopps.reihenfolge));
  for (let i = 0; i < liste.length; i++) await db().update(tourVorlageStopps).set({ reihenfolge: i + 1 }).where(eq(tourVorlageStopps.id, liste[i]!.id));
}

// ── Tagesdisposition ──────────────────────────────────────────────────────
/** Touren des Tages aus dem Wochenplan erzeugen (idempotent: vorhandene bleiben). */
export async function tourenErzeugen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const datum = str(fd, "datum"); if (!datum) return;
  const wt = wochentag(datum);
  const vorlagen = await db().select().from(tourVorlagen).where(and(eq(tourVorlagen.wochentag, wt), eq(tourVorlagen.isActive, true)));
  let n = 0;
  for (const v of vorlagen) {
    const r = await db().insert(touren).values({
      datum, vorlageId: v.id, name: v.name, startzeit: v.startzeit, startLocationId: v.startLocationId,
      fahrzeugId: v.fahrzeugId, fahrerId: v.fahrerId, hinweise: v.hinweise, createdBy: u.id,
    }).onConflictDoNothing().returning({ id: touren.id });
    if (!r[0]) continue;
    n += 1;
    const stopps = await db().select().from(tourVorlageStopps).where(eq(tourVorlageStopps.vorlageId, v.id)).orderBy(asc(tourVorlageStopps.reihenfolge));
    if (stopps.length) await db().insert(tourStopps).values(stopps.map((s) => ({ tourId: r[0]!.id, reihenfolge: s.reihenfolge, art: s.art, abholstelleId: s.abholstelleId, locationId: s.locationId, hinweis: s.hinweis })));
  }
  await audit({ actorUserId: u.id, action: "touren.generate", entityType: "tour", entityId: datum, after: { erzeugt: n } });
  revalidatePath("/touren");
}
export async function tourAnlegen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const datum = str(fd, "datum"); const name = str(fd, "name");
  if (!datum || !name) throw new Error("Datum und Name sind Pflicht.");
  const r = await db().insert(touren).values({ datum, name, startzeit: str(fd, "startzeit"), startLocationId: await lagerId(), createdBy: u.id }).returning({ id: touren.id });
  await audit({ actorUserId: u.id, action: "tour.create", entityType: "tour", entityId: r[0]!.id });
  redirect(`/touren/${r[0]!.id}`);
}
/** Zuweisung Fahrer/Fahrzeug direkt aus der Tagesliste. */
export async function tourZuweisen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  const set: Partial<typeof touren.$inferInsert> = { updatedAt: new Date() };
  if (fd.has("fahrerId")) set.fahrerId = str(fd, "fahrerId");
  if (fd.has("beifahrerId")) set.beifahrerId = str(fd, "beifahrerId");
  if (fd.has("fahrzeugId")) set.fahrzeugId = num(fd, "fahrzeugId");
  if (fd.has("startzeit")) set.startzeit = str(fd, "startzeit");
  if (fd.has("hinweise")) set.hinweise = str(fd, "hinweise");
  if (fd.has("status")) { const s = str(fd, "status"); if (s && ["GEPLANT", "UNTERWEGS", "ABGESCHLOSSEN", "AUSGEFALLEN"].includes(s)) set.status = s; }
  await db().update(touren).set(set).where(eq(touren.id, id));
  await audit({ actorUserId: u.id, action: "tour.assign", entityType: "tour", entityId: id, after: set });
  revalidatePath("/touren");
  revalidatePath(`/touren/${id}`);
}
/** An den Fahrer senden: Tour wird am Handy sichtbar. Nur ohne rote Konflikte. */
export async function tourFreigeben(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = String(fd.get("id") ?? "");
  const zurueck = String(fd.get("zurueck") ?? "") === "1";
  if (!id) return;
  if (zurueck) {
    await db().update(touren).set({ freigegebenAt: null, freigegebenBy: null, updatedAt: new Date() }).where(and(eq(touren.id, id), eq(touren.status, "GEPLANT")));
    await audit({ actorUserId: u.id, action: "tour.unrelease", entityType: "tour", entityId: id });
  } else {
    const { ladeTouren } = await import("@/lib/touren-daten");
    const [t] = await ladeTouren({ id });
    if (!t) throw new Error("Tour nicht gefunden.");
    const fehler = t.konflikte.filter((k) => k.schwere === "FEHLER");
    if (fehler.length) throw new Error("Nicht sendbar: " + fehler.map((k) => k.text).join(" "));
    if (!t.fahrzeugId) throw new Error("Nicht sendbar: kein Fahrzeug – die Tour geht ans Tablet des Fahrzeugs.");
    await db().update(touren).set({ freigegebenAt: new Date(), freigegebenBy: u.id, updatedAt: new Date() }).where(eq(touren.id, id));
    await audit({ actorUserId: u.id, action: "tour.release", entityType: "tour", entityId: id });
  }
  revalidatePath("/touren"); revalidatePath(`/touren/${id}`); revalidatePath("/fahrt");
}

/** Alle fahrbereiten (gruenen/gelben) Touren eines Tages auf einmal senden. */
export async function alleFreigeben(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const datum = str(fd, "datum"); if (!datum) return;
  const { ladeTouren } = await import("@/lib/touren-daten");
  const liste = await ladeTouren({ datum });
  let n = 0;
  for (const t of liste) {
    if (t.freigegebenAt || t.status !== "GEPLANT" || t.konflikte.some((k) => k.schwere === "FEHLER")) continue;
    await db().update(touren).set({ freigegebenAt: new Date(), freigegebenBy: u.id, updatedAt: new Date() }).where(eq(touren.id, t.id));
    n += 1;
  }
  await audit({ actorUserId: u.id, action: "tour.release_all", entityType: "tour", entityId: datum, after: { n } });
  revalidatePath("/touren"); revalidatePath("/fahrt");
}

export async function tourLoeschen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = String(fd.get("id") ?? ""); const datum = str(fd, "datum");
  await db().delete(touren).where(and(eq(touren.id, id), eq(touren.status, "GEPLANT")));
  await audit({ actorUserId: u.id, action: "tour.delete", entityType: "tour", entityId: id });
  redirect(`/touren?datum=${datum ?? ""}`);
}
export async function tourStoppHinzufuegen(fd: FormData): Promise<void> {
  await requirePermission("tour:manage");
  const tourId = String(fd.get("tourId") ?? "");
  const art = str(fd, "art") === "LIEFERUNG" ? "LIEFERUNG" : "ABHOLUNG";
  const abholstelleId = art === "ABHOLUNG" ? num(fd, "abholstelleId") : null;
  const locationId = art === "LIEFERUNG" ? num(fd, "locationId") : null;
  if (!tourId || (art === "ABHOLUNG" && !abholstelleId) || (art === "LIEFERUNG" && !locationId)) throw new Error("Ziel fehlt.");
  const m = await db().select({ m: max(tourStopps.reihenfolge) }).from(tourStopps).where(eq(tourStopps.tourId, tourId));
  await db().insert(tourStopps).values({ tourId, reihenfolge: (m[0]?.m ?? 0) + 1, art, abholstelleId, locationId, hinweis: str(fd, "hinweis") });
  revalidatePath(`/touren/${tourId}`);
}
export async function tourStoppEntfernen(fd: FormData): Promise<void> {
  await requirePermission("tour:manage");
  const id = String(fd.get("id") ?? ""); const tourId = String(fd.get("tourId") ?? "");
  await db().delete(tourStopps).where(and(eq(tourStopps.id, id), eq(tourStopps.status, "OFFEN")));
  revalidatePath(`/touren/${tourId}`);
}
export async function tourStoppVerschieben(fd: FormData): Promise<void> {
  await requirePermission("tour:manage");
  const id = String(fd.get("id") ?? ""); const tourId = String(fd.get("tourId") ?? ""); const richtung = String(fd.get("richtung")) === "hoch" ? -1 : 1;
  const liste = await db().select().from(tourStopps).where(eq(tourStopps.tourId, tourId)).orderBy(asc(tourStopps.reihenfolge));
  const i = liste.findIndex((s) => s.id === id); const j = i + richtung;
  if (i < 0 || j < 0 || j >= liste.length) return;
  await db().update(tourStopps).set({ reihenfolge: liste[j]!.reihenfolge }).where(eq(tourStopps.id, liste[i]!.id));
  await db().update(tourStopps).set({ reihenfolge: liste[i]!.reihenfolge }).where(eq(tourStopps.id, liste[j]!.id));
  revalidatePath(`/touren/${tourId}`);
}

// ── Abwesenheiten ─────────────────────────────────────────────────────────
export async function abwesenheitAnlegen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const staffId = str(fd, "staffId"); const von = str(fd, "von"); const bis = str(fd, "bis") ?? von;
  const art = str(fd, "art") ?? "SONSTIG";
  if (!staffId || !von || !bis || bis < von) throw new Error("Person und Zeitraum sind Pflicht.");
  await db().insert(abwesenheiten).values({ staffId, art: ["URLAUB", "KRANK", "ZEITAUSGLEICH", "PFLEGE", "SONDERURLAUB", "UNBEZAHLT", "SONSTIG"].includes(art) ? art : "SONSTIG", von, bis, notiz: str(fd, "notiz"), createdBy: u.id, entschiedenBy: u.id, entschiedenAt: new Date() });
  await audit({ actorUserId: u.id, action: "abwesenheit.create", entityType: "staff", entityId: staffId, after: { art, von, bis } });
  revalidatePath("/touren");
}
export async function abwesenheitLoeschen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = String(fd.get("id") ?? "");
  await db().delete(abwesenheiten).where(eq(abwesenheiten.id, id));
  await audit({ actorUserId: u.id, action: "abwesenheit.delete", entityType: "abwesenheit", entityId: id });
  revalidatePath("/touren");
}

// ── Fahrzeug-Tablet / Fahrer-Handy ────────────────────────────────────────
/**
 * Wer darf eine Tour bedienen (starten, Stopps melden, beenden)?
 *  - das gekoppelte Tablet des Fahrzeugs, auf dem die Tour gesendet wurde (kein Login), oder
 *  - Buero (tour:manage), oder
 *  - ein Fahrer-Login, dessen Personal-Datensatz als Fahrer:in/Beifahrer:in eingeteilt ist.
 */
async function darfTourBedienen(tourId: string): Promise<{ t: typeof touren.$inferSelect; akteur: string; userId: string | null }> {
  const t = (await db().select().from(touren).where(eq(touren.id, tourId)).limit(1))[0];
  if (!t) throw new Error("Tour nicht gefunden.");
  const g = await geraetAusCookie();
  if (g && t.fahrzeugId === g.fahrzeugId && t.freigegebenAt) return { t, akteur: `Tablet ${g.name}`, userId: null };
  const u = await tryPermission("tour:drive", "tour:manage");
  if (!u) throw new Error("Nicht berechtigt – Tablet nicht gekoppelt oder Tour nicht an dieses Fahrzeug gesendet.");
  if (u.role === "FAHRER") {
    const me = (await db().select({ id: staff.id }).from(staff).where(eq(staff.userId, u.id)).limit(1))[0];
    if (!me || (t.fahrerId !== me.id && t.beifahrerId !== me.id)) throw new Error("Nicht deine Tour.");
  }
  return { t, akteur: u.email, userId: u.id };
}
export async function tourStarten(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const { userId } = await darfTourBedienen(id);
  const u = { id: userId };
  // Wer faehrt, wird am Tablet beim Start bestaetigt (kein Login noetig) – das ist der Nachweis.
  const fahrerId = str(fd, "fahrerId"); const beifahrerId = str(fd, "beifahrerId");
  await db().update(touren).set({
    status: "UNTERWEGS", gestartetAt: new Date(), kmStart: num(fd, "kmStart"), updatedAt: new Date(),
    ...(fahrerId ? { fahrerId } : {}), ...(fd.has("beifahrerId") ? { beifahrerId } : {}),
  }).where(and(eq(touren.id, id), inArray(touren.status, ["GEPLANT", "UNTERWEGS"])));
  await audit({ actorUserId: u.id, action: "tour.start", entityType: "tour", entityId: id, after: { fahrerId, beifahrerId } });
  revalidatePath("/fahrt"); revalidatePath("/fahrzeug"); revalidatePath(`/touren/${id}`); revalidatePath("/touren");
}
export async function tourBeenden(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? "");
  const { userId } = await darfTourBedienen(id);
  const u = { id: userId };
  await db().update(touren).set({ status: "ABGESCHLOSSEN", beendetAt: new Date(), kmEnde: num(fd, "kmEnde"), updatedAt: new Date() }).where(eq(touren.id, id));
  const { positionLoeschen } = await import("@/lib/geofence-daten");
  await positionLoeschen(id); // Geofencing: keine Position ueber das Tourende hinaus
  await audit({ actorUserId: u.id, action: "tour.end", entityType: "tour", entityId: id });
  revalidatePath("/fahrt"); revalidatePath("/fahrzeug"); revalidatePath(`/touren/${id}`); revalidatePath("/touren");
}
/** Stopp erledigen (mit Mengen) oder als nicht moeglich melden. */
export async function stoppMelden(fd: FormData): Promise<void> {
  const id = String(fd.get("id") ?? ""); const tourId = String(fd.get("tourId") ?? "");
  const status = str(fd, "status") === "NICHT_MOEGLICH" ? "NICHT_MOEGLICH" : str(fd, "status") === "OFFEN" ? "OFFEN" : "ERLEDIGT";
  await darfTourBedienen(tourId);
  await db().update(tourStopps).set({
    status, erledigtAt: status === "OFFEN" ? null : new Date(),
    mengeKisten: status === "ERLEDIGT" ? num(fd, "mengeKisten") : null, mengeKg: status === "ERLEDIGT" ? (num(fd, "mengeKg") != null ? String(num(fd, "mengeKg")) : null) : null,
    bemerkung: str(fd, "bemerkung"),
  }).where(and(eq(tourStopps.id, id), eq(tourStopps.tourId, tourId)));
  // Erste Erledigung setzt die Tour auf UNTERWEGS, falls der Start vergessen wurde.
  await db().update(touren).set({ status: "UNTERWEGS", gestartetAt: sql`coalesce(${touren.gestartetAt}, now())` }).where(and(eq(touren.id, tourId), eq(touren.status, "GEPLANT")));
  revalidatePath("/fahrt"); revalidatePath("/fahrzeug"); revalidatePath(`/touren/${tourId}`); revalidatePath("/touren");
}

// ── Fahrzeug-Tablets koppeln ──────────────────────────────────────────────
export interface KoppelState { code?: string; name?: string; error?: string }
/** Disposition: Code fuer ein Tablet erzeugen – am Tablet unter /fahrzeug eingeben. */
export async function tabletCode(_prev: KoppelState, fd: FormData): Promise<KoppelState> {
  const u = await requirePermission("tour:manage");
  const fahrzeugId = Number(fd.get("fahrzeugId"));
  const name = str(fd, "name") ?? "Tablet";
  if (!fahrzeugId) return { error: "Kein Fahrzeug." };
  const code = await kopplungscodeErzeugen(fahrzeugId, name, u.id);
  await audit({ actorUserId: u.id, action: "geraet.code", entityType: "fahrzeug", entityId: String(fahrzeugId), after: { name } });
  return { code, name };
}
export async function tabletTrennen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = String(fd.get("id") ?? "");
  await geraetTrennen(id);
  await audit({ actorUserId: u.id, action: "geraet.revoke", entityType: "geraet", entityId: id });
  revalidatePath("/touren/fahrzeuge");
}

// ── Angebote von der Homepage ─────────────────────────────────────────────
interface Angebot { id: number; betrieb: string; ansprechperson?: string; email?: string; telefon?: string; adresse?: { strasse?: string; plz?: string; ort?: string }; abholzeit?: string; warenarten?: string[]; menge?: string; haeufigkeit?: string; kuehlung?: boolean; nachricht?: string; stand: string; eingegangen: string }

function homepage(): { url: string; token: string } | null {
  const url = process.env.HOMEPAGE_API_URL; const token = process.env.UEBERGABE_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}
/** Offene Angebote von der Homepage abholen (Schnittstelle: GET /api/uebergabe/lebensmittel). */
export async function angeboteAbholen(): Promise<void> {
  const u = await requirePermission("tour:manage");
  const hp = homepage();
  if (!hp) throw new Error("HOMEPAGE_API_URL / UEBERGABE_TOKEN nicht gesetzt.");
  const r = await fetch(`${hp.url}/api/uebergabe/lebensmittel?limit=200`, { headers: { Authorization: `Bearer ${hp.token}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`Homepage antwortet ${r.status}`);
  const j = (await r.json()) as { angebote?: Angebot[] };
  let neu = 0;
  for (const a of j.angebote ?? []) {
    const ins = await db().insert(angeboteEingang).values({ homepageId: a.id, betrieb: a.betrieb, daten: a, eingegangen: new Date(a.eingegangen) }).onConflictDoNothing().returning({ id: angeboteEingang.id });
    if (ins[0]) neu += 1;
  }
  await audit({ actorUserId: u.id, action: "angebote.fetch", entityType: "angebot", after: { neu, gesamt: j.angebote?.length ?? 0 } });
  revalidatePath("/touren/angebote");
}
async function rueckmelden(homepageId: number, stand: "uebernommen" | "abgelehnt", vermerk: string): Promise<boolean> {
  const hp = homepage(); if (!hp) return false;
  try {
    const r = await fetch(`${hp.url}/api/uebergabe/lebensmittel/${homepageId}`, { method: "POST", headers: { Authorization: `Bearer ${hp.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ stand, vermerk }) });
    return r.ok;
  } catch { return false; }
}
/** Angebot als Abholstelle uebernehmen (vorbefuellt) und der Homepage melden. */
export async function angebotUebernehmen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = Number(fd.get("id"));
  const a = (await db().select().from(angeboteEingang).where(eq(angeboteEingang.id, id)).limit(1))[0];
  if (!a || a.stand !== "NEU") return;
  const d = a.daten as Angebot;
  const art = (d.warenarten ?? []).includes("backwaren") && (d.warenarten ?? []).length === 1 ? "BAECKEREI" : "SONSTIGES";
  const r = await db().insert(abholstellen).values({
    name: d.betrieb, art, strasse: d.adresse?.strasse ?? null, plz: d.adresse?.plz ?? null, ort: d.adresse?.ort ?? null,
    ansprechperson: d.ansprechperson ?? null, telefon: d.telefon ?? null, email: d.email ?? null, kuehlbedarf: !!d.kuehlung,
    hinweise: [d.abholzeit ? `Abholzeit: ${d.abholzeit}` : "", d.menge ? `Menge: ${d.menge}` : "", d.haeufigkeit ? `Häufigkeit: ${d.haeufigkeit}` : "", (d.warenarten ?? []).length ? `Waren: ${d.warenarten!.join(", ")}` : "", d.nachricht ?? ""].filter(Boolean).join(" · ") || null,
    angebotId: a.homepageId,
  }).returning({ id: abholstellen.id });
  const ok = await rueckmelden(a.homepageId, "uebernommen", `Als Abholstelle #${r[0]!.id} angelegt`);
  await db().update(angeboteEingang).set({ stand: "UEBERNOMMEN", abholstelleId: r[0]!.id, entschiedenBy: u.id, entschiedenAt: new Date(), rueckgemeldet: ok }).where(eq(angeboteEingang.id, id));
  await audit({ actorUserId: u.id, action: "angebot.accept", entityType: "angebot", entityId: String(a.homepageId), after: { abholstelle: r[0]!.id, rueckgemeldet: ok } });
  redirect(`/touren/abholstellen/${r[0]!.id}`);
}
export async function angebotAblehnen(fd: FormData): Promise<void> {
  const u = await requirePermission("tour:manage");
  const id = Number(fd.get("id"));
  const a = (await db().select().from(angeboteEingang).where(eq(angeboteEingang.id, id)).limit(1))[0];
  if (!a || a.stand !== "NEU") return;
  const ok = await rueckmelden(a.homepageId, "abgelehnt", str(fd, "vermerk") ?? "");
  await db().update(angeboteEingang).set({ stand: "ABGELEHNT", entschiedenBy: u.id, entschiedenAt: new Date(), rueckgemeldet: ok }).where(eq(angeboteEingang.id, id));
  await audit({ actorUserId: u.id, action: "angebot.reject", entityType: "angebot", entityId: String(a.homepageId) });
  revalidatePath("/touren/angebote");
}
