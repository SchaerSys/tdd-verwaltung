-- ════════════════════════════════════════════════════════════════════════
--  053_tenants.sql · Mandanten-Ebene (Unternehmen) ueber den Organisationen
--
--  Neue globale Ebene `tenants` (uuid). Die bestehende Ebene `organizations` (Gemeinden,
--  Institutionen, TDD; integer) bleibt unangetastet und haengt jetzt an einem Mandanten.
--  Jede datenrelevante Tabelle bekommt `tenant_id`; der Bestand wird EINMALIG dem
--  Mandanten "Tischlein deck dich Vorarlberg" (feste UUID) zugeordnet.
--
--  Kontext: GUC app.current_tenant_id (je Verbindung/Transaktion gesetzt). Spalten-Default
--  = aktueller Kontext, d. h. Inserts erben den Mandanten; ohne Kontext scheitert der
--  Insert (NOT NULL) – fail closed. RLS: RESTRICTIVE Policy je Tabelle fuer tdd_app,
--  UND-verknuepft mit den bestehenden Organisations-Policies (antraege, antrag_documents,
--  antrag_nachrichten). tdd_ops (Betreiber) sieht ueber alle Mandanten (PERMISSIVE, Spalten-
--  rechte bleiben). Kein FORCE: der Owner (Migrationen, Owner-Views) umgeht RLS weiterhin.
--  Idempotent: mehrfach ausfuehrbar (Integrationstests, Wiederholung nach Abbruch).
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  created_at timestamp DEFAULT now() NOT NULL,
  is_active  boolean DEFAULT true NOT NULL
);
INSERT INTO tenants (id, name, slug)
VALUES ('e3b29c11-0000-4000-a000-000000000000', 'Tischlein deck dich Vorarlberg', 'tdd-vorarlberg')
ON CONFLICT DO NOTHING;

GRANT SELECT ON tenants TO tdd_app;
GRANT SELECT, INSERT, UPDATE ON tenants TO tdd_ops;

-- Hilfsfunktion: aktueller Mandant aus dem Sitzungskontext (NULL ohne Kontext)
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO PUBLIC;

-- ── tenant_id auf allen datenrelevanten Tabellen ─────────────────────────
DO $$
DECLARE
  tabellen text[] := ARRAY[
    'locations','lookup_lists','lookup_values','organizations','users','persons','person_location_assignments',
    'cards','distributions','duplicate_decisions','scan_documents','audit_logs','retention_rules','integration_outbox',
    'antraege','antrag_documents','antrag_nachrichten','app_events','staff','staff_dokumente','dienste','dienstplan_wochen',
    'time_events','abwesenheiten','abholstellen','fahrzeuge','tour_vorlagen','tour_vorlage_stopps','touren','tour_stopps',
    'tour_ereignisse','angebote_eingang','geraete','ausgabe_sitzungen','zeit_regeln','zivi_meldungen','betriebsfreie_tage',
    'zeit_abschluesse','card_sequences'];
  nullable text[] := ARRAY['audit_logs','app_events'];
  t text;
BEGIN
  FOREACH t IN ARRAY tabellen LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid DEFAULT NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid', t);
    -- Bestand einmalig dem ersten Mandanten zuordnen
    EXECUTE format('UPDATE %I SET tenant_id = ''e3b29c11-0000-4000-a000-000000000000'' WHERE tenant_id IS NULL', t);
    IF NOT (t = ANY(nullable)) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_tenant_fk') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE', t, t || '_tenant_fk');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', 'idx_' || t || '_tenant', t);
  END LOOP;
END $$;

-- ── Eindeutigkeit je Mandant statt global ───────────────────────────────
-- Globale Unique-Constraints auf genau einer Spalte entfernen und als (tenant_id, spalte) neu anlegen.
DO $$
DECLARE
  r record;
  paare text[][] := ARRAY[
    ['locations','location_code'], ['locations','name'], ['cards','card_number'],
    ['lookup_lists','code'], ['retention_rules','entity_type']];
  p text[];
