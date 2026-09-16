-- ════════════════════════════════════════════════════════════════════════
--  043_arbeitszeit_azg.sql · P3 Arbeitszeit nach AZG (Dario 16.09.: kein KV bekannt,
--  kein Betriebsrat, Teilzeit mit fixer Wochenverteilung)
--
--  staff.soll_verteilung: Sollminuten je ISO-Wochentag {"1":480,...} (fix, § 19c AZG);
--  Zeitkonto-Start + Anfangssaldo (Uebernahme aus der bisherigen Fuehrung);
--  zeit_regeln: Grenzen und Zuschlaege (einstellbar, weil KV-abhaengig);
--  betriebsfreie_tage: 24./31.12., Betriebsurlaub – zaehlen wie Feiertage (Gutschrift);
--  zeit_abschluesse: Monat je Person abgeschlossen -> Buchungen gesperrt (Nachweis § 26 AZG).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE staff ADD COLUMN IF NOT EXISTS soll_verteilung jsonb;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS zeitkonto_start date;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS zeitkonto_anfang_min integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS zeit_regeln (
  id                            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_tag_min                   integer NOT NULL DEFAULT 600,
  max_woche_min                 integer NOT NULL DEFAULT 3000,
  pause_ab_min                  integer NOT NULL DEFAULT 360,
  pause_min                     integer NOT NULL DEFAULT 30,
  ruhezeit_min                  integer NOT NULL DEFAULT 660,
  normalarbeitszeit_woche_min   integer NOT NULL DEFAULT 2400,
  mehrarbeit_zuschlag           integer NOT NULL DEFAULT 25,
  ueberstunden_zuschlag         integer NOT NULL DEFAULT 50,
  kollektivvertrag              text,
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO zeit_regeln (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS betriebsfreie_tage (
  datum date PRIMARY KEY,
  name  text NOT NULL,
  created_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS zeit_abschluesse (
  staff_id        uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  jahr            integer NOT NULL,
  monat           integer NOT NULL CHECK (monat BETWEEN 1 AND 12),
  ist_min         integer NOT NULL,
  soll_min        integer NOT NULL,
  gutschrift_min  integer NOT NULL,
  saldo_min       integer NOT NULL,        -- Monatssaldo
  konto_min       integer NOT NULL,        -- Zeitkonto-Stand am Monatsende
  mehrarbeit_min  integer NOT NULL DEFAULT 0,
  ueberstunden_min integer NOT NULL DEFAULT 0,
  abgeschlossen_by uuid REFERENCES users(id),
  abgeschlossen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, jahr, monat)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON zeit_regeln, betriebsfreie_tage, zeit_abschluesse TO tdd_app;
GRANT SELECT ON zeit_regeln, betriebsfreie_tage TO tdd_ops;
REVOKE ALL ON zeit_abschluesse FROM tdd_ops;
