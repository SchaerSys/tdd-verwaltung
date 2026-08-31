"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { cards, distributions } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function guard() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "card:manage")) throw new Error("Keine Berechtigung");
  return user;
}

/** Holt eine Karte aus dem Papierkorb zurück. */
export async function restoreCard(formData: FormData): Promise<void> {
  const user = await guard();
  const id = String(formData.get("cardId") ?? "");
  if (!id) { revalidatePath("/karten/papierkorb"); return; }
  await db().update(cards).set({ deletedAt: null, trashReason: null, updatedAt: new Date() }).where(eq(cards.id, id));
  await audit({ actorUserId: user.id, action: "card.restore", entityType: "card", entityId: id });
  revalidatePath("/karten/papierkorb");
}

/** Löscht eine Karte endgültig (nur aus dem Papierkorb) inkl. ihrer Buchungen. */
export async function hardDeleteCard(formData: FormData): Promise<void> {
  const user = await guard();
  const id = String(formData.get("cardId") ?? "");
  if (!id) { revalidatePath("/karten/papierkorb"); return; }
  const rows = await db().select({ del: cards.deletedAt }).from(cards).where(eq(cards.id, id)).limit(1);
  if (!rows[0] || !rows[0].del) { revalidatePath("/karten/papierkorb"); return; } // nur Papierkorb-Karten
  await db().delete(distributions).where(eq(distributions.cardId, id));
  await db().delete(cards).where(eq(cards.id, id));
  await audit({ actorUserId: user.id, action: "card.harddelete", entityType: "card", entityId: id });
  revalidatePath("/karten/papierkorb");
}

/** Leert den gesamten Papierkorb endgültig (alle Papierkorb-Karten + deren Buchungen). */
export async function emptyTrash(): Promise<void> {
  const user = await guard();
  await db().execute(sql`DELETE FROM distributions WHERE card_id IN (SELECT id FROM cards WHERE deleted_at IS NOT NULL)`);
  const res = await db().execute(sql`DELETE FROM cards WHERE deleted_at IS NOT NULL RETURNING id`);
  const n = (res as unknown as { id: string }[]).length;
  await audit({ actorUserId: user.id, action: "card.trash.empty", entityType: "card", after: { deleted: n } });
  revalidatePath("/karten/papierkorb");
}
