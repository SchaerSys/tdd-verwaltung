"use server";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { opsUsers } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

export interface SetupState { error?: string }

/** Gibt es schon ein Wartungskonto? Dann ist die Einrichtung vorbei. */
export async function einrichtungOffen(): Promise<boolean> {
  const r = await db().execute(sql`SELECT count(*)::int AS n FROM ops_users`);
  const rows = (Array.isArray(r) ? r : (r as { rows?: { n: number }[] }).rows ?? []) as { n: number }[];
  return Number(rows[0]?.n ?? 0) === 0;
}

/**
 * Erstes Konto der Wartungsplattform – nur solange ops_users leer ist. Danach
 * liefert die Seite 404; weitere Konten entstehen ueber das Skript oder spaeter im UI.
 */
export async function ersteEinrichtung(_prev: SetupState, fd: FormData): Promise<SetupState> {
  if (!(await einrichtungOffen())) return { error: "Die Einrichtung ist bereits abgeschlossen." };
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("displayName") ?? "").trim();
  const pw = String(fd.get("password") ?? "");
  const pw2 = String(fd.get("confirm") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return { error: "E-Mail und Name sind Pflicht." };
  if (pw.length < MIN_PASSWORD_LENGTH) return { error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.` };
  if (pw !== pw2) return { error: "Die Passwörter stimmen nicht überein." };

  await db().insert(opsUsers).values({ email, displayName: name, passwordHash: await hash(pw) });
  await audit({ akteur: email, action: "setup.first_account", entityType: "ops_user", entityId: email });
  redirect("/login");
}
