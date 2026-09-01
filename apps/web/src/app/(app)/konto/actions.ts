"use server";

import { eq } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { users } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export interface PwState { ok: boolean; error?: string }

/** Selbst-Service: eigenes Passwort ändern (verlangt das aktuelle Passwort). */
export async function changePassword(_prev: PwState, formData: FormData): Promise<PwState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 10) return { ok: false, error: "Das neue Passwort muss mindestens 10 Zeichen haben." };
  if (next !== confirm) return { ok: false, error: "Die neuen Passwörter stimmen nicht überein." };
  if (next === current) return { ok: false, error: "Das neue Passwort muss sich vom bisherigen unterscheiden." };

  const rows = await db().select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  const h = rows[0]?.hash;
  if (!h) return { ok: false, error: "Konto nicht gefunden." };

  const ok = await verify(h, current).catch(() => false);
  if (!ok) return { ok: false, error: "Das aktuelle Passwort ist nicht korrekt." };

  await db().update(users).set({ passwordHash: await hash(next) }).where(eq(users.id, user.id));
  await audit({ actorUserId: user.id, action: "user.password_change", entityType: "user", entityId: user.id });
  return { ok: true };
}