BEGIN
  FOREACH p SLICE 1 IN ARRAY paare LOOP
    FOR r IN
      SELECT c.conname FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'u' AND c.conrelid = p[1]::regclass AND array_length(c.conkey, 1) = 1 AND a.attname = p[2]
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', p[1], r.conname);
    END LOOP;
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (tenant_id, %I)', 'uq_' || p[1] || '_tenant_' || p[2], p[1], p[2]);
  END LOOP;
END $$;
DROP INDEX IF EXISTS idx_staff_personalnr;
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_tenant_personalnr ON staff (tenant_id, personalnr) WHERE personalnr IS NOT NULL;
DROP INDEX IF EXISTS uq_users_username;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_username ON users (tenant_id, username) WHERE username IS NOT NULL;
-- E-Mail bleibt global eindeutig (Login-Kennung ueber alle Mandanten).

-- zeit_regeln: eine Zeile je Mandant (bisher Singleton id = 1)
DO $$
DECLARE pk_spalten text[];
BEGIN
  SELECT array_agg(a.attname::text) INTO pk_spalten
  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'zeit_regeln'::regclass AND c.contype = 'p';
  IF pk_spalten IS NOT NULL AND NOT ('tenant_id' = ANY(pk_spalten)) THEN
    ALTER TABLE zeit_regeln DROP CONSTRAINT zeit_regeln_pkey;
    ALTER TABLE zeit_regeln DROP CONSTRAINT IF EXISTS zeit_regeln_id_check;
    ALTER TABLE zeit_regeln ADD PRIMARY KEY (tenant_id);
  END IF;
END $$;

-- card_sequences: Zaehler je Mandant und Standortcode
DO $$
DECLARE pk_spalten text[]; pk_name text;
BEGIN
  SELECT array_agg(a.attname::text), min(c.conname) INTO pk_spalten, pk_name
  FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'card_sequences'::regclass AND c.contype = 'p';
  IF pk_spalten IS NOT NULL AND NOT ('tenant_id' = ANY(pk_spalten)) THEN
    EXECUTE format('ALTER TABLE card_sequences DROP CONSTRAINT %I', pk_name);
    ALTER TABLE card_sequences ADD PRIMARY KEY (tenant_id, location_code);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION next_card_sequence(p_code smallint) RETURNS bigint
LANGUAGE sql AS $$
  INSERT INTO card_sequences (tenant_id, location_code, next_value) VALUES (current_tenant_id(), p_code, 2)
  ON CONFLICT (tenant_id, location_code) DO UPDATE SET next_value = card_sequences.next_value + 1
  RETURNING next_value - 1;
$$;

-- ── Row Level Security ──────────────────────────────────────────────────
DO $$
DECLARE
  tabellen text[] := ARRAY[
    'locations','lookup_lists','lookup_values','organizations','users','persons','person_location_assignments',
    'cards','distributions','duplicate_decisions','scan_documents','audit_logs','retention_rules','integration_outbox',
    'antraege','antrag_documents','antrag_nachrichten','app_events','staff','staff_dokumente','dienste','dienstplan_wochen',
    'time_events','abwesenheiten','abholstellen','fahrzeuge','tour_vorlagen','tour_vorlage_stopps','touren','tour_stopps',
    'tour_ereignisse','angebote_eingang','geraete','ausgabe_sitzungen','zeit_regeln','zivi_meldungen','betriebsfreie_tage',
    'zeit_abschluesse','card_sequences'];
  nullable text[] := ARRAY['audit_logs','app_events'];
  t text; hatte boolean;
