import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/Readiness: DB erreichbar? Keine Fachdaten, kein Token nötig. */
export async function GET() {
  const started = Date.now();
  try {
    await db().execute(sql`SELECT 1`);
    return Response.json(
      { ok: true, db: "up", ms: Date.now() - started, version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
