import { cookies, headers } from "next/headers";
import { auditLogs } from "@tdd/db";
import { db } from "./db";
import { verifySession, SESSION_COOKIE } from "./session";

/** Handelnde Person hinter einem technischen Konto (Ausgabestation) aus der Session. */
async function sessionStaffId(): Promise<string | null> {
  try {
    const store = await cookies();
    return verifySession(store.get(SESSION_COOKIE)?.value)?.az?.st ?? null;
  } catch {
    return null;
  }
}

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
  staffId?: string | null;
}): Promise<void> {
  await db().insert(auditLogs).values({
    staffId: entry.staffId ?? (await sessionStaffId()),
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null),
    after: (entry.after ?? null),
    ip: entry.ip ?? (await clientIp()),
  });
}
