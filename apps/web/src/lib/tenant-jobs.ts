import { eq } from "drizzle-orm";
import { tenants, runWithTenant } from "@tdd/db";
import { db } from "./db";

/**
 * Hintergrundjobs laufen ohne Session: je aktivem Mandanten einmal im passenden Kontext
 * (eigener Pool mit GUC), Ergebnisse je Mandant zurueck. Die Liste der Mandanten liest der
 * Standard-Pool (tenants hat keine RLS, tdd_app darf lesen).
 */
export async function fuerAlleMandanten<T>(fn: (tenantId: string) => Promise<T>): Promise<Record<string, T>> {
  const liste = await db().select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(eq(tenants.isActive, true));
  const out: Record<string, T> = {};
  for (const t of liste) out[t.slug] = await runWithTenant(t.id, () => fn(t.id));
  return out;
}
