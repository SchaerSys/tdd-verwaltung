import { sql } from "drizzle-orm";
import { db } from "./db";

export interface LocationStat { location_name: string; location_type: string; active_persons: number; active_cards: number }
export interface DistByLocation { name: string; type: string; d30: number; total: number }
export interface MonthPoint { monat: string; n: number }
export interface DuplicateStat { create_new: number; merged: number; linked: number }
export interface CardExpiry { d30: number; d60: number; d90: number }
export interface OriginStat { org_name: string; org_type: string; n: number }
export interface AntragMonth { month: string; gemeinde: number; institution: number }

export interface Reports {
  byLocation: LocationStat[];
  distByLocation: DistByLocation[];
  distMonthly: MonthPoint[];
  newPersonsMonthly: MonthPoint[];
  duplicates: DuplicateStat;
  cardExpiry: CardExpiry;
  byOrigin: OriginStat[];
  antragMonthly: AntragMonth[];
}

function rows<T>(res: unknown): T[] { return res as T[]; }
function num(v: unknown): number { return Number(v ?? 0); }

export async function loadReports(): Promise<Reports> {
  const d = db();

  const byLocation = rows<LocationStat>(await d.execute(sql`
    SELECT location_name, location_type, active_persons, active_cards
    FROM v_stats_by_location ORDER BY location_type, location_name`))
    .map((r) => ({ ...r, active_persons: num(r.active_persons), active_cards: num(r.active_cards) }));

  const distByLocation = rows<DistByLocation>(await d.execute(sql`
    SELECT l.name, l.type,
      count(dd.*) FILTER (WHERE dd.distributed_at > now() - interval '30 days') AS d30,
      count(dd.*) AS total
    FROM locations l LEFT JOIN distributions dd ON dd.location_id = l.id
    GROUP BY l.id, l.name, l.type ORDER BY l.type, l.name`))
    .map((r) => ({ name: r.name, type: r.type, d30: num(r.d30), total: num(r.total) }));

  const distMonthly = rows<MonthPoint>(await d.execute(sql`
    SELECT to_char(date_trunc('month', distributed_at), 'YYYY-MM') AS monat, count(*) AS n
    FROM distributions WHERE distributed_at > now() - interval '12 months'
    GROUP BY 1 ORDER BY 1`)).map((r) => ({ monat: r.monat, n: num(r.n) }));

  const newPersonsMonthly = rows<MonthPoint>(await d.execute(sql`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS monat, count(*) AS n
    FROM persons WHERE deleted_at IS NULL AND created_at > now() - interval '12 months'
    GROUP BY 1 ORDER BY 1`)).map((r) => ({ monat: r.monat, n: num(r.n) }));

  const dup = rows<{ decision: string; n: unknown }>(await d.execute(sql`
    SELECT decision, count(*) AS n FROM duplicate_decisions GROUP BY decision`));
  const duplicates: DuplicateStat = {
    create_new: num(dup.find((r) => r.decision === "CREATE_NEW")?.n),
    merged: num(dup.find((r) => r.decision === "MERGED")?.n),
    linked: num(dup.find((r) => r.decision === "LINKED_EXISTING")?.n),
  };

  const exp = rows<CardExpiry>(await d.execute(sql`
    SELECT
      count(*) FILTER (WHERE valid_to BETWEEN current_date AND current_date + 30) AS d30,
      count(*) FILTER (WHERE valid_to BETWEEN current_date AND current_date + 60) AS d60,
      count(*) FILTER (WHERE valid_to BETWEEN current_date AND current_date + 90) AS d90
    FROM cards WHERE status = 'AKTIV'`));
  const cardExpiry: CardExpiry = { d30: num(exp[0]?.d30), d60: num(exp[0]?.d60), d90: num(exp[0]?.d90) };

  const byOrigin = rows<OriginStat>(await d.execute(sql`
    SELECT o.name AS org_name, o.type AS org_type, count(p.*) AS n
    FROM persons p JOIN organizations o ON o.id = p.source_organization_id
    WHERE p.deleted_at IS NULL
    GROUP BY o.name, o.type ORDER BY n DESC, o.name`))
    .map((r) => ({ org_name: r.org_name, org_type: r.org_type, n: num(r.n) }));

  const am = rows<{ monat: string; org_type: string; n: unknown }>(await d.execute(sql`
    SELECT monat, org_type, sum(n)::int AS n FROM v_antraege_by_origin_month GROUP BY monat, org_type ORDER BY monat`));
  const amMap = new Map<string, AntragMonth>();
  for (const r of am) {
    const m = amMap.get(r.monat) ?? { month: r.monat, gemeinde: 0, institution: 0 };
    if (r.org_type === "GEMEINDE") m.gemeinde += num(r.n);
    else if (r.org_type === "INSTITUTION") m.institution += num(r.n);
    amMap.set(r.monat, m);
  }
  const antragMonthly = [...amMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  return { byLocation, distByLocation, distMonthly, newPersonsMonthly, duplicates, cardExpiry, byOrigin, antragMonthly };
}
