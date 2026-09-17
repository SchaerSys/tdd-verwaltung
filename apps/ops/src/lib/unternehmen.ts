import { asc, eq, sql } from "drizzle-orm";
import { tenants } from "@tdd/db";
import { db } from "./db";

export interface Mandant { id: string; name: string; slug: string; isActive: boolean; createdAt: Date; host: string | null }

/** Inbetriebnahme-Kennzahlen je Mandant aus v_support_unternehmen (055) – nur Zaehler. */
export interface MandantStatus {
  id: string; name: string; slug: string; host: string | null; is_active: boolean; created_at: Date;
  admins: number; benutzer: number; standorte: number; lager: number; personal: number; personen: number;
  organisationen: number; zeitregeln: boolean; letzter_login: Date | null;
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
  return r.map((m) => ({ ...m, admins: Number(m.admins), benutzer: Number(m.benutzer), standorte: Number(m.standorte), lager: Number(m.lager),
    personal: Number(m.personal), personen: Number(m.personen), organisationen: Number(m.organisationen) }));
}

export async function mandantLaden(id: string) {
  const d = await db();
  return (await d.select().from(tenants).where(eq(tenants.id, id)).limit(1))[0] ?? null;
}
