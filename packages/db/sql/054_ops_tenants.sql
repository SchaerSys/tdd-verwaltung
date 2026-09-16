-- ════════════════════════════════════════════════════════════════════════
--  054_ops_tenants.sql · Mandanten (Unternehmen) anlegen ueber die Wartungsplattform
--  tdd_ops darf keine Organisationen/Regeln direkt schreiben; die Funktion (Owner) legt
--  den Mandanten samt Grundausstattung an: TDD-Organisation, Zeitregeln, Loeschfristen
--  und Auswahllisten als Kopie des Bestandsmandanten.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ops_create_tenant(p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_von uuid := 'e3b29c11-0000-4000-a000-000000000000'; r record; v_list integer;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN RAISE EXCEPTION 'Name fehlt'; END IF;
  IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,60}$' THEN RAISE EXCEPTION 'Slug: Kleinbuchstaben, Ziffern, Bindestrich'; END IF;
  INSERT INTO tenants (name, slug) VALUES (trim(p_name), p_slug) RETURNING id INTO v_id;
  INSERT INTO organizations (name, type, tenant_id) VALUES (trim(p_name), 'TDD', v_id);
  INSERT INTO zeit_regeln (tenant_id) VALUES (v_id);
  INSERT INTO retention_rules (entity_type, retention_period, legal_basis, is_active, tenant_id)
    SELECT entity_type, retention_period, legal_basis, is_active, v_id FROM retention_rules WHERE tenant_id = v_von;
  FOR r IN SELECT id, code FROM lookup_lists WHERE tenant_id = v_von LOOP
    INSERT INTO lookup_lists (code, tenant_id) VALUES (r.code, v_id) RETURNING id INTO v_list;
    INSERT INTO lookup_values (list_id, label, sort, is_active, tenant_id)
      SELECT v_list, label, sort, is_active, v_id FROM lookup_values WHERE list_id = r.id;
  END LOOP;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION ops_create_tenant(text, text) FROM PUBLIC, tdd_app;
GRANT EXECUTE ON FUNCTION ops_create_tenant(text, text) TO tdd_ops;
