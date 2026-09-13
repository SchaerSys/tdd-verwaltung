-- ════════════════════════════════════════════════════════════════════════
--  027_purge_antrag_documents.sql · Löschfrist auch für Antragsdokumente
--  antrag_documents steht unter RLS: ohne gesetztes app.org_id sieht tdd_app dort
--  nichts, ein DELETE im Löschjob träfe null Zeilen. Die Funktion umgeht RLS
--  kontrolliert (SECURITY DEFINER) und gibt NUR file_refs zurück – keine Inhalte.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION purge_expired_antrag_documents()
RETURNS TABLE(file_ref text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM antrag_documents
  WHERE retention_until IS NOT NULL AND retention_until <= current_date
  RETURNING file_ref;
$$;
GRANT EXECUTE ON FUNCTION purge_expired_antrag_documents() TO tdd_app;
REVOKE EXECUTE ON FUNCTION purge_expired_antrag_documents() FROM PUBLIC, tdd_ops;
