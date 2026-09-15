import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { abholstellen, abwesenheiten, fahrzeuge, locations, staff, tourStopps, touren } from "@tdd/db";
import { db } from "./db";
import { konflikte, type Konflikt, type PlanAbwesenheit, type PlanFahrer, type PlanFahrzeug, type PlanTour } from "./touren";

export interface StoppAnzeige {
  id: string; reihenfolge: number; art: string; status: string; hinweis: string | null; bemerkung: string | null;
  mengeKisten: number | null; mengeKg: string | null; erledigtAt: Date | null;
  name: string; adresse: string; telefon: string | null; kuehlbedarf: boolean; fenster: string | null; ansprechperson: string | null; stellenHinweis: string | null;
  lat: number | null; lng: number | null;
}
export interface TourAnzeige {
  id: string; datum: string; name: string; startzeit: string | null; status: string; hinweise: string | null;
  fahrerId: string | null; beifahrerId: string | null; fahrzeugId: number | null; startLocationId: number | null;
  fahrer: string | null; beifahrer: string | null; fahrzeug: string | null; fahrzeugKuehlung: boolean; start: string | null;
  kmStart: number | null; kmEnde: number | null; gestartetAt: Date | null; beendetAt: Date | null;
  freigegebenAt: Date | null; streckeKm: string | null; fahrzeitMin: number | null;
  stopps: StoppAnzeige[]; konflikte: Konflikt[];
}

