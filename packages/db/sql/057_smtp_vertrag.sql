-- ════════════════════════════════════════════════════════════════════════
--  057_smtp_vertrag.sql · SMTP je Mandant, Mail-Protokoll, Vertrag/Module, Betreiber-Rollen
--
--  * tenant_smtp: Zugangsdaten je Mandant. Passwort NUR verschluesselt (AES-256-GCM mit dem
--    Server-Schluessel SMTP_KEY, siehe packages/db/src/smtp.ts). tdd_ops darf schreiben,
--    aber die Passwortspalte nicht lesen; die Apps holen die Konfiguration ueber
--    smtp_fuer_mandant() (Owner-Funktion) fuer den aktuellen Kontext.
--  * mail_log: jede gesendete/fehlgeschlagene Mail als Metadatensatz (Empfaenger nur als
--    Hash + Domain, kein Inhalt) – fuer den Betreiber nachvollziehbar, ohne mitzulesen.
--  * tenants: Vertrag (Plan, Testphase, Laufzeit, Limits), Module ein/aus, Betreiber-Notizen.
--    tenant_aktiv(): aktiv UND Testphase/Vertrag nicht abgelaufen – Login und Jobs richten
--    sich danach.
--  * ops_users.rolle: SUPER (alles) | SUPPORT (lesen, Passwort-Links, Sperren).
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- ── SMTP je Mandant ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_smtp (
  tenant_id        uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  host             text NOT NULL,
  port             integer NOT NULL DEFAULT 587,
  sicherheit       text NOT NULL DEFAULT 'STARTTLS' CHECK (sicherheit IN ('STARTTLS','SSL','KEINE')),
  benutzer         text,
  passwort_enc     text,                      -- base64(iv|tag|ciphertext), AES-256-GCM
  absender_email   text NOT NULL,
  absender_name    text,
  antwort_an       text,
  aktualisiert_am  timestamptz NOT NULL DEFAULT now(),
  aktualisiert_von text,
  letzter_test_am  timestamptz,
  letzter_test_ok  boolean,
  letzter_test_info text
);
REVOKE ALL ON tenant_smtp FROM PUBLIC, tdd_app;
GRANT SELECT (tenant_id, host, port, sicherheit, benutzer, absender_email, absender_name, antwort_an, aktualisiert_am, aktualisiert_von, letzter_test_am, letzter_test_ok, letzter_test_info) ON tenant_smtp TO tdd_ops;
GRANT INSERT, UPDATE, DELETE ON tenant_smtp TO tdd_ops;

