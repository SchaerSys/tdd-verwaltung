import { connect as tlsConnect } from "node:tls";
import { sql } from "drizzle-orm";
import { db } from "./db";

function rows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[];
}

export interface DbStatus {
  version: string; gestartet: Date; groesseMb: number; verbindungen: number; maxVerbindungen: number;
  tabellen: { name: string; zeilen: number; mb: number }[];
}

/** Datenbank-Metadaten: Groesse, Version, Laufzeit, Tabellen – keine Inhalte. */
export async function dbStatus(): Promise<DbStatus> {
  const d = db();
  const kopf = rows<{ version: string; gestartet: Date; groesse: string; verbindungen: string; max: string }>(await d.execute(sql`
    SELECT version() AS version, pg_postmaster_start_time() AS gestartet,
           pg_database_size(current_database()) AS groesse,
           (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS verbindungen,
           current_setting('max_connections') AS max`))[0]!;
  const tab = rows<{ name: string; zeilen: string; bytes: string }>(await d.execute(sql`
    SELECT relname AS name, n_live_tup AS zeilen, pg_total_relation_size(relid) AS bytes
    FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`));
  return {
    version: kopf.version.split(" on ")[0] ?? kopf.version,
    gestartet: kopf.gestartet instanceof Date ? kopf.gestartet : new Date(String(kopf.gestartet)),
    groesseMb: Math.round((Number(kopf.groesse) / 1024 ** 2) * 10) / 10,
    verbindungen: Number(kopf.verbindungen), maxVerbindungen: Number(kopf.max),
    tabellen: tab.map((t) => ({ name: t.name, zeilen: Number(t.zeilen), mb: Math.round((Number(t.bytes) / 1024 ** 2) * 100) / 100 })),
  };
}

export interface WebStatus { erreichbar: boolean; ok: boolean; version: string | null; dbMs: number | null; fehler?: string }

/** Health-Endpunkt der Fach-App im Docker-Netz. */
export async function webStatus(): Promise<WebStatus> {
  const url = process.env.WEB_HEALTH_URL ?? "http://web:3000/api/health";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    const j = (await r.json()) as { ok?: boolean; version?: string; ms?: number };
    return { erreichbar: true, ok: !!j.ok, version: j.version ?? null, dbMs: j.ms ?? null };
  } catch (e) {
    return { erreichbar: false, ok: false, version: null, dbMs: null, fehler: e instanceof Error ? e.message : "Fehler" };
  }
}

export interface ZertStatus { host: string; gueltigBis: Date | null; tage: number | null; fehler?: string }

/** Ablaufdatum des TLS-Zertifikats (Caddy erneuert selbst; hier nur die Kontrolle). */
export function zertStatus(host: string): Promise<ZertStatus> {
  return new Promise((resolve) => {
    const s = tlsConnect({ host, port: 443, servername: host, timeout: 4000 }, () => {
      const c = s.getPeerCertificate();
      s.end();
      const bis = c.valid_to ? new Date(c.valid_to) : null;
      resolve({ host, gueltigBis: bis, tage: bis ? Math.floor((bis.getTime() - Date.now()) / 864e5) : null });
    });
    s.on("error", (e) => resolve({ host, gueltigBis: null, tage: null, fehler: e.message }));
    s.on("timeout", () => { s.destroy(); resolve({ host, gueltigBis: null, tage: null, fehler: "Zeitüberschreitung" }); });
  });
}

export interface Kennzahlen {
  system: { persons_total: number; active_cards: number; distributions_30d: number; active_users: number };
  standorte: { location_id: number; name: string; type: string; persons: number; active_cards: number; distributions_30d: number; is_active: boolean }[];
  ausgabenTage: { day: string; n: number }[];
  antraegeMonate: { monat: string; org_type: string; n: number }[];
  organisationen: { type: string; n: number; aktiv: number }[];
}

/** Nur Aggregat-Views (002/008) – die Rolle kann gar nichts anderes lesen. */
export async function kennzahlen(): Promise<Kennzahlen> {
  const d = db();
  const system = rows<Kennzahlen["system"]>(await d.execute(sql`SELECT * FROM v_system_counts`))[0]!;
  const standorte = rows<Kennzahlen["standorte"][number]>(await d.execute(sql`
    SELECT s.location_id, s.location_name AS name, s.location_type AS type, s.active_persons AS persons, s.active_cards,
           coalesce((SELECT sum(n) FROM v_distributions_daily d WHERE d.location_id = s.location_id AND d.day >= current_date - 30), 0)::int AS distributions_30d,
           l.is_active
    FROM v_stats_by_location s JOIN locations l ON l.id = s.location_id ORDER BY s.location_type, s.location_name`));
  const ausgabenTage = rows<{ day: string; n: number }>(await d.execute(sql`
    SELECT day::text AS day, sum(n)::int AS n FROM v_distributions_daily
    WHERE day >= current_date - 30 GROUP BY day ORDER BY day`));
  const antraegeMonate = rows<{ monat: string; org_type: string; n: number }>(await d.execute(sql`
    SELECT monat, org_type, sum(n)::int AS n FROM v_antraege_by_origin_month GROUP BY monat, org_type ORDER BY monat DESC LIMIT 24`));
  const organisationen = rows<{ type: string; n: number; aktiv: number }>(await d.execute(sql`
    SELECT type, count(*)::int AS n, count(*) FILTER (WHERE is_active)::int AS aktiv FROM organizations GROUP BY type ORDER BY type`));
  const num = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v])) as T;
  return { system: num(system), standorte: standorte.map(num), ausgabenTage: ausgabenTage.map(num), antraegeMonate: antraegeMonate.map(num), organisationen: organisationen.map(num) };
}
