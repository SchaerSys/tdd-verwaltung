import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Wareneingang (Auftrag 17.09.2026): Kisten und geschaetzte kg, die die Fahrer:innen an den
 * Abholstellen erfassen (tour_stopps.menge_* bei Stopps der Art ABHOLUNG, Status ERLEDIGT).
 * Auswertung je Tag, je Abholstelle und je Tour fuer einen Zeitraum.
 */
export interface TagZeile { tag: string; kisten: number; kg: number; stopps: number; touren: number }
export interface StelleZeile { abholstelleId: number; name: string; art: string | null; kisten: number; kg: number; stopps: number; letzte: string | null }
export interface TourZeile { tourId: string; datum: string; tour: string; fahrer: string | null; fahrzeug: string | null; stelle: string; kisten: number | null; kg: number | null; erledigtAt: Date | null; bemerkung: string | null }
export interface Wareneingang { tage: TagZeile[]; stellen: StelleZeile[]; touren: TourZeile[]; summe: { kisten: number; kg: number; stopps: number; touren: number; tage: number } }

function rows<T>(res: unknown): T[] { return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[]; }

export async function ladeWareneingang(von: string, bis: string, tag?: string): Promise<Wareneingang> {
  const d = db();
  const basis = sql`FROM tour_stopps s JOIN touren t ON t.id = s.tour_id JOIN abholstellen a ON a.id = s.abholstelle_id
    WHERE s.art = 'ABHOLUNG' AND s.status = 'ERLEDIGT' AND t.datum BETWEEN ${von} AND ${bis}`;
  const tage = rows<TagZeile>(await d.execute(sql`
    SELECT t.datum::text AS tag, coalesce(sum(s.menge_kisten), 0)::int AS kisten, coalesce(sum(s.menge_kg), 0)::float AS kg,
           count(*)::int AS stopps, count(DISTINCT t.id)::int AS touren ${basis} GROUP BY t.datum ORDER BY t.datum DESC`));
  const stellen = rows<StelleZeile>(await d.execute(sql`
    SELECT a.id AS "abholstelleId", a.name, a.art, coalesce(sum(s.menge_kisten), 0)::int AS kisten, coalesce(sum(s.menge_kg), 0)::float AS kg,
           count(*)::int AS stopps, max(t.datum)::text AS letzte ${basis} GROUP BY a.id, a.name, a.art ORDER BY kisten DESC, a.name`));
  const touren = rows<TourZeile>(await d.execute(sql`
    SELECT t.id AS "tourId", t.datum::text AS datum, t.name AS tour, (SELECT first_name || ' ' || last_name FROM staff st WHERE st.id = t.fahrer_id) AS fahrer,
           (SELECT kennzeichen FROM fahrzeuge f WHERE f.id = t.fahrzeug_id) AS fahrzeug, a.name AS stelle, s.menge_kisten AS kisten, s.menge_kg::float AS kg,
           s.erledigt_at AS "erledigtAt", s.bemerkung ${basis} ${tag ? sql`AND t.datum = ${tag}` : sql``} ORDER BY t.datum DESC, t.startzeit, s.reihenfolge`));
  const summe = { kisten: tage.reduce((x, z) => x + z.kisten, 0), kg: Math.round(tage.reduce((x, z) => x + z.kg, 0)), stopps: tage.reduce((x, z) => x + z.stopps, 0),
    touren: tage.reduce((x, z) => x + z.touren, 0), tage: tage.length };
  return { tage, stellen, touren, summe };
}
