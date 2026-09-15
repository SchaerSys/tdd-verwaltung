import { describe, expect, test } from "vitest";
import { backupBewertung, parseBackupZeile } from "@/lib/backup-log";

describe("Backup-Log", () => {
  test("parst OK-Zeile mit Groessen", () => {
    const e = parseBackupZeile("[backup 2026-09-15_03:00:03] OK  db=779K  uploads=56K");
    expect(e?.ok).toBe(true);
    expect(e?.zeit.toISOString()).toBe("2026-09-15T03:00:03.000Z");
    expect(e?.text).toContain("db=779K");
  });
  test("Fehlerzeile und Muell", () => {
    expect(parseBackupZeile("[backup 2026-09-14_03:00:02] FEHLER: rsync exit 255")?.ok).toBe(false);
    expect(parseBackupZeile("irgendwas")).toBeNull();
    expect(parseBackupZeile("")).toBeNull();
  });
  test("Bewertung: letzter gueltiger Eintrag zaehlt, Alter entscheidet", () => {
    const zeilen = ["[backup 2026-09-13_03:00:03] OK", "kaputte zeile", "[backup 2026-09-15_03:00:03] OK  db=779K"];
    const frisch = backupBewertung(zeilen, new Date("2026-09-15T20:00:00Z"));
    expect(frisch.ok).toBe(true);
    expect(frisch.veraltet).toBe(false);
    const alt = backupBewertung(zeilen, new Date("2026-09-17T20:00:00Z"));
    expect(alt.ok).toBe(false);
    expect(alt.veraltet).toBe(true);
    expect(backupBewertung([], new Date()).eintrag).toBeNull();
  });
});
