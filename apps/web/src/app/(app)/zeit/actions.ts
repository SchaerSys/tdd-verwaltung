"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { staff, timeEvents } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { statusFromLast, allowedActions, viennaLocalToUtc, type EventKind, type Status } from "@/lib/zeit";

const KINDS: EventKind[] = ["IN", "OUT", "BREAK_START", "BREAK_END"];

async function guard() {
  const u = await getCurrentUser();
  if (!u || !hasPermission(u.role, "staff:manage")) throw new Error("Keine Berechtigung");
  return u;
}

async function currentStatus(staffId: string): Promise<Status> {
  const last = await db().select({ kind: timeEvents.kind }).from(timeEvents)
    .where(eq(timeEvents.staffId, staffId)).orderBy(desc(timeEvents.at)).limit(1);
  return statusFromLast((last[0]?.kind ?? null) as EventKind | null);
}

export interface StaffState { id: string; name: string; status: Status }

/** Terminal: Mitarbeiter:in per NFC-Karten-ID oder per ID auflösen (inkl. Status). */
export async function lookupStaff(value: string, byCard: boolean): Promise<StaffState | null> {
  await guard();
  const v = value.trim();
  if (!v) return null;
  const rows = await db().select({ id: staff.id, first: staff.firstName, last: staff.lastName, active: staff.isActive })
    .from(staff).where(byCard ? eq(staff.nfcCardId, v) : eq(staff.id, v)).limit(1);
  const s = rows[0];
  if (!s || !s.active) return null;
  return { id: s.id, name: `${s.first} ${s.last}`, status: await currentStatus(s.id) };
}

/** Terminal: Stempelvorgang. Prüft, ob die Aktion im aktuellen Status erlaubt ist. */
export async function stamp(staffId: string, kind: EventKind, viaCard = false): Promise<{ ok: boolean; status: Status; error?: string }> {
  const u = await guard();
  const status = await currentStatus(staffId);
  if (!KINDS.includes(kind) || !allowedActions(status).includes(kind)) {
    return { ok: false, status, error: "Aktion im aktuellen Status nicht möglich." };
  }
  await db().insert(timeEvents).values({ staffId, kind, source: viaCard ? "TERMINAL_NFC" : "TERMINAL_MANUAL", createdBy: u.id });
  await audit({ actorUserId: u.id, action: "time.stamp", entityType: "staff", entityId: staffId, after: { kind, viaCard } });
  return { ok: true, status: await currentStatus(staffId) };
}

/** Backoffice: manuelle Nacherfassung/Korrektur eines Stempels (Wiener Zeit). */
export async function addCorrection(formData: FormData): Promise<void> {
  const u = await guard();
  const staffId = String(formData.get("staffId") ?? "");
  const kind = String(formData.get("kind") ?? "") as EventKind;
  const at = String(formData.get("at") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!staffId || !KINDS.includes(kind) || !at) { revalidatePath("/zeit"); return; }
  await db().insert(timeEvents).values({
    staffId, kind, at: viennaLocalToUtc(at), source: "KORREKTUR", edited: true, note, createdBy: u.id,
  });
  await audit({ actorUserId: u.id, action: "time.correction", entityType: "staff", entityId: staffId, after: { kind, at, note } });
  revalidatePath("/zeit");
}

/** Backoffice: einzelnes Stempel-Ereignis löschen (Korrektur). */
export async function deleteEvent(formData: FormData): Promise<void> {
  const u = await guard();
  const id = String(formData.get("eventId") ?? "");
  if (!id) { revalidatePath("/zeit"); return; }
  await db().delete(timeEvents).where(eq(timeEvents.id, id));
  await audit({ actorUserId: u.id, action: "time.delete", entityType: "time_event", entityId: id });
  revalidatePath("/zeit");
}
