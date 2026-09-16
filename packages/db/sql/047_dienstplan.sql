-- ════════════════════════════════════════════════════════════════════════
--  047_dienstplan.sql · P5 Dienstplan
--  dienste: ein Dienst = Person, Tag, von/bis, Pause, Standort, Taetigkeit.
--  dienstplan_wochen: Woche (Montag) im Entwurf oder veroeffentlicht – nur veroeffentlichte
--  Wochen sehen Mitarbeitende in "Mein Bereich" (§ 19c AZG: Lage der Arbeitszeit ist zu
--  vereinbaren, Aenderungen mindestens zwei Wochen vorher mitzuteilen, ausser bei
--  unvorhersehbaren Faellen).
--  staff.dienst_standard: Standard-Dienst je ISO-Wochentag {"1":{"von":"08:00","bis":"16:30",
--  "pause":30,"location":3,"taetigkeit":"AUSGABE"}} – Vorlage zum Fuellen der Woche.
--  Betriebsdaten ohne Klientenbezug; tdd_ops braucht sie nicht.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE staff ADD COLUMN IF NOT EXISTS dienst_standard jsonb;

CREATE TABLE IF NOT EXISTS dienste (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datum        date NOT NULL,
  staff_id     uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  location_id  integer REFERENCES locations(id),
  von          time NOT NULL,
  bis          time NOT NULL,
  pause_min    integer NOT NULL DEFAULT 0 CHECK (pause_min >= 0),
  taetigkeit   text NOT NULL DEFAULT 'AUSGABE' CHECK (taetigkeit IN ('AUSGABE','FAHRDIENST','LAGER','BUERO','SONSTIG')),
  notiz        text,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (bis > von)
);
CREATE INDEX IF NOT EXISTS idx_dienste_datum ON dienste (datum);
CREATE INDEX IF NOT EXISTS idx_dienste_staff_datum ON dienste (staff_id, datum);

CREATE TABLE IF NOT EXISTS dienstplan_wochen (
  woche_start        date PRIMARY KEY,                 -- Montag
  status             text NOT NULL DEFAULT 'ENTWURF' CHECK (status IN ('ENTWURF','VEROEFFENTLICHT')),
  veroeffentlicht_at timestamptz,
  veroeffentlicht_by uuid REFERENCES users(id),
  notiz              text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON dienste, dienstplan_wochen TO tdd_app;
REVOKE ALL ON dienste, dienstplan_wochen FROM tdd_ops;
