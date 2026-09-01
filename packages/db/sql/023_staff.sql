-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 023_staff.sql · A2 Personal-Verzeichnis
--  Mitarbeitende, Zivildiener, Ehrenamtliche, Fahrer:innen. Grundlage für
--  Zeiterfassung (A2), Urlaub (A3) und Einsatzplanung (A4/A5).
--  Getrennt von der Lebensmittelhilfe (A1); keine Vermischung mit persons.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS staff (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  staff_type         text NOT NULL DEFAULT 'ANGESTELLT',  -- ANGESTELLT | ZIVILDIENER | EHRENAMT | FAHRER
  email              text,
  phone              text,
  location_id        integer REFERENCES locations(id),
  employment_start   date,
  employment_end     date,
  weekly_hours       numeric(5,2),        -- Sollstunden/Woche (Angestellte)
  vacation_days_year numeric(5,1),        -- Urlaubsanspruch Werktage/Jahr (für A3)
  nfc_card_id        text UNIQUE,         -- ID der Stempelkarte (für A2-Terminal)
  is_active          boolean NOT NULL DEFAULT true,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff (is_active);
CREATE INDEX IF NOT EXISTS idx_staff_lastname ON staff (last_name);

-- App-Rolle braucht Zugriff (nur wenn die Rolle existiert – lokal ggf. nicht).
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'tdd_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON staff TO tdd_app;
  END IF;
END $$;
