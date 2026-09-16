-- ════════════════════════════════════════════════════════════════════════
--  033_support.sql · Support-Sicht der Wartungsplattform (Dario 15.09.2026:
--  "Ansicht direkt auf die Plattform des jeweiligen Users, um zu sehen, was
--  falsch laeuft im Falle eines Ausfalls")
--
--  Kein Blick in fremde Sitzungen und keine Personendaten – stattdessen meldet die
--  Fach-App selbst, was der Wartung hilft: Fehler (Route, Meldung, Kennung) und
--  Lebenszeichen (Version, online/offline, Warteschlange des Kiosks, Browser).
--  Die Meldungen werden in der App bereinigt (keine E-Mail-Adressen, keine langen
--  Zahlenfolgen), damit die Tabelle fuer tdd_ops lesbar sein darf.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS app_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL CHECK (kind IN ('FEHLER', 'LEBENSZEICHEN')),
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  role            text,
  location_id     integer,
  organization_id integer,
  route           text,
  message         text,
  digest          text,
  detail          jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_app_events_user_at ON app_events (user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_at ON app_events (at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_digest ON app_events (digest) WHERE digest IS NOT NULL;

GRANT SELECT, INSERT, DELETE ON app_events TO tdd_app;   -- melden + Aufraeumjob (30 Tage)
GRANT SELECT ON app_events TO tdd_ops;

-- Je Benutzer: Stammdaten (freigegebene Spalten) + letztes Lebenszeichen + Fehlerlage.
DROP VIEW IF EXISTS v_support_benutzer;
CREATE VIEW v_support_benutzer AS
SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.totp_enabled, u.last_login, u.locked_until, u.failed_attempts,
       l.name AS standort, o.name AS organisation, o.type AS organisation_typ,
       lz.at AS zuletzt_gesehen, lz.route AS zuletzt_route,
       lz.detail->>'version' AS version, (lz.detail->>'online')::boolean AS online,
       (lz.detail->>'queue')::int AS warteschlange, lz.detail->>'ua' AS browser,
       (SELECT count(*) FROM app_events e WHERE e.user_id = u.id AND e.kind = 'FEHLER' AND e.at > now() - interval '24 hours')::int AS fehler_24h,
       (SELECT max(e.at) FROM app_events e WHERE e.user_id = u.id AND e.kind = 'FEHLER') AS letzter_fehler
FROM users u
LEFT JOIN locations l ON l.id = u.location_id
LEFT JOIN organizations o ON o.id = u.organization_id
LEFT JOIN LATERAL (
  SELECT at, route, detail FROM app_events e WHERE e.user_id = u.id AND e.kind = 'LEBENSZEICHEN' ORDER BY at DESC LIMIT 1
) lz ON true;

-- Aktionen eines Benutzers aus dem Audit-Log, ohne Datensatz-Bezug (was, nicht an wem).
DROP VIEW IF EXISTS v_support_aktionen;
CREATE VIEW v_support_aktionen AS
SELECT actor_user_id AS user_id, at, action, entity_type
FROM audit_logs
WHERE actor_user_id IS NOT NULL;

GRANT SELECT ON v_support_benutzer, v_support_aktionen TO tdd_ops;

-- Mandanten-Sicht: jede Gemeinde/Institution (und TDD selbst) als Einheit – Konten,
-- Aktivitaet, Fehler, Antraege nur als Zahlen. Owner-View umgeht RLS auf antraege
-- ausschliesslich fuer diese Aggregation.
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
       (SELECT count(*) FROM antrag_nachrichten n WHERE n.organization_id = o.id AND n.seite = 'ORG' AND n.gelesen_at IS NULL)::int AS rueckfragen_offen
FROM organizations o;

GRANT SELECT ON v_support_mandanten TO tdd_ops;
-- Die Sichten gehoeren der Wartung; die Fach-App braucht sie nicht (Default-Privilegien aus 002 zuruecknehmen).
REVOKE ALL ON v_support_mandanten, v_support_benutzer, v_support_aktionen FROM tdd_app;
