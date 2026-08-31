-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 002_roles.sql
--  DB-Rollen + DSGVO-Trennung. Als DB-Eigentümer/Superuser NACH 001_init.sql
--  einspielen. Passwörter danach separat setzen (NICHT in dieser Datei):
--     ALTER ROLE tdd_app  WITH PASSWORD '…';
--     ALTER ROLE tdd_ops  WITH PASSWORD '…';
-- ════════════════════════════════════════════════════════════════════════

-- ── Rollen anlegen (Login, kein Superuser) ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tdd_app') THEN
    CREATE ROLE tdd_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tdd_ops') THEN
    CREATE ROLE tdd_ops LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END$$;

-- ── Fach-App-Rolle: voller Zugriff auf die Fachtabellen ───────────────────
GRANT USAGE ON SCHEMA public TO tdd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tdd_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tdd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tdd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tdd_app;

-- ════════════════════════════════════════════════════════════════════════
--  Wartungsrolle tdd_ops · NUR Metadaten, KEIN PII-Lesezugriff.
--  Grundsatz: KEIN Tabellenzugriff auf persons/scan_documents/distributions/
--  cards/person_location_assignments/duplicate_decisions. Kennzahlen kommen
--  ausschließlich aus PII-freien Aggregat-Views (Ansichten laufen mit den
--  Rechten ihres Eigentümers, nicht des Aufrufers → tdd_ops sieht nur Zahlen).
-- ════════════════════════════════════════════════════════════════════════
GRANT USAGE ON SCHEMA public TO tdd_ops;

-- Betrieb: Benutzer/Rollen verwalten + Konfiguration (kein Berechtigten-PII)
GRANT SELECT, INSERT, UPDATE ON users           TO tdd_ops;
GRANT SELECT, INSERT, UPDATE, DELETE ON locations       TO tdd_ops;
GRANT SELECT, INSERT, UPDATE, DELETE ON lookup_lists    TO tdd_ops;
GRANT SELECT, INSERT, UPDATE, DELETE ON lookup_values   TO tdd_ops;
GRANT SELECT, INSERT, UPDATE, DELETE ON retention_rules TO tdd_ops;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tdd_ops;

-- ── PII-freie Aggregat-Views (nur Zahlen) ─────────────────────────────────
CREATE OR REPLACE VIEW v_stats_by_location AS
SELECT
  l.id                              AS location_id,
  l.name                            AS location_name,
  l.type                            AS location_type,
  count(DISTINCT p.id) FILTER (WHERE p.status = 'AKTIV' AND p.deleted_at IS NULL) AS active_persons,
  count(DISTINCT c.id) FILTER (WHERE c.status = 'AKTIV')                          AS active_cards
FROM locations l
LEFT JOIN person_location_assignments a ON a.location_id = l.id AND a.is_active
LEFT JOIN persons p ON p.id = a.person_id
LEFT JOIN cards   c ON c.location_id = l.id
GROUP BY l.id, l.name, l.type;

CREATE OR REPLACE VIEW v_distributions_daily AS
SELECT location_id, date_trunc('day', distributed_at)::date AS day, count(*) AS n
FROM distributions
GROUP BY location_id, date_trunc('day', distributed_at)::date;

CREATE OR REPLACE VIEW v_system_counts AS
SELECT
  (SELECT count(*) FROM persons WHERE deleted_at IS NULL)         AS persons_total,
  (SELECT count(*) FROM cards   WHERE status = 'AKTIV')           AS active_cards,
  (SELECT count(*) FROM distributions
     WHERE distributed_at > now() - interval '30 days')           AS distributions_30d,
  (SELECT count(*) FROM users   WHERE is_active)                  AS active_users;

-- Views gehören dem Migrations-Eigentümer; tdd_ops darf NUR sie lesen.
GRANT SELECT ON v_stats_by_location, v_distributions_daily, v_system_counts TO tdd_ops;

-- Sicherheitsnetz: explizit KEIN Zugriff auf die PII-Tabellen für tdd_ops.
REVOKE ALL ON persons, scan_documents, distributions, cards,
              person_location_assignments, duplicate_decisions FROM tdd_ops;
