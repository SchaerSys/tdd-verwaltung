import { sql } from "drizzle-orm";
import { db } from "./db";

function rows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[];
}
const dt = (v: unknown): Date | null => (v ? (v instanceof Date ? v : new Date(String(v))) : null);

export interface Mandant {
  id: number; name: string; type: string; is_active: boolean; konten: number; konten_aktiv: number;
  letzter_login: Date | null; zuletzt_gesehen: Date | null; fehler_24h: number; fehler_7d: number;
  antraege: number; antraege_offen: number; letzter_antrag: Date | null; rueckfragen_offen: number;
}

export async function ladeMandanten(): Promise<Mandant[]> {
  const r = rows<Mandant>(await (await db()).execute(sql`SELECT * FROM v_support_mandanten ORDER BY type, name`));
  return r.map((m) => ({ ...m, letzter_login: dt(m.letzter_login), zuletzt_gesehen: dt(m.zuletzt_gesehen), letzter_antrag: dt(m.letzter_antrag),
    konten: Number(m.konten), konten_aktiv: Number(m.konten_aktiv), fehler_24h: Number(m.fehler_24h), fehler_7d: Number(m.fehler_7d),
    antraege: Number(m.antraege), antraege_offen: Number(m.antraege_offen), rueckfragen_offen: Number(m.rueckfragen_offen) }));
}

export interface SupportBenutzer {
  id: string; email: string; display_name: string; role: string; is_active: boolean; totp_enabled: boolean;
  last_login: Date | null; locked_until: Date | null; failed_attempts: number;
  standort: string | null; organisation: string | null; organisation_typ: string | null;
  zuletzt_gesehen: Date | null; zuletzt_route: string | null; version: string | null; online: boolean | null;
  warteschlange: number | null; browser: string | null; fehler_24h: number; letzter_fehler: Date | null;
}

export async function ladeBenutzer(where: { orgId?: number; nurTdd?: boolean; id?: string } = {}): Promise<SupportBenutzer[]> {
  const bedingung = where.id ? sql`WHERE b.id = ${where.id}::uuid`
    : where.orgId ? sql`WHERE b.id IN (SELECT id FROM users WHERE organization_id = ${where.orgId})`
    : where.nurTdd ? sql`WHERE b.role <> 'SACHBEARBEITER'` : sql``;
  const r = rows<SupportBenutzer>(await (await db()).execute(sql`SELECT b.* FROM v_support_benutzer b ${bedingung} ORDER BY b.zuletzt_gesehen DESC NULLS LAST, b.display_name`));
  return r.map((b) => ({ ...b, last_login: dt(b.last_login), locked_until: dt(b.locked_until), zuletzt_gesehen: dt(b.zuletzt_gesehen),
    letzter_fehler: dt(b.letzter_fehler), fehler_24h: Number(b.fehler_24h), failed_attempts: Number(b.failed_attempts),
    warteschlange: b.warteschlange == null ? null : Number(b.warteschlange) }));
}

export interface Ereignis { id: number; at: Date; kind: string; user_id: string | null; role: string | null; route: string | null; message: string | null; digest: string | null; detail: Record<string, unknown> }

export async function ladeEreignisse(where: { userId?: string; orgId?: number; nurFehler?: boolean; digest?: string }, limit = 100): Promise<Ereignis[]> {
  const teile = [sql`true`];
  if (where.userId) teile.push(sql`user_id = ${where.userId}::uuid`);
  if (where.orgId) teile.push(sql`organization_id = ${where.orgId}`);
  if (where.nurFehler) teile.push(sql`kind = 'FEHLER'`);
  if (where.digest) teile.push(sql`digest = ${where.digest}`);
  const r = rows<Ereignis>(await (await db()).execute(sql`SELECT id, at, kind, user_id, role, route, message, digest, detail FROM app_events WHERE ${sql.join(teile, sql` AND `)} ORDER BY at DESC LIMIT ${limit}`));
  return r.map((e) => ({ ...e, at: dt(e.at)!, detail: e.detail ?? {} }));
}

export interface Aktion { at: Date; action: string; entity_type: string }

export async function ladeAktionen(userId: string, limit = 60): Promise<Aktion[]> {
  const r = rows<Aktion>(await (await db()).execute(sql`SELECT at, action, entity_type FROM v_support_aktionen WHERE user_id = ${userId}::uuid ORDER BY at DESC LIMIT ${limit}`));
  return r.map((a) => ({ ...a, at: dt(a.at)! }));
}

/** Fehler der letzten 24 h ueber alle Mandanten, gruppiert nach Kennung/Meldung. */
export async function fehlerUebersicht(): Promise<{ digest: string | null; message: string | null; route: string | null; n: number; zuletzt: Date; betroffene: number }[]> {
  const r = rows<{ digest: string | null; message: string | null; route: string | null; n: number; zuletzt: Date; betroffene: number }>(await (await db()).execute(sql`
    SELECT digest, min(message) AS message, min(route) AS route, count(*)::int AS n, max(at) AS zuletzt, count(DISTINCT user_id)::int AS betroffene
    FROM app_events WHERE kind = 'FEHLER' AND at > now() - interval '24 hours'
    GROUP BY digest, coalesce(digest, message) ORDER BY max(at) DESC LIMIT 50`));
  return r.map((x) => ({ ...x, n: Number(x.n), betroffene: Number(x.betroffene), zuletzt: dt(x.zuletzt)! }));
}
