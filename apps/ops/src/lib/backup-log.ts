/**
 * Zeilen des Backup-Logs (scripts/backup.sh), z. B.
 *   [backup 2026-09-15_03:00:03] OK  db=779K  uploads=56K
 *   [backup 2026-09-14_03:00:02] FEHLER: rsync exit 255
 */
export interface BackupEintrag { zeit: Date; ok: boolean; text: string }

const MUSTER = /^\[backup (\d{4}-\d{2}-\d{2})_(\d{2}:\d{2}:\d{2})\]\s*(.*)$/;

export function parseBackupZeile(zeile: string): BackupEintrag | null {
  const m = MUSTER.exec(zeile.trim());
  if (!m) return null;
  const zeit = new Date(`${m[1]}T${m[2]}Z`); // Server-Cron laeuft in UTC
  if (Number.isNaN(zeit.getTime())) return null;
  return { zeit, ok: /^OK\b/.test(m[3] ?? ""), text: m[3] ?? "" };
}

/** Bewertung des letzten Eintrags: ok + nicht aelter als `maxStunden`. */
export function backupBewertung(zeilen: string[], jetzt: Date, maxStunden = 30): { eintrag: BackupEintrag | null; ok: boolean; veraltet: boolean } {
  const letzter = [...zeilen].reverse().map(parseBackupZeile).find((e) => e !== null) ?? null;
  if (!letzter) return { eintrag: null, ok: false, veraltet: true };
  const veraltet = (jetzt.getTime() - letzter.zeit.getTime()) / 36e5 > maxStunden;
  return { eintrag: letzter, ok: letzter.ok && !veraltet, veraltet };
}
