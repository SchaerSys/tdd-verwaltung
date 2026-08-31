"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { persons } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** TDD übernimmt einen bewilligten Antrag aktiv (Person wird in den TDD-Bestand aufgenommen). */
export async function takeoverPerson(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) throw new Error("Keine Berechtigung");
  const personId = String(formData.get("personId") ?? "");
  if (!personId) throw new Error("Keine Person");

  await db().update(persons).set({ takeoverPending: false, updatedBy: user.id, updatedAt: new Date() })
    .where(and(eq(persons.id, personId), eq(persons.takeoverPending, true)));

  await audit({ actorUserId: user.id, action: "person.takeover", entityType: "person", entityId: personId });
  revalidatePath("/bewilligt");
  revalidatePath("/personen");
}
