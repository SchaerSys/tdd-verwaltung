"use server";

import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { hash } from "@node-rs/argon2";
import { organizations, users } from "@tdd/db";
import { db } from "@/lib/db";
import { login, landingFor } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createAuthToken, consumeAuthToken, appUrl } from "@/lib/auth-tokens";
import { sendMail } from "@/lib/mail";

export interface LoginState { error?: string }
export interface FormState { error?: string; done?: boolean; info?: string }

/** Öffentliche Liste der Organisationen eines Typs (nur Namen – für die Auswahl). */
export async function listOrganizations(type: "GEMEINDE" | "INSTITUTION" | "TDD"): Promise<{ id: number; name: string }[]> {
  return db().select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(and(eq(organizations.type, type), eq(organizations.isActive, true)))
    .orderBy(asc(organizations.name));
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const orgRaw = formData.get("orgId");
  const orgId = orgRaw ? parseInt(String(orgRaw), 10) : null;

  const user = await login(email, password, orgId);
  if (!user) return { error: "E-Mail, Passwort oder Organisation ist falsch." };
  await audit({ actorUserId: user.id, action: "login", entityType: "user", entityId: user.id });
  redirect(landingFor(user.role));
}

// ── Passwort vergessen ────────────────────────────────────────────────────
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  if (!email) return { error: "Bitte E-Mail-Adresse angeben." };
  const rows = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (rows[0]) {
    const token = await createAuthToken(rows[0].id, "RESET", 60);
    const link = `${appUrl()}/passwort-neu?token=${token}`;
    await sendMail({ to: email, subject: "TDD-Verwaltung – Passwort zurücksetzen",
      text: `Sie haben ein neues Passwort angefordert.\n\nZum Zurücksetzen öffnen Sie diesen Link (gültig 60 Minuten):\n${link}\n\nWenn Sie das nicht waren, ignorieren Sie diese E-Mail.` });
    await audit({ actorUserId: rows[0].id, action: "password.reset.request", entityType: "user", entityId: rows[0].id });
  }
  // Immer generische Rückmeldung (kein Hinweis, ob die Adresse existiert)
  return { done: true, info: "Falls die Adresse hinterlegt ist, wurde eine E-Mail zum Zurücksetzen gesendet." };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const pw = String(formData.get("password") ?? "");
  if (pw.length < 8) return { error: "Das Passwort muss mindestens 8 Zeichen haben." };
  const userId = await consumeAuthToken(token, "RESET");
  if (!userId) return { error: "Der Link ist ungültig oder abgelaufen." };
  await db().update(users).set({ passwordHash: await hash(pw) }).where(eq(users.id, userId));
  await audit({ actorUserId: userId, action: "password.reset.done", entityType: "user", entityId: userId });
  redirect("/login?reset=1");
}

// ── Registrierung als Sachbearbeiter (mit E-Mail-Bestätigung) ─────────────
export async function registerSachbearbeiter(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const pw = String(formData.get("password") ?? "");
  const orgId = parseInt(String(formData.get("orgId") ?? ""), 10);
  if (!email || !displayName || !orgId) return { error: "Bitte alle Felder ausfüllen und Organisation wählen." };
  if (pw.length < 8) return { error: "Das Passwort muss mindestens 8 Zeichen haben." };

  const exists = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (exists[0]) return { error: "Für diese E-Mail existiert bereits ein Konto." };

  const ins = await db().insert(users).values({
    email, passwordHash: await hash(pw), displayName, role: "SACHBEARBEITER", organizationId: orgId,
    isActive: false, emailVerified: false,
  }).returning({ id: users.id });
  const userId = ins[0]!.id;

  const token = await createAuthToken(userId, "VERIFY", 60 * 24);
  const link = `${appUrl()}/konto-bestaetigen?token=${token}`;
  await sendMail({ to: email, subject: "TDD-Verwaltung – Konto bestätigen",
    text: `Willkommen,\n\nbitte bestätigen Sie Ihr Konto über diesen Link (gültig 24 Stunden):\n${link}\n\nErst nach Bestätigung ist die Anmeldung möglich.` });
  await audit({ actorUserId: userId, action: "user.register", entityType: "user", entityId: userId });

  return { done: true, info: "Konto erstellt. Bitte bestätigen Sie die E-Mail; anschließend wird Ihr Zugang von einer Administration freigegeben." };
}

export async function confirmAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const userId = await consumeAuthToken(token, "VERIFY");
  if (!userId) return { error: "Der Bestätigungslink ist ungültig oder abgelaufen." };
  // E-Mail bestätigt – aber NICHT aktiv: wartet auf Admin-Freigabe.
  await db().update(users).set({ emailVerified: true }).where(eq(users.id, userId));
  await audit({ actorUserId: userId, action: "user.emailverified", entityType: "user", entityId: userId });
  redirect("/login?confirmed=1");
}
