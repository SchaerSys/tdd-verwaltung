"use server";

import { revalidatePath } from "next/cache";
import { eq, isNull } from "drizzle-orm";
import { aufgaben, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { pushAnPersonal } from "@/lib/push";

const str = (fd: FormData, k: string): string | null => { const v = String(fd.get(k) ?? "").trim(); return v || null; };

/** Aufgabe anlegen (an eine Person oder an alle) – myTafelwerk zeigt sie, Push an die Betroffenen. */
export async function aufgabeAnlegen(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const titel = str(fd, "titel"); if (!titel) throw new Error("Titel fehlt.");
  const staffId = str(fd, "staffId");
  const faellig = str(fd, "faelligAm"); const prio = ["NIEDRIG", "NORMAL", "HOCH"].includes(str(fd, "prio") ?? "") ? str(fd, "prio")! : "NORMAL";
  const r = await db().insert(aufgaben).values({ titel, beschreibung: str(fd, "beschreibung"), staffId, faelligAm: faellig && /^\d{4}-\d{2}-\d{2}$/.test(faellig) ? faellig : null, prio, createdBy: u.id }).returning({ id: aufgaben.id });
  await audit({ actorUserId: u.id, action: "aufgabe.create", entityType: "aufgabe", entityId: r[0]!.id, after: { titel, staffId, prio } });
  const ziel = staffId ? [staffId] : (await db().select({ id: staff.id }).from(staff).where(eq(staff.isActive, true))).map((s) => s.id);
  void pushAnPersonal(ziel, { titel: prio === "HOCH" ? "Neue dringende Aufgabe" : "Neue Aufgabe", text: titel, url: "/my/aufgaben", tag: `aufgabe-${r[0]!.id}` });
  revalidatePath("/personal/aufgaben"); revalidatePath("/my"); revalidatePath("/my/aufgaben");
}

export async function aufgabeLoeschen(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = String(fd.get("id") ?? "");
  await db().delete(aufgaben).where(eq(aufgaben.id, id));
  await audit({ actorUserId: u.id, action: "aufgabe.delete", entityType: "aufgabe", entityId: id });
  revalidatePath("/personal/aufgaben"); revalidatePath("/my/aufgaben");
}

export async function aufgabeWiederOeffnen(fd: FormData): Promise<void> {
  const u = await requirePermission("staff:manage");
  const id = String(fd.get("id") ?? "");
  await db().update(aufgaben).set({ erledigtAm: null, erledigtVon: null }).where(eq(aufgaben.id, id));
  await audit({ actorUserId: u.id, action: "aufgabe.reopen", entityType: "aufgabe", entityId: id });
  revalidatePath("/personal/aufgaben"); revalidatePath("/my/aufgaben");
}

export async function alleOffenenZaehlen(): Promise<number> {
  await requirePermission("staff:manage");
  return (await db().select({ id: aufgaben.id }).from(aufgaben).where(isNull(aufgaben.erledigtAm))).length;
}
