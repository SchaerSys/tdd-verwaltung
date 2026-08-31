import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { verify } from "@node-rs/argon2";
import { users, organizations } from "@tdd/db";
import { db } from "./db";
import { verifySession, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "./session";
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
}

async function loadUser(where: ReturnType<typeof eq>): Promise<CurrentUser | null> {
  const rows = await db()
    .select({
      id: users.id, email: users.email, displayName: users.displayName, role: users.role,
      locationId: users.locationId, isActive: users.isActive, organizationId: users.organizationId,
      orgType: organizations.type, orgName: organizations.name,
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
  };
}

/** Liest den angemeldeten Benutzer aus dem Session-Cookie (oder null). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return loadUser(eq(users.id, session.uid));
}

/**
 * Prüft E-Mail/Passwort (und optional die gewählte Organisation) und setzt die Session.
 */
export async function login(email: string, password: string, orgId?: number | null): Promise<CurrentUser | null> {
  const rows = await db().select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  const u = rows[0];
  if (!u || !u.isActive) return null;

  // Gewählte Organisation muss zur Person gehören (verhindert falschen Org-Kontext)
  if (orgId != null && u.organizationId !== orgId) return null;

  const ok = await verify(u.passwordHash, password).catch(() => false);
  if (!ok) return null;

  const store = await cookies();
  store.set(SESSION_COOKIE, signSession({ uid: u.id, role: u.role, orgId: u.organizationId ?? null }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  await db().update(users).set({ lastLogin: new Date(), failedAttempts: 0 }).where(eq(users.id, u.id));

  return loadUser(eq(users.id, u.id));
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Landeseite nach dem Login je nach Rolle. */
export function landingFor(role: Role): string {
  if (role === "SACHBEARBEITER") return "/portal"; // Antragsportal (Gemeinde/Institution)
  if (role === "AUSGABE") return "/kiosk";           // Zivildiener: nur Tresen-Kiosk
  return "/dashboard";
}
