"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { cards, locations, personLocationAssignments } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextCardNumber, addMonths, today } from "@/lib/cards";

async function guard() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "card:manage")) throw new Error("Keine Berechtigung");
  return user;
}

function months(fd: FormData): number {
  const m = parseInt(String(fd.get("months") ?? "6"), 10);
  return [3, 6, 12].includes(m) ? m : 6;
}

/** Stellt eine neue Karte für eine Person aus (Standort = aktive Zuordnung). */
export async function issueCard(formData: FormData): Promise<void> {
  const user = await guard();
  const personId = String(formData.get("personId") ?? "");
  if (!personId) throw new Error("Keine Person");

  const assignment = await db()
    .select({ locId: locations.id, code: locations.locationCode })
    .from(personLocationAssignments)
    .innerJoin(locations, eq(personLocationAssignments.locationId, locations.id))
    .where(and(eq(personLocationAssignments.personId, personId), eq(personLocationAssignments.isActive, true)))
    .limit(1);
  if (!assignment[0]) throw new Error("Person hat keinen Standort – bitte zuerst zuordnen.");

  const validFrom = String(formData.get("validFrom") || today());
  const validTo = addMonths(validFrom, months(formData));
  const cardNumber = await nextCardNumber(assignment[0].code);

  const ins = await db().insert(cards).values({
    cardNumber, personId, locationId: assignment[0].locId,
    validFrom, validTo, status: "AKTIV", createdBy: user.id,
  }).returning({ id: cards.id });

  await audit({ actorUserId: user.id, action: "card.issue", entityType: "card", entityId: ins[0]!.id, after: { cardNumber, validTo } });
  revalidatePath(`/personen/${personId}`);
  revalidatePath("/karten");
}

async function loadCard(cardId: string) {
  const rows = await db()
    .select({ id: cards.id, personId: cards.personId, locationId: cards.locationId, validTo: cards.validTo, code: locations.locationCode, status: cards.status, deletedAt: cards.deletedAt })
    .from(cards).innerJoin(locations, eq(cards.locationId, locations.id))
    .where(eq(cards.id, cardId)).limit(1);
  return rows[0];
}

/** Mehrere (ausgewählte) Karten auf einmal verlängern – je neue Karte, alte → ERSETZT. */
export async function renewCardsBulk(formData: FormData): Promise<void> {
  const user = await guard();
  const ids = [...new Set(formData.getAll("cardIds").map(String).filter(Boolean))];
  const m = months(formData);
  const touchedPersons = new Set<string>();
  let count = 0;
  for (const id of ids) {
    const old = await loadCard(id);
    if (!old || old.status !== "AKTIV" || old.deletedAt) continue; // nur aktive, nicht gelöschte Karten
    const validFrom = today();
    const validTo = addMonths(validFrom, m);
    const cardNumber = await nextCardNumber(old.code);
    await db().insert(cards).values({
      cardNumber, personId: old.personId, locationId: old.locationId,
      validFrom, validTo, status: "AKTIV", predecessorCardId: old.id, createdBy: user.id,
    });
    await db().update(cards).set({ status: "ERSETZT", updatedAt: new Date() }).where(eq(cards.id, old.id));
    touchedPersons.add(old.personId);
    count++;
  }
  await audit({ actorUserId: user.id, action: "card.renew.bulk", entityType: "card", after: { count, months: m } });
  touchedPersons.forEach((pid) => revalidatePath(`/personen/${pid}`));
  revalidatePath("/karten");
}

/** Verlängern: neue Karte mit neuem Code, alte wird ERSETZT. */
export async function renewCard(formData: FormData): Promise<void> {
  const user = await guard();
  const old = await loadCard(String(formData.get("cardId") ?? ""));
  if (!old) throw new Error("Karte nicht gefunden");

  const validFrom = today();
  const validTo = addMonths(validFrom, months(formData));
  const cardNumber = await nextCardNumber(old.code);

  const ins = await db().insert(cards).values({
    cardNumber, personId: old.personId, locationId: old.locationId,
    validFrom, validTo, status: "AKTIV", predecessorCardId: old.id, createdBy: user.id,
  }).returning({ id: cards.id });
  await db().update(cards).set({ status: "ERSETZT", updatedAt: new Date() }).where(eq(cards.id, old.id));

  await audit({ actorUserId: user.id, action: "card.renew", entityType: "card", entityId: ins[0]!.id, before: { predecessor: old.id }, after: { cardNumber, validTo } });
  revalidatePath(`/personen/${old.personId}`);
  revalidatePath("/karten");
}

/** Sperren (z. B. Verlust). */
export async function blockCard(formData: FormData): Promise<void> {
  const user = await guard();
  const cardId = String(formData.get("cardId") ?? "");
  const reason = (formData.get("reason") as string | null) || "gesperrt";
  const old = await loadCard(cardId);
  if (!old) throw new Error("Karte nicht gefunden");
  await db().update(cards).set({ status: "GESPERRT", blockReason: reason, updatedAt: new Date() }).where(eq(cards.id, cardId));
  await audit({ actorUserId: user.id, action: "card.block", entityType: "card", entityId: cardId, after: { reason } });
  revalidatePath(`/personen/${old.personId}`);
  revalidatePath("/karten");
}

/** Entsperren: hebt eine Sperre wieder auf (Status zurück auf AKTIV). */
export async function unblockCard(formData: FormData): Promise<void> {
  const user = await guard();
  const cardId = String(formData.get("cardId") ?? "");
  const old = await loadCard(cardId);
  if (!old) throw new Error("Karte nicht gefunden");
  await db().update(cards).set({ status: "AKTIV", blockReason: null, updatedAt: new Date() })
    .where(and(eq(cards.id, cardId), eq(cards.status, "GESPERRT")));
  await audit({ actorUserId: user.id, action: "card.unblock", entityType: "card", entityId: cardId });
  revalidatePath(`/personen/${old.personId}`);
  revalidatePath("/karten");
}

/** Ersetzen bei Verlust: alte sperren + neue Karte mit neuem Code. */
export async function replaceCard(formData: FormData): Promise<void> {
  const user = await guard();
  const old = await loadCard(String(formData.get("cardId") ?? ""));
  if (!old) throw new Error("Karte nicht gefunden");
  const reason = (formData.get("reason") as string | null) || "Verlust";

  await db().update(cards).set({ status: "GESPERRT", blockReason: reason, updatedAt: new Date() }).where(eq(cards.id, old.id));

  const validFrom = today();
  const validTo = addMonths(validFrom, 6);
  const cardNumber = await nextCardNumber(old.code);
  const ins = await db().insert(cards).values({
    cardNumber, personId: old.personId, locationId: old.locationId,
    validFrom, validTo, status: "AKTIV", predecessorCardId: old.id, createdBy: user.id,
  }).returning({ id: cards.id });

  await audit({ actorUserId: user.id, action: "card.replace", entityType: "card", entityId: ins[0]!.id, before: { replaced: old.id, reason }, after: { cardNumber } });
  revalidatePath(`/personen/${old.personId}`);
  revalidatePath("/karten");
}
