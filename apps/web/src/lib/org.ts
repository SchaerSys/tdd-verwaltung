import { sql } from "drizzle-orm";
import { db } from "./db";

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/**
 * Führt Portal-Queries im Kontext einer Organisation aus: setzt `app.org_id`
 * transaktionslokal, sodass die RLS-Policies auf `antraege`/`antrag_documents`
 * nur die Zeilen dieser Organisation sichtbar machen (strikte Mandantentrennung).
 */
export async function withOrg<T>(orgId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.org_id', ${String(orgId)}, true)`);
    return fn(tx);
  });
}
