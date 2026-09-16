import { sql } from "drizzle-orm";
import { db } from "./db";

/** Personalnummern-Bereiche: Festangestellte 1–99, Zivildiener 100–199, Ehrenamt und Fahrer:innen 200–9999. */
export function personalnrBereich(staffType: string): { von: number; bis: number } {
  if (staffType === "ANGESTELLT") return { von: 1, bis: 99 };
  if (staffType === "ZIVILDIENER") return { von: 100, bis: 199 };
  return { von: 200, bis: 9999 };
}

export function personalnrPasst(nr: number | null | undefined, staffType: string): boolean {
  if (nr == null) return false;
  const b = personalnrBereich(staffType);
  return nr >= b.von && nr <= b.bis;
}

/** Naechste freie Nummer im Bereich (DB-Funktion aus Migration 051). */
export async function naechstePersonalnr(staffType: string): Promise<number> {
  const r = await db().execute(sql`SELECT naechste_personalnr(${staffType})::int AS n`);
  const rows = (Array.isArray(r) ? r : (r as { rows?: { n: number }[] }).rows ?? []) as { n: number }[];
  return Number(rows[0]!.n);
}
