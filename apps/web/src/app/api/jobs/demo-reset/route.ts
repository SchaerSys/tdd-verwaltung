import { eq } from "drizzle-orm";
import { tenants, runWithTenant, TENANT_VORARLBERG } from "@tdd/db";
import { db } from "@/lib/db";
import { requireJobToken } from "@/lib/job-auth";
import { demoSeed } from "@/lib/demo-seed";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Demo-Mandant zuruecksetzen (Auftrag 17.09.2026): loescht die Fachdaten des Mandanten
 * "demo" und baut den fiktiven Datenbestand neu auf. Tokengeschuetzt (JOB_TOKEN); die
 * Wartungsplattform ruft den Endpunkt ueber das Docker-Netz auf. Wirkt ausschliesslich
 * im Mandanten mit Kurzname "demo" (Pruefung in demoSeed + RLS des Pools).
 */
export async function POST(req: Request) {
  const denied = requireJobToken(req);
  if (denied) return denied;
  const demo = (await runWithTenant(TENANT_VORARLBERG, () => db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo")).limit(1)))[0];
  if (!demo) return Response.json({ ok: false, error: "Kein Mandant mit Kurzname 'demo'" }, { status: 404 });
  try {
    const ergebnis = await runWithTenant(demo.id, () => demoSeed());
    return Response.json({ ok: true, ...ergebnis });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
