import { cookies, headers } from "next/headers";
import { currentTenantId, defaultTenantId, istTenantId, runWithTenant, tenantKontextGesetzt } from "@tdd/db";
import { verifySession, SESSION_COOKIE } from "./session";
import { GERAET_COOKIE } from "./geraet";
import { STATION_COOKIE } from "./station";

/**
 * Mandant eines Requests (Stufe B des Mandanten-Kontexts):
 *  1. verifizierte Session (tenantId im Payload),
 *  2. Geraete-Cookie (Fahrzeug-Tablet/Ausgabestation, Prefix "<tenant>:<token>"),
 *  3. Header x-tenant-id aus der Middleware (Hostname-Zuordnung),
 *  4. Standard-Mandant.
 */
export async function tenantAusRequest(): Promise<string> {
  try {
    const store = await cookies();
    const s = verifySession(store.get(SESSION_COOKIE)?.value);
    if (s?.tenantId && istTenantId(s.tenantId)) return s.tenantId.toLowerCase();
    for (const name of [GERAET_COOKIE, STATION_COOKIE]) {
      const v = store.get(name)?.value;
      const t = v?.includes(":") ? v.split(":")[0] : null;
      if (t && istTenantId(t)) return t.toLowerCase();
    }
    const h = (await headers()).get("x-tenant-id");
    if (h && istTenantId(h)) return h.toLowerCase();
  } catch { /* ausserhalb eines Requests */ }
  return defaultTenantId();
}

/** Route-Handler/Server-Action im Mandanten des Requests ausfuehren (falls noch kein Kontext gesetzt ist). */
export async function mitMandant<T>(fn: () => Promise<T>): Promise<T> {
  if (tenantKontextGesetzt()) return fn();
  const t = await tenantAusRequest();
  return t === currentTenantId() ? fn() : runWithTenant(t, fn);
}
