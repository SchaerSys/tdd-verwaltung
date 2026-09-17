import { cookies } from "next/headers";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { verify } from "@node-rs/argon2";
import { users, organizations, staff, tenants, currentTenantId, istTenantId, runWithTenant } from "@tdd/db";
import { db } from "./db";
import { audit } from "./audit";
import { verifySession, signSession, signToken, verifyToken, SESSION_COOKIE, SESSION_MAX_AGE, PRE_AUTH_COOKIE, PRE_AUTH_MAX_AGE, type PreAuthData, type AusgabeSession } from "./session";
import { verifyTotp, hashRecoveryCode } from "./totp";
import type { Role } from "./rbac";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  locationId: number | null;
  organizationId: number | null;
  organizationType: string | null;
  organizationName: string | null;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  /** Ausgabe-Sitzung (Station oder Buero): Standort und handelnde Person kommen aus der Sitzung. */
  sitzungId: string | null;
  staffId: string | null;
  /** Mandant (Unternehmen) des Kontos. */
  tenantId: string;
}

async function loadUser(where: ReturnType<typeof eq>): Promise<CurrentUser | null> {
  const rows = await db()
    .select({
      id: users.id, email: users.email, displayName: users.displayName, role: users.role,
      locationId: users.locationId, isActive: users.isActive, organizationId: users.organizationId,
      orgType: organizations.type, orgName: organizations.name, totpEnabled: users.totpEnabled, mustChangePassword: users.mustChangePassword,
      tenantId: users.tenantId,
    })
    .from(users)
    .leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(where)
    .limit(1);
  const u = rows[0];
  if (!u || !u.isActive) return null;
  return {
    id: u.id, email: u.email, displayName: u.displayName, role: u.role as Role,
    locationId: u.locationId ?? null, organizationId: u.organizationId ?? null,
    organizationType: u.orgType ?? null, organizationName: u.orgName ?? null,
    totpEnabled: u.totpEnabled, mustChangePassword: u.mustChangePassword, sitzungId: null, staffId: null,
    tenantId: u.tenantId ?? currentTenantId(),
  };
}

/** Liest den angemeldeten Benutzer aus dem Session-Cookie (oder null). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const u = await loadUser(eq(users.id, session.uid));
  if (!u) return null;
  // Ausgabe-Sitzung: Standort und Name aus der Sitzung, nicht vom Konto
  if (session.az) return { ...u, locationId: session.az.loc, displayName: session.az.name, sitzungId: session.az.s, staffId: session.az.st ?? null };
  return u;
}

/** Ausgabe-Sitzung aus dem Cookie (fuer Audit und Station). */
export async function ausgabeSession(): Promise<AusgabeSession | null> {
  try {
    const store = await cookies();
    return verifySession(store.get(SESSION_COOKIE)?.value)?.az ?? null;
  } catch { return null; }
}

/**
 * Session mit Ausgabe-Sitzung setzen (Station: technisches Konto; Buero: eigenes Konto) bzw. die
 * Sitzung wieder aus der Session nehmen (az = null).
 */
export async function sessionMitAusgabe(uid: string, role: string, orgId: number | null, az: AusgabeSession | null): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession({ uid, role, orgId, tenantId: currentTenantId(), az }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
}

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Prüft E-Mail/Passwort (und optional die gewählte Organisation) und setzt die Session.
 * Nach MAX_ATTEMPTS Fehlversuchen wird das Konto LOCK_MINUTES lang gesperrt.
 * Die Rückmeldung nach außen bleibt immer generisch (keine Konto-Aufzählung).
 */
export interface LoginResult { user: CurrentUser | null; needsSecondFactor: boolean; }

export async function login(email: string, password: string, orgId?: number | null): Promise<LoginResult | null> {
  // Anmeldename: E-Mail oder Benutzername (vorname.nachname), beides klein geschrieben.
  const name = email.trim().toLowerCase();
  const rows = await db().select().from(users).where(name.includes("@") ? eq(users.email, name) : eq(users.username, name)).limit(1);
  const u = rows[0];
  if (!u) {
    // Konto in einem anderen Mandanten (Anmeldung ueber den Host eines anderen Unternehmens
    // oder ohne eigenen Host)? Die DB nennt den Mandanten, die Anmeldung laeuft dann dort (055).
    const fremd = await mandantDesKontos(name);
    // Die auf der Login-Seite gewaehlte Organisation stammt aus dem Host-Mandanten und ist dort bedeutungslos;
    // die Session bekommt ohnehin die Organisation des Kontos.
    if (fremd && fremd !== currentTenantId()) return runWithTenant(fremd, () => login(email, password, null));
    return null;
  }
  if (!u.isActive) return null;
  // Deaktivierter Mandant (Wartungsplattform): keine Anmeldung mehr
  if (!(await db().select({ a: tenants.isActive }).from(tenants).where(eq(tenants.id, u.tenantId)).limit(1))[0]?.a) return null;

  // Ausgetreten (Austritt am Personal-Datensatz liegt in der Vergangenheit)? Kein Login mehr, Konto sperren.
  const ausgetreten = (await db().select({ id: staff.id }).from(staff)
    .where(and(eq(staff.userId, u.id), isNotNull(staff.employmentEnd), lt(staff.employmentEnd, new Date().toISOString().slice(0, 10)))).limit(1))[0];
  if (ausgetreten) {
    await db().update(users).set({ isActive: false, deaktiviertGrund: "AUSTRITT", deaktiviertAt: new Date() }).where(eq(users.id, u.id));
    await audit({ actorUserId: u.id, action: "login.austritt", entityType: "user", entityId: u.id });
    return null;
  }

  // Gesperrt? Dann gar nicht erst prüfen (kostet auch keine argon2-Zeit).
  if (u.lockedUntil && u.lockedUntil > new Date()) return null;

  // Gewählte Organisation muss zur Person gehören (verhindert falschen Org-Kontext)
  if (orgId != null && u.organizationId !== orgId) return null;

  const ok = await verify(u.passwordHash, password).catch(() => false);
  if (!ok) {
    const attempts = u.failedAttempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await db().update(users).set({
      failedAttempts: locked ? 0 : attempts, // nach der Sperre wieder bei 0 zählen
      lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    }).where(eq(users.id, u.id));
    await audit({
      actorUserId: u.id, action: locked ? "login.locked" : "login.failed",
      entityType: "user", entityId: u.id, after: { attempts },
    });
    return null;
  }

  await db().update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, u.id));

  // Zweiter Faktor aktiv: noch keine Session, nur ein kurzlebiges Vor-Cookie.
  if (u.totpEnabled) {
    const store = await cookies();
    store.set(PRE_AUTH_COOKIE, signToken<PreAuthData>({ uid: u.id, orgId: u.organizationId ?? null, tenantId: u.tenantId }, PRE_AUTH_MAX_AGE), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: PRE_AUTH_MAX_AGE,
    });
    return { user: null, needsSecondFactor: true };
  }

  await startSession(u.id, u.role, u.organizationId ?? null, u.tenantId);
  return { user: await loadUser(eq(users.id, u.id)), needsSecondFactor: false };
}

