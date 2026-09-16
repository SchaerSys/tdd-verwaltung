import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { abwesenheiten, betriebsfreieTage, staff, timeEvents, zeitAbschluesse, zeitRegeln } from "@tdd/db";
import { db } from "./db";
import { currentTenantId } from "@tdd/db";
import { feiertagsKarte } from "./feiertage";
import { monatAuswertung, REGELN_STANDARD, type MonatAuswertung, type Verteilung, type ZeitRegeln } from "./azg";
import { viennaLocalToUtc, type Ev, type EventKind } from "./zeit";

export interface Arbeitgeber { arbeitgeberName: string; arbeitgeberAnschrift: string | null; bvKasse: string | null; svTraeger: string; kvEinsicht: string | null; ausgabeStempelt: boolean; ortungAufbewahrungTage: number }
const ARBEITGEBER_STANDARD: Arbeitgeber = { arbeitgeberName: "Tischlein deck dich Vorarlberg", arbeitgeberAnschrift: null, bvKasse: null, svTraeger: "Österreichische Gesundheitskasse (ÖGK)", kvEinsicht: null, ausgabeStempelt: true, ortungAufbewahrungTage: 90 };

/** Zivildienst-Grenzen laut ZISA (ZDG § 23) – als ZeitRegeln im ZDG-Modus plus Wochenminimum und Freistellung. */
export interface ZiviRegeln { zivi: ZeitRegeln; ziviWocheMinMin: number; ziviFreistellungMonat: number }
export const ZIVI_STANDARD: ZiviRegeln = {
  zivi: { maxTagMin: 600, maxWocheMin: 2700, pauseAbMin: 360, pauseMin: 30, ruhezeitMin: 660, normalarbeitszeitWocheMin: 2700, mehrarbeitZuschlag: 0, ueberstundenZuschlag: 0, gesetz: "ZDG", sonntagErlaubt: false },
  ziviWocheMinMin: 2160, ziviFreistellungMonat: 2,
};
export type AlleRegeln = ZeitRegeln & { kollektivvertrag: string | null } & Arbeitgeber & ZiviRegeln;

/** Regeln fuer eine Person: Zivis nach ZDG, alle anderen nach AZG. */
export function regelnFuer(r: AlleRegeln, staffType: string): ZeitRegeln {
  return staffType === "ZIVILDIENER" ? r.zivi : r;
}

export async function ladeRegeln(): Promise<AlleRegeln> {
  const r = (await db().select().from(zeitRegeln).where(eq(zeitRegeln.tenantId, currentTenantId())).limit(1))[0]; // eine Zeile je Mandant (053)
  if (!r) return { ...REGELN_STANDARD, kollektivvertrag: null, ...ARBEITGEBER_STANDARD, ...ZIVI_STANDARD };
  return { maxTagMin: r.maxTagMin, maxWocheMin: r.maxWocheMin, pauseAbMin: r.pauseAbMin, pauseMin: r.pauseMin, ruhezeitMin: r.ruhezeitMin,
    normalarbeitszeitWocheMin: r.normalarbeitszeitWocheMin, mehrarbeitZuschlag: r.mehrarbeitZuschlag, ueberstundenZuschlag: r.ueberstundenZuschlag, kollektivvertrag: r.kollektivvertrag,
    arbeitgeberName: r.arbeitgeberName, arbeitgeberAnschrift: r.arbeitgeberAnschrift, bvKasse: r.bvKasse, svTraeger: r.svTraeger, kvEinsicht: r.kvEinsicht, ausgabeStempelt: r.ausgabeStempelt, ortungAufbewahrungTage: r.ortungAufbewahrungTage,
    zivi: { maxTagMin: r.ziviTagMaxMin, maxWocheMin: r.ziviWocheMaxMin, pauseAbMin: r.ziviPauseAbMin, pauseMin: r.ziviPauseMin, ruhezeitMin: r.ziviRuhezeitMin, normalarbeitszeitWocheMin: r.ziviWocheMaxMin, mehrarbeitZuschlag: 0, ueberstundenZuschlag: 0, gesetz: "ZDG", sonntagErlaubt: r.ziviSonntagErlaubt },
    ziviWocheMinMin: r.ziviWocheMinMin, ziviFreistellungMonat: r.ziviFreistellungMonat };
}

export interface PersonAuswertung {
  person: typeof staff.$inferSelect; auswertung: MonatAuswertung;
  abschluss: typeof zeitAbschluesse.$inferSelect | null;
  /** Zeitkonto: Stand am Monatsende = Anfangssaldo + Salden aller Monate seit Kontostart bis inkl. diesem. */
  kontoMin: number; kontoStart: string | null;
}

function monatsGrenzen(jahr: number, monat: number) {
  const von = viennaLocalToUtc(`${jahr}-${String(monat).padStart(2, "0")}-01T00:00`);
  const bisMonat = monat === 12 ? `${jahr + 1}-01` : `${jahr}-${String(monat + 1).padStart(2, "0")}`;
  const bis = viennaLocalToUtc(`${bisMonat}-01T00:00`);
  return { von, bis, vonIso: `${jahr}-${String(monat).padStart(2, "0")}-01`, bisIso: `${bisMonat}-01` };
}

/**
 * Monatsauswertung fuer eine oder alle aktiven Personen inkl. Zeitkonto.
 * Zeitkonto: abgeschlossene Vormonate aus zeit_abschluesse (fest), offene Vormonate werden
 * live gerechnet – so bleibt das Konto auch ohne lueckenlosen Abschluss brauchbar.
 */
