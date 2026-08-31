import { eq, sql } from "drizzle-orm";
import { cards } from "@tdd/db";
import { buildCardNumber } from "@tdd/core";
import { db } from "./db";

/** Nächste freie EAN-13-Kartennummer für eine Standort-Kennung (kollisionsfrei). */
export async function nextCardNumber(locationCode: number): Promise<string> {
  const cnt = await db().select({ n: sql<number>`count(*)` }).from(cards);
  let seq = Number(cnt[0]?.n ?? 0) + 1;
  for (let i = 0; i < 100; i++, seq++) {
    const num = buildCardNumber(locationCode, seq);
    const ex = await db().select({ id: cards.id }).from(cards).where(eq(cards.cardNumber, num)).limit(1);
    if (!ex[0]) return num;
  }
  throw new Error("Keine freie Kartennummer gefunden");
}

/** Addiert Monate zu einem ISO-Datum (yyyy-mm-dd). */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
