-- ════════════════════════════════════════════════════════════════════════
--  048_zivildienst.sql · P6 Zivildienst
--  Zivildienstleistende sind keine Arbeitnehmer (ZDG statt AVRAG/UrlG/EFZG):
--  Dienstzeit 9 Monate ab Zuweisung, Dienstfreistellung zwei Werktage je vollem Monat
--  (§ 23a ZDG), Verlaengerung um Fehltage ueber 24 Tage (§ 21 ZDG), Meldungen an die
--  Zivildienstserviceagentur. Der Lohnexport (P6) braucht keine neuen Tabellen.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE staff ADD COLUMN IF NOT EXISTS zivi_beginn date;            -- Dienstantritt laut Zuweisungsbescheid
ALTER TABLE staff ADD COLUMN IF NOT EXISTS zivi_ende date;              -- regulaeres Ende (leer = Beginn + 9 Monate)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS zivi_bescheid text;          -- Geschaeftszahl des Zuweisungsbescheids
ALTER TABLE staff ADD COLUMN IF NOT EXISTS zivi_fehltage_vor smallint NOT NULL DEFAULT 0; -- Fehltage aus frueherer Einsatzstelle
