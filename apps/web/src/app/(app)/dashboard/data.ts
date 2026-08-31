import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export interface Kpi { persons: number; activeCards: number; dist30: number; exp30: number; exp60: number; debtorSum: number; }
export interface ExpRow { name: string; valid_to: string; card_number: string; days: number }
export interface ActRow { name: string; at: string; amount: string | null }
export interface DashboardData { kpi: Kpi; expiring: ExpRow[]; recent: ActRow[] }

function rows<T>(res: unknown): T[] { return res as T[]; }
function num(v: unknown): number { return Number(v ?? 0); }

/** Lädt alle Dashboard-Kennzahlen frisch aus der DB (keine Caches). */
export async function loadDashboard(): Promise<DashboardData | null> {
  try {
    const d = db();
    const k = rows<Record<string, unknown>>(await d.execute(sql`
      SELECT
        (SELECT count(DISTINCT c.person_id) FROM cards c JOIN persons p ON p.id = c.person_id
           WHERE c.status = 'AKTIV' AND c.valid_to >= current_date AND c.deleted_at IS NULL
             AND p.deleted_at IS NULL AND p.status = 'AKTIV') AS persons,
        (SELECT count(*) FROM cards WHERE status = 'AKTIV' AND valid_to >= current_date AND deleted_at IS NULL) AS active_cards,
        (SELECT count(*) FROM distributions WHERE distributed_at > now() - interval '30 days') AS dist30,
        (SELECT count(*) FROM cards WHERE status = 'AKTIV' AND valid_to BETWEEN current_date AND current_date + 30 AND deleted_at IS NULL) AS exp30,
        (SELECT count(*) FROM cards WHERE status = 'AKTIV' AND valid_to BETWEEN current_date AND current_date + 60 AND deleted_at IS NULL) AS exp60
    `))[0] ?? {};
    const kpi: Kpi = {
      persons: num(k.persons), activeCards: num(k.active_cards), dist30: num(k.dist30),
      exp30: num(k.exp30), exp60: num(k.exp60), debtorSum: 0,
    };
    const expiring = rows<ExpRow>(await d.execute(sql`
      SELECT (p.first_name || ' ' || p.last_name) AS name, to_char(c.valid_to, 'YYYY-MM-DD') AS valid_to,
             c.card_number, (c.valid_to - current_date) AS days
      FROM cards c JOIN persons p ON p.id = c.person_id
      WHERE c.status = 'AKTIV' AND c.valid_to BETWEEN current_date AND current_date + 30 AND c.deleted_at IS NULL
      ORDER BY c.valid_to ASC LIMIT 12`));
    const recent = rows<ActRow>(await d.execute(sql`
      SELECT (p.first_name || ' ' || p.last_name) AS name,
             to_char(d.distributed_at AT TIME ZONE 'Europe/Vienna', 'DD.MM.YYYY HH24:MI') AS at,
             d.amount_paid::text AS amount
      FROM distributions d JOIN persons p ON p.id = d.person_id
      ORDER BY d.distributed_at DESC LIMIT 8`));
    return { kpi, expiring, recent };
  } catch {
    return null;
  }
}
