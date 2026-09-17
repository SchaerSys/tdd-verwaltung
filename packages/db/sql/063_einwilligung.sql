-- ════════════════════════════════════════════════════════════════════════
--  063_einwilligung.sql · DSGVO-Einwilligung digital (Unterschrift, Bestaetigungslink, Widerruf)
--  * Antrag: Art der Einwilligung (PAPIER | UNTERSCHRIFT | LINK), Unterschrift als Datei-Referenz,
--    Token fuer den Bestaetigungslink (nur Hash, 14 Tage gueltig).
--  * Person: dieselben Angaben nach der Uebernahme sowie Widerruf (Zeit, Grund) – ein Widerruf
--    sperrt die Ausgabe am Tresen, bis das Buero den Fall klaert.
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE antraege ADD COLUMN IF NOT EXISTS consent_method        text CHECK (consent_method IS NULL OR consent_method IN ('PAPIER','UNTERSCHRIFT','LINK'));
ALTER TABLE antraege ADD COLUMN IF NOT EXISTS consent_signature_ref text;
ALTER TABLE antraege ADD COLUMN IF NOT EXISTS consent_token_hash    text;
ALTER TABLE antraege ADD COLUMN IF NOT EXISTS consent_token_bis     timestamptz;
ALTER TABLE persons  ADD COLUMN IF NOT EXISTS consent_method        text CHECK (consent_method IS NULL OR consent_method IN ('PAPIER','UNTERSCHRIFT','LINK'));
ALTER TABLE persons  ADD COLUMN IF NOT EXISTS consent_signature_ref text;
ALTER TABLE persons  ADD COLUMN IF NOT EXISTS consent_revoked_at    timestamptz;
ALTER TABLE persons  ADD COLUMN IF NOT EXISTS consent_revoked_reason text;
CREATE INDEX IF NOT EXISTS idx_antraege_consent_token ON antraege (consent_token_hash) WHERE consent_token_hash IS NOT NULL;

-- Bestaetigung ueber den oeffentlichen Link: Owner-Funktion, damit die Seite ohne Login und ohne
-- Organisations-Kontext genau EINEN Antrag ueber den Token-Hash bestaetigen kann.
CREATE OR REPLACE FUNCTION einwilligung_per_link(p_hash text)
RETURNS TABLE (antrag_id uuid, vorname text, tenant_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  SELECT id, first_name, tenant_id AS t INTO a FROM antraege
   WHERE consent_token_hash = p_hash AND consent_token_bis > now() AND NOT consent_given LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE antraege SET consent_given = true, consent_at = current_date, consent_method = 'LINK', consent_token_hash = NULL, consent_token_bis = NULL WHERE id = a.id;
  RETURN QUERY SELECT a.id, a.first_name, a.t;
END $$;
CREATE OR REPLACE FUNCTION einwilligung_link_pruefen(p_hash text)
RETURNS TABLE (antrag_id uuid, vorname text, tenant_id uuid, schon boolean)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT id, first_name, tenant_id, consent_given FROM antraege WHERE consent_token_hash = p_hash AND consent_token_bis > now() LIMIT 1
$$;
REVOKE ALL ON FUNCTION einwilligung_per_link(text), einwilligung_link_pruefen(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION einwilligung_per_link(text), einwilligung_link_pruefen(text) TO tdd_app;
