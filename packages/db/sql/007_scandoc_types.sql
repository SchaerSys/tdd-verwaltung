-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 007_scandoc_types.sql · Dokumenttypen erweitern (ADDITIV)
--  scan_documents muss auch die aus Anträgen übernommenen Typen + BESCHEID zulassen.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE scan_documents DROP CONSTRAINT IF EXISTS scan_documents_doc_type_check;
ALTER TABLE scan_documents ADD CONSTRAINT scan_documents_doc_type_check
  CHECK (doc_type IN ('VEREINSFORMULAR','AUSWEIS','ALTLISTE','ZMR','KONTOAUSZUG','MIETVERTRAG','BESCHEID','SONSTIGES'));
