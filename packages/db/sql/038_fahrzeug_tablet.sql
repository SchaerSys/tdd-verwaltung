-- ════════════════════════════════════════════════════════════════════════
--  038_fahrzeug_tablet.sql · Tour ans Fahrzeug-Tablet, nicht an einen Fahrer-Login
--  Dario 16.09.: "nicht jeder Fahrer bekommt ein Login, die Tablets sind fahrzeugbezogen,
--  die Tour wird an das Tablet im Fahrzeug gesendet."
--
--  1) Geraete: ein Tablet ist genau einem Fahrzeug zugeordnet und meldet sich mit einem
--     langlebigen Geraete-Token (Cookie, nur Hash in der DB). Gekoppelt wird einmalig mit
--     einem 6-stelligen Code aus der Disposition (10 Minuten gueltig).
--  2) Nebenbefund: Benutzer, die das Buero anlegte, hatten keine Organisation und konnten
--     sich deshalb nicht anmelden (Login prueft die gewaehlte Organisation) – nachgezogen,
--     auch in der Einladungsfunktion der Wartung.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS geraete (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fahrzeug_id     integer NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  name            text NOT NULL,                 -- "Tablet Kühlwagen 1"
  token_hash      text NOT NULL UNIQUE,
  user_agent      text,
  gekoppelt_at    timestamptz NOT NULL DEFAULT now(),
  gekoppelt_by    uuid REFERENCES users(id),
  zuletzt_gesehen timestamptz,
  is_active       boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_geraete_fahrzeug ON geraete (fahrzeug_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS geraet_codes (
  code        text PRIMARY KEY,                  -- 6 Ziffern
  fahrzeug_id integer NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  name        text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON geraete, geraet_codes TO tdd_app;
GRANT SELECT (id, fahrzeug_id, name, gekoppelt_at, zuletzt_gesehen, is_active) ON geraete TO tdd_ops;
REVOKE ALL ON geraet_codes FROM tdd_ops;

-- ── Login-Fix: interne Konten gehoeren zur TDD-Organisation ───────────────
UPDATE users SET organization_id = (SELECT id FROM organizations WHERE type = 'TDD' LIMIT 1)
WHERE organization_id IS NULL AND role <> 'SACHBEARBEITER';

CREATE OR REPLACE FUNCTION ops_invite_user(p_email text, p_display_name text, p_role text,
                                           p_location_id integer, p_organization_id integer)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_raw text; v_org integer;
BEGIN
  IF p_role NOT IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG','SACHBEARBEITER','FAHRER') THEN
    RAISE EXCEPTION 'Unbekannte Rolle %', p_role;
  END IF;
  v_org := CASE WHEN p_role = 'SACHBEARBEITER' THEN p_organization_id
                ELSE coalesce(p_organization_id, (SELECT id FROM organizations WHERE type = 'TDD' LIMIT 1)) END;
  INSERT INTO users (email, password_hash, display_name, role, location_id, organization_id, is_active, email_verified)
  VALUES (lower(trim(p_email)), '!', trim(p_display_name), p_role, p_location_id, v_org, true, true)
  RETURNING id INTO v_id;
  v_raw := encode(gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
  VALUES (v_id, 'RESET', encode(sha256(v_raw::bytea), 'hex'), now() + interval '72 hours');
  RETURN v_raw;
END $$;
