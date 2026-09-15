-- ════════════════════════════════════════════════════════════════════════
--  036_tour_freigabe.sql · Tour an den Fahrer senden
--  Dario 15.09.: "die Tourenplanung muss ans Tablet des Fahrers gesendet werden
--  koennen ... die Route ist vorgegeben, er muss nur noch Start druecken."
--  Freigabe = Zeitstempel; Fahrer:innen sehen am Handy nur freigegebene Touren.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE touren ADD COLUMN IF NOT EXISTS freigegeben_at timestamptz;
ALTER TABLE touren ADD COLUMN IF NOT EXISTS freigegeben_by uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_touren_freigabe ON touren (datum) WHERE freigegeben_at IS NOT NULL;
