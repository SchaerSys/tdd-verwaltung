import { inArray } from "drizzle-orm";
import { cards, distributions, persons } from "@tdd/db";
import { db } from "./db";

/**
 * Rueckkanal Portal: Was ist bei TDD aus einem positiv beschiedenen Antrag geworden?
 * Die Organisation hat die Person selbst gemeldet – sie erfaehrt hier nur den Stand
 * des Falls (uebernommen, Karte, Bezug), keine weiteren Daten aus der TDD-Akte.
 */
export type RueckStufe =
  | "KEINE"          // nicht positiv / nichts uebergeben
  | "UEBERGEBEN"     // bei TDD, Uebernahme noch ausstehend
  | "UEBERNOMMEN"    // uebernommen, noch keine Karte
  | "KARTE"          // Karte ausgestellt, noch kein Bezug
  | "BEZIEHT"        // mindestens ein Bezug, Karte gueltig
  | "LAEUFT_AB"      // Karte gueltig, endet in <= 30 Tagen
  | "ABGELAUFEN"     // Karte abgelaufen / gesperrt
  | "GELOESCHT";     // Person bei TDD geloescht

export interface RueckStatus {
  stufe: RueckStufe;
  text: string;
  pill: "muted" | "good" | "warn" | "bad" | "tag-out";
  gueltigBis: string | null;
  letzterBezug: Date | null;
  bezuege: number;
}

export interface RueckDaten {
  person: { takeoverPending: boolean; deletedAt: Date | null } | undefined;
  karte: { status: string; validTo: string } | undefined;
  bezuege: number;
  letzterBezug: Date | null;
}

const fmt = (d: string) => d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4);

/** Reine Einstufung – testbar ohne Datenbank. `heute` als ISO-Datum. */
export function rueckstatus(d: RueckDaten, heute: string): RueckStatus {
  const basis = { gueltigBis: d.karte?.validTo ?? null, letzterBezug: d.letzterBezug, bezuege: d.bezuege };
  if (!d.person) return { stufe: "KEINE", text: "—", pill: "muted", ...basis };
  if (d.person.deletedAt) return { stufe: "GELOESCHT", text: "bei TDD gelöscht", pill: "muted", ...basis };
  if (d.person.takeoverPending) return { stufe: "UEBERGEBEN", text: "an TDD übergeben · Übernahme ausstehend", pill: "tag-out", ...basis };
  if (!d.karte) return { stufe: "UEBERNOMMEN", text: "von TDD übernommen · Karte noch nicht ausgestellt", pill: "tag-out", ...basis };
  if (d.karte.status !== "AKTIV") return { stufe: "ABGELAUFEN", text: `Karte ${d.karte.status.toLowerCase()}`, pill: "bad", ...basis };
  if (d.karte.validTo < heute) return { stufe: "ABGELAUFEN", text: `Karte abgelaufen am ${fmt(d.karte.validTo)}`, pill: "bad", ...basis };
  const plus30 = new Date(Date.parse(heute) + 30 * 864e5).toISOString().slice(0, 10);
  if (d.karte.validTo <= plus30) return { stufe: "LAEUFT_AB", text: `Karte läuft ab am ${fmt(d.karte.validTo)}`, pill: "warn", ...basis };
  if (d.bezuege > 0) return { stufe: "BEZIEHT", text: `bezieht · ${d.bezuege}× · gültig bis ${fmt(d.karte.validTo)}`, pill: "good", ...basis };
  return { stufe: "KARTE", text: `Karte ausgestellt · gültig bis ${fmt(d.karte.validTo)}`, pill: "good", ...basis };
}

/** Laedt fuer uebergebene Personen den Stand bei TDD (nur Status-Felder, keine Stammdaten). */
export async function ladeRueckstatus(personIds: string[]): Promise<Map<string, RueckStatus>> {
  const out = new Map<string, RueckStatus>();
  const ids = [...new Set(personIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const d = db();
  const [prs, crs, drs] = await Promise.all([
    d.select({ id: persons.id, takeoverPending: persons.takeoverPending, deletedAt: persons.deletedAt }).from(persons).where(inArray(persons.id, ids)),
    d.select({ personId: cards.personId, status: cards.status, validTo: cards.validTo, deletedAt: cards.deletedAt }).from(cards).where(inArray(cards.personId, ids)),
    d.select({ personId: distributions.personId, at: distributions.distributedAt }).from(distributions).where(inArray(distributions.personId, ids)),
  ]);
  const heute = new Date().toISOString().slice(0, 10);
  const karte = new Map<string, { status: string; validTo: string }>();
  for (const c of crs) {
    if (c.deletedAt) continue;
    const cur = karte.get(c.personId);
    // Neueste Karte zaehlt; bei gleichem Ablauf die aktive.
    if (!cur || c.validTo > cur.validTo || (c.validTo === cur.validTo && c.status === "AKTIV")) karte.set(c.personId, { status: c.status, validTo: c.validTo });
  }
  const bez = new Map<string, { n: number; letzter: Date | null }>();
  for (const x of drs) {
    const cur = bez.get(x.personId) ?? { n: 0, letzter: null };
    cur.n += 1;
    if (!cur.letzter || x.at > cur.letzter) cur.letzter = x.at;
    bez.set(x.personId, cur);
  }
  for (const p of prs) {
    const b = bez.get(p.id);
    out.set(p.id, rueckstatus({ person: p, karte: karte.get(p.id), bezuege: b?.n ?? 0, letzterBezug: b?.letzter ?? null }, heute));
  }
  return out;
}
