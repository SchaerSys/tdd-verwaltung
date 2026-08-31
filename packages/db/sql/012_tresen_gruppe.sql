-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 012_tresen_gruppe.sql · Ort/Gruppe/Nummer + Gruppengröße
--  - persons.ausgabe_number = laufende Nummer je Ausgabestelle (= Familien-Nummer)
--  - locations.group_size    = wie viele Personen je Gruppe (Test-Default 20)
--  Gruppe wird abgeleitet: ceil(ausgabe_number / group_size).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE locations ADD COLUMN IF NOT EXISTS group_size int NOT NULL DEFAULT 20;
ALTER TABLE persons  ADD COLUMN IF NOT EXISTS ausgabe_number int;

-- Backfill: bestehende Personen je aktivem Bezugsort fortlaufend nummerieren
-- (stabil nach Anlagedatum). Nur wo noch keine Nummer vergeben ist.
WITH ranked AS (
  SELECT p.id,
         row_number() OVER (PARTITION BY pla.location_id ORDER BY p.created_at, p.id) AS rn
  FROM persons p
  JOIN person_location_assignments pla ON pla.person_id = p.id AND pla.is_active
  WHERE p.deleted_at IS NULL AND p.ausgabe_number IS NULL
)
UPDATE persons SET ausgabe_number = ranked.rn
FROM ranked WHERE persons.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_persons_ausgabe_number ON persons (ausgabe_number);
