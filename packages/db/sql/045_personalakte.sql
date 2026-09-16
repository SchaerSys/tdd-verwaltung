-- ════════════════════════════════════════════════════════════════════════
--  045_personalakte.sql · P2 Personalakte nach AVRAG
--  Dienstzettel-Inhalte (§ 2 Abs 2 AVRAG): Beschaeftigungsart, Verwendung/Taetigkeit,
--  KV-Einstufung und Entgelt, Probezeit (max. 1 Monat, § 19 Abs 2 AngG), Befristung,
--  Kuendigungsfrist, Datum der Aushaendigung. Dazu Stammdaten fuer die Anmeldung bei
--  der OeGK (Geburtsdatum, SV-Nummer, Staatsbuergerschaft), Notfallkontakt und
--  Dokumente je Person (Dienstzettel, Zeugnisse, Fuehrerschein, Unterweisungen).
--  Aufbewahrung: 7 Jahre nach Austritt (§ 132 BAO / § 76 EStG Lohnkonto), danach
--  loescht der Retention-Job Dokumente und sensible Felder.
--  Zugriff: nur tdd_app; tdd_ops (Wartung) sieht nichts davon.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE staff ADD COLUMN IF NOT EXISTS geburtsdatum date;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS sv_nummer text;                 -- 10-stellig (4 + Geburtsdatum TTMMJJ)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS staatsbuergerschaft text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS beschaeftigung text CHECK (beschaeftigung IS NULL OR beschaeftigung IN ('VOLLZEIT','TEILZEIT','GERINGFUEGIG','ZIVILDIENST','EHRENAMT'));
ALTER TABLE staff ADD COLUMN IF NOT EXISTS taetigkeit text;                -- vorgesehene Verwendung (§ 2 Abs 2 Z 8 AVRAG)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS kv_einstufung text;             -- z. B. "kein KV" oder Verwendungsgruppe/Stufe
ALTER TABLE staff ADD COLUMN IF NOT EXISTS gehalt_brutto numeric(9,2);     -- monatliches Grundgehalt brutto (§ 2 Abs 2 Z 9 AVRAG)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS probezeit_bis date;             -- max. 1 Monat ab Eintritt
ALTER TABLE staff ADD COLUMN IF NOT EXISTS befristet_bis date;             -- NULL = unbefristet
ALTER TABLE staff ADD COLUMN IF NOT EXISTS kuendigungsfrist text;          -- Text laut Vereinbarung/AngG
ALTER TABLE staff ADD COLUMN IF NOT EXISTS dienstzettel_am date;           -- Aushaendigung (§ 2 Abs 1 AVRAG: unverzueglich nach Beginn)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS notfall_name text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS notfall_tel text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS austritt_grund text CHECK (austritt_grund IS NULL OR austritt_grund IN ('KUENDIGUNG_AN','KUENDIGUNG_AG','EINVERNEHMLICH','BEFRISTUNG','PROBEZEIT','ENTLASSUNG','AUSTRITT','PENSION','SONSTIG'));

CREATE TABLE IF NOT EXISTS staff_dokumente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  art           text NOT NULL CHECK (art IN ('DIENSTZETTEL','DIENSTVERTRAG','ZEUGNIS','AUSWEIS','FUEHRERSCHEIN','UNTERWEISUNG','AERZTLICH','SONSTIG')),
  bezeichnung   text NOT NULL,
  file_ref      text NOT NULL,                  -- relativ unter STORAGE_DIR, z. B. personal/<uuid>.pdf
  gueltig_bis   date,                           -- z. B. Fuehrerschein, Unterweisung (jaehrlich)
  uploaded_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_dokumente_staff ON staff_dokumente (staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON staff_dokumente TO tdd_app;
REVOKE ALL ON staff_dokumente FROM tdd_ops;

-- Arbeitgeber-Angaben fuer den Dienstzettel (§ 2 Abs 2 Z 1, 12, 13 AVRAG) – zentral bei den Regeln
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS arbeitgeber_name text NOT NULL DEFAULT 'Tischlein deck dich Vorarlberg';
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS arbeitgeber_anschrift text;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS bv_kasse text;                -- Betriebliche Vorsorgekasse (Name, Anschrift)
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS sv_traeger text NOT NULL DEFAULT 'Österreichische Gesundheitskasse (ÖGK)';
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS kv_einsicht text;             -- Ort der Einsichtnahme in KV/Betriebsvereinbarung
