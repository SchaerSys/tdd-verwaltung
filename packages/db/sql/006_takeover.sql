-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 006_takeover.sql · Aktive Übernahme + Herkunft (ADDITIV)
-- ════════════════════════════════════════════════════════════════════════

-- Übergebene Person wartet auf aktive Übernahme durch TDD (Karte erst bei Vor-Ort-Besuch)
ALTER TABLE persons ADD COLUMN IF NOT EXISTS takeover_pending boolean NOT NULL DEFAULT false;
-- Herkunftsorganisation (für Auswertungen nach Gemeinde/Institution) – denormalisiert,
-- damit TDD-Reporting NICHT auf die RLS-geschützten Anträge zugreifen muss.
ALTER TABLE persons ADD COLUMN IF NOT EXISTS source_organization_id integer REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_persons_source_org ON persons (source_organization_id);
