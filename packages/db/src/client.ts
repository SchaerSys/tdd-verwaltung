import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Erzeugt einen Drizzle-Client für eine gegebene Verbindung.
 * Die Fach-App nutzt DATABASE_URL (Rolle tdd_app), die Wartungsplattform
 * OPS_DATABASE_URL (Rolle tdd_ops, ohne PII-Zugriff).
 *
 * Mandant: Wird `tenantId` uebergeben, traegt jede Verbindung des Pools die GUC
 * app.current_tenant_id (Startparameter `options=-c ...`). Damit greifen die RLS-Policies
 * und der Spalten-Default von tenant_id auf jeder Query – auch ohne Transaktion.
 */
export function createDb(connectionString: string, tenantId?: string, max = 10) {
  const sql = postgres(connectionString, {
    max,
    ...(tenantId ? { connection: { options: `-c app.current_tenant_id=${tenantId}` } } : {}),
  });
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
export { schema };