/** Mandant eines Kontos ueber E-Mail (global eindeutig) oder eindeutigen Benutzernamen – DB-Funktion, umgeht RLS nur dafuer. */
async function mandantDesKontos(name: string): Promise<string | null> {
  const r = await db().execute(sql`SELECT tenant_fuer_login(${name}) AS t`);
  const t = (r as unknown as { t: string | null }[])[0]?.t;
  return istTenantId(t) ? t.toLowerCase() : null;
}

/** Setzt das Session-Cookie und merkt den Login. */
async function startSession(uid: string, role: string, orgId: number | null, tenantId?: string | null): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession({ uid, role, orgId, tenantId: tenantId ?? currentTenantId() }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  store.delete(PRE_AUTH_COOKIE);
  await db().update(users).set({ lastLogin: new Date() }).where(eq(users.id, uid));
}

/**
 * Zweiter Schritt der Anmeldung: Einmalcode aus der App oder ein Wiederherstellungscode.
 * Braucht das Vor-Cookie aus login(). Jeder Code gilt nur einmal.
 */
export async function completeSecondFactor(code: string): Promise<CurrentUser | null> {
  const store = await cookies();
  const pre = verifyToken<PreAuthData>(store.get(PRE_AUTH_COOKIE)?.value);
  if (!pre) return null;
  // Der zweite Schritt muss im Mandanten des Kontos laufen (Anmeldung ohne passenden Host, 055)
  if (pre.tenantId && istTenantId(pre.tenantId) && pre.tenantId.toLowerCase() !== currentTenantId()) {
    return runWithTenant(pre.tenantId, () => completeSecondFactor(code));
  }
  const rows = await db().select().from(users).where(eq(users.id, pre.uid)).limit(1);
  const u = rows[0];
  if (!u || !u.isActive || !u.totpEnabled || !u.totpSecret) return null;

  const eingabe = code.trim();
  const fenster = verifyTotp(u.totpSecret, eingabe);
  if (fenster !== null) {
    // Dasselbe Zeitfenster darf nicht zweimal verwendet werden (Mitlesen am Bildschirm).
    if (u.totpLastWindow != null && fenster <= u.totpLastWindow) {
      await audit({ actorUserId: u.id, action: "login.2fa.replay", entityType: "user", entityId: u.id });
      return null;
    }
    await db().update(users).set({ totpLastWindow: fenster }).where(eq(users.id, u.id));
  } else {
    // Wiederherstellungscode? Einmal gueltig, wird danach entfernt.
    const hash = hashRecoveryCode(eingabe);
    if (!u.totpRecovery.includes(hash)) {
      await audit({ actorUserId: u.id, action: "login.2fa.failed", entityType: "user", entityId: u.id });
      return null;
    }
    await db().update(users).set({ totpRecovery: u.totpRecovery.filter((h) => h !== hash) }).where(eq(users.id, u.id));
    await audit({ actorUserId: u.id, action: "login.2fa.recovery", entityType: "user", entityId: u.id,
      after: { verbleibend: u.totpRecovery.length - 1 } });
  }

  await startSession(u.id, u.role, u.organizationId ?? null, u.tenantId);
  return loadUser(eq(users.id, u.id));
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Landeseite nach dem Login je nach Rolle. */
export function landingFor(role: Role, mustChangePassword = false): string {
  if (mustChangePassword) return "/passwort-aendern"; // Initialpasswort: zuerst eigenes Passwort setzen
  if (role === "SACHBEARBEITER") return "/portal"; // Antragsportal (Gemeinde/Institution)
  if (role === "AUSGABE") return "/kiosk";           // Zivildiener: nur Tresen-Kiosk
  if (role === "FAHRER") return "/fahrt";            // Fahrer: Tour des Tages am Handy
  if (role === "MITARBEITER") return "/mein";        // Selbstservice: eigene Zeiten und Urlaub
  return "/dashboard";
}
