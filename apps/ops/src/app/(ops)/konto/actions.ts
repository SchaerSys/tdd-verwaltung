"use server";

import { eq } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import { opsUsers as users } from "@tdd/db";
import { db } from "@/lib/db";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { getCurrentOps as getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export interface PwState { ok: boolean; error?: string }

/** Selbst-Service: eigenes Passwort ändern (verlangt das aktuelle Passwort). */
export async function changePassword(_prev: PwState, formData: FormData): Promise<PwState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Das neue Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.` };
  if (next !== confirm) return { ok: false, error: "Die neuen Passwörter stimmen nicht überein." };
  if (next === current) return { ok: false, error: "Das neue Passwort muss sich vom bisherigen unterscheiden." };

  const rows = await db().select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  const h = rows[0]?.hash;
  if (!h) return { ok: false, error: "Konto nicht gefunden." };

  const ok = await verify(h, current).catch(() => false);
  if (!ok) return { ok: false, error: "Das aktuelle Passwort ist nicht korrekt." };

  await db().update(users).set({ passwordHash: await hash(next) }).where(eq(users.id, user.id));
  await audit({ akteur: user.email, action: "user.password_change", entityType: "ops_user", entityId: user.id });
  return { ok: true };
}

// ── Zweiter Faktor (TOTP) ─────────────────────────────────────────────────

export interface TotpSetup { secret: string; otpauth: string; qrDataUrl: string }
export interface TotpState { ok: boolean; error?: string; recoveryCodes?: string[] }

/**
 * Schritt 1: neues Geheimnis erzeugen und als "noch nicht bestaetigt" speichern.
 * Aktiv wird der Faktor erst, wenn ein Code aus der App stimmt (confirmTotp).
 * Ein bereits aktiver Faktor wird hier nicht angefasst.
 */
export async function startTotpSetup(): Promise<TotpSetup | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (user.totpEnabled) return { error: "Der zweite Faktor ist bereits aktiv." };

  const { generateSecret, otpauthUrl } = await import("@tdd/core/totp");
  const QR = (await import("qrcode")).default;
  const secret = generateSecret();
  const otpauth = otpauthUrl(secret, user.email, "TDD-Wartung");
  // PNG als Data-URL fuer ein <img>: kein innerHTML, keine Angriffsflaeche.
  const qrDataUrl = await QR.toDataURL(otpauth, { margin: 1, width: 220 });
  await db().update(users).set({ totpSecret: secret, totpEnabled: false }).where(eq(users.id, user.id));
  return { secret, otpauth, qrDataUrl };
}

/** Schritt 2: Code aus der App bestaetigt das Geheimnis, Wiederherstellungscodes werden einmalig gezeigt. */
export async function confirmTotp(_prev: TotpState, formData: FormData): Promise<TotpState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  const { verifyTotp, generateRecoveryCodes, hashRecoveryCode } = await import("@tdd/core/totp");

  const rows = await db().select({ secret: users.totpSecret, enabled: users.totpEnabled }).from(users).where(eq(users.id, user.id)).limit(1);
  const u = rows[0];
  if (!u?.secret || u.enabled) return { ok: false, error: "Bitte die Einrichtung zuerst starten." };

  const fenster = verifyTotp(u.secret, String(formData.get("code") ?? ""));
  if (fenster === null) return { ok: false, error: "Der Code stimmt nicht. Prüfen Sie die Uhrzeit des Geräts und versuchen Sie es erneut." };

  const codes = generateRecoveryCodes();
  await db().update(users).set({
    totpEnabled: true, totpLastWindow: fenster, totpRecovery: codes.map(hashRecoveryCode),
  }).where(eq(users.id, user.id));
  await audit({ akteur: user.email, action: "user.2fa.enabled", entityType: "ops_user", entityId: user.id });
  return { ok: true, recoveryCodes: codes };
}

/** Abschalten verlangt einen gueltigen Code, damit es niemand mit einer offenen Sitzung tun kann. */
export async function disableTotp(_prev: TotpState, formData: FormData): Promise<TotpState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };
  const { verifyTotp } = await import("@tdd/core/totp");

  const rows = await db().select({ secret: users.totpSecret, enabled: users.totpEnabled }).from(users).where(eq(users.id, user.id)).limit(1);
  const u = rows[0];
  if (!u?.secret || !u.enabled) return { ok: false, error: "Der zweite Faktor ist nicht aktiv." };
  if (verifyTotp(u.secret, String(formData.get("code") ?? "")) === null) return { ok: false, error: "Der Code stimmt nicht." };

  await db().update(users).set({ totpEnabled: false, totpSecret: null, totpRecovery: [], totpLastWindow: null }).where(eq(users.id, user.id));
  await audit({ akteur: user.email, action: "user.2fa.disabled", entityType: "ops_user", entityId: user.id });
  return { ok: true };
}
