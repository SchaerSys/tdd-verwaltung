-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 017_fix_stats_view.sql · Performance-Fix
--  v_stats_by_location verband Personen UND Karten desselben Ortes ohne
--  Relation → Kreuzprodukt (bei 1300 Personen×1300 Karten = 1,7 Mio Zeilen/Ort,
--  ~4,6 s). Neu: getrennte Subqueries → Millisekunden.
-- ════════════════════════════════════════════════════════════════════════
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
     WHERE c.location_id = l.id AND c.status = 'AKTIV') AS active_cards
FROM locations l;
