"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { users } from "@tdd/db";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOps } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

export interface BenutzerState { error?: string; info?: string; link?: string }

const ROLLEN = ["ADMIN", "ERFASSUNG", "AUSGABE", "AUSWERTUNG", "SACHBEARBEITER", "FAHRER", "MITARBEITER"] as const;
const appUrl = () => process.env.APP_URL ?? "https://tdd.schaer-systems.at";

function rows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[];
}

/** Einladung: Konto ohne Passwort + Link zum Setzen (72 h). Die Funktion in der DB fasst die gesperrten Spalten an. */
export async function einladen(_prev: BenutzerState, fd: FormData): Promise<BenutzerState> {
  const ops = await requireOps();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("displayName") ?? "").trim();
  const rolle = String(fd.get("role") ?? "");
  const loc = fd.get("locationId") ? Number(fd.get("locationId")) : null;
  const org = fd.get("organizationId") ? Number(fd.get("organizationId")) : null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return { error: "E-Mail und Anzeigename sind Pflicht." };
  if (!(ROLLEN as readonly string[]).includes(rolle)) return { error: "Ungültige Rolle." };
  if (rolle === "SACHBEARBEITER" && !org) return { error: "Sachbearbeiter:innen brauchen eine Organisation (Gemeinde/Institution)." };

  const vorhanden = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (vorhanden[0]) return { error: "Diese E-Mail-Adresse hat schon ein Konto." };

  let token: string;
  try {
    const r = rows<{ t: string }>(await db().execute(sql`SELECT ops_invite_user(${email}, ${name}, ${rolle}, ${loc}, ${org}) AS t`));
    token = r[0]!.t;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Einladung fehlgeschlagen." };
  }
  const link = `${appUrl()}/passwort-neu?token=${token}`;
  const mail = await sendMail({
    to: email, subject: "TDD-Verwaltung – Ihr Zugang",
    text: `Guten Tag ${name},\n\nfür Sie wurde ein Zugang zur TDD-Verwaltung angelegt (Rolle ${rolle}).\nBitte legen Sie innerhalb von 72 Stunden Ihr Passwort fest:\n${link}\n\nDanach melden Sie sich unter ${appUrl()}/login an.\n\nFreundliche Grüße\nTischlein deck dich Vorarlberg`,
  });
  await audit({ akteur: ops.email, action: "user.invite", entityType: "user", entityId: email, after: { rolle, loc, org, mail: mail.sent } });
  revalidatePath("/benutzer");
  return mail.sent
    ? { info: `Einladung an ${email} verschickt.` }
    : { info: `Konto angelegt, Mail konnte nicht gesendet werden (${mail.info ?? "SMTP"}). Link zum Weitergeben:`, link };
}

export async function passwortLink(_prev: BenutzerState, fd: FormData): Promise<BenutzerState> {
  const ops = await requireOps();
  const id = String(fd.get("userId") ?? "");
  const u = (await db().select({ id: users.id, email: users.email, name: users.displayName }).from(users).where(eq(users.id, id)).limit(1))[0];
  if (!u) return { error: "Benutzer nicht gefunden." };
  let token: string;
  try {
    token = rows<{ t: string }>(await db().execute(sql`SELECT ops_password_reset_token(${id}::uuid) AS t`))[0]!.t;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler." };
  }
  const link = `${appUrl()}/passwort-neu?token=${token}`;
  const mail = await sendMail({
    to: u.email, subject: "TDD-Verwaltung – Passwort neu setzen",
    text: `Guten Tag ${u.name},\n\nüber diesen Link können Sie innerhalb von 24 Stunden ein neues Passwort setzen:\n${link}\n\nFalls Sie das nicht angefordert haben, wenden Sie sich an das TDD-Büro.\n\nFreundliche Grüße\nTischlein deck dich Vorarlberg`,
  });
  await audit({ akteur: ops.email, action: "user.password_link", entityType: "user", entityId: u.id, after: { mail: mail.sent } });
  return mail.sent ? { info: `Link an ${u.email} verschickt.` } : { info: `Mail nicht gesendet (${mail.info ?? "SMTP"}). Link:`, link };
}

/** Registrierung einer Gemeinde/Institution freigeben (Konto aktivieren + Mail). */
export async function registrierungFreigeben(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = String(fd.get("userId") ?? "");
  const u = (await db().select({ email: users.email, name: users.displayName, active: users.isActive }).from(users).where(eq(users.id, id)).limit(1))[0];
  if (!u || u.active) return;
  await db().update(users).set({ isActive: true }).where(eq(users.id, id));
  await sendMail({ to: u.email, subject: "TDD-Verwaltung – Zugang freigegeben", text: `Guten Tag ${u.name},\n\nIhr Zugang zum Antragsportal wurde freigegeben. Sie können sich jetzt anmelden:\n${appUrl()}/login\n\nFreundliche Grüße\nTischlein deck dich Vorarlberg` });
  await audit({ akteur: ops.email, action: "user.approve", entityType: "user", entityId: id });
  revalidatePath("/benutzer");
}
/** Registrierung ablehnen: das nie aktivierte Konto wird entfernt. */
export async function registrierungAblehnen(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = String(fd.get("userId") ?? "");
  const u = (await db().select({ active: users.isActive, verified: users.emailVerified }).from(users).where(eq(users.id, id)).limit(1))[0];
  if (!u || u.active) return;
  await db().execute(sql`SELECT ops_reject_registration(${id}::uuid)`);
  await audit({ akteur: ops.email, action: "user.reject", entityType: "user", entityId: id });
  revalidatePath("/benutzer");
}

export async function rolleSetzen(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = String(fd.get("userId") ?? "");
  const rolle = String(fd.get("role") ?? "");
  if (!(ROLLEN as readonly string[]).includes(rolle)) return;
  await db().update(users).set({ role: rolle }).where(eq(users.id, id));
  await audit({ akteur: ops.email, action: "user.role", entityType: "user", entityId: id, after: { rolle } });
  revalidatePath("/benutzer");
}

export async function aktivSchalten(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = String(fd.get("userId") ?? "");
  const an = String(fd.get("aktiv") ?? "") === "1";
  await db().update(users).set({ isActive: an }).where(eq(users.id, id));
  await audit({ akteur: ops.email, action: an ? "user.activate" : "user.deactivate", entityType: "user", entityId: id });
  revalidatePath("/benutzer");
}

/** Login-Sperre (5 Fehlversuche) vorzeitig aufheben. */
export async function entsperren(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = String(fd.get("userId") ?? "");
  await db().update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, id));
  await audit({ akteur: ops.email, action: "user.unlock", entityType: "user", entityId: id });
  revalidatePath("/benutzer");
}

export async function zfaZuruecksetzen(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = String(fd.get("userId") ?? "");
  await db().execute(sql`SELECT ops_reset_totp(${id}::uuid)`);
  await audit({ akteur: ops.email, action: "user.totp_reset", entityType: "user", entityId: id });
  revalidatePath("/benutzer");
}