BEGIN
  FOREACH t IN ARRAY tabellen LOOP
    -- Vorher vorhandene Policies (Organisations-Filter) merken: dann keine PERMISSIVE-Freigabe noetig
    SELECT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname NOT IN ('tenant_isolation','tenant_all','tenant_ops')) INTO hatte;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    IF t = ANY(nullable) THEN
      -- Protokolle: Zeilen des Mandanten plus mandantenlose (Jobs, Betreiber)
      EXECUTE format('CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL TO tdd_app USING (tenant_id IS NULL OR tenant_id = current_tenant_id()) WITH CHECK (tenant_id IS NULL OR tenant_id = current_tenant_id())', t);
    ELSE
      EXECUTE format('CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL TO tdd_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', t);
    END IF;
    IF NOT hatte THEN
      EXECUTE format('DROP POLICY IF EXISTS tenant_all ON %I', t);
      EXECUTE format('CREATE POLICY tenant_all ON %I AS PERMISSIVE FOR ALL TO tdd_app USING (true) WITH CHECK (true)', t);
    END IF;
    -- Betreiber (Wartung): ueber alle Mandanten, Spaltenrechte aus 032/033 begrenzen weiterhin
    EXECUTE format('DROP POLICY IF EXISTS tenant_ops ON %I', t);
    -- ohne Kontext (GUC leer) sieht der Betreiber alle Mandanten, mit gewaehltem Mandanten nur diesen
    EXECUTE format('CREATE POLICY tenant_ops ON %I AS PERMISSIVE FOR ALL TO tdd_ops USING (current_tenant_id() IS NULL OR tenant_id IS NULL OR tenant_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR tenant_id IS NULL OR tenant_id = current_tenant_id())', t);
  END LOOP;
END $$;

-- ── SECURITY-DEFINER-Funktionen ─────────────────────────────────────────
-- Einladung durch den Betreiber: Mandant explizit, sonst Kontext, sonst Vorarlberg (Bestandsschutz).
DROP FUNCTION IF EXISTS ops_invite_user(text, text, text, integer, integer);
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
REVOKE ALL ON FUNCTION ops_invite_user(text, text, text, integer, integer, uuid) FROM PUBLIC, tdd_app;
GRANT EXECUTE ON FUNCTION ops_invite_user(text, text, text, integer, integer, uuid) TO tdd_ops;

