import { asc, desc, eq, sql } from "drizzle-orm";
import { mailLog, tenantSmtp, tenants, users } from "@tdd/db";
import { db, dbFuer } from "./db";

export interface Mandant { id: string; name: string; slug: string; isActive: boolean; createdAt: Date; host: string | null }

/** Inbetriebnahme-Kennzahlen je Mandant aus v_support_unternehmen (055/057) – nur Zaehler. */
export interface MandantStatus {
  id: string; name: string; slug: string; host: string | null; is_active: boolean; created_at: Date;
  plan: string; test_bis: string | null; vertrag_ende: string | null; limit_benutzer: number | null; limit_standorte: number | null; aktiv_effektiv: boolean;
  admins: number; benutzer: number; standorte: number; lager: number; personal: number; personen: number;
  organisationen: number; zeitregeln: boolean; smtp: boolean; letzter_login: Date | null; mails_30: number; mails_fehler_30: number;
}

function rows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return (res as { rows?: T[] }).rows ?? [];
}

/** Alle Mandanten (Unternehmen) – die Tabelle tenants hat keine Zeilenfilter, tdd_ops sieht sie ganz. */
export async function mandantenListe(): Promise<Mandant[]> {
  const d = await db();
  return d.select({ id: tenants.id, name: tenants.name, slug: tenants.slug, isActive: tenants.isActive, createdAt: tenants.createdAt, host: tenants.host })
    .from(tenants).orderBy(asc(tenants.createdAt));
}

export async function mandantenStatus(): Promise<MandantStatus[]> {
  const r = rows<MandantStatus>(await (await db()).execute(sql`SELECT * FROM v_support_unternehmen ORDER BY created_at`));
  const n = (v: unknown) => Number(v);
  return r.map((m) => ({ ...m, admins: n(m.admins), benutzer: n(m.benutzer), standorte: n(m.standorte), lager: n(m.lager),
    personal: n(m.personal), personen: n(m.personen), organisationen: n(m.organisationen), mails_30: n(m.mails_30), mails_fehler_30: n(m.mails_fehler_30) }));
}

export async function mandantLaden(id: string) {
  return (await dbFuer(null).select().from(tenants).where(eq(tenants.id, id)).limit(1))[0] ?? null;
}

/** SMTP-Einstellungen ohne Passwortspalte (tdd_ops darf sie nicht lesen). */
export async function smtpLaden(id: string) {
  return (await dbFuer(null).select({
    host: tenantSmtp.host, port: tenantSmtp.port, sicherheit: tenantSmtp.sicherheit, benutzer: tenantSmtp.benutzer,
    absenderEmail: tenantSmtp.absenderEmail, absenderName: tenantSmtp.absenderName, antwortAn: tenantSmtp.antwortAn,
    aktualisiertAm: tenantSmtp.aktualisiertAm, aktualisiertVon: tenantSmtp.aktualisiertVon,
    letzterTestAm: tenantSmtp.letzterTestAm, letzterTestOk: tenantSmtp.letzterTestOk, letzterTestInfo: tenantSmtp.letzterTestInfo,
  }).from(tenantSmtp).where(eq(tenantSmtp.tenantId, id)).limit(1))[0] ?? null;
}

/** Konten des Mandanten (Metadaten). */
export async function benutzerDesMandanten(id: string) {
  return dbFuer(id).select({ id: users.id, email: users.email, name: users.displayName, role: users.role, isActive: users.isActive, lastLogin: users.lastLogin, totp: users.totpEnabled, lockedUntil: users.lockedUntil })
    .from(users).orderBy(asc(users.role), asc(users.email));
}

export interface MailEintrag { id: number; at: Date; empfaenger_domain: string | null; betreff: string | null; ausloeser: string | null; quelle: string; gesendet: boolean; fehler: string | null; ueber: string | null }
export async function mailProtokoll(id: string, limit = 100): Promise<{ eintraege: MailEintrag[]; gesendet30: number; fehler30: number }> {
  const d = dbFuer(id);
  const eintraege = await d.select({ id: mailLog.id, at: mailLog.at, empfaenger_domain: mailLog.empfaengerDomain, betreff: mailLog.betreff, ausloeser: mailLog.ausloeser, quelle: mailLog.quelle, gesendet: mailLog.gesendet, fehler: mailLog.fehler, ueber: mailLog.ueber })
    .from(mailLog).where(eq(mailLog.tenantId, id)).orderBy(desc(mailLog.at)).limit(limit);
  const agg = (await d.select({ g: sql<number>`count(*) filter (where gesendet)::int`, f: sql<number>`count(*) filter (where not gesendet)::int` })
    .from(mailLog).where(sql`${mailLog.tenantId} = ${id}::uuid AND ${mailLog.at} > now() - interval '30 days'`))[0];
  return { eintraege, gesendet30: agg?.g ?? 0, fehler30: agg?.f ?? 0 };
}

export interface SystemZahlen { persons_total: number; active_cards: number; distributions_30d: number; active_users: number }
export async function kennzahlenDesMandanten(id: string): Promise<SystemZahlen | null> {
  return rows<SystemZahlen>(await dbFuer(id).execute(sql`SELECT * FROM v_system_counts`))[0] ?? null;
}
