import { loadTresenReport } from "./tresen-report";
import { ladeWareneingang } from "./wareneingang";
import { db } from "./db";
import { sql } from "drizzle-orm";

/** Monatsbericht (6): Ausgaben je Ausgabestelle, Wareneingang, Schuldenstand – als Zahlen fuer Druck und Mail. */
export interface Monatsbericht {
  monat: string; von: string; bis: string;
  stellen: { name: string; tage: number; personen: number; einnahmen: number; ausstand: number }[];
  summe: { tage: number; personen: number; einnahmen: number; ausstand: number };
  wareneingang: { kisten: number; kg: number; abholungen: number; touren: number };
  schulden: { personen: number; offen: number };
  neuePersonen: number; aktiveKarten: number;
}

function rows<T>(res: unknown): T[] { return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[]; }

export function monatsgrenzen(monat: string): { von: string; bis: string } {
  const [j, m] = monat.split("-").map(Number);
  const von = `${j}-${String(m).padStart(2, "0")}-01`;
  const letzter = new Date(Date.UTC(j ?? 2026, m ?? 1, 0)).getUTCDate();
  return { von, bis: `${j}-${String(m).padStart(2, "0")}-${String(letzter).padStart(2, "0")}` };
}

export async function ladeMonatsbericht(monat: string): Promise<Monatsbericht> {
  const { von, bis } = monatsgrenzen(monat);
  const [bloecke, ware, schuldR, neuR, kartenR] = await Promise.all([
    loadTresenReport(von, bis), ladeWareneingang(von, bis),
    db().execute(sql`SELECT count(*)::int AS n, coalesce(sum(offen), 0) AS offen FROM v_schulden`),
    db().execute(sql`SELECT count(*)::int AS n FROM persons WHERE deleted_at IS NULL AND created_at::date BETWEEN ${von} AND ${bis}`),
    db().execute(sql`SELECT count(*)::int AS n FROM cards WHERE status = 'AKTIV' AND deleted_at IS NULL AND valid_to >= ${bis}`),
  ]);
  const schuld = rows<{ n: number; offen: string }>(schuldR), neu = rows<{ n: number }>(neuR), karten = rows<{ n: number }>(kartenR);
  const stellen = bloecke.map((b) => ({ name: b.name, tage: b.days.filter((d) => d.persons > 0).length, personen: b.totalPersons, einnahmen: b.totalIncome, ausstand: b.totalAusstand }));
  const summe = { tage: stellen.reduce((a, s) => a + s.tage, 0), personen: stellen.reduce((a, s) => a + s.personen, 0), einnahmen: stellen.reduce((a, s) => a + s.einnahmen, 0), ausstand: stellen.reduce((a, s) => a + s.ausstand, 0) };
  return { monat, von, bis, stellen, summe, wareneingang: { kisten: ware.summe.kisten, kg: ware.summe.kg, abholungen: ware.summe.stopps, touren: ware.summe.touren },
    schulden: { personen: schuld[0]?.n ?? 0, offen: Number(schuld[0]?.offen ?? 0) }, neuePersonen: neu[0]?.n ?? 0, aktiveKarten: karten[0]?.n ?? 0 };
}

const eur = (n: number) => n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export function monatName(monat: string): string { const [j, m] = monat.split("-").map(Number); return `${MONATE[m! - 1]} ${j}`; }

/** Klartext fuer die Mail an den Obmann / Vorstand. */
export function monatsberichtText(b: Monatsbericht, traeger: string): string {
  const z: string[] = [`Monatsbericht ${monatName(b.monat)} – ${traeger}`, "", "AUSGABE"];
  for (const s of b.stellen) z.push(`  ${s.name}: ${s.tage} Ausgabetage, ${s.personen} Bezüge, Einnahmen ${eur(s.einnahmen)}${s.ausstand ? `, neuer Ausstand ${eur(s.ausstand)}` : ""}`);
  z.push(`  Gesamt: ${b.summe.tage} Ausgabetage, ${b.summe.personen} Bezüge, Einnahmen ${eur(b.summe.einnahmen)}`, "",
    "KLIENT:INNEN", `  Neu aufgenommen: ${b.neuePersonen} · Aktive Karten am Monatsende: ${b.aktiveKarten}`, `  Offene Schulden (Stand heute): ${b.schulden.personen} Personen, ${eur(b.schulden.offen)}`, "",
    "WARENEINGANG", `  ${b.wareneingang.kisten} Kisten, ca. ${Math.round(b.wareneingang.kg)} kg aus ${b.wareneingang.abholungen} Abholungen (${b.wareneingang.touren} Touren)`, "",
    "Details und Excel-Export: Auswertungen in Tafelwerk.");
  return z.join("\n");
}
