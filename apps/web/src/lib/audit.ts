import { headers } from "next/headers";
import { auditLogs } from "@tdd/db";
import { db } from "./db";

/** Client-IP aus dem Reverse-Proxy-Header (Caddy setzt X-Forwarded-For). */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null; // außerhalb eines Requests (z. B. Cron-Job)
  }
}

/** Schreibt einen Audit-Eintrag (append-only). */
export async function audit(entry: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}): Promise<void> {
  await db().insert(auditLogs).values({
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null),
    after: (entry.after ?? null),
    ip: entry.ip ?? (await clientIp()),
  });
}
