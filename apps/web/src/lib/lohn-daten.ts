import { and, gte, inArray, lte } from "drizzle-orm";
import { abwesenheiten } from "@tdd/db";
import { db } from "./db";
import { ladeMonat } from "./azg-daten";
import { freieTage } from "./abwesenheit-daten";
import { sollJeWochentag, type Verteilung } from "./azg";
import { lohnRelevant, lohnZeile, monatsGrenzen, type LohnZeile } from "./lohn";

/** Lohnexport-Zeilen eines Monats: alle aktiven Arbeitnehmer:innen (Zivis/Ehrenamt ausgenommen). */
export async function ladeLohn(jahr: number, monat: number): Promise<LohnZeile[]> {
  const liste = (await ladeMonat(jahr, monat)).filter((x) => lohnRelevant(x.person));
  if (liste.length === 0) return [];
  const { von, bis } = monatsGrenzen(jahr, monat);
  const [abw, frei] = await Promise.all([
    db().select().from(abwesenheiten).where(and(inArray(abwesenheiten.staffId, liste.map((x) => x.person.id)), lte(abwesenheiten.von, bis), gte(abwesenheiten.bis, von))),
    freieTage([jahr]),
  ]);
  return liste.map((x) => lohnZeile({
    person: x.person, auswertung: x.auswertung, kontoMin: x.kontoMin, abgeschlossen: !!x.abschluss, abschluss: x.abschluss,
    abwesenheiten: abw.filter((a) => a.staffId === x.person.id), soll: sollJeWochentag((x.person.sollVerteilung as Verteilung | null) ?? null, x.person.weeklyHours ? Number(x.person.weeklyHours) : null),
    feiertage: frei, jahr, monat,
  }));
}
