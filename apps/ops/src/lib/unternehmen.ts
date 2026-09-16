import { asc } from "drizzle-orm";
import { tenants } from "@tdd/db";
import { db } from "./db";

export interface Mandant { id: string; name: string; slug: string; isActive: boolean; createdAt: Date }

/** Alle Mandanten (Unternehmen) – die Tabelle tenants hat keine Zeilenfilter, tdd_ops sieht sie ganz. */
export async function mandantenListe(): Promise<Mandant[]> {
  const d = await db();
  return d.select({ id: tenants.id, name: tenants.name, slug: tenants.slug, isActive: tenants.isActive, createdAt: tenants.createdAt })
    .from(tenants).orderBy(asc(tenants.createdAt));
}
