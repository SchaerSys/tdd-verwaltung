-- ════════════════════════════════════════════════════════════════════════
--  055_tenant_stammdaten.sql · Mandanten-Stammdaten und Mandanten-Auflösung beim Login
--
--  * Stammdaten je Mandant (Host, Kurzname fuer Drucke, Anschrift, Kontakt): werden vom
--    Betreiber (Wartungsplattform) gepflegt und ersetzen die bisher fest verdrahteten
--    Angaben "Tischlein deck dich Vorarlberg" in Drucken, Datenschutzinfo und E-Mails.
--  * host: eigener Hostname je Mandant (z. B. tirol.tafelwerk.at). Der Server leitet Anfragen
--    ohne Session ueber den Host in den richtigen Mandanten-Kontext.
--  * tenant_fuer_login(name): Anmeldung ohne passenden Host – die E-Mail-Adresse ist global
--    eindeutig, der Benutzername je Mandant; die Funktion (Owner, umgeht RLS) liefert den
--    Mandanten des Kontos, damit die Fach-App die Anmeldung im richtigen Kontext ausfuehrt.
--    Sie verraet nichts ausser der Mandanten-ID eines aktiven Kontos.
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS host            text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS kurzname        text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS anschrift       text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS kontakt_email   text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS kontakt_telefon text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website         text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vertretung      text; -- Vereinsregister, vertretungsbefugte Person (Datenschutzinfo)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at      timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_host ON tenants (lower(host)) WHERE host IS NOT NULL;

UPDATE tenants SET
  host      = coalesce(host, 'tdd.schaer-systems.at'),
  kurzname  = coalesce(kurzname, 'Tischlein deck dich Vorarlberg'),
  anschrift = coalesce(anschrift, E'Ladritschweg 10c\nA-6773 Vandans'),
  website   = coalesce(website, 'https://tischlein-deckdich.at'),
  vertretung = coalesce(vertretung, E'Vereinsregister: ZVR 263197010\nVertreten durch den Obmann Elmar Stüttler')
WHERE id = 'e3b29c11-0000-4000-a000-000000000000';

-- Arbeitgeber-Name in den Zeitregeln: Mandanten, die noch den Standard tragen, bekommen ihren Namen
UPDATE zeit_regeln z SET arbeitgeber_name = t.name
FROM tenants t
WHERE z.tenant_id = t.id AND t.id <> 'e3b29c11-0000-4000-a000-000000000000'
  AND (z.arbeitgeber_name IS NULL OR z.arbeitgeber_name = 'Tischlein deck dich Vorarlberg');

-- Mandant eines Kontos fuer die Anmeldung (E-Mail global eindeutig; Benutzername nur, wenn eindeutig)
CREATE OR REPLACE FUNCTION tenant_fuer_login(p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_name text := lower(trim(p_name)); v_tenant uuid; v_n integer;
BEGIN
  IF v_name IS NULL OR v_name = '' THEN RETURN NULL; END IF;
  IF position('@' in v_name) > 0 THEN
    SELECT u.tenant_id INTO v_tenant FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE u.email = v_name AND u.is_active AND t.is_active LIMIT 1;
    RETURN v_tenant;
  END IF;
  SELECT count(DISTINCT u.tenant_id), min(u.tenant_id::text)::uuid INTO v_n, v_tenant
    FROM users u JOIN tenants t ON t.id = u.tenant_id
   WHERE u.username = v_name AND u.is_active AND t.is_active;
  RETURN CASE WHEN v_n = 1 THEN v_tenant ELSE NULL END;
END $$;
REVOKE ALL ON FUNCTION tenant_fuer_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_fuer_login(text) TO tdd_app;

-- Einladung: Benutzername im Ziel-Mandanten eindeutig machen (mach_benutzername liest den Kontext),
-- auch wenn die Wartungsplattform gerade ohne oder mit anderem Mandanten-Kontext arbeitet.
CREATE OR REPLACE FUNCTION ops_invite_user(p_email text, p_display_name text, p_role text,
                                           p_location_id integer, p_organization_id integer, p_tenant uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_raw text; v_org integer; v_tenant uuid;
BEGIN
  IF p_role NOT IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG','SACHBEARBEITER','FAHRER','MITARBEITER') THEN
    RAISE EXCEPTION 'Unbekannte Rolle %', p_role;
  END IF;
  v_tenant := coalesce(p_tenant, current_tenant_id(), 'e3b29c11-0000-4000-a000-000000000000'::uuid);
  PERFORM set_config('app.current_tenant_id', v_tenant::text, true);
  v_org := CASE WHEN p_role = 'SACHBEARBEITER' THEN p_organization_id
                ELSE coalesce(p_organization_id, (SELECT id FROM organizations WHERE type = 'TDD' AND tenant_id = v_tenant LIMIT 1)) END;
  INSERT INTO users (email, password_hash, display_name, role, location_id, organization_id, is_active, email_verified, username, tenant_id)
  VALUES (lower(trim(p_email)), '!', trim(p_display_name), p_role, p_location_id, v_org, true, true, mach_benutzername(p_display_name), v_tenant)
  RETURNING id INTO v_id;
  v_raw := encode(gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
  VALUES (v_id, 'RESET', encode(sha256(v_raw::bytea), 'hex'), now() + interval '72 hours');
  RETURN v_raw;
END $$;

-- Ops-Sicht der Mandanten mit Inbetriebnahme-Kennzahlen (nur Zaehler, keine Personendaten)
DROP VIEW IF EXISTS v_support_unternehmen;
CREATE VIEW v_support_unternehmen AS
SELECT t.id, t.name, t.slug, t.host, t.is_active, t.created_at,
       (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.role = 'ADMIN' AND u.is_active)      AS admins,
       (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active)                            AS benutzer,
       (SELECT count(*) FROM locations l WHERE l.tenant_id = t.id AND l.is_active)                        AS standorte,
       (SELECT count(*) FROM locations l WHERE l.tenant_id = t.id AND l.is_active AND l.type = 'LAGER')   AS lager,
       (SELECT count(*) FROM staff s WHERE s.tenant_id = t.id)                                            AS personal,
       (SELECT count(*) FROM persons p WHERE p.tenant_id = t.id)                                          AS personen,
       (SELECT count(*) FROM organizations o WHERE o.tenant_id = t.id AND o.type <> 'TDD')                AS organisationen,
       EXISTS (SELECT 1 FROM zeit_regeln z WHERE z.tenant_id = t.id)                                      AS zeitregeln,
       (SELECT max(u.last_login) FROM users u WHERE u.tenant_id = t.id)                                    AS letzter_login
FROM tenants t;
REVOKE ALL ON v_support_unternehmen FROM PUBLIC, tdd_app;
GRANT SELECT ON v_support_unternehmen TO tdd_ops;
