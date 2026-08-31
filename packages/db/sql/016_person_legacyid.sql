-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 016_person_legacyid.sql · Alt-ID auf der Person
--  Speichert die Familien-ID aus dem Altsystem → Re-Import ist wiederholbar
--  (Deduplizierung nach echter ID statt Name) und Zuordnungen reparierbar.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE persons ADD COLUMN IF NOT EXISTS legacy_id int;
CREATE INDEX IF NOT EXISTS idx_persons_legacy_id ON persons (legacy_id);
