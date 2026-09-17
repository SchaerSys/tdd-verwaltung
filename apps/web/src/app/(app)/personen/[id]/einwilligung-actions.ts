"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { persons } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { unterschriftSpeichern } from "@/lib/einwilligung";

/** Widerruf dokumentieren: sperrt die Ausgabe am Tresen, bis das Buero den Fall klaert (Loeschung/Neu-Einwilligung). */
export async function einwilligungWiderrufen(fd: FormData): Promise<void> {
  const u = await requirePermission("person:write");
  const id = String(fd.get("personId") ?? ""); const grund = String(fd.get("grund") ?? "").trim();
  if (!id) return;
  await db().update(persons).set({ consentRevokedAt: new Date(), consentRevokedReason: grund || null, updatedBy: u.id }).where(eq(persons.id, id));
  await audit({ actorUserId: u.id, action: "person.consent.revoke", entityType: "person", entityId: id, after: { grund } });
  revalidatePath(`/personen/${id}`);
}

/** Neue Einwilligung (Unterschrift am Bildschirm oder Papier) – hebt einen Widerruf auf. */
export async function einwilligungErfassen(fd: FormData): Promise<void> {
  const u = await requirePermission("person:write");
  const id = String(fd.get("personId") ?? "");
  const art = fd.get("art") === "PAPIER" ? "PAPIER" : "UNTERSCHRIFT";
  if (!id) return;
  const ref = art === "UNTERSCHRIFT" ? await unterschriftSpeichern(String(fd.get("unterschrift") ?? "")) : null;
  if (art === "UNTERSCHRIFT" && !ref) throw new Error("Bitte unterschreiben.");
  await db().update(persons).set({ consentAt: new Date(), consentMethod: art, consentSignatureRef: ref ?? null, consentRevokedAt: null, consentRevokedReason: null, updatedBy: u.id }).where(eq(persons.id, id));
  await audit({ actorUserId: u.id, action: "person.consent.given", entityType: "person", entityId: id, after: { art } });
  revalidatePath(`/personen/${id}`);
}
