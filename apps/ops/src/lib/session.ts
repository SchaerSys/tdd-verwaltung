/** Signiertes Cookie (HMAC-SHA256), Geheimnis OPS_SESSION_SECRET – getrennt von der Fach-App. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_MAX_AGE } from "./constants";

export interface SessionData { uid: string; exp: number }
export interface PreAuthData { uid: string }

function secret(): string {
  const s = process.env.OPS_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("OPS_SESSION_SECRET fehlt oder ist zu kurz");
  return s;
}

export function signToken<T extends object>(data: T, maxAgeSeconds: number): string {
  const payload = { ...data, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
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

export const signSession = (uid: string) => signToken<Omit<SessionData, "exp">>({ uid }, SESSION_MAX_AGE);
export const verifySession = (t: string | undefined) => verifyToken<Omit<SessionData, "exp">>(t);
