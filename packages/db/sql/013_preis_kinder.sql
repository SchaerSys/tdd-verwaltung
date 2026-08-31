-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 013_preis_kinder.sql · Preis: Kinder kosten 1 €
--  Alt-System-Formel: e*2 + 1*k  (Erwachsene × 2 €, Kinder × 1 €).
--  Korrigiert den bisherigen Default (Kinder 0 €).
-- ════════════════════════════════════════════════════════════════════════
UPDATE locations SET price_child = 1.00 WHERE type = 'AUSGABESTELLE' AND price_child = 0;
ALTER TABLE locations ALTER COLUMN price_child SET DEFAULT 1.00;
