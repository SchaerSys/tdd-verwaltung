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
 * 4) Personalakten 7 Jahre nach Ende des Austrittsjahres (§ 132 BAO): Dokumente
 *    samt Dateien löschen, Gehalt/SV-Nummer/Geburtsdatum/Notfallkontakt leeren.
 *    Die Person bleibt (Touren-/Zeithistorie ist Betriebsdatum ohne Sensibles).
 * 5) Logins ausgetretener Mitarbeitender sperren (P1) – Grund AUSTRITT.
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

  // 4) Personalakten nach Ablauf der 7-Jahres-Frist
  const akten = await db().execute(sql`
    DELETE FROM staff_dokumente
    WHERE staff_id IN (SELECT id FROM staff WHERE employment_end IS NOT NULL
                       AND make_date(extract(year FROM employment_end)::int + 7, 12, 31) < current_date)
    RETURNING file_ref`);
  const aktenRefs = (akten as unknown as { file_ref: string }[]).map((d) => d.file_ref);
  const aktenFiles = await deleteFiles(aktenRefs);
  const bereinigt = await db().execute(sql`
    UPDATE staff SET sv_nummer = NULL, geburtsdatum = NULL, gehalt_brutto = NULL, notfall_name = NULL, notfall_tel = NULL,
                     strasse = NULL, plz = NULL, ort = NULL, staatsbuergerschaft = NULL, updated_at = now()
    WHERE employment_end IS NOT NULL
      AND make_date(extract(year FROM employment_end)::int + 7, 12, 31) < current_date
      AND (sv_nummer IS NOT NULL OR geburtsdatum IS NOT NULL OR gehalt_brutto IS NOT NULL OR notfall_name IS NOT NULL OR strasse IS NOT NULL)
    RETURNING id`);

  // 5) Ausgetretene: Login sperren
  const gesperrt = await db().execute(sql`
    UPDATE users SET is_active = false, deaktiviert_grund = 'AUSTRITT', deaktiviert_at = now()
    WHERE is_active AND id IN (SELECT user_id FROM staff WHERE user_id IS NOT NULL AND employment_end IS NOT NULL AND employment_end < current_date)
    RETURNING id`);

  const result = {
    logins: (gesperrt as unknown as { id: string }[]).length,
    scans: scanRefs.length, scanFiles,
    persons: purged.persons, personFiles: purged.files,
    docs: docRefs.length, docFiles,
    staffDocs: aktenRefs.length, staffDocFiles: aktenFiles, staffBereinigt: (bereinigt as unknown as { id: string }[]).length,
  };
  await audit({ action: "job.retention", entityType: "job", after: result });
  return Response.json(result);
}
