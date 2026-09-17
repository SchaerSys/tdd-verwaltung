"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { cards, distributions, personLocationAssignments } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { and } from "drizzle-orm";

/**
 * Schuldenerlass – nur im Buero (person:write), mit Pflichtbegruendung.
 * Buchung ERLASS: faellig negativ, bezahlt 0 → Saldo sinkt, ohne dass Geld in der Kasse landet.
 * Ganz oder teilweise (Betrag <= offener Ausstand). Audit mit Begruendung.
 */
export async function schuldenErlassen(fd: FormData): Promise<void> {
  const user = await requirePermission("person:write");
  const personId = String(fd.get("personId") ?? "");
  const begruendung = String(fd.get("begruendung") ?? "").trim();
  const betragRoh = String(fd.get("betrag") ?? "").replace(",", ".").trim();
  if (!personId) return;
  if (begruendung.length < 5) throw new Error("Begründung ist Pflicht (mindestens 5 Zeichen).");

  const agg = (await db().select({
    due: sql<string>`COALESCE(SUM(${distributions.amountDue}), 0)`, paid: sql<string>`COALESCE(SUM(${distributions.amountPaid}), 0)`,
  }).from(distributions).where(eq(distributions.personId, personId)))[0];
  const offen = Math.round((Number(agg?.due ?? 0) - Number(agg?.paid ?? 0)) * 100) / 100;
  if (offen <= 0) return;
  const betrag = betragRoh ? Math.round(Number(betragRoh) * 100) / 100 : offen;
  if (!(betrag > 0) || betrag > offen + 0.005) throw new Error(`Betrag muss zwischen 0,01 und ${offen.toFixed(2)} € liegen.`);

  // Buchung haengt an der juengsten Karte und dem registrierten Standort (Pflichtfelder der Tabelle)
  const karte = (await db().select({ id: cards.id, loc: cards.locationId }).from(cards).where(eq(cards.personId, personId)).orderBy(sql`${cards.createdAt} DESC`).limit(1))[0];
  const zuordnung = (await db().select({ loc: personLocationAssignments.locationId }).from(personLocationAssignments)
    .where(and(eq(personLocationAssignments.personId, personId), eq(personLocationAssignments.isActive, true))).limit(1))[0];
  if (!karte) throw new Error("Ohne Karte kann kein Erlass gebucht werden.");
  await db().insert(distributions).values({
    cardId: karte.id, personId, locationId: zuordnung?.loc ?? karte.loc, distributedBy: user.id,
    amountDue: (-betrag).toFixed(2), amountPaid: "0", buchungsart: "ERLASS", note: `Erlass: ${begruendung}`,
  });
  await audit({ actorUserId: user.id, action: "distribution.erlass", entityType: "person", entityId: personId, after: { betrag, begruendung, offenVorher: offen } });
  revalidatePath(`/personen/${personId}`);
}
