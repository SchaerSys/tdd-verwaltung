import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Healthcheck der Wartungsplattform (Compose). Prueft nur die eigene DB-Verbindung. */
export async function GET(): Promise<Response> {
  const t = Date.now();
  try {
    await (await db()).execute(sql`SELECT 1`);
    return Response.json({ ok: true, db: "up", ms: Date.now() - t, version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" });
  } catch (e) {
    return Response.json({ ok: false, db: "down", error: e instanceof Error ? e.message : "Fehler" }, { status: 503 });
  }
}
