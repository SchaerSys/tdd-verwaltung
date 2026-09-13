import { timingSafeEqual } from "node:crypto";

/**
 * Prüft den Job-Token aus dem Authorization-Header (Bearer).
 * Bewusst kein Query-Parameter mehr: Tokens in URLs landen in Zugriffslogs.
 * Rückgabe null = erlaubt, sonst die fertige 403-Antwort.
 */
export function requireJobToken(req: Request): Response | null {
  const expected = process.env.JOB_TOKEN;
  if (!expected) return new Response("Forbidden", { status: 403 });
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Forbidden", { status: 403 });
  return null;
}
