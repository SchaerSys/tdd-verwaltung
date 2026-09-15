-- ════════════════════════════════════════════════════════════════════════
--  035_karte.sql · A4 Schritt 2: Karte und Routenoptimierung
--  Standorte bekommen Adresse + Koordinaten (Start/Ziel der Touren), Touren und
--  Vorlagen merken sich Streckenlaenge und Fahrzeit aus der letzten Berechnung.
--  Routing laeuft auf dem eigenen Server (OSRM, OpenStreetMap-Auszug Vorarlberg),
--  Geocoding ueber Photon (komoot, Deutschland) – nur Betriebs-/Standortadressen.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE locations ADD COLUMN IF NOT EXISTS strasse text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS plz text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS lng double precision;

ALTER TABLE touren ADD COLUMN IF NOT EXISTS strecke_km numeric(7,1);
ALTER TABLE touren ADD COLUMN IF NOT EXISTS fahrzeit_min integer;
ALTER TABLE tour_vorlagen ADD COLUMN IF NOT EXISTS strecke_km numeric(7,1);
ALTER TABLE tour_vorlagen ADD COLUMN IF NOT EXISTS fahrzeit_min integer;

-- Ausgabestellen/Laeden: Ort ist bekannt, Strasse muss das Buero nachtragen.
UPDATE locations SET plz = CASE city
  WHEN 'Bludenz' THEN '6700' WHEN 'Dornbirn' THEN '6850' WHEN 'Feldkirch' THEN '6800'
  WHEN 'Götzis' THEN '6840' WHEN 'Goetzis' THEN '6840' WHEN 'Hard' THEN '6971' WHEN 'Bregenz' THEN '6900' ELSE plz END
WHERE plz IS NULL;

-- Start jeder Tour ist das Lager in Vandans (Dario 15.09.). Dafuer ein dritter Standorttyp.
ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_type_check;
ALTER TABLE locations ADD CONSTRAINT locations_type_check CHECK (type IN ('LADEN','AUSGABESTELLE','LAGER'));
INSERT INTO locations (name, type, city, location_code, is_active, plz)
SELECT 'Lager Vandans', 'LAGER', 'Vandans', 990, true, '6773'
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE type = 'LAGER');
-- Bestehende Vorlagen/Touren ohne Start bekommen das Lager.
UPDATE tour_vorlagen SET start_location_id = (SELECT id FROM locations WHERE type = 'LAGER' LIMIT 1) WHERE start_location_id IS NULL;
UPDATE touren SET start_location_id = (SELECT id FROM locations WHERE type = 'LAGER' LIMIT 1) WHERE start_location_id IS NULL AND status = 'GEPLANT';
