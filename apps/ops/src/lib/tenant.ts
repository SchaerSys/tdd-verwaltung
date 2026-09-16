import { cookies } from "next/headers";
import { istTenantId, TENANT_VORARLBERG } from "@tdd/db";

/**
 * Gewaehlter Mandant (Unternehmen) der Wartungsplattform – Cookie ops_tenant.
 * "" = alle Mandanten (nur fuer die Mandanten-Uebersicht sinnvoll); Standard Vorarlberg.
 * Der Wert steuert den DB-Pool (GUC): tdd_ops sieht mit Kontext nur diesen Mandanten,
 * ohne Kontext alle (Policy tenant_ops, 053).
 */
import { ALLE, OPS_TENANT_COOKIE } from "./tenant-const";
export { ALLE, OPS_TENANT_COOKIE };

export async function gewaehlterMandant(): Promise<string | null> {
  try {
    const v = (await cookies()).get(OPS_TENANT_COOKIE)?.value;
    if (v === ALLE) return null;
    return v && istTenantId(v) ? v.toLowerCase() : TENANT_VORARLBERG;
  } catch { return TENANT_VORARLBERG; }
}

export async function mandantWaehlen(v: string): Promise<void> {
  const store = await cookies();
  store.set(OPS_TENANT_COOKIE, v === ALLE ? ALLE : istTenantId(v) ? v.toLowerCase() : TENANT_VORARLBERG, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
}
