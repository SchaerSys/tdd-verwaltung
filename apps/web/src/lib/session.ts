/**
 * Minimalistische, abhängigkeitsfreie Session: signiertes Cookie (HMAC-SHA256).
 * Kein Fremd-Paket; Geheimnis aus SESSION_SECRET.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "./constants";

const MAX_AGE = SESSION_MAX_AGE;

export interface SessionData {
  uid: string;
  role: string;
  orgId?: number | null;
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

export function signSession(data: Omit<SessionData, "exp">): string {
  const payload: SessionData = { ...data, exp: Math.floor(Date.now() / 1000) + MAX_AGE };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): SessionData | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionData;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export { SESSION_COOKIE, SESSION_MAX_AGE } from "./constants";
