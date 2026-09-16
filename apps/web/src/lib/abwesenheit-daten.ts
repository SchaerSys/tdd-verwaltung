import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { abwesenheiten, betriebsfreieTage, staff } from "@tdd/db";
import { db } from "./db";
import { feiertage } from "./feiertage";
import { sollJeWochentag, type Verteilung } from "./azg";
import { krankenstand, pflegefreistellung, urlaubskonto, type AbwEintrag, type PersonUrlaub, type UrlaubsKonto } from "./abwesenheit";

export interface PersonKonto {
  person: typeof staff.$inferSelect; soll: Record<number, number>; eintraege: (typeof abwesenheiten.$inferSelect)[];
  urlaub: UrlaubsKonto | null; krank: ReturnType<typeof krankenstand> | null; pflege: ReturnType<typeof pflegefreistellung> | null;
  fehlt: string | null; // warum kein Konto (kein Eintritt)
}

function personUrlaub(p: typeof staff.$inferSelect): PersonUrlaub | null {
  if (!p.employmentStart) return null;
  return {
    eintritt: p.employmentStart, austritt: p.employmentEnd, urlaubsjahr: p.urlaubsjahr === "KALENDER" ? "KALENDER" : "ARBEIT",
    wochen: p.urlaubWochen === 6 ? 6 : 5, uebertragTage: Number(p.urlaubUebertragTage ?? 0), uebertragAb: p.urlaubUebertragAb, dienstjahreAnrechnung: Number(p.dienstjahreAnrechnung ?? 0),
  };
}

/** Feiertage + betriebsfreie Tage als Set (zaehlen nicht als Urlaubstag). */
async function freieTage(jahre: number[]): Promise<Set<string>> {
  const s = new Set<string>();
  for (const j of jahre) for (const f of feiertage(j)) s.add(f.datum);
  for (const b of await db().select().from(betriebsfreieTage)) s.add(b.datum);
  return s;
}

/** Konten (Urlaub/Krankenstand/Pflege) fuer eine oder alle aktiven Personen am Stichtag. */
export async function ladeKonten(stichtag: string, staffId?: string): Promise<PersonKonto[]> {
  const d = db();
  const leute = await d.select().from(staff).where(staffId ? eq(staff.id, staffId) : eq(staff.isActive, true)).orderBy(asc(staff.lastName), asc(staff.firstName));
  if (leute.length === 0) return [];
  const jahr = Number(stichtag.slice(0, 4));
  const frei = await freieTage([jahr - 3, jahr - 2, jahr - 1, jahr, jahr + 1]);
  const alle = await d.select().from(abwesenheiten).where(inArray(abwesenheiten.staffId, leute.map((p) => p.id))).orderBy(desc(abwesenheiten.von));
  return leute.map((p) => {
    const eintraege = alle.filter((a) => a.staffId === p.id);
    const soll = sollJeWochentag((p.sollVerteilung as Verteilung | null) ?? null, p.weeklyHours ? Number(p.weeklyHours) : null);
    const pu = personUrlaub(p);
    const e: AbwEintrag[] = eintraege.map((a) => ({ art: a.art, von: a.von, bis: a.bis, status: a.status, halbtag: a.halbtag }));
    return {
      person: p, soll, eintraege,
      urlaub: pu ? urlaubskonto(pu, e, soll, frei, stichtag) : null,
      krank: pu ? krankenstand(pu, e, stichtag) : null,
      pflege: pu ? pflegefreistellung(pu, e, soll, frei, stichtag) : null,
      fehlt: pu ? null : "Kein Eintrittsdatum im Personal-Datensatz – ohne Eintritt kein Urlaubsjahr.",
    };
  });
}

/** Abwesenheiten eines Zeitraums (fuer den Kalender), inkl. beantragte. */
export async function ladeZeitraum(von: string, bis: string) {
  return db().select({ a: abwesenheiten, first: staff.firstName, last: staff.lastName, staffId: staff.id })
    .from(abwesenheiten).innerJoin(staff, eq(abwesenheiten.staffId, staff.id))
    .where(and(lte(abwesenheiten.von, bis), gte(abwesenheiten.bis, von), eq(staff.isActive, true)))
    .orderBy(asc(staff.lastName), asc(abwesenheiten.von));
}
