import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Papierkorb-Automatik: verschiebt Karten, die seit mehr als 6 Monaten nicht mehr
 * gültig/aktiv sind, in den Papierkorb (Soft-Delete: deleted_at gesetzt).
 * NICHT hart gelöscht – endgültiges Löschen passiert nur manuell im Papierkorb.
 * Token-geschützt (JOB_TOKEN), per täglichem Cron:
 *   curl "http://127.0.0.1:3080/api/jobs/cleanup?token=..."
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!process.env.JOB_TOKEN || token !== process.env.JOB_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  const res = await db().execute(sql`
    UPDATE cards
    SET deleted_at = now(),
        trash_reason = 'Automatik: seit >6 Monaten nicht mehr aktiv',
        updated_at = now()
    WHERE deleted_at IS NULL
      AND valid_to < current_date - interval '6 months'
    RETURNING id`);
  const moved = (res as unknown as { id: string }[]).length;

  await audit({ action: "job.card.trash", entityType: "job", after: { moved } });
  return Response.json({ moved });
}
