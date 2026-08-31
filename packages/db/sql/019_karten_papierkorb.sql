-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 019_karten_papierkorb.sql · Karten-Papierkorb (Soft-Delete)
--  Karten, die >6 Monate nicht mehr aktiv sind, werden automatisch in den
--  Papierkorb verschoben (deleted_at gesetzt) — NICHT hart gelöscht.
--  Endgültiges Löschen passiert nur manuell im Papierkorb.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE cards ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS trash_reason text;
CREATE INDEX IF NOT EXISTS idx_cards_deleted ON cards (deleted_at);

-- Statistik-View: aktive Karten dürfen keine Papierkorb-Karten mitzählen.
CREATE OR REPLACE VIEW v_stats_by_location AS
SELECT
  l.id   AS location_id,
  l.name AS location_name,
  l.type AS location_type,
  (SELECT count(*) FROM person_location_assignments a
     JOIN persons p ON p.id = a.person_id
     WHERE a.location_id = l.id AND a.is_active
       AND p.status = 'AKTIV' AND p.deleted_at IS NULL) AS active_persons,
  (SELECT count(*) FROM cards c
     WHERE c.location_id = l.id AND c.status = 'AKTIV' AND c.deleted_at IS NULL) AS active_cards
FROM locations l;
