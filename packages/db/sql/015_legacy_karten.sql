-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 015_legacy_karten.sql · Alt-Kartennummern
--  Alte Karten (Barcode = Familien-ID 6-stellig, z. B. „006732") bleiben
--  scannbar. Flag „legacy" markiert sie; beim Scan wird automatisch eine
--  neue EAN-Karte am hinterlegten Ort erstellt und die Alt-Karte ersetzt.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE cards ADD COLUMN IF NOT EXISTS legacy boolean NOT NULL DEFAULT false;