-- Benutzername eindeutig je Mandant (Logik aus 041 unveraendert, nur Mandantenfilter)
CREATE OR REPLACE FUNCTION mach_benutzername(p_anzeige text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE basis text; kandidat text; n integer := 1; teile text[]; v_tenant uuid;
BEGIN
  v_tenant := coalesce(current_tenant_id(), 'e3b29c11-0000-4000-a000-000000000000'::uuid);
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
  WHILE EXISTS (SELECT 1 FROM users WHERE username = kandidat AND tenant_id = v_tenant) LOOP
    n := n + 1; kandidat := basis || n::text;
  END LOOP;
  RETURN kandidat;
END $$;

-- Personalnummern je Mandant
CREATE OR REPLACE FUNCTION naechste_personalnr(p_typ text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE b record; n integer; v_tenant uuid;
BEGIN
  v_tenant := current_tenant_id();
  SELECT * INTO b FROM personalnr_bereich(p_typ);
  SELECT min(k) INTO n FROM generate_series(b.von, b.bis) AS k
   WHERE NOT EXISTS (SELECT 1 FROM staff WHERE personalnr = k AND (v_tenant IS NULL OR tenant_id = v_tenant));
  IF n IS NULL THEN RAISE EXCEPTION 'Kein freier Personalnummern-Bereich fuer %', p_typ; END IF;
  RETURN n;
END $$;

-- Antragsdokumente-Loeschung: nur der aufrufende Mandant (Owner-Funktion umgeht RLS)
CREATE OR REPLACE FUNCTION purge_expired_antrag_documents()
RETURNS TABLE(file_ref text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM antrag_documents
  WHERE retention_until IS NOT NULL AND retention_until <= current_date
    AND (current_tenant_id() IS NULL OR tenant_id = current_tenant_id())
  RETURNING file_ref;
$$;

-- ── Views des Betreibers: tenant_id als letzte Spalte (CREATE OR REPLACE erlaubt nur Anhaengen) ──
DROP VIEW IF EXISTS v_audit_daily;
CREATE VIEW v_audit_daily AS
SELECT date_trunc('day', at)::date AS tag, action, entity_type, count(*)::int AS n, tenant_id
FROM audit_logs
GROUP BY 1, 2, 3, tenant_id;

DROP VIEW IF EXISTS v_audit_recent;
CREATE VIEW v_audit_recent AS
SELECT a.at, a.action, a.entity_type, u.display_name AS akteur, u.role AS akteur_rolle, a.tenant_id
FROM audit_logs a
LEFT JOIN users u ON u.id = a.actor_user_id
ORDER BY a.at DESC
LIMIT 500;

DROP VIEW IF EXISTS v_login_daily;
CREATE VIEW v_login_daily AS
SELECT date_trunc('day', at)::date AS tag,
       count(*) FILTER (WHERE action = 'login')::int            AS ok,
       count(*) FILTER (WHERE action = 'login.failed')::int     AS fehl,
       count(*) FILTER (WHERE action = 'login.locked')::int     AS gesperrt,
       count(*) FILTER (WHERE action LIKE 'login.2fa.%')::int   AS zweiter_faktor_fehl,
       tenant_id
FROM audit_logs
WHERE action LIKE 'login.%'
GROUP BY 1, tenant_id;

DROP VIEW IF EXISTS v_support_benutzer;
CREATE VIEW v_support_benutzer AS
SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.totp_enabled, u.last_login, u.locked_until, u.failed_attempts,
       l.name AS standort, o.name AS organisation, o.type AS organisation_typ,
       lz.at AS zuletzt_gesehen, lz.route AS zuletzt_route,
       lz.detail->>'version' AS version, (lz.detail->>'online')::boolean AS online,
       (lz.detail->>'queue')::int AS warteschlange, lz.detail->>'ua' AS browser,
       (SELECT count(*) FROM app_events e WHERE e.user_id = u.id AND e.kind = 'FEHLER' AND e.at > now() - interval '24 hours')::int AS fehler_24h,
       (SELECT max(e.at) FROM app_events e WHERE e.user_id = u.id AND e.kind = 'FEHLER') AS letzter_fehler,
       u.tenant_id
FROM users u
LEFT JOIN locations l ON l.id = u.location_id
LEFT JOIN organizations o ON o.id = u.organization_id
LEFT JOIN LATERAL (
  SELECT at, route, detail FROM app_events e WHERE e.user_id = u.id AND e.kind = 'LEBENSZEICHEN' ORDER BY at DESC LIMIT 1
) lz ON true;

DROP VIEW IF EXISTS v_support_aktionen;
CREATE VIEW v_support_aktionen AS
SELECT actor_user_id AS user_id, at, action, entity_type, tenant_id
FROM audit_logs
WHERE actor_user_id IS NOT NULL;

DROP VIEW IF EXISTS v_support_mandanten;
CREATE VIEW v_support_mandanten AS
SELECT o.id, o.name, o.type, o.is_active,
       (SELECT count(*) FROM users u WHERE u.organization_id = o.id)::int AS konten,
       (SELECT count(*) FROM users u WHERE u.organization_id = o.id AND u.is_active)::int AS konten_aktiv,
       (SELECT max(u.last_login) FROM users u WHERE u.organization_id = o.id) AS letzter_login,
       (SELECT max(e.at) FROM app_events e WHERE e.organization_id = o.id AND e.kind = 'LEBENSZEICHEN') AS zuletzt_gesehen,
       (SELECT count(*) FROM app_events e WHERE e.organization_id = o.id AND e.kind = 'FEHLER' AND e.at > now() - interval '24 hours')::int AS fehler_24h,
       (SELECT count(*) FROM app_events e WHERE e.organization_id = o.id AND e.kind = 'FEHLER' AND e.at > now() - interval '7 days')::int AS fehler_7d,
       (SELECT count(*) FROM antraege a WHERE a.organization_id = o.id)::int AS antraege,
       (SELECT count(*) FROM antraege a WHERE a.organization_id = o.id AND a.status IN ('OFFEN','IN_PRUEFUNG'))::int AS antraege_offen,
       (SELECT max(a.created_at) FROM antraege a WHERE a.organization_id = o.id) AS letzter_antrag,
       (SELECT count(*) FROM antrag_nachrichten n WHERE n.organization_id = o.id AND n.seite = 'ORG' AND n.gelesen_at IS NULL)::int AS rueckfragen_offen,
       o.tenant_id
FROM organizations o;

GRANT SELECT ON v_audit_daily, v_audit_recent, v_login_daily, v_support_benutzer, v_support_aktionen, v_support_mandanten TO tdd_ops;

-- ── Fach-App-/Kennzahlen-Views: Owner-Views (umgehen Organisations-RLS bewusst), aber je Mandant ──
-- Fach-App (tdd_app) sieht nur den eigenen Mandanten; Betreiber (tdd_ops) ohne Kontext alle.
CREATE OR REPLACE FUNCTION tenant_sichtbar(p_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT p_tenant = current_tenant_id() OR (current_user = 'tdd_ops' AND current_tenant_id() IS NULL)
$$;
GRANT EXECUTE ON FUNCTION tenant_sichtbar(uuid) TO PUBLIC;

DROP VIEW IF EXISTS v_stats_by_location;
CREATE VIEW v_stats_by_location AS
SELECT
  l.id   AS location_id,
  l.name AS location_name,
  l.type AS location_type,
  (SELECT count(*) FROM person_location_assignments a
     JOIN persons p ON p.id = a.person_id
     WHERE a.location_id = l.id AND a.is_active
       AND p.status = 'AKTIV' AND p.deleted_at IS NULL) AS active_persons,
  (SELECT count(*) FROM cards c
     WHERE c.location_id = l.id AND c.status = 'AKTIV' AND c.deleted_at IS NULL) AS active_cards,
  l.tenant_id
FROM locations l
WHERE tenant_sichtbar(l.tenant_id);

DROP VIEW IF EXISTS v_distributions_daily;
CREATE VIEW v_distributions_daily AS
SELECT location_id, date_trunc('day', distributed_at)::date AS day, count(*) AS n, tenant_id
FROM distributions
WHERE tenant_sichtbar(tenant_id)
GROUP BY location_id, date_trunc('day', distributed_at)::date, tenant_id;

DROP VIEW IF EXISTS v_system_counts;
CREATE VIEW v_system_counts AS
SELECT
  (SELECT count(*) FROM persons WHERE deleted_at IS NULL AND tenant_sichtbar(tenant_id))         AS persons_total,
  (SELECT count(*) FROM cards   WHERE status = 'AKTIV' AND tenant_sichtbar(tenant_id))           AS active_cards,
  (SELECT count(*) FROM distributions
     WHERE distributed_at > now() - interval '30 days' AND tenant_sichtbar(tenant_id))           AS distributions_30d,
  (SELECT count(*) FROM users   WHERE is_active AND tenant_sichtbar(tenant_id))                  AS active_users;

DROP VIEW IF EXISTS v_antraege_by_origin_month;
CREATE VIEW v_antraege_by_origin_month AS
SELECT o.name AS org_name, o.type AS org_type,
       to_char(date_trunc('month', a.created_at), 'YYYY-MM') AS monat,
       count(*) AS n, a.tenant_id
FROM antraege a
JOIN organizations o ON o.id = a.organization_id
WHERE tenant_sichtbar(a.tenant_id)
GROUP BY o.name, o.type, to_char(date_trunc('month', a.created_at), 'YYYY-MM'), a.tenant_id;

DROP VIEW IF EXISTS v_rueckfragen_tdd;
CREATE VIEW v_rueckfragen_tdd AS
SELECT a.id AS antrag_id, a.organization_id, o.name AS org_name, o.type AS org_type,
       a.first_name, a.last_name, a.birth_date, a.status, a.transferred_person_id, a.created_at AS antrag_am,
       (SELECT count(*) FROM antrag_nachrichten n WHERE n.antrag_id = a.id AND n.seite = 'ORG' AND n.gelesen_at IS NULL)::int AS ungelesen,
       (SELECT max(n.created_at) FROM antrag_nachrichten n WHERE n.antrag_id = a.id) AS letzte_am,
       a.tenant_id
FROM antraege a
JOIN organizations o ON o.id = a.organization_id
WHERE EXISTS (SELECT 1 FROM antrag_nachrichten n WHERE n.antrag_id = a.id)
  AND tenant_sichtbar(a.tenant_id);

GRANT SELECT ON v_stats_by_location, v_distributions_daily, v_system_counts, v_antraege_by_origin_month, v_rueckfragen_tdd TO tdd_app;
GRANT SELECT ON v_stats_by_location, v_distributions_daily, v_system_counts, v_antraege_by_origin_month TO tdd_ops;
-- Betreiber-Views: nicht fuer die Fach-App (wie 032/033)
REVOKE ALL ON v_audit_daily, v_audit_recent, v_login_daily, v_support_benutzer, v_support_aktionen, v_support_mandanten FROM tdd_app;
