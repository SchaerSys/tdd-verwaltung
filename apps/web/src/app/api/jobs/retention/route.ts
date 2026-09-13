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
 * 3) Antragsdokumente über alle Mandanten (RLS wird kontrolliert über eine
 *    SECURITY-DEFINER-Funktion umgangen, die nur file_refs zurückgibt).
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

  // 3) Antragsdokumente – Funktion statt DELETE, weil RLS den Job sonst nichts sehen ließe
  const docs = await db().execute(sql`SELECT * FROM purge_expired_antrag_documents()`);
  const docRefs = (docs as unknown as { file_ref: string }[]).map((d) => d.file_ref);
  const docFiles = await deleteFiles(docRefs);

  const result = {
    scans: scanRefs.length, scanFiles,
    persons: purged.persons, personFiles: purged.files,
    docs: docRefs.length, docFiles,
  };
  await audit({ action: "job.retention", entityType: "job", after: result });
  return Response.json(result);
}
