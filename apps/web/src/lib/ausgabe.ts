import { eq, sql } from "drizzle-orm";
import { persons, locations } from "@tdd/db";
import { db } from "./db";

/** Nächste freie Nummer innerhalb (Ort, Gruppe) = max vorhandene + 1. */
export async function nextNumberInGroup(locationId: number, gruppe: number): Promise<number> {
  const res = await db().execute(sql`
    SELECT COALESCE(MAX(p.ausgabe_number), 0) + 1 AS next
    FROM persons p
    JOIN person_location_assignments pla ON pla.person_id = p.id AND pla.is_active
    WHERE pla.location_id = ${locationId} AND p.gruppe = ${gruppe}`);
  const rows = res as unknown as { next: number }[];
  return Number(rows[0]?.next ?? 1);
}

/** Wählt die am wenigsten volle Gruppe eines Ortes (1..group_count). */
async function leastFullGroup(locationId: number): Promise<number> {
  const locRows = await db().select({ gc: locations.groupCount }).from(locations).where(eq(locations.id, locationId)).limit(1);
  const groupCount = Math.max(1, Number(locRows[0]?.gc ?? 8));
  const res = await db().execute(sql`
    SELECT p.gruppe AS gruppe, COUNT(*) AS n
    FROM persons p
    JOIN person_location_assignments pla ON pla.person_id = p.id AND pla.is_active
    WHERE pla.location_id = ${locationId} AND p.gruppe IS NOT NULL
    GROUP BY p.gruppe`);
  const counts = new Map<number, number>();
  for (const r of res as unknown as { gruppe: number; n: number }[]) counts.set(Number(r.gruppe), Number(r.n));
  let best = 1, bestN = Infinity;
  for (let g = 1; g <= groupCount; g++) {
    const n = counts.get(g) ?? 0;
    if (n < bestN) { best = g; bestN = n; }
  }
  return best;
}

/**
 * Stellt sicher, dass die Person Gruppe + Nummer an ihrem Ort hat.
 * Vorbelegung: am wenigsten volle Gruppe, nächste freie Nummer darin.
 * Vergibt nur, wenn noch nicht gesetzt. Gibt {gruppe, nummer} zurück.
 */
export async function ensureAusgabePlacement(personId: string, locationId: number): Promise<{ gruppe: number; nummer: number }> {
  const cur = await db().select({ g: persons.gruppe, n: persons.ausgabeNumber }).from(persons).where(eq(persons.id, personId)).limit(1);
  if (cur[0]?.g != null && cur[0]?.n != null) return { gruppe: cur[0].g, nummer: cur[0].n };
  const gruppe = cur[0]?.g ?? (await leastFullGroup(locationId));
  const nummer = cur[0]?.n ?? (await nextNumberInGroup(locationId, gruppe));
  await db().update(persons).set({ gruppe, ausgabeNumber: nummer }).where(eq(persons.id, personId));
  return { gruppe, nummer };
}
