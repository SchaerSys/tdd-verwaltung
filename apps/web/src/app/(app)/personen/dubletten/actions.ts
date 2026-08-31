"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import {
  persons, cards, distributions, scanDocuments, personLocationAssignments, duplicateDecisions,
} from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/**
 * Führt zwei Personen zusammen: hängt Karten/Ausgaben/Scans/Zuordnung von `drop`
 * auf `keep` um, markiert `drop` als gelöscht und protokolliert die Entscheidung.
 */
export async function mergePersons(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) throw new Error("Keine Berechtigung");

  const keepId = String(formData.get("keepId") ?? "");
  const dropId = String(formData.get("dropId") ?? "");
  const reason = (formData.get("reason") as string | null) || null;
  if (!keepId || !dropId || keepId === dropId) throw new Error("Ungültige Auswahl");

  await db().transaction(async (tx) => {
    await tx.update(cards).set({ personId: keepId }).where(eq(cards.personId, dropId));
    await tx.update(distributions).set({ personId: keepId }).where(eq(distributions.personId, dropId));
    await tx.update(scanDocuments).set({ personId: keepId }).where(eq(scanDocuments.personId, dropId));

    // Standort-Zuordnung: nur behalten, wenn keep noch keine aktive hat
    const keepActive = await tx
      .select({ n: sql<number>`count(*)` })
      .from(personLocationAssignments)
      .where(and(eq(personLocationAssignments.personId, keepId), eq(personLocationAssignments.isActive, true)));
    const hasActive = Number(keepActive[0]?.n ?? 0) > 0;
    if (hasActive) {
      await tx.delete(personLocationAssignments).where(eq(personLocationAssignments.personId, dropId));
    } else {
      await tx.update(personLocationAssignments).set({ personId: keepId })
        .where(and(eq(personLocationAssignments.personId, dropId), eq(personLocationAssignments.isActive, true)));
      await tx.delete(personLocationAssignments).where(eq(personLocationAssignments.personId, dropId));
    }

    await tx.update(persons).set({ deletedAt: new Date(), status: "INAKTIV" }).where(eq(persons.id, dropId));

    await tx.insert(duplicateDecisions).values({
      matchedPersonId: keepId,
      shownCandidates: [{ mergedFrom: dropId }],
      decision: "MERGED",
      reason,
      decidedBy: user.id,
    });
  });

  await audit({ actorUserId: user.id, action: "person.merge", entityType: "person", entityId: keepId, before: { mergedFrom: dropId } });
  revalidatePath("/personen/dubletten");
}
