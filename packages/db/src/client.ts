import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Erzeugt einen Drizzle-Client für eine gegebene Verbindung.
 * Die Fach-App nutzt DATABASE_URL (Rolle tdd_app), die Wartungsplattform
 * OPS_DATABASE_URL (Rolle tdd_ops, ohne PII-Zugriff).
 */
export function createDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 10 });
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
export { schema };
