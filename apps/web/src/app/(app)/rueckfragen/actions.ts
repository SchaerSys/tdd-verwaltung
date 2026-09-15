"use server";

import { revalidatePath } from "next/cache";
import { antragNachrichten } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { ladeRueckfrage } from "@/lib/rueckfragen";

/** TDD antwortet im Verlauf eines Antrags (Organisation sieht die Antwort im Portal). */
export async function antwortNachricht(formData: FormData): Promise<void> {
  const user = await requirePermission("person:write");
  const antragId = String(formData.get("antragId") ?? "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 4000);
  if (!text) throw new Error("Nachricht ist leer.");

  // Nur zu Antraegen, zu denen die Organisation den Verlauf eroeffnet hat (View liefert sonst nichts).
  const fall = await ladeRueckfrage(antragId);
  if (!fall) throw new Error("Kein Verlauf zu diesem Antrag.");

  await db().insert(antragNachrichten).values({
    antragId, organizationId: fall.organizationId, seite: "TDD", autorUserId: user.id, autorName: user.displayName, text,
  });
  await audit({ actorUserId: user.id, action: "antrag.nachricht", entityType: "antrag", entityId: antragId, after: { seite: "TDD", laenge: text.length } });
  revalidatePath(`/rueckfragen/${antragId}`);
  revalidatePath("/rueckfragen");
  revalidatePath(`/portal/${antragId}`);
}
