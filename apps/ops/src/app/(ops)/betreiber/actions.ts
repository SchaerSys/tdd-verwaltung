"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { opsUsers } from "@tdd/db";
import { dbFuer } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireSuper } from "@/lib/auth";

export type BetreiberState = { error?: string; info?: string; passwort?: string };

/** Lesbares Startpasswort: 3 Bloecke ohne verwechselbare Zeichen – wird einmal angezeigt, nie gespeichert. */
function startpasswort(): string {
  const z = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const teil = () => Array.from({ length: 4 }, () => z[randomInt(0, z.length)]).join("");
  return `${teil()}-${teil()}-${teil()}`;
}

/** Betreiber-Konto anlegen (nur Super-Admin). Das Startpasswort uebergibt der Super-Admin persoenlich; 2FA richtet die Person selbst ein. */
export async function betreiberAnlegen(_prev: BetreiberState, fd: FormData): Promise<BetreiberState> {
  const ops = await requireSuper();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("displayName") ?? "").trim();
  const rolle = fd.get("rolle") === "SUPPORT" ? "SUPPORT" : "SUPER";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return { error: "E-Mail und Name sind Pflicht." };
  const pw = startpasswort();
  try {
    await dbFuer(null).insert(opsUsers).values({ email, displayName: name, passwordHash: await hash(pw), rolle });
  } catch (e) {
    return { error: /duplicate|unique/i.test(e instanceof Error ? e.message : "") ? "Diese E-Mail hat schon ein Betreiber-Konto." : "Anlegen fehlgeschlagen." };
  }
  await audit({ akteur: ops.email, action: "ops.user.create", entityType: "ops_user", entityId: email, after: { rolle } });
  revalidatePath("/betreiber");
  return { info: `Konto ${email} (${rolle}) angelegt. Startpasswort einmalig anzeigen und persönlich übergeben:`, passwort: pw };
}

export async function betreiberRolle(fd: FormData): Promise<void> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? ""); const rolle = fd.get("rolle") === "SUPPORT" ? "SUPPORT" : "SUPER";
  if (!id || id === ops.id) return; // eigene Rolle nicht aendern (sonst sperrt man sich aus)
  await dbFuer(null).update(opsUsers).set({ rolle }).where(eq(opsUsers.id, id));
  await audit({ akteur: ops.email, action: "ops.user.role", entityType: "ops_user", entityId: id, after: { rolle } });
  revalidatePath("/betreiber");
}

export async function betreiberSchalten(fd: FormData): Promise<void> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? ""); const an = fd.get("aktiv") === "1";
  if (!id || id === ops.id) return;
  await dbFuer(null).update(opsUsers).set({ isActive: an }).where(eq(opsUsers.id, id));
  await audit({ akteur: ops.email, action: an ? "ops.user.activate" : "ops.user.deactivate", entityType: "ops_user", entityId: id });
  revalidatePath("/betreiber");
}

export async function betreiberEntsperren(fd: FormData): Promise<void> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await dbFuer(null).update(opsUsers).set({ failedAttempts: 0, lockedUntil: null }).where(eq(opsUsers.id, id));
  await audit({ akteur: ops.email, action: "ops.user.unlock", entityType: "ops_user", entityId: id });
  revalidatePath("/betreiber");
}
