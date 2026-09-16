-- ════════════════════════════════════════════════════════════════════════
--  050_zivi_regeln.sql · Zivildienst nach ZISA-Vorgaben
--  Grenzen fuer Zivildienstleistende (ZDG § 23) getrennt von den AZG-Regeln – die Werte
--  gibt die Zivildienstserviceagentur vor und werden hier eingetragen. Vorbelegung:
--  36–45 h Woche, 10 h Tag, Pause 30 min ab 6 h, Ruhezeit 11 h, kein Sonntagsdienst,
--  Dienstfreistellung 2 Werktage je vollem Monat.
--  zivi_meldungen: erledigte Meldungen an die Agentur (Dienstantritt, Krankheit > 3 Tage,
--  Verlaengerung, Dienstende) – die Meldeliste selbst wird aus den Daten berechnet.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS zivi_woche_min_min   integer NOT NULL DEFAULT 2160;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS zivi_woche_max_min   integer NOT NULL DEFAULT 2700;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS zivi_tag_max_min     integer NOT NULL DEFAULT 600;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS zivi_pause_ab_min    integer NOT NULL DEFAULT 360;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS zivi_pause_min       integer NOT NULL DEFAULT 30;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS zivi_ruhezeit_min    integer NOT NULL DEFAULT 660;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS zivi_sonntag_erlaubt boolean NOT NULL DEFAULT false;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS zivi_freistellung_monat smallint NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS zivi_meldungen (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  art         text NOT NULL CHECK (art IN ('DIENSTANTRITT','KRANK','VERLAENGERUNG','DIENSTENDE','SONSTIG')),
  bezug       text NOT NULL,                       -- Schluessel der Meldung (z. B. Abwesenheits-ID, Datum)
  gemeldet_at timestamptz NOT NULL DEFAULT now(),
  gemeldet_by uuid REFERENCES users(id),
  notiz       text,
  UNIQUE (staff_id, art, bezug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON zivi_meldungen TO tdd_app;
REVOKE ALL ON zivi_meldungen FROM tdd_ops;
