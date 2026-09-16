/**
 * Minimalistische, abhängigkeitsfreie Session: signiertes Cookie (HMAC-SHA256).
 * Kein Fremd-Paket; Geheimnis aus SESSION_SECRET.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_MAX_AGE } from "./constants";

const MAX_AGE = SESSION_MAX_AGE;

/** Ausgabe-Sitzung an der Station: Sitzung, handelnde Person, gewaehlter Standort, Anzeigename. */
export interface AusgabeSession { s: string; st?: string | null; loc: number; name: string }

export interface SessionData {
  uid: string;
  role: string;
  orgId?: number | null;
  /** Mandant (Unternehmen) des Kontos – Grundlage fuer den Pool-Kontext (053). */
  tenantId?: string | null;
  az?: AusgabeSession | null;
  exp: number; // Unix-Sekunden
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET fehlt oder ist zu kurz");
  return s;
}

/** Signiert beliebige Daten mit Ablauf. Basis fuer Session und Vor-Anmeldung (2FA). */
export function signToken<T extends object>(data: T, maxAgeSeconds: number): string {
  const payload = { ...data, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken<T extends object>(token: string | undefined): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function signSession(data: Omit<SessionData, "exp">): string {
  return signToken(data, MAX_AGE);
}

export function verifySession(token: string | undefined): SessionData | null {
  return verifyToken<Omit<SessionData, "exp">>(token);
}

/** Vor-Anmeldung: Passwort war richtig, der zweite Faktor fehlt noch. Fuenf Minuten. */
export const PRE_AUTH_COOKIE = "tdd_preauth";
export const PRE_AUTH_MAX_AGE = 5 * 60;
export interface PreAuthData { uid: string; orgId?: number | null; }

export { SESSION_COOKIE, SESSION_MAX_AGE } from "./constants";
