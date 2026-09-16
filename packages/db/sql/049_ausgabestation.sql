-- ════════════════════════════════════════════════════════════════════════
--  049_ausgabestation.sql · Ausgabestation (Laptop) mit Ausgabe-Sitzungen
--  Ein Laptop wandert mit dem Team von Ausgabestelle zu Ausgabestelle: das Geraet wird
--  einmal gekoppelt (wie das Fahrzeug-Tablet, aber ohne Fahrzeug), der Standort wird je
--  Sitzung gewaehlt. Zivis/Mitarbeitende melden sich mit persoenlicher PIN an; die
--  Buchungen laufen ueber ein technisches Konto "Ausgabestation", die Person steht an der
--  Sitzung und im Audit-Log (staff_id).
-- ════════════════════════════════════════════════════════════════════════
-- Geraete: Fahrzeugbezug optional, Art unterscheidet Tablet und Ausgabestation
ALTER TABLE geraete ALTER COLUMN fahrzeug_id DROP NOT NULL;
ALTER TABLE geraete ADD COLUMN IF NOT EXISTS art text NOT NULL DEFAULT 'FAHRZEUG' CHECK (art IN ('FAHRZEUG','AUSGABE'));
ALTER TABLE geraet_codes ALTER COLUMN fahrzeug_id DROP NOT NULL;
ALTER TABLE geraet_codes ADD COLUMN IF NOT EXISTS art text NOT NULL DEFAULT 'FAHRZEUG' CHECK (art IN ('FAHRZEUG','AUSGABE'));

-- PIN am Personal (Berechtigung fuer die Ausgabestation = PIN vergeben)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_hash text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_muss_aendern boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_fehlversuche integer NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pin_gesperrt_bis timestamptz;

CREATE TABLE IF NOT EXISTS ausgabe_sitzungen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geraet_id        uuid REFERENCES geraete(id) ON DELETE SET NULL,
  location_id      integer NOT NULL REFERENCES locations(id),
  staff_id         uuid REFERENCES staff(id) ON DELETE SET NULL,   -- wer die Ausgabe gefuehrt hat
  user_id          uuid REFERENCES users(id),                      -- Admin/Buero ohne Station
  beginn           timestamptz NOT NULL DEFAULT now(),
  ende             timestamptz,
  ausgaben_anzahl  integer,
  einnahmen_soll   numeric(8,2),
  kasse_gezaehlt   numeric(8,2),
  differenz        numeric(8,2),
  uebergabe_an     text,
  notiz            text,
  ordentlich       boolean NOT NULL DEFAULT true,                   -- false = automatisch geschlossen
  kommen_gestempelt boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_ausgabe_sitzungen_loc ON ausgabe_sitzungen (location_id, beginn DESC);
CREATE INDEX IF NOT EXISTS idx_ausgabe_sitzungen_offen ON ausgabe_sitzungen (geraet_id) WHERE ende IS NULL;

ALTER TABLE distributions ADD COLUMN IF NOT EXISTS sitzung_id uuid REFERENCES ausgabe_sitzungen(id) ON DELETE SET NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS staff_id uuid;     -- handelnde Person hinter einem technischen Konto
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS ausgabe_stempelt boolean NOT NULL DEFAULT true;

-- Technisches Konto der Ausgabestation: kein Passwort-Login ('!' ist kein gueltiger Hash), Rolle Kasse
INSERT INTO users (email, password_hash, display_name, role, organization_id, is_active, email_verified, username)
SELECT 'ausgabestation@tdd.intern', '!', 'Ausgabestation', 'AUSGABE', (SELECT id FROM organizations WHERE type = 'TDD' LIMIT 1), true, true, 'ausgabestation'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'ausgabestation@tdd.intern');

GRANT SELECT, INSERT, UPDATE, DELETE ON ausgabe_sitzungen TO tdd_app;
REVOKE ALL ON ausgabe_sitzungen FROM tdd_ops;
