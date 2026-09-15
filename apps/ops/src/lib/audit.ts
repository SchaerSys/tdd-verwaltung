import { headers } from "next/headers";
import { auditLogs } from "@tdd/db";
import { db } from "./db";

/**
 * Aktionen der Wartungsplattform landen im selben Audit-Log wie die Fach-App,
 * mit Praefix "ops." – der Akteur ist ein ops_users-Konto (kein users-Verweis),
 * deshalb steht sein Name im after-Feld.
 */
export async function audit(entry: { akteur: string; action: string; entityType: string; entityId?: string | null; after?: Record<string, unknown> }): Promise<void> {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
  } catch { /* ausserhalb eines Requests (Skript) */ }
  await db().insert(auditLogs).values({
    actorUserId: null, action: `ops.${entry.action}`, entityType: entry.entityType, entityId: entry.entityId ?? null,
    after: { ops: entry.akteur, ...(entry.after ?? {}) }, ip,
  });
}
