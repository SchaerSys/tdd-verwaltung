import { and, desc, eq, gte } from "drizzle-orm";
import { staff, timeEvents } from "@tdd/db";
import { db } from "./db";
import { getCurrentUser, type CurrentUser } from "./auth";
import { hasPermission } from "./rbac";
import { statusFromLast, type EventKind, type Status } from "./zeit";

/** myTafelwerk: Login + verknuepfter Personal-Datensatz (Selbstservice am Handy). */
export interface MeinKontext { user: CurrentUser; person: typeof staff.$inferSelect | null }

export async function meinKontext(): Promise<MeinKontext | null> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "self:view")) return null;
  const person = (await db().select().from(staff).where(and(eq(staff.userId, user.id), eq(staff.isActive, true))).limit(1))[0] ?? null;
  return { user, person };
}

export interface StempelStand { status: Status; seit: Date | null; heute: { kind: EventKind; at: Date }[] }

/** Aktueller Stempelstatus und die heutigen Stempel (Wiener Tag). */
export async function stempelStand(staffId: string): Promise<StempelStand> {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const heute = await db().select({ kind: timeEvents.kind, at: timeEvents.at }).from(timeEvents)
    .where(and(eq(timeEvents.staffId, staffId), gte(timeEvents.at, start))).orderBy(desc(timeEvents.at));
  const letzter = heute[0] ?? (await db().select({ kind: timeEvents.kind, at: timeEvents.at }).from(timeEvents).where(eq(timeEvents.staffId, staffId)).orderBy(desc(timeEvents.at)).limit(1))[0];
  const status = statusFromLast((letzter?.kind ?? null) as EventKind | null);
  return { status, seit: letzter?.at ?? null, heute: heute.map((e) => ({ kind: e.kind as EventKind, at: e.at })).reverse() };
}
