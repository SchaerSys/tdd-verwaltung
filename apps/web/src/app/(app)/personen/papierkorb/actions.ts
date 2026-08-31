"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { persons } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function guardWrite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) throw new Error("Keine Berechtigung");
  return user;
}
async function guardAdmin() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) throw new Error("Keine Berechtigung");
  return user;
}

/** Holt eine Person aus dem Archiv zurück (inkl. ihrer archivierten Karten). */
export async function restorePerson(formData: FormData): Promise<void> {
  const user = await guardWrite();
  const id = String(formData.get("personId") ?? "");
  if (!id) { revalidatePath("/personen/papierkorb"); return; }

  await db().update(persons).set({
    deletedAt: null, deleteReason: null, retentionUntil: null,
    status: "AKTIV", updatedBy: user.id, updatedAt: new Date(),
  }).where(eq(persons.id, id));
  // Karten, die wegen der Archivierung in den Papierkorb kamen, wiederherstellen.
  await db().execute(sql`
    UPDATE cards SET deleted_at = NULL, trash_reason = NULL, updated_at = now()
    WHERE person_id = ${id} AND trash_reason = 'Person archiviert'`);
  // Jüngste Standort-Zuordnung wieder aktiv setzen (nur eine, wegen Unique-Index).
  await db().execute(sql`
    UPDATE person_location_assignments SET is_active = true
    WHERE id = (SELECT id FROM person_location_assignments WHERE person_id = ${id} ORDER BY created_at DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM person_location_assignments WHERE person_id = ${id} AND is_active)`);

  await audit({ actorUserId: user.id, action: "person.restore", entityType: "person", entityId: id });
  revalidatePath("/personen/papierkorb");
  revalidatePath("/personen");
}

/** Löscht eine einzelne archivierte Person endgültig – nur nach Ablauf der Aufbewahrungsfrist. */
export async function hardDeletePerson(formData: FormData): Promise<void> {
  const user = await guardAdmin();
  const id = String(formData.get("personId") ?? "");
  if (!id) { revalidatePath("/personen/papierkorb"); return; }

  const chk = await db().execute(sql`
    SELECT (deleted_at IS NOT NULL) AS archived,
           (retention_until IS NULL OR retention_until <= current_date) AS retention_ok
    FROM persons WHERE id = ${id}`);
  const row = (chk as unknown as { archived: boolean; retention_ok: boolean }[])[0];
  if (!row || !row.archived || !row.retention_ok) { revalidatePath("/personen/papierkorb"); return; } // Aufbewahrungsfrist schützt

  await purgePersons(sql`= ${id}`);
  await audit({ actorUserId: user.id, action: "person.harddelete", entityType: "person", entityId: id });
  revalidatePath("/personen/papierkorb");
}

/** Leert das Archiv endgültig – aber nur Personen, deren Aufbewahrungsfrist abgelaufen ist. */
export async function emptyArchive(): Promise<void> {
  const user = await guardAdmin();
  const res = await purgePersons(sql`IN (SELECT id FROM persons WHERE deleted_at IS NOT NULL AND (retention_until IS NULL OR retention_until <= current_date))`);
  await audit({ actorUserId: user.id, action: "person.archive.empty", entityType: "person", after: { deleted: res } });
  revalidatePath("/personen/papierkorb");
}

/**
 * Entfernt Personen (Selektor auf persons.id) samt aller referenzierenden Daten
 * in Abhängigkeitsreihenfolge, in einer Transaktion. Gibt die Anzahl gelöschter
 * Personen zurück. Anträge behalten wir (Org-Akte) – nur der Personenbezug wird gelöst.
 */
async function purgePersons(idSel: ReturnType<typeof sql>): Promise<number> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`UPDATE antraege SET transferred_person_id = NULL WHERE transferred_person_id ${idSel}`);
    await tx.execute(sql`DELETE FROM duplicate_decisions WHERE created_person_id ${idSel} OR matched_person_id ${idSel}`);
    await tx.execute(sql`DELETE FROM scan_documents WHERE person_id ${idSel}`);
    await tx.execute(sql`DELETE FROM distributions WHERE person_id ${idSel}`);
    await tx.execute(sql`UPDATE cards SET predecessor_card_id = NULL WHERE predecessor_card_id IN (SELECT id FROM cards WHERE person_id ${idSel})`);
    await tx.execute(sql`DELETE FROM cards WHERE person_id ${idSel}`);
    await tx.execute(sql`DELETE FROM person_location_assignments WHERE person_id ${idSel}`);
    const del = await tx.execute(sql`DELETE FROM persons WHERE id ${idSel} RETURNING id`);
    return (del as unknown as { id: string }[]).length;
  });
}
