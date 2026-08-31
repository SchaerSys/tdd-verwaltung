-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 020_personen_papierkorb.sql · Personen-Archiv (Papierkorb)
--  Gelöschte Personen werden NICHT sofort hart gelöscht, sondern archiviert
--  (deleted_at gesetzt). Wegen Aufbewahrungspflicht bleibt der Datensatz bis
--  retention_until erhalten; erst danach ist endgültiges Löschen erlaubt.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE persons ADD COLUMN IF NOT EXISTS delete_reason text;
CREATE INDEX IF NOT EXISTS idx_persons_deleted ON persons (deleted_at);

-- Aufbewahrungsregel für Personen (falls in einer frischen DB noch nicht geseedet).
INSERT INTO retention_rules (entity_type, retention_period, legal_basis) VALUES
  ('person', interval '3 years', 'Standard: 3 Jahre nach letzter Aktivität')
ON CONFLICT (entity_type) DO NOTHING;
