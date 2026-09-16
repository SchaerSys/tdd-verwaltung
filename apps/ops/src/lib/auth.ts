import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { verify } from "@node-rs/argon2";
import { opsUsers } from "@tdd/db";
import { verifyTotp, hashRecoveryCode } from "@tdd/core/totp";
import { db } from "./db";
import { audit } from "./audit";
import { signSession, verifySession, signToken, verifyToken, type PreAuthData } from "./session";
import { SESSION_COOKIE, SESSION_MAX_AGE, PRE_AUTH_COOKIE, PRE_AUTH_MAX_AGE } from "./constants";

export interface OpsUser { id: string; email: string; displayName: string; totpEnabled: boolean }

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

async function load(id: string): Promise<OpsUser | null> {
  const rows = await (await db()).select({ id: opsUsers.id, email: opsUsers.email, displayName: opsUsers.displayName, totpEnabled: opsUsers.totpEnabled, isActive: opsUsers.isActive })
    .from(opsUsers).where(eq(opsUsers.id, id)).limit(1);
  const u = rows[0];
  return u && u.isActive ? { id: u.id, email: u.email, displayName: u.displayName, totpEnabled: u.totpEnabled } : null;
}

export async function getCurrentOps(): Promise<OpsUser | null> {
  const store = await cookies();
  const s = verifySession(store.get(SESSION_COOKIE)?.value);
  return s ? load(s.uid) : null;
}

function cookieOpts(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge };
}

/** Wie in der Fach-App: Sperre nach 5 Fehlversuchen, generische Rueckmeldung, 2FA per Vor-Cookie. */
export async function login(email: string, password: string): Promise<{ ok: boolean; needsSecondFactor: boolean }> {
  const rows = await (await db()).select().from(opsUsers).where(eq(opsUsers.email, email.toLowerCase().trim())).limit(1);
  const u = rows[0];
  if (!u || !u.isActive) return { ok: false, needsSecondFactor: false };
  if (u.lockedUntil && u.lockedUntil > new Date()) return { ok: false, needsSecondFactor: false };

  const ok = await verify(u.passwordHash, password).catch(() => false);
  if (!ok) {
    const attempts = u.failedAttempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await (await db()).update(opsUsers).set({ failedAttempts: locked ? 0 : attempts, lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null }).where(eq(opsUsers.id, u.id));
    await audit({ akteur: u.email, action: locked ? "login.locked" : "login.failed", entityType: "ops_user", entityId: u.id });
    return { ok: false, needsSecondFactor: false };
  }
  await (await db()).update(opsUsers).set({ failedAttempts: 0, lockedUntil: null }).where(eq(opsUsers.id, u.id));

  const store = await cookies();
  if (u.totpEnabled) {
    store.set(PRE_AUTH_COOKIE, signToken<PreAuthData>({ uid: u.id }, PRE_AUTH_MAX_AGE), cookieOpts(PRE_AUTH_MAX_AGE));
    return { ok: true, needsSecondFactor: true };
  }
  await startSession(u.id);
  await audit({ akteur: u.email, action: "login", entityType: "ops_user", entityId: u.id });
  return { ok: true, needsSecondFactor: false };
}

async function startSession(uid: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(uid), cookieOpts(SESSION_MAX_AGE));
  store.delete(PRE_AUTH_COOKIE);
  await (await db()).update(opsUsers).set({ lastLogin: new Date() }).where(eq(opsUsers.id, uid));
}

export async function completeSecondFactor(code: string): Promise<boolean> {
  const store = await cookies();
  const pre = verifyToken<PreAuthData>(store.get(PRE_AUTH_COOKIE)?.value);
  if (!pre) return false;
  const rows = await (await db()).select().from(opsUsers).where(eq(opsUsers.id, pre.uid)).limit(1);
  const u = rows[0];
  if (!u || !u.isActive || !u.totpEnabled || !u.totpSecret) return false;

  const eingabe = code.trim();
  const fenster = verifyTotp(u.totpSecret, eingabe);
  if (fenster !== null) {
    if (u.totpLastWindow != null && fenster <= u.totpLastWindow) {
      await audit({ akteur: u.email, action: "login.2fa.replay", entityType: "ops_user", entityId: u.id });
      return false;
    }
    await (await db()).update(opsUsers).set({ totpLastWindow: fenster }).where(eq(opsUsers.id, u.id));
  } else {
    const hash = hashRecoveryCode(eingabe);
    if (!u.totpRecovery.includes(hash)) {
      await audit({ akteur: u.email, action: "login.2fa.failed", entityType: "ops_user", entityId: u.id });
      return false;
    }
    await (await db()).update(opsUsers).set({ totpRecovery: u.totpRecovery.filter((h) => h !== hash) }).where(eq(opsUsers.id, u.id));
    await audit({ akteur: u.email, action: "login.2fa.recovery", entityType: "ops_user", entityId: u.id });
  }
  await startSession(u.id);
  await audit({ akteur: u.email, action: "login", entityType: "ops_user", entityId: u.id });
  return true;
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(PRE_AUTH_COOKIE);
}

/** Fuer Server Actions: wirft, wenn niemand angemeldet ist. */
export async function requireOps(): Promise<OpsUser> {
  const u = await getCurrentOps();
  if (!u) throw new Error("Nicht angemeldet");
  return u;
}
