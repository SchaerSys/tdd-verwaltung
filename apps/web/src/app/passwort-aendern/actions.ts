"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { users } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser, landingFor } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

export interface PwState { error?: string }

/** Erstes eigenes Passwort nach dem Initialpasswort; hebt die Pflicht auf und leitet weiter. */
export async function erstesPasswortSetzen(_prev: PwState, fd: FormData): Promise<PwState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Nicht angemeldet." };
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) return { error: `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.` };
  if (next !== confirm) return { error: "Die neuen Passwörter stimmen nicht überein." };
  if (next === current) return { error: "Das neue Passwort muss sich vom Initialpasswort unterscheiden." };
  const row = (await db().select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!row || !(await verify(row.hash, current).catch(() => false))) return { error: "Das Initialpasswort ist nicht korrekt." };
  await db().update(users).set({ passwordHash: await hash(next), mustChangePassword: false }).where(eq(users.id, user.id));
  await audit({ actorUserId: user.id, action: "user.password_change", entityType: "user", entityId: user.id, after: { erstes: true } });
  redirect(landingFor(user.role));
}
