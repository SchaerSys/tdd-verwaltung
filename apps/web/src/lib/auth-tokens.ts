import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { authTokens } from "@tdd/db";
import { db } from "./db";

export type TokenType = "RESET" | "VERIFY";

function sha256(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

/** Erzeugt ein Einmal-Token (roher Wert für den E-Mail-Link; DB speichert nur den Hash). */
export async function createAuthToken(userId: string, type: TokenType, ttlMinutes: number): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await db().insert(authTokens).values({ userId, type, tokenHash: sha256(raw), expiresAt });
  return raw;
}

/** Prüft & verbraucht ein Token; liefert die userId oder null. */
export async function consumeAuthToken(raw: string, type: TokenType): Promise<string | null> {
  if (!raw) return null;
  const rows = await db().select().from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.type, type), isNull(authTokens.usedAt))).limit(1);
  const t = rows[0];
  if (!t || t.expiresAt < new Date()) return null;
  await db().update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
  return t.userId;
}

/** Basis-URL für Links in E-Mails. */
export function appUrl(): string {
  return process.env.APP_URL || (process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : "http://localhost:3080");
}