/** Stammdaten fuer Auswahlfelder und Konfliktpruefung. */
export async function planStammdaten() {
  const d = db();
  const [fahrer, wagen, orte] = await Promise.all([
    d.select({ id: staff.id, firstName: staff.firstName, lastName: staff.lastName, kannFahren: staff.kannFahren, isActive: staff.isActive, fahrerTage: staff.fahrerTage, phone: staff.phone })
      .from(staff).where(eq(staff.isActive, true)).orderBy(asc(staff.lastName), asc(staff.firstName)),
    d.select().from(fahrzeuge).orderBy(asc(fahrzeuge.isActive), asc(fahrzeuge.kennzeichen)),
    d.select({ id: locations.id, name: locations.name, type: locations.type, city: locations.city }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
  ]);
  const planFahrer: PlanFahrer[] = fahrer.map((f) => ({ id: f.id, name: `${f.firstName} ${f.lastName}`, kannFahren: f.kannFahren, isActive: f.isActive, fahrerTage: f.fahrerTage }));
  const planFahrzeuge: PlanFahrzeug[] = wagen.map((v) => ({ id: v.id, kennzeichen: v.kennzeichen, kuehlung: v.kuehlung, isActive: v.isActive, ausserBetriebVon: v.ausserBetriebVon, ausserBetriebBis: v.ausserBetriebBis, pickerlBis: v.pickerlBis }));
  return { fahrer, wagen, orte, planFahrer, planFahrzeuge };
}

/** Touren eines Tages (oder eine bestimmte) mit Stopps, Namen und Konflikten. */
export async function ladeTouren(where: { datum?: string; id?: string; fahrerStaffId?: string }): Promise<TourAnzeige[]> {
  const d = db();
  const bed = where.id ? eq(touren.id, where.id)
    : where.fahrerStaffId ? and(eq(touren.datum, where.datum!), inArray(touren.fahrerId, [where.fahrerStaffId]))
    : eq(touren.datum, where.datum!);
  const liste = await d.select().from(touren).where(bed).orderBy(asc(touren.startzeit), asc(touren.name));
  if (liste.length === 0) return [];
  const ids = liste.map((t) => t.id);
  const datumSet = [...new Set(liste.map((t) => t.datum))];
  const [stopps, sd, ab, tagesTouren] = await Promise.all([
    d.select({
      s: tourStopps, aName: abholstellen.name, aStrasse: abholstellen.strasse, aPlz: abholstellen.plz, aOrt: abholstellen.ort, aTel: abholstellen.telefon,
      aKuehl: abholstellen.kuehlbedarf, aVon: abholstellen.fensterVon, aBis: abholstellen.fensterBis, aPerson: abholstellen.ansprechperson, aHinw: abholstellen.hinweise, aLat: abholstellen.lat, aLng: abholstellen.lng,
      lName: locations.name, lCity: locations.city,
    }).from(tourStopps).leftJoin(abholstellen, eq(tourStopps.abholstelleId, abholstellen.id)).leftJoin(locations, eq(tourStopps.locationId, locations.id))
      .where(inArray(tourStopps.tourId, ids)).orderBy(asc(tourStopps.reihenfolge)),
    planStammdaten(),
    d.select().from(abwesenheiten).where(and(lte(abwesenheiten.von, datumSet[datumSet.length - 1]!), gte(abwesenheiten.bis, datumSet[0]!))),
    d.select({ id: touren.id, datum: touren.datum, name: touren.name, fahrerId: touren.fahrerId, fahrzeugId: touren.fahrzeugId, status: touren.status }).from(touren).where(inArray(touren.datum, datumSet)),
  ]);
  const planAb: PlanAbwesenheit[] = ab.map((a) => ({ staffId: a.staffId, art: a.art, von: a.von, bis: a.bis }));
  const fahrerName = (id: string | null) => { const f = sd.fahrer.find((x) => x.id === id); return f ? `${f.firstName} ${f.lastName}` : null; };
  const kuehlJeTour = new Map<string, boolean>();
  for (const s of stopps) if (s.s.art === "ABHOLUNG" && s.aKuehl) kuehlJeTour.set(s.s.tourId, true);
  const planTouren: PlanTour[] = tagesTouren.map((t) => ({ id: t.id, datum: t.datum, name: t.name, fahrerId: t.fahrerId, fahrzeugId: t.fahrzeugId, status: t.status, kuehlbedarf: kuehlJeTour.get(t.id) ?? false }));

  return liste.map((t) => {
    const w = sd.wagen.find((x) => x.id === t.fahrzeugId);
    const start = sd.orte.find((o) => o.id === t.startLocationId);
    const plan: PlanTour = { id: t.id, datum: t.datum, name: t.name, fahrerId: t.fahrerId, fahrzeugId: t.fahrzeugId, status: t.status, kuehlbedarf: kuehlJeTour.get(t.id) ?? false };
    return {
      id: t.id, datum: t.datum, name: t.name, startzeit: t.startzeit, status: t.status, hinweise: t.hinweise,
      fahrerId: t.fahrerId, beifahrerId: t.beifahrerId, fahrzeugId: t.fahrzeugId, startLocationId: t.startLocationId,
      fahrer: fahrerName(t.fahrerId), beifahrer: fahrerName(t.beifahrerId), fahrzeug: w ? `${w.kennzeichen} · ${w.bezeichnung}` : null, fahrzeugKuehlung: w?.kuehlung ?? false,
      start: start ? start.name : null, kmStart: t.kmStart, kmEnde: t.kmEnde, gestartetAt: t.gestartetAt, beendetAt: t.beendetAt,
      freigegebenAt: t.freigegebenAt, streckeKm: t.streckeKm, fahrzeitMin: t.fahrzeitMin,
      stopps: stopps.filter((s) => s.s.tourId === t.id).map((s) => ({
        id: s.s.id, reihenfolge: s.s.reihenfolge, art: s.s.art, status: s.s.status, hinweis: s.s.hinweis, bemerkung: s.s.bemerkung,
        mengeKisten: s.s.mengeKisten, mengeKg: s.s.mengeKg, erledigtAt: s.s.erledigtAt,
        name: s.s.art === "ABHOLUNG" ? (s.aName ?? "?") : (s.lName ?? "?"),
        adresse: s.s.art === "ABHOLUNG" ? [s.aStrasse, [s.aPlz, s.aOrt].filter(Boolean).join(" ")].filter(Boolean).join(", ") : (s.lCity ?? ""),
        telefon: s.aTel ?? null, kuehlbedarf: s.s.art === "ABHOLUNG" ? !!s.aKuehl : false,
        fenster: s.aVon || s.aBis ? `${(s.aVon ?? "").slice(0, 5)}–${(s.aBis ?? "").slice(0, 5)}` : null,
        ansprechperson: s.aPerson ?? null, stellenHinweis: s.aHinw ?? null, lat: s.aLat ?? null, lng: s.aLng ?? null,
      })),
      konflikte: konflikte(plan, planTouren, sd.planFahrer, sd.planFahrzeuge, planAb),
    };
  });
}

/** Personal-Datensatz des angemeldeten Fahrers (staff.user_id). */
export async function fahrerZuBenutzer(userId: string) {
  return (await db().select({ id: staff.id, firstName: staff.firstName, lastName: staff.lastName }).from(staff).where(eq(staff.userId, userId)).limit(1))[0] ?? null;
}
