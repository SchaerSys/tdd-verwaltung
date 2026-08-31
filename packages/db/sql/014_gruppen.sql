-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 014_gruppen.sql · Gruppen wie Altsystem
--  - locations.group_count = feste Anzahl Gruppen je Ausgabestelle (Default 8)
--  - persons.gruppe        = zugeordnete Gruppe (1..group_count)
--  - persons.ausgabe_number bleibt = Nummer innerhalb (Ort, Gruppe)
--  Gruppe + Nummer sind vorbelegt, aber in der Verwaltung editierbar.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE locations ADD COLUMN IF NOT EXISTS group_count int NOT NULL DEFAULT 8;
ALTER TABLE persons  ADD COLUMN IF NOT EXISTS gruppe int;

-- Bestehende Personen: vorerst alle in Gruppe 1 (Nummer bleibt die bisherige
-- laufende Nummer je Ort, dort eindeutig). Können danach umverteilt werden.
UPDATE persons SET gruppe = 1 WHERE gruppe IS NULL AND ausgabe_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_persons_gruppe ON persons (gruppe);
