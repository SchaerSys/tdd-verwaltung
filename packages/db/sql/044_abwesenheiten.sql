-- ════════════════════════════════════════════════════════════════════════
--  044_abwesenheiten.sql · P4 Abwesenheiten nach UrlG/EFZG
--  Arten: URLAUB (UrlG), KRANK (EFZG), ZEITAUSGLEICH (aus dem Zeitkonto), PFLEGE
--  (Pflegefreistellung § 16 UrlG), SONDERURLAUB (bezahlt, z. B. Hochzeit/Todesfall),
--  UNBEZAHLT (keine Gutschrift), SONSTIG. Status fuer Antrag -> Genehmigung.
--  Urlaubsjahr am Personal: Arbeitsjahr (Eintritt) oder Kalenderjahr; Urlaubsuebertrag als
--  Startwert aus der bisherigen Fuehrung.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE abwesenheiten DROP CONSTRAINT IF EXISTS abwesenheiten_art_check;
ALTER TABLE abwesenheiten ADD CONSTRAINT abwesenheiten_art_check
  CHECK (art IN ('URLAUB','KRANK','ZEITAUSGLEICH','PFLEGE','SONDERURLAUB','UNBEZAHLT','SONSTIG'));
ALTER TABLE abwesenheiten ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'GENEHMIGT' CHECK (status IN ('BEANTRAGT','GENEHMIGT','ABGELEHNT'));
ALTER TABLE abwesenheiten ADD COLUMN IF NOT EXISTS halbtag boolean NOT NULL DEFAULT false;
ALTER TABLE abwesenheiten ADD COLUMN IF NOT EXISTS bestaetigung boolean NOT NULL DEFAULT false;   -- Krankenbestaetigung liegt vor
ALTER TABLE abwesenheiten ADD COLUMN IF NOT EXISTS entschieden_by uuid REFERENCES users(id);
ALTER TABLE abwesenheiten ADD COLUMN IF NOT EXISTS entschieden_at timestamptz;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS urlaubsjahr text NOT NULL DEFAULT 'ARBEIT' CHECK (urlaubsjahr IN ('ARBEIT','KALENDER'));
ALTER TABLE staff ADD COLUMN IF NOT EXISTS urlaub_wochen smallint NOT NULL DEFAULT 5 CHECK (urlaub_wochen IN (5, 6));
ALTER TABLE staff ADD COLUMN IF NOT EXISTS urlaub_uebertrag_tage numeric(5,1) NOT NULL DEFAULT 0;   -- Startwert (Resturlaub aus alter Fuehrung)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS urlaub_uebertrag_ab date;                                 -- gilt fuer das Urlaubsjahr, das an diesem Datum beginnt
ALTER TABLE staff ADD COLUMN IF NOT EXISTS dienstjahre_anrechnung numeric(4,1) NOT NULL DEFAULT 0;   -- Vordienstzeiten (6. Woche ab 25 Jahren, EFZG-Stufen)
