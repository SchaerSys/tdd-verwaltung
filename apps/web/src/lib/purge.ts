import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Entfernt Personen (Selektor auf persons.id) samt referenzierender Daten in
 * Abhängigkeitsreihenfolge – und löscht die zugehörigen Scan-DATEIEN von der Platte.
 * Anträge bleiben als Org-Akte erhalten, nur der Personenbezug wird gelöst.
 *
 * Vorher löschte der Papierkorb nur die Datenbankzeilen der Scans; die Dateien
 * blieben als verwaiste PII im Volume liegen.
 */
export async function purgePersons(idSel: ReturnType<typeof sql>): Promise<{ persons: number; files: number }> {
  const refs = await db().transaction(async (tx) => {
    await tx.execute(sql`UPDATE antraege SET transferred_person_id = NULL WHERE transferred_person_id ${idSel}`);
    await tx.execute(sql`DELETE FROM duplicate_decisions WHERE created_person_id ${idSel} OR matched_person_id ${idSel}`);
    const scans = await tx.execute(sql`DELETE FROM scan_documents WHERE person_id ${idSel} RETURNING file_ref`);
    await tx.execute(sql`DELETE FROM distributions WHERE person_id ${idSel}`);
    await tx.execute(sql`UPDATE cards SET predecessor_card_id = NULL WHERE predecessor_card_id IN (SELECT id FROM cards WHERE person_id ${idSel})`);
    await tx.execute(sql`DELETE FROM cards WHERE person_id ${idSel}`);
    await tx.execute(sql`DELETE FROM person_location_assignments WHERE person_id ${idSel}`);
    const del = await tx.execute(sql`DELETE FROM persons WHERE id ${idSel} RETURNING id`);
    return {
      fileRefs: (scans as unknown as { file_ref: string }[]).map((s) => s.file_ref),
      count: (del as unknown as { id: string }[]).length,
    };
  });
  const files = await deleteFiles(refs.fileRefs);
  return { persons: refs.count, files };
}

/** Löscht Dateien unterhalb von STORAGE_DIR. Fehlende Dateien sind kein Fehler. */
export async function deleteFiles(fileRefs: string[]): Promise<number> {
  const base = process.env.STORAGE_DIR ?? "./data/uploads";
  let n = 0;
  for (const ref of fileRefs) {
    if (!ref || ref.includes("..")) continue; // Pfad-Sicherheit wie in den Datei-Routen
    try {
      await unlink(join(base, ref));
      n++;
    } catch {
      /* schon weg – ok */
    }
  }
  return n;
}
