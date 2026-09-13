import { sql } from "drizzle-orm";
import { buildCardNumber } from "@tdd/core";
import { db } from "./db";

/**
 * Nächste EAN-13-Kartennummer für eine Standort-Kennung.
 * Atomar über next_card_sequence(): zwei Tresen, die gleichzeitig ausstellen,
 * bekommen garantiert verschiedene Nummern – ohne Retry, ohne Lücke.
 */
export async function nextCardNumber(locationCode: number): Promise<string> {
  const res = await db().execute(sql`SELECT next_card_sequence(${locationCode}::smallint) AS seq`);
  const seq = Number((res as unknown as { seq: string | number }[])[0]?.seq ?? 0);
  if (!seq) throw new Error("Kartennummer konnte nicht vergeben werden");
  return buildCardNumber(locationCode, seq);
}

/** Addiert Monate zu einem ISO-Datum (yyyy-mm-dd), ohne Monatsende-Überlauf. */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1); // erst auf den 1. – verhindert den Überlauf
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastOfMonth)); // 31.08. + 6 Mon. → 28./29.02.
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
