import { sql } from "drizzle-orm";
import { tenants, TENANT_VORARLBERG, runWithTenant } from "@tdd/db";
import { db } from "@/lib/db";
import { hostsAusUmgebung } from "@/lib/tenant-aufloesung";

export const dynamic = "force-dynamic";

/**
 * Caddy on_demand_tls "ask": Darf fuer diesen Host ein Zertifikat ausgestellt werden?
 * 200 = Host gehoert einem aktiven Mandanten (Stammdaten, 055) oder steht in TENANT_HOSTS,
 * 404 = nein. So bekommt ein neuer Mandant seinen Host ohne Caddy-Aenderung: Betreiber traegt
 * den Host in der Wartungsplattform ein, DNS zeigt auf den Server, das Zertifikat kommt beim
 * ersten Aufruf. Nur aus dem Docker-Netz erreichbar (Caddy fragt intern), gibt nichts preis.
 */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get("domain") ?? "").trim().toLowerCase();
  if (!domain || domain.length > 253 || !/^[a-z0-9.-]+$/.test(domain)) return new Response("nein", { status: 404 });
  if (hostsAusUmgebung()[domain]) return new Response("ok");
  // Zeile in tenants unabhaengig vom Mandanten-Kontext lesbar (keine RLS auf tenants)
  const rows = await runWithTenant(TENANT_VORARLBERG, () =>
    db().select({ id: tenants.id }).from(tenants).where(sql`lower(${tenants.host}) = ${domain} AND ${tenants.isActive}`).limit(1));
  return rows[0] ? new Response("ok", { headers: { "Cache-Control": "no-store" } }) : new Response("nein", { status: 404 });
}
