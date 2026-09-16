import { createDb, currentTenantId, type Database } from "@tdd/db";

const pools = new Map<string, Database>();

/**
 * DB-Client der Fach-App (Rolle tdd_app via DATABASE_URL) – **je Mandant ein Pool**.
 * Jede Verbindung eines Pools traegt die GUC app.current_tenant_id; damit greifen die
 * RLS-Policies (053) und der Spalten-Default von tenant_id auf jeder Query, auch ohne
 * Transaktion. Welcher Pool: der Mandant des aktuellen Ablaufs (runWithTenant), sonst der
 * Standard-Mandant (DEFAULT_TENANT_ID / Vorarlberg).
 */
export function db(): Database {
  const tenant = currentTenantId();
  let d = pools.get(tenant);
  if (!d) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL fehlt");
    d = createDb(url, tenant);
    pools.set(tenant, d);
  }
  return d;
}
