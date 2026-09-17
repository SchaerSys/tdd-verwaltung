"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";
import { sendMail } from "@/lib/mail";
import { einmalPinErzeugen, pinEntfernen, stationscodeErzeugen, stationTrennen } from "@/lib/station";

export interface StationCodeState { code?: string; name?: string; error?: string }
export interface PinState { pin?: string; gesendet?: boolean; name?: string; error?: string }

/** Stammdaten: Kopplungscode fuer den Ausgabelaptop. */
export async function stationCode(_prev: StationCodeState, fd: FormData): Promise<StationCodeState> {
  const u = await requirePermission("admin:manage");
  const name = String(fd.get("name") ?? "").trim() || "Ausgabelaptop";
  const code = await stationscodeErzeugen(name, u.id);
  await audit({ actorUserId: u.id, action: "station.code", entityType: "geraet", entityId: name });
  revalidatePath("/admin/ausgabestation");
  return { code, name };
}

export async function stationTrennenAction(fd: FormData): Promise<void> {
  const u = await requirePermission("admin:manage");
  const id = String(fd.get("id") ?? ""); if (!id) return;
  await stationTrennen(id);
  await audit({ actorUserId: u.id, action: "station.unpaired", entityType: "geraet", entityId: id });
  revalidatePath("/admin/ausgabestation");
}

/** Personal: Einmal-PIN erzeugen – einmal angezeigt und, wenn eine E-Mail hinterlegt ist, zugeschickt. */
export async function einmalPin(_prev: PinState, fd: FormData): Promise<PinState> {
  const u = await requirePermission("admin:manage");
  const staffId = String(fd.get("staffId") ?? "");
  const p = (await db().select({ id: staff.id, first: staff.firstName, last: staff.lastName, email: staff.email }).from(staff).where(eq(staff.id, staffId)).limit(1))[0];
  if (!p) return { error: "Person nicht gefunden." };
  const pin = await einmalPinErzeugen(p.id);
  let gesendet = false;
  if (p.email && fd.get("mail") === "on") {
    const r = await sendMail({ ausloeser: "pin", to: p.email, subject: "Deine Einmal-PIN für die Ausgabe", text: `Hallo ${p.first},\n\ndeine Einmal-PIN für die Ausgabestation lautet: ${pin}\n\nBeim ersten Anmelden am Ausgabelaptop legst du damit deine eigene PIN fest.\n\nTischlein deck dich Vorarlberg` });
    gesendet = r.sent;
  }
  await audit({ actorUserId: u.id, action: "station.pin.issued", entityType: "staff", entityId: p.id, after: { gesendet } });
  revalidatePath(`/personal/${p.id}`); revalidatePath("/admin/ausgabestation");
  return { pin, gesendet, name: `${p.first} ${p.last}` };
}

export async function pinEntfernenAction(fd: FormData): Promise<void> {
  const u = await requirePermission("admin:manage");
  const staffId = String(fd.get("staffId") ?? ""); if (!staffId) return;
  await pinEntfernen(staffId);
  await audit({ actorUserId: u.id, action: "station.pin.removed", entityType: "staff", entityId: staffId });
  revalidatePath(`/personal/${staffId}`); revalidatePath("/admin/ausgabestation");
}
