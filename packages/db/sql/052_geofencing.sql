-- ════════════════════════════════════════════════════════════════════════
--  052_geofencing.sql · Geofencing fuer Touren
--  Kreis um Abholstellen, Standorte und Lager (Radius je Stelle). Das Fahrzeug-Tablet meldet
--  waehrend einer Tour (Status UNTERWEGS) seine Position; der Server erkennt Ankunft/Abfahrt
--  und speichert NUR diese Ereignisse plus die jeweils letzte Position (kein Bewegungsprofil).
--  Voraussetzung: Zustimmung der fahrenden Person (§ 10 AVRAG) am Personal-Datensatz.
--  Aufbewahrung der Ereignisse einstellbar (Standard 90 Tage), letzte Position wird am
--  Tourende geloescht.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE abholstellen ADD COLUMN IF NOT EXISTS geofence_m integer NOT NULL DEFAULT 150 CHECK (geofence_m BETWEEN 30 AND 1000);
ALTER TABLE locations   ADD COLUMN IF NOT EXISTS geofence_m integer NOT NULL DEFAULT 150 CHECK (geofence_m BETWEEN 30 AND 1000);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS ortung_zustimmung_am date;          -- Zustimmung zur Fahrzeugortung liegt vor (Datum)
ALTER TABLE touren ADD COLUMN IF NOT EXISTS position_lat double precision;
ALTER TABLE touren ADD COLUMN IF NOT EXISTS position_lng double precision;
ALTER TABLE touren ADD COLUMN IF NOT EXISTS position_at timestamptz;
ALTER TABLE touren ADD COLUMN IF NOT EXISTS position_genauigkeit_m integer;
ALTER TABLE touren ADD COLUMN IF NOT EXISTS bewegung_at timestamptz;              -- letzte Position mit Bewegung (> 40 m) fuer die Stillstand-Erkennung
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS ortung_aufbewahrung_tage integer NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS tour_ereignisse (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id       uuid NOT NULL REFERENCES touren(id) ON DELETE CASCADE,
  stopp_id      uuid REFERENCES tour_stopps(id) ON DELETE SET NULL,
  art           text NOT NULL CHECK (art IN ('ANKUNFT','ABFAHRT','STILLSTAND','LAGER_ANKUNFT','LAGER_ABFAHRT')),
  stelle_typ    text CHECK (stelle_typ IS NULL OR stelle_typ IN ('ABHOLSTELLE','STANDORT')),
  stelle_id     integer,
  stelle_name   text,
  at            timestamptz NOT NULL DEFAULT now(),
  lat           double precision,
  lng           double precision,
  genauigkeit_m integer
);
CREATE INDEX IF NOT EXISTS idx_tour_ereignisse_tour ON tour_ereignisse (tour_id, at);

GRANT SELECT, INSERT, UPDATE, DELETE ON tour_ereignisse TO tdd_app;
REVOKE ALL ON tour_ereignisse FROM tdd_ops;
