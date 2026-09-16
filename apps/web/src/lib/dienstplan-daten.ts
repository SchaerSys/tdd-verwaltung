import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { abwesenheiten, betriebsfreieTage, dienste, dienstplanWochen, locations, staff, touren } from "@tdd/db";
import { db } from "./db";
import { feiertagsKarte } from "./feiertage";
import { sollJeWochentag, type Verteilung } from "./azg";
import { ladeRegeln, regelnFuer } from "./azg-daten";
import { asOpeningHours, WEEKDAYS } from "./opening-hours";
import { besetzungPruefung, planPruefung, plusTage, wochenStart, wochenSummen, type Dienst, type DienstStandard, type OeffnungsSlot, type PlanHinweis } from "./dienstplan";

export interface PlanPersonDaten {
  id: string; name: string; firstName: string; lastName: string; staffType: string; soll: Record<number, number>;
  standard: DienstStandard | null; kannFahren: boolean; locationId: number | null;
}
export interface WochenDaten {
  wocheStart: string; wocheEnde: string;
  status: "ENTWURF" | "VEROEFFENTLICHT"; veroeffentlichtAt: Date | null;
  personen: PlanPersonDaten[];
  dienste: Dienst[];                       // Sonntag davor bis Sonntag der Woche
  abwesenheiten: { staffId: string; von: string; bis: string; art: string; status: string; halbtag: boolean }[];
  feiertage: Map<string, string>;
  standorte: { id: number; name: string; type: string; oeffnung: Partial<Record<number, OeffnungsSlot[]>> }[];
  touren: { id: string; datum: string; name: string; fahrerId: string | null; beifahrerId: string | null; startzeit: string | null }[];
  hinweise: PlanHinweis[];
  summen: Map<string, number>;
}

/** Öffnungszeiten (mon..sun) auf ISO-Wochentage 1..7 umschlüsseln. */
function oeffnungIso(v: unknown): Partial<Record<number, OeffnungsSlot[]>> {
  const oh = asOpeningHours(v);
  const out: Partial<Record<number, OeffnungsSlot[]>> = {};
  WEEKDAYS.forEach((k, i) => { const s = oh[k]; if (s && s.length) out[i + 1] = s; });
  return out;
}

export async function ladeWoche(wocheStart: string): Promise<WochenDaten> {
  const d = db();
  const wocheEnde = plusTage(wocheStart, 6);
  const von = plusTage(wocheStart, -1); // Sonntag davor fuer die Ruhezeit
  const [woche, leute, ds, abw, frei, locs, tours, regeln] = await Promise.all([
    d.select().from(dienstplanWochen).where(eq(dienstplanWochen.wocheStart, wocheStart)).limit(1),
    d.select().from(staff).where(eq(staff.isActive, true)).orderBy(asc(staff.lastName), asc(staff.firstName)),
    d.select().from(dienste).where(and(gte(dienste.datum, von), lte(dienste.datum, wocheEnde))).orderBy(asc(dienste.datum), asc(dienste.von)),
    d.select({ staffId: abwesenheiten.staffId, von: abwesenheiten.von, bis: abwesenheiten.bis, art: abwesenheiten.art, status: abwesenheiten.status, halbtag: abwesenheiten.halbtag })
      .from(abwesenheiten).where(and(lte(abwesenheiten.von, wocheEnde), gte(abwesenheiten.bis, wocheStart))),
    d.select().from(betriebsfreieTage).where(and(gte(betriebsfreieTage.datum, wocheStart), lte(betriebsfreieTage.datum, wocheEnde))),
    d.select({ id: locations.id, name: locations.name, type: locations.type, openingHours: locations.openingHours }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
    d.select({ id: touren.id, datum: touren.datum, name: touren.name, fahrerId: touren.fahrerId, beifahrerId: touren.beifahrerId, startzeit: touren.startzeit })
      .from(touren).where(and(gte(touren.datum, wocheStart), lte(touren.datum, wocheEnde))),
    ladeRegeln(),
  ]);

  const feiertage = feiertagsKarte([Number(wocheStart.slice(0, 4)), Number(wocheEnde.slice(0, 4))]);
  for (const f of frei) feiertage.set(f.datum, f.name);

  const personen: PlanPersonDaten[] = leute.map((p) => ({
    id: p.id, name: `${p.firstName} ${p.lastName}`, firstName: p.firstName, lastName: p.lastName, staffType: p.staffType,
    soll: sollJeWochentag((p.sollVerteilung as Verteilung | null) ?? null, p.weeklyHours ? Number(p.weeklyHours) : null),
    standard: (p.dienstStandard as DienstStandard | null) ?? null, kannFahren: p.kannFahren, locationId: p.locationId,
    regeln: regelnFuer(regeln, p.staffType), zivildienst: p.staffType === "ZIVILDIENER",
  }));
  const dienstListe: Dienst[] = ds.map((x) => ({ id: x.id, datum: x.datum, staffId: x.staffId, locationId: x.locationId, von: x.von, bis: x.bis, pauseMin: x.pauseMin, taetigkeit: x.taetigkeit, notiz: x.notiz }));
  const standorte = locs.map((l) => ({ id: l.id, name: l.name, type: l.type, oeffnung: oeffnungIso(l.openingHours) }));

  const hinweise = [
    ...planPruefung({ wocheStart, dienste: dienstListe, personen, abwesenheiten: abw, feiertage, regeln }),
    ...besetzungPruefung({ wocheStart, dienste: dienstListe, standorte: standorte.filter((s) => s.type === "AUSGABESTELLE" || s.type === "LADEN"), feiertage }),
  ];

  return {
    wocheStart, wocheEnde,
    status: (woche[0]?.status as "ENTWURF" | "VEROEFFENTLICHT" | undefined) ?? "ENTWURF", veroeffentlichtAt: woche[0]?.veroeffentlichtAt ?? null,
    personen, dienste: dienstListe, abwesenheiten: abw, feiertage, standorte, touren: tours, hinweise, summen: wochenSummen(dienstListe, wocheStart),
  };
}

/** Eigene Dienste aus veröffentlichten Wochen (für „Mein Bereich“). */
export async function ladeMeineDienste(staffId: string, von: string, bis: string) {
  const d = db();
  const wochen = await d.select({ w: dienstplanWochen.wocheStart }).from(dienstplanWochen).where(and(eq(dienstplanWochen.status, "VEROEFFENTLICHT"), gte(dienstplanWochen.wocheStart, plusTage(von, -6)), lte(dienstplanWochen.wocheStart, bis)));
  const frei = new Set(wochen.map((w) => w.w));
  if (frei.size === 0) return [];
  const rows = await d.select({ d: dienste, ort: locations.name }).from(dienste).leftJoin(locations, eq(locations.id, dienste.locationId))
    .where(and(eq(dienste.staffId, staffId), gte(dienste.datum, von), lte(dienste.datum, bis))).orderBy(asc(dienste.datum), asc(dienste.von));
  return rows.filter((r) => frei.has(wochenStart(r.d.datum))).map((r) => ({ ...r.d, ort: r.ort }));
}

/** Für Aktionen: Dienste einer Personengruppe in einer Woche (z. B. Kopieren). */
export async function diensteDerWoche(wocheStart: string, staffIds?: string[]) {
  const ende = plusTage(wocheStart, 6);
  const conds = [gte(dienste.datum, wocheStart), lte(dienste.datum, ende)];
  if (staffIds && staffIds.length) conds.push(inArray(dienste.staffId, staffIds));
  return db().select().from(dienste).where(and(...conds));
}