CREATE OR REPLACE FUNCTION smtp_fuer_mandant(p_tenant uuid DEFAULT NULL)
RETURNS TABLE (host text, port integer, sicherheit text, benutzer text, passwort_enc text, absender_email text, absender_name text, antwort_an text, aktualisiert_am timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT s.host, s.port, s.sicherheit, s.benutzer, s.passwort_enc, s.absender_email, s.absender_name, s.antwort_an, s.aktualisiert_am
  FROM tenant_smtp s WHERE s.tenant_id = coalesce(p_tenant, current_tenant_id())
$$;
REVOKE ALL ON FUNCTION smtp_fuer_mandant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION smtp_fuer_mandant(uuid) TO tdd_app, tdd_ops;

-- Passwort schreiben, ohne dass tdd_ops die Spalte je liest (Test/Anzeige nur "gesetzt")
CREATE OR REPLACE FUNCTION ops_smtp_speichern(p_tenant uuid, p_host text, p_port integer, p_sicherheit text, p_benutzer text,
                                              p_passwort_enc text, p_absender_email text, p_absender_name text, p_antwort_an text, p_von text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO tenant_smtp (tenant_id, host, port, sicherheit, benutzer, passwort_enc, absender_email, absender_name, antwort_an, aktualisiert_am, aktualisiert_von)
  VALUES (p_tenant, p_host, p_port, p_sicherheit, nullif(p_benutzer, ''), p_passwort_enc, p_absender_email, nullif(p_absender_name, ''), nullif(p_antwort_an, ''), now(), p_von)
  ON CONFLICT (tenant_id) DO UPDATE SET
    host = EXCLUDED.host, port = EXCLUDED.port, sicherheit = EXCLUDED.sicherheit, benutzer = EXCLUDED.benutzer,
    passwort_enc = coalesce(EXCLUDED.passwort_enc, tenant_smtp.passwort_enc), -- leer gelassen = Passwort behalten
    absender_email = EXCLUDED.absender_email, absender_name = EXCLUDED.absender_name, antwort_an = EXCLUDED.antwort_an,
    aktualisiert_am = now(), aktualisiert_von = EXCLUDED.aktualisiert_von;
END $$;
REVOKE ALL ON FUNCTION ops_smtp_speichern(uuid, text, integer, text, text, text, text, text, text, text) FROM PUBLIC, tdd_app;
GRANT EXECUTE ON FUNCTION ops_smtp_speichern(uuid, text, integer, text, text, text, text, text, text, text) TO tdd_ops;

-- ── Mail-Protokoll ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mail_log (
  id               bigserial PRIMARY KEY,
  tenant_id        uuid REFERENCES tenants(id) ON DELETE CASCADE DEFAULT current_tenant_id(),
  at               timestamptz NOT NULL DEFAULT now(),
  empfaenger_hash  text NOT NULL,   -- sha256(lower(email)) – Nachweis ohne Adresse
  empfaenger_domain text,
  betreff          text,
  ausloeser        text,            -- z. B. einladung, passwort, bescheid, kartenablauf, pin, test
  quelle           text NOT NULL DEFAULT 'app',  -- app | ops
  gesendet         boolean NOT NULL,
  fehler           text,
  ueber            text             -- 'mandant' | 'plattform' (welches SMTP)
);
CREATE INDEX IF NOT EXISTS idx_mail_log_tenant_at ON mail_log (tenant_id, at DESC);
ALTER TABLE mail_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON mail_log;
CREATE POLICY tenant_isolation ON mail_log AS RESTRICTIVE FOR ALL TO tdd_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS tenant_all ON mail_log;
CREATE POLICY tenant_all ON mail_log AS PERMISSIVE FOR ALL TO tdd_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_ops ON mail_log;
CREATE POLICY tenant_ops ON mail_log AS PERMISSIVE FOR ALL TO tdd_ops USING (current_tenant_id() IS NULL OR tenant_id IS NULL OR tenant_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR tenant_id IS NULL OR tenant_id = current_tenant_id());
GRANT INSERT ON mail_log TO tdd_app;
GRANT USAGE ON SEQUENCE mail_log_id_seq TO tdd_app, tdd_ops;
GRANT SELECT, INSERT ON mail_log TO tdd_ops;
GRANT SELECT ON mail_log TO tdd_app;

-- ── Vertrag, Module, Notizen ───────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan             text NOT NULL DEFAULT 'BASIS';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS test_bis         date;          -- Testphase; danach automatisch inaktiv
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vertrag_beginn   date;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vertrag_ende     date;          -- Laufzeit; danach automatisch inaktiv
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS kuendigungsfrist text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS limit_benutzer   integer;       -- NULL = unbegrenzt
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS limit_standorte  integer;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS module           jsonb NOT NULL DEFAULT '{}'::jsonb; -- {"portal":false} = aus; fehlend = an
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ansprechpartner  text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notizen          text;          -- nur Betreiber
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_plan_check') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check CHECK (plan IN ('TEST','BASIS','PLUS'));
  END IF;
END $$;
-- Betreiber-Spalten fuer die Fach-App unsichtbar (Notizen/Vertrag sind Sache des Betreibers)
REVOKE SELECT ON tenants FROM tdd_app;
GRANT SELECT (id, name, slug, created_at, is_active, host, kurzname, anschrift, kontakt_email, kontakt_telefon, website, vertretung, updated_at, plan, test_bis, vertrag_ende, module, limit_benutzer, limit_standorte) ON tenants TO tdd_app;

CREATE OR REPLACE FUNCTION tenant_aktiv(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT t.is_active AND (t.test_bis IS NULL OR t.test_bis >= current_date) AND (t.vertrag_ende IS NULL OR t.vertrag_ende >= current_date)
                   FROM tenants t WHERE t.id = p_tenant), false)
$$;
GRANT EXECUTE ON FUNCTION tenant_aktiv(uuid) TO PUBLIC;

-- Login-Aufloesung und Konto-Mandant beruecksichtigen Testphase/Vertrag
CREATE OR REPLACE FUNCTION tenant_fuer_login(p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_name text := lower(trim(p_name)); v_tenant uuid; v_n integer;
BEGIN
  IF v_name IS NULL OR v_name = '' THEN RETURN NULL; END IF;
  IF position('@' in v_name) > 0 THEN
    SELECT u.tenant_id INTO v_tenant FROM users u WHERE u.email = v_name AND u.is_active AND tenant_aktiv(u.tenant_id) LIMIT 1;
    RETURN v_tenant;
  END IF;
  SELECT count(DISTINCT u.tenant_id), min(u.tenant_id::text)::uuid INTO v_n, v_tenant
    FROM users u WHERE u.username = v_name AND u.is_active AND tenant_aktiv(u.tenant_id);
  RETURN CASE WHEN v_n = 1 THEN v_tenant ELSE NULL END;
END $$;
CREATE OR REPLACE FUNCTION tenant_fuer_benutzer(p_user uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT u.tenant_id FROM users u WHERE u.id = p_user AND tenant_aktiv(u.tenant_id) LIMIT 1
$$;

-- ── Betreiber-Rollen ───────────────────────────────────────────────────
ALTER TABLE ops_users ADD COLUMN IF NOT EXISTS rolle text NOT NULL DEFAULT 'SUPER';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_users_rolle_check') THEN
    ALTER TABLE ops_users ADD CONSTRAINT ops_users_rolle_check CHECK (rolle IN ('SUPER','SUPPORT'));
  END IF;
END $$;

-- ── Ops-Sicht Mandanten: Vertrag/Status ergaenzen ──────────────────────
DROP VIEW IF EXISTS v_support_unternehmen;
CREATE VIEW v_support_unternehmen AS
SELECT t.id, t.name, t.slug, t.host, t.is_active, t.created_at, t.plan, t.test_bis, t.vertrag_ende, t.limit_benutzer, t.limit_standorte,
       tenant_aktiv(t.id) AS aktiv_effektiv,
       (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.role = 'ADMIN' AND u.is_active)      AS admins,
       (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.is_active)                            AS benutzer,
       (SELECT count(*) FROM locations l WHERE l.tenant_id = t.id AND l.is_active)                        AS standorte,
       (SELECT count(*) FROM locations l WHERE l.tenant_id = t.id AND l.is_active AND l.type = 'LAGER')   AS lager,
       (SELECT count(*) FROM staff s WHERE s.tenant_id = t.id)                                            AS personal,
       (SELECT count(*) FROM persons p WHERE p.tenant_id = t.id)                                          AS personen,
       (SELECT count(*) FROM organizations o WHERE o.tenant_id = t.id AND o.type <> 'TDD')                AS organisationen,
       EXISTS (SELECT 1 FROM zeit_regeln z WHERE z.tenant_id = t.id)                                      AS zeitregeln,
       EXISTS (SELECT 1 FROM tenant_smtp s WHERE s.tenant_id = t.id)                                      AS smtp,
       (SELECT max(u.last_login) FROM users u WHERE u.tenant_id = t.id)                                    AS letzter_login,
       (SELECT count(*) FROM mail_log m WHERE m.tenant_id = t.id AND m.at > now() - interval '30 days' AND m.gesendet)     AS mails_30,
       (SELECT count(*) FROM mail_log m WHERE m.tenant_id = t.id AND m.at > now() - interval '30 days' AND NOT m.gesendet) AS mails_fehler_30
FROM tenants t;
REVOKE ALL ON v_support_unternehmen FROM PUBLIC, tdd_app;
GRANT SELECT ON v_support_unternehmen TO tdd_ops;
