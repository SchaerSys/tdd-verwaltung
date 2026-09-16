-- ════════════════════════════════════════════════════════════════════════
--  041_benutzername.sql · Login per E-Mail ODER Benutzername "vorname.nachname"
--  Dario 16.09. Benutzername wird aus dem Anzeigenamen gebildet (Umlaute aufgeloest,
--  Kleinschreibung, bei Kollision Zaehler), fuer Bestand nachgezogen; die Einladung der
--  Wartung vergibt ihn mit.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username) WHERE username IS NOT NULL;
GRANT SELECT (username), UPDATE (username), INSERT (username) ON users TO tdd_ops;

CREATE OR REPLACE FUNCTION mach_benutzername(p_anzeige text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE basis text; kandidat text; n integer := 1; teile text[];
BEGIN
  basis := lower(trim(p_anzeige));
  basis := replace(replace(replace(replace(replace(replace(replace(basis, 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), 'é', 'e'), 'è', 'e'), 'à', 'a');
  basis := regexp_replace(basis, '[^a-z0-9 ]', '', 'g');
  teile := regexp_split_to_array(trim(basis), '\s+');
  IF array_length(teile, 1) >= 2 THEN
    basis := teile[1] || '.' || teile[array_length(teile, 1)];
  ELSE
    basis := coalesce(teile[1], 'benutzer');
  END IF;
  IF basis = '' OR basis = '.' THEN basis := 'benutzer'; END IF;
  kandidat := basis;
  WHILE EXISTS (SELECT 1 FROM users WHERE username = kandidat) LOOP
    n := n + 1; kandidat := basis || n::text;
  END LOOP;
  RETURN kandidat;
END $$;

-- Bestand nachziehen
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT id, display_name FROM users WHERE username IS NULL ORDER BY created_at LOOP
    UPDATE users SET username = mach_benutzername(u.display_name) WHERE id = u.id;
  END LOOP;
END $$;

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
  INSERT INTO users (email, password_hash, display_name, role, location_id, organization_id, is_active, email_verified, username)
  VALUES (lower(trim(p_email)), '!', trim(p_display_name), p_role, p_location_id, v_org, true, true, mach_benutzername(p_display_name))
  RETURNING id INTO v_id;
  v_raw := encode(gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
  VALUES (v_id, 'RESET', encode(sha256(v_raw::bytea), 'hex'), now() + interval '72 hours');
  RETURN v_raw;
END $$;
