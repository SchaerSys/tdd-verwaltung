import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireJobToken } from "@/lib/job-auth";
import { purgePersons, deleteFiles } from "@/lib/purge";

/**
 * DSGVO-Löschjob (Art. 5 Abs 1 lit e – Speicherbegrenzung). Täglich per Cron:
 *   curl -H "Authorization: Bearer $JOB_TOKEN" http://127.0.0.1:3080/api/jobs/retention
 *
 * 1) Rohscans, deren Aufbewahrungsfrist (90 Tage) abgelaufen ist – Zeile UND Datei.
 * 2) Archivierte Personen, deren Frist (3 Jahre) abgelaufen ist – vollständig.
 *
 * Bekannte Lücke: antrag_documents steht unter RLS und wird hier noch nicht
 * erfasst; das kommt mit einer SECURITY-DEFINER-Funktion in S3-5.
 */
export async function GET(req: Request) {
  const denied = requireJobToken(req);
  if (denied) return denied;

  // 1) Abgelaufene Rohscans (auch solche ohne Personenbezug)
  const scans = await db().execute(sql`
    DELETE FROM scan_documents
    WHERE retention_until IS NOT NULL AND retention_until <= current_date
    RETURNING file_ref`);
  const scanRefs = (scans as unknown as { file_ref: string }[]).map((s) => s.file_ref);
  const scanFiles = await deleteFiles(scanRefs);

  // 2) Archivierte Personen nach Ablauf der Aufbewahrungsfrist
  const purged = await purgePersons(sql`IN (
    SELECT id FROM persons
    WHERE deleted_at IS NOT NULL
      AND retention_until IS NOT NULL
      AND retention_until <= current_date)`);

  const result = { scans: scanRefs.length, scanFiles, persons: purged.persons, personFiles: purged.files };
  await audit({ action: "job.retention", entityType: "job", after: result });
  return Response.json(result);
}