export async function ladeMonat(jahr: number, monat: number, staffId?: string, now = new Date()): Promise<PersonAuswertung[]> {
  const d = db();
  const leute = await d.select().from(staff).where(staffId ? eq(staff.id, staffId) : eq(staff.isActive, true)).orderBy(asc(staff.lastName), asc(staff.firstName));
  if (leute.length === 0) return [];
  const ids = leute.map((p) => p.id);
  const regeln = await ladeRegeln();
  const feier = feiertagsKarte([jahr - 1, jahr, jahr + 1]);
  const frei = new Map((await d.select().from(betriebsfreieTage)).map((b) => [b.datum, b.name]));
  const { von, bis, vonIso, bisIso } = monatsGrenzen(jahr, monat);

  const [evs, abw, abschl] = await Promise.all([
    d.select({ staffId: timeEvents.staffId, kind: timeEvents.kind, at: timeEvents.at }).from(timeEvents)
      .where(and(inArray(timeEvents.staffId, ids), gte(timeEvents.at, von), lt(timeEvents.at, bis))).orderBy(asc(timeEvents.at)),
    d.select().from(abwesenheiten).where(and(inArray(abwesenheiten.staffId, ids), lte(abwesenheiten.von, bisIso), gte(abwesenheiten.bis, vonIso), eq(abwesenheiten.status, "GENEHMIGT"))),
    d.select().from(zeitAbschluesse).where(and(inArray(zeitAbschluesse.staffId, ids), eq(zeitAbschluesse.jahr, jahr), eq(zeitAbschluesse.monat, monat))),
  ]);
  const jeStaff = new Map<string, Ev[]>();
  for (const e of evs) { if (!jeStaff.has(e.staffId)) jeStaff.set(e.staffId, []); jeStaff.get(e.staffId)!.push({ kind: e.kind as EventKind, at: e.at }); }

  const out: PersonAuswertung[] = [];
  for (const p of leute) {
    const R = regelnFuer(regeln, p.staffType); // Zivis: ZDG-Grenzen laut ZISA
    const auswertung = monatAuswertung({
      events: jeStaff.get(p.id) ?? [], verteilung: (p.sollVerteilung as Verteilung | null) ?? null, wochenstunden: p.weeklyHours ? Number(p.weeklyHours) : null,
      jahr, monat, feiertage: feier, betriebsfrei: frei, regeln: R,
      abwesenheiten: abw.filter((a) => a.staffId === p.id).map((a) => ({ art: a.art, von: a.von, bis: a.bis })), now,
    });
    const abschluss = abschl.find((a) => a.staffId === p.id) ?? null;
    const kontoVor = await kontoBisVormonat(p, jahr, monat, R, feier, frei, now);
    out.push({ person: p, auswertung, abschluss, kontoMin: kontoVor + auswertung.saldoMin, kontoStart: p.zeitkontoStart });
  }
  return out;
}

/** Zeitkonto bis zum Ende des Vormonats: feste Abschluesse, sonst live gerechnet, ab Kontostart. */
async function kontoBisVormonat(p: typeof staff.$inferSelect, jahr: number, monat: number, regeln: ZeitRegeln, feier: Map<string, string>, frei: Map<string, string>, now: Date): Promise<number> {
  const start = p.zeitkontoStart ?? p.employmentStart;
  if (!start) return p.zeitkontoAnfangMin;
  let [j, m] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  let konto = p.zeitkontoAnfangMin;
  const d = db();
  const abschl = await d.select().from(zeitAbschluesse).where(eq(zeitAbschluesse.staffId, p.id));
  while (j < jahr || (j === jahr && m < monat)) {
    const a = abschl.find((x) => x.jahr === j && x.monat === m);
    if (a) konto += a.saldoMin;
    else {
      const { von, bis, vonIso, bisIso } = monatsGrenzen(j, m);
      const [evs, abw] = await Promise.all([
        d.select({ kind: timeEvents.kind, at: timeEvents.at }).from(timeEvents).where(and(eq(timeEvents.staffId, p.id), gte(timeEvents.at, von), lt(timeEvents.at, bis))),
        d.select().from(abwesenheiten).where(and(eq(abwesenheiten.staffId, p.id), lte(abwesenheiten.von, bisIso), gte(abwesenheiten.bis, vonIso), eq(abwesenheiten.status, "GENEHMIGT"))),
      ]);
      const a2 = monatAuswertung({ events: evs.map((e) => ({ kind: e.kind as EventKind, at: e.at })), verteilung: (p.sollVerteilung as Verteilung | null) ?? null, wochenstunden: p.weeklyHours ? Number(p.weeklyHours) : null,
        jahr: j, monat: m, feiertage: feier, betriebsfrei: frei, regeln, abwesenheiten: abw.map((x) => ({ art: x.art, von: x.von, bis: x.bis })), now });
      konto += a2.saldoMin;
    }
    m += 1; if (m > 12) { m = 1; j += 1; }
  }
  return konto;
}

export async function monatAbgeschlossen(staffId: string, jahr: number, monat: number): Promise<boolean> {
  const r = await db().select({ jahr: zeitAbschluesse.jahr }).from(zeitAbschluesse).where(and(eq(zeitAbschluesse.staffId, staffId), eq(zeitAbschluesse.jahr, jahr), eq(zeitAbschluesse.monat, monat))).limit(1);
  return r.length > 0;
}
