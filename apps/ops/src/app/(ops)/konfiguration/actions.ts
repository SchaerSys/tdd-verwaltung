"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { locations, lookupValues, organizations, retentionRules } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOps } from "@/lib/auth";

/** Standort: Name/Ort/aktiv. Kennung und Typ bleiben in der Fach-App (Karten haengen daran). */
export async function standortSpeichern(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = Number(fd.get("id"));
  const name = String(fd.get("name") ?? "").trim();
  const city = String(fd.get("city") ?? "").trim();
  const aktiv = fd.get("isActive") === "on";
  if (!id || !name || !city) return;
  await (await db()).update(locations).set({ name, city, isActive: aktiv }).where(eq(locations.id, id));
  await audit({ akteur: ops.email, action: "location.update", entityType: "location", entityId: String(id), after: { name, city, aktiv } });
  revalidatePath("/konfiguration");
}

/** Loeschfrist als Postgres-Intervall-Text, z. B. "3 years", "90 days". */
export async function fristSpeichern(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = Number(fd.get("id"));
  const frist = String(fd.get("retentionPeriod") ?? "").trim();
  const aktiv = fd.get("isActive") === "on";
  if (!id || !/^\d+\s+(day|days|month|months|year|years)$/.test(frist)) return;
  await (await db()).update(retentionRules).set({ retentionPeriod: frist, isActive: aktiv }).where(eq(retentionRules.id, id));
  await audit({ akteur: ops.email, action: "retention.update", entityType: "retention_rule", entityId: String(id), after: { frist, aktiv } });
  revalidatePath("/konfiguration");
}

export async function auswahlwertHinzufuegen(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const listId = Number(fd.get("listId"));
  const label = String(fd.get("label") ?? "").trim();
  if (!listId || !label) return;
  await (await db()).insert(lookupValues).values({ listId, label, sort: 999 });
  await audit({ akteur: ops.email, action: "lookup.add", entityType: "lookup_value", after: { listId, label } });
  revalidatePath("/konfiguration");
}

export async function auswahlwertSchalten(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = Number(fd.get("id"));
  const an = String(fd.get("aktiv")) === "1";
  if (!id) return;
  await (await db()).update(lookupValues).set({ isActive: an }).where(eq(lookupValues.id, id));
  await audit({ akteur: ops.email, action: an ? "lookup.activate" : "lookup.deactivate", entityType: "lookup_value", entityId: String(id) });
  revalidatePath("/konfiguration");
}

export async function organisationSchalten(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = Number(fd.get("id"));
  const an = String(fd.get("aktiv")) === "1";
  if (!id) return;
  await (await db()).update(organizations).set({ isActive: an }).where(eq(organizations.id, id));
  await audit({ akteur: ops.email, action: an ? "org.activate" : "org.deactivate", entityType: "organization", entityId: String(id) });
  revalidatePath("/konfiguration");
}
