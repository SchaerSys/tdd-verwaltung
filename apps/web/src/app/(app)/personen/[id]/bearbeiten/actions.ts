"use server";

import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { persons, personLocationAssignments } from "@tdd/db";
import { normalizeName, normalizeAddress, koelnerPhonetik } from "@tdd/core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

function s(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? null : str;
}
function toInt(v: string | null): number | null {
  if (v == null) return null;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Gesamt-Haushalt aus Erwachsenen + Kindern; null wenn beides leer. */
function householdTotal(adults: number | null, children: number | null): number | null {
  if (adults == null && children == null) return null;
  return (adults ?? 0) + (children ?? 0);
}

export async function updatePerson(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) throw new Error("Keine Berechtigung");

  const personId = String(formData.get("personId") ?? "");
  if (!personId) throw new Error("Keine Person");
  const firstName = s(formData, "firstName");
  const lastName = s(formData, "lastName");
  if (!firstName || !lastName) throw new Error("Vor- und Nachname sind Pflicht.");

  const address = s(formData, "address");
  const lastNameNorm = normalizeName(lastName);
  const firstNameNorm = normalizeName(firstName);

  await db().update(persons).set({
    firstName, lastName, address,
    postalCode: s(formData, "postalCode"), city: s(formData, "city"), birthDate: s(formData, "birthDate"),
    phone: s(formData, "phone"), email: s(formData, "email"),
    householdSize: householdTotal(toInt(s(formData, "adults")), toInt(s(formData, "childrenCount"))), childrenCount: toInt(s(formData, "childrenCount")),
    gruppe: toInt(s(formData, "gruppe")), ausgabeNumber: toInt(s(formData, "nummer")),
    languageId: toInt(s(formData, "languageId")), originId: toInt(s(formData, "originId")), note: s(formData, "note"),
    consentAt: formData.get("consent") ? sql`COALESCE(${persons.consentAt}, now())` : null,
    lastNameNorm, firstNameNorm, addressNorm: normalizeAddress(address),
    lastNamePhon: koelnerPhonetik(lastNameNorm), firstNamePhon: koelnerPhonetik(firstNameNorm),
    updatedBy: user.id, updatedAt: new Date(),
  }).where(eq(persons.id, personId));

  // Standortwechsel (falls geändert)
  const newLoc = toInt(s(formData, "locationId"));
  const current = await db().select({ id: personLocationAssignments.id, locationId: personLocationAssignments.locationId })
    .from(personLocationAssignments)
    .where(and(eq(personLocationAssignments.personId, personId), eq(personLocationAssignments.isActive, true)))
    .limit(1);
  const curLoc = current[0]?.locationId ?? null;
  if (newLoc !== curLoc) {
    if (current[0]) await db().update(personLocationAssignments)
      .set({ isActive: false, validTo: new Date().toISOString().slice(0, 10) })
      .where(eq(personLocationAssignments.id, current[0].id));
    if (newLoc) {
      await db().insert(personLocationAssignments).values({ personId, locationId: newLoc });
      // Neuer Ort → Gruppe/Nummer am neuen Ort neu vergeben (die aus dem Formular galten für den alten Ort).
      await db().update(persons).set({ gruppe: null, ausgabeNumber: null }).where(eq(persons.id, personId));
      const { ensureAusgabePlacement } = await import("@/lib/ausgabe");
      await ensureAusgabePlacement(personId, newLoc);
    } else {
      await db().update(persons).set({ gruppe: null, ausgabeNumber: null }).where(eq(persons.id, personId));
    }
  }

  await audit({ actorUserId: user.id, action: "person.update", entityType: "person", entityId: personId, after: { firstName, lastName } });
  redirect(`/personen/${personId}`);
}

const PHOTO_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Lädt ein Erkennungsfoto der Person hoch (für die Ausgabe am Tresen). */
export async function uploadPersonPhoto(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) throw new Error("Keine Berechtigung");
  const personId = String(formData.get("personId") ?? "");
  if (!personId) throw new Error("Keine Person");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) redirect(`/personen/${personId}/bearbeiten`);
  const f = file as File;
  const ext = PHOTO_EXT[f.type];
  if (!ext) throw new Error("Nur JPG, PNG oder WebP erlaubt.");
  if (f.size > 8 * 1024 * 1024) throw new Error("Foto zu groß (max. 8 MB).");

  const buf = Buffer.from(await f.arrayBuffer());
  const dir = join(process.env.STORAGE_DIR ?? "./data/uploads", "photos");
  await mkdir(dir, { recursive: true });
  const fileRef = `photos/${randomUUID()}.${ext}`;
  await writeFile(join(process.env.STORAGE_DIR ?? "./data/uploads", fileRef), buf);

  await db().update(persons).set({ photoRef: fileRef, updatedBy: user.id, updatedAt: new Date() }).where(eq(persons.id, personId));
  await audit({ actorUserId: user.id, action: "person.photo", entityType: "person", entityId: personId });
  redirect(`/personen/${personId}`);
}

/**
 * Person „löschen" = ins Archiv/Papierkorb verschieben (Soft-Delete).
 * Wegen Aufbewahrungspflicht wird retention_until aus retention_rules gesetzt;
 * endgültiges Löschen ist erst nach Ablauf dieser Frist möglich (im Papierkorb).
 * Die zugehörigen Karten wandern ebenfalls in den Karten-Papierkorb, damit sie
 * nicht mehr als „aktiv" zählen; die Ausgabe-Historie bleibt erhalten.
 */
export async function deletePerson(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) throw new Error("Keine Berechtigung");
  const personId = String(formData.get("personId") ?? "");
  if (!personId) throw new Error("Keine Person");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const now = new Date();
  await db().update(persons).set({
    deletedAt: now,
    deleteReason: reason,
    retentionUntil: sql`(current_date + COALESCE((SELECT retention_period FROM retention_rules WHERE entity_type = 'person' AND is_active), interval '3 years'))::date`,
    status: "INAKTIV",
    updatedBy: user.id,
    updatedAt: now,
  }).where(eq(persons.id, personId));
  await db().update(personLocationAssignments).set({ isActive: false }).where(eq(personLocationAssignments.personId, personId));
  // Karten der Person in den Karten-Papierkorb (Soft-Delete), Historie bleibt.
  await db().execute(sql`
    UPDATE cards SET deleted_at = now(), trash_reason = 'Person archiviert', updated_at = now()
    WHERE person_id = ${personId} AND deleted_at IS NULL`);

  await audit({ actorUserId: user.id, action: "person.archive", entityType: "person", entityId: personId, after: { reason } });
  redirect("/personen");
}
