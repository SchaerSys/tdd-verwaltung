-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 022_person_consent.sql · DSGVO-Einwilligung je Person
--  consent_at = Zeitpunkt, zu dem die Einwilligung zur Datenverarbeitung
--  dokumentiert wurde. NULL = keine Einwilligung hinterlegt.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE persons ADD COLUMN IF NOT EXISTS consent_at timestamptz;
