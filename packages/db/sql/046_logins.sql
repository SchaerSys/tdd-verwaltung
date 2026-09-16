-- ════════════════════════════════════════════════════════════════════════
--  046_logins.sql · P1 Logins
--  Rolle MITARBEITER: Selbstservice (eigene Zeiten, Urlaubskonto, Urlaubsantrag,
--  Krankmeldung) – keine Klientendaten. Austritt am Personal-Datensatz sperrt den
--  Login (Grund AUSTRITT, vom Retention-Job und beim Speichern gesetzt; manuelle
--  Sperren bleiben ADMIN). Login-Verlauf kommt aus audit_logs (login*, passwort*).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG','SACHBEARBEITER','FAHRER','MITARBEITER'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS deaktiviert_grund text CHECK (deaktiviert_grund IS NULL OR deaktiviert_grund IN ('ADMIN','AUSTRITT'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS deaktiviert_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_audit_actor_at ON audit_logs (actor_user_id, at DESC);

-- ops_invite_user: Rollenliste um MITARBEITER erweitern (sonst identisch zu 041)
CREATE OR REPLACE FUNCTION ops_invite_user(p_email text, p_display_name text, p_role text,
                                           p_location_id integer, p_organization_id integer)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_raw text; v_org integer;
BEGIN
  IF p_role NOT IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG','SACHBEARBEITER','FAHRER','MITARBEITER') THEN
    RAISE EXCEPTION 'Unbekannte Rolle %', p_role;
  END IF;
  v_org := CASE WHEN p_role = 'SACHBEARBEITER' THEN p_organization_id
                ELSE coalesce(p_organization_id, (SELECT id FROM organizations WHERE type = 'TDD' LIMIT 1)) END;
  INSERT INTO users (email, password_hash, display_name, role, location_id, organization_id, is_active, email_verified, username)
  VALUES (lower(trim(p_email)), '!', trim(p_display_name), p_role, p_location_id, v_org, true, true, mach_benutzername(p_display_name))
  RETURNING id INTO v_id;
  v_raw := encode(gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
  VALUES (v_id, 'RESET', encode(sha256(v_raw::bytea), 'hex'), now() + interval '72 hours');
  RETURN v_raw;
END $$;
REVOKE ALL ON FUNCTION ops_invite_user(text, text, text, integer, integer) FROM PUBLIC, tdd_app;
GRANT EXECUTE ON FUNCTION ops_invite_user(text, text, text, integer, integer) TO tdd_ops;

-- tdd_ops darf den Sperrgrund sehen/setzen (kein PII), wie is_active
GRANT SELECT (deaktiviert_grund, deaktiviert_at), UPDATE (deaktiviert_grund, deaktiviert_at) ON users TO tdd_ops;
