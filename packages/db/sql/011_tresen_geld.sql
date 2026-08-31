-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 011_tresen_geld.sql · Tresen: "zu zahlen" + Schulden
--  - Preiskonfiguration je Ausgabestelle (pro Erwachsene/Kinder)
--  - Beträge je Ausgabe (fällig / bezahlt) → Schuldensaldo je Person
--    Saldo(Person) = SUM(amount_paid) - SUM(amount_due)  (negativ = Schulden)
-- ════════════════════════════════════════════════════════════════════════

-- Preisregel pro Ort. Default 2,00 € je Erwachsener, 0 € je Kind (wie Alt-System).
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS price_adult numeric(6,2) NOT NULL DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS price_child numeric(6,2) NOT NULL DEFAULT 0.00;

-- Beträge je Ausgabe. Historische Zeilen bleiben NULL (nicht rückwirkend berechnet).
ALTER TABLE distributions
  ADD COLUMN IF NOT EXISTS amount_due  numeric(6,2),
  ADD COLUMN IF NOT EXISTS amount_paid numeric(6,2);

-- Schneller Saldo/Anwesenheits-Zugriff je Person.
CREATE INDEX IF NOT EXISTS idx_distributions_person_time
  ON distributions (person_id, distributed_at DESC);
