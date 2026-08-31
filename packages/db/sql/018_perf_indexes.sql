-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 018_perf_indexes.sql · Performance-Indizes
--  Fehlende Indizes auf location_id (wurden pro Ort seq-gescannt).
-- ════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_pla_location ON person_location_assignments (location_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cards_location ON cards (location_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards (status);
CREATE INDEX IF NOT EXISTS idx_persons_lastname ON persons (last_name);
ANALYZE person_location_assignments;
ANALYZE cards;
ANALYZE persons;
