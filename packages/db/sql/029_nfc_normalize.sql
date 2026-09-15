-- ════════════════════════════════════════════════════════════════════════
--  029_nfc_normalize.sql · NFC-Kennungen einheitlich, eine Karte je Person
-- ════════════════════════════════════════════════════════════════════════
-- Web NFC liefert "04:a3:2b:…", Leser "04A32B…", Menschen beides. Die App
-- normalisiert ab jetzt beim Speichern und Suchen; der Bestand wird angeglichen.
UPDATE staff
   SET nfc_card_id = NULLIF(upper(regexp_replace(nfc_card_id, '[^0-9A-Fa-f]', '', 'g')), '')
 WHERE nfc_card_id IS NOT NULL;

-- Dieselbe Karte darf nicht zwei Personen gehoeren, sonst stempelt die falsche.
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_nfc_card ON staff (nfc_card_id) WHERE nfc_card_id IS NOT NULL;
