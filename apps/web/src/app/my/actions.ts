"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { aufgaben, pushAbos, staff, timeEvents } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { allowedActions, statusFromLast, type EventKind, type Status } from "@/lib/zeit";

const KINDS: EventKind[] = ["IN", "OUT", "BREAK_START", "BREAK_END"];

async function eigenePerson() {
  const u = await requirePermission("self:view");
  const p = (await db().select({ id: staff.id, ende: staff.employmentEnd }).from(staff).where(and(eq(staff.userId, u.id), eq(staff.isActive, true))).limit(1))[0];
  if (!p) throw new Error("Kein Personal-Datensatz mit diesem Login verknüpft.");
  if (p.ende && p.ende < new Date().toISOString().slice(0, 10)) throw new Error("Dienstverhältnis beendet.");
  return { u, staffId: p.id };
}

/** Stempeln aus der App: derselbe Zustandsautomat wie am Terminal, Quelle APP, Person = eigener Datensatz. */
export async function selbstStempeln(kind: EventKind): Promise<{ ok: boolean; status: Status; error?: string }> {
  const { u, staffId } = await eigenePerson();
  const last = await db().select({ kind: timeEvents.kind }).from(timeEvents).where(eq(timeEvents.staffId, staffId)).orderBy(desc(timeEvents.at)).limit(1);
  const status = statusFromLast((last[0]?.kind ?? null) as EventKind | null);
  if (!KINDS.includes(kind) || !allowedActions(status).includes(kind)) return { ok: false, status, error: "Im aktuellen Zustand nicht möglich." };
  await db().insert(timeEvents).values({ staffId, kind, source: "APP", createdBy: u.id });
  await audit({ actorUserId: u.id, action: "time.stamp", entityType: "staff", entityId: staffId, after: { kind, quelle: "APP" } });
  for (const p of ["/my", "/my/stempeln", "/my/zeiten", "/mein", "/zeit"]) revalidatePath(p);
  const neu = await db().select({ kind: timeEvents.kind }).from(timeEvents).where(eq(timeEvents.staffId, staffId)).orderBy(desc(timeEvents.at)).limit(1);
  return { ok: true, status: statusFromLast((neu[0]?.kind ?? null) as EventKind | null) };
}

/** Aufgabe erledigen (eigene oder "fuer alle"). */
export async function aufgabeErledigen(fd: FormData): Promise<void> {
  const { u, staffId } = await eigenePerson();
  const id = String(fd.get("id") ?? "");
  const r = await db().update(aufgaben).set({ erledigtAm: new Date(), erledigtVon: staffId })
    .where(and(eq(aufgaben.id, id), isNull(aufgaben.erledigtAm), or(eq(aufgaben.staffId, staffId), isNull(aufgaben.staffId)))).returning({ id: aufgaben.id });
  if (r[0]) await audit({ actorUserId: u.id, action: "aufgabe.erledigt", entityType: "aufgabe", entityId: id });
  revalidatePath("/my"); revalidatePath("/my/aufgaben"); revalidatePath("/personal/aufgaben");
}

/** Push-Abo speichern / entfernen (Endpunkt je Geraet). */
export async function pushAbonnieren(abo: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string): Promise<{ ok: boolean }> {
  const { staffId } = await eigenePerson();
  if (!abo.endpoint.startsWith("https://") || !abo.keys?.p256dh || !abo.keys?.auth) return { ok: false };
  await db().insert(pushAbos).values({ staffId, endpoint: abo.endpoint, p256dh: abo.keys.p256dh, auth: abo.keys.auth, userAgent: userAgent.slice(0, 200) })
    .onConflictDoUpdate({ target: pushAbos.endpoint, set: { staffId, p256dh: abo.keys.p256dh, auth: abo.keys.auth, fehler: 0 } });
  return { ok: true };
}

export async function pushAbbestellen(endpoint: string): Promise<void> {
  const { staffId } = await eigenePerson();
  await db().delete(pushAbos).where(and(eq(pushAbos.endpoint, endpoint), eq(pushAbos.staffId, staffId)));
}
