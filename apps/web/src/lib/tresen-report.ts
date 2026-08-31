import { sql } from "drizzle-orm";
import { db } from "./db";

const TZ = "Europe/Vienna";

export interface DayStat {
  day: string;     // YYYY-MM-DD
  persons: number; // verschiedene Personen an dem Tag
  income: number;  // Einnahmen (Σ bezahlt)
  due: number;     // fällig (Σ fällig)
  ausstand: number; // Schulden/Ausstand des Tages (fällig − bezahlt)
}
export interface LocationBlock {
  locationId: number;
  name: string;
  days: DayStat[];
  totalPersons: number;  // Summe der Tages-Personenanzahl (Durchsatz)
  totalIncome: number;
  totalDue: number;
  totalAusstand: number;
  todayPersons: number;
  todayIncome: number;
}

function rows<T>(res: unknown): T[] { return res as T[]; }
function num(v: unknown): number { return Number(v ?? 0); }

/** Tägliche Ausgabe-Zahlen je Ausgabestelle im Zeitraum [from, to] (inkl.). */
export async function loadTresenReport(from: string, to: string): Promise<LocationBlock[]> {
  const d = db();

  const locs = rows<{ id: number; name: string }>(await d.execute(sql`
    SELECT id, name FROM locations WHERE type = 'AUSGABESTELLE' ORDER BY name`));

  const stats = rows<{ locationId: number; day: string; persons: unknown; income: unknown; due: unknown }>(await d.execute(sql`
    SELECT di.location_id AS "locationId",
      to_char((di.distributed_at AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day,
      count(DISTINCT di.person_id) AS persons,
      COALESCE(SUM(di.amount_paid), 0) AS income,
      COALESCE(SUM(di.amount_due), 0) AS due
    FROM distributions di
    WHERE (di.distributed_at AT TIME ZONE ${TZ})::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY di.location_id, 2
    ORDER BY 2 DESC`));

  const today = new Date(new Date().toLocaleString("en-US", { timeZone: TZ })).toISOString().slice(0, 10);

  return locs.map((l) => {
    const days: DayStat[] = stats
      .filter((s) => s.locationId === l.id)
      .map((s) => {
        const income = num(s.income), due = num(s.due);
        return { day: s.day, persons: num(s.persons), income, due, ausstand: Math.round((due - income) * 100) / 100 };
      });
    const totalPersons = days.reduce((a, b) => a + b.persons, 0);
    const totalIncome = Math.round(days.reduce((a, b) => a + b.income, 0) * 100) / 100;
    const totalDue = Math.round(days.reduce((a, b) => a + b.due, 0) * 100) / 100;
    const t = days.find((x) => x.day === today);
    return {
      locationId: l.id, name: l.name, days,
      totalPersons, totalIncome, totalDue,
      totalAusstand: Math.round((totalDue - totalIncome) * 100) / 100,
      todayPersons: t?.persons ?? 0, todayIncome: t?.income ?? 0,
    };
  });
}
