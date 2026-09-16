-- ════════════════════════════════════════════════════════════════════════
--  032_ops.sql · Wartungsplattform (apps/ops) auf der Rolle tdd_ops
--  Entscheidungen 34–37 (decisions.md): eigene Anmeldung, nur Betreiber, nur
--  Metadaten – die PII-Sperre von 002 bleibt unangetastet. Alles, was tdd_ops
--  an Personendaten NICHT sehen darf, wird hier auch nicht geoeffnet.
--
--  1) ops_users: Konten der Wartungsplattform (Schaer Systems), getrennt von users.
--  2) Hilfsfunktionen (SECURITY DEFINER): Benutzer einladen, Passwort-Link, 2FA
--     zuruecksetzen – weil tdd_ops password_hash/totp_* weder lesen noch schreiben darf.
--     Die Funktionen fassen genau diese Spalten an und geben nur ein Einmal-Token zurueck.
--  3) Protokoll-Sichten ohne Personenbezug (kein entity_id, kein before/after, keine IP).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) Konten der Wartungsplattform ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ops_users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE,
  password_hash    text NOT NULL,
  display_name     text NOT NULL,
  totp_secret      text,
  totp_enabled     boolean NOT NULL DEFAULT false,
  totp_recovery    text[] NOT NULL DEFAULT '{}',
  totp_last_window bigint,
  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_login       timestamptz,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ops_users FROM tdd_app;
GRANT SELECT, INSERT, UPDATE ON ops_users TO tdd_ops;

-- Anfragen der Wartungsplattform an den Host (Backup jetzt, Wartungsmodus) laufen
-- ueber Dateien in /opt/tdd/ops – bewusst keine Docker-Rechte im Container.

-- ── 2) Hilfsfunktionen ────────────────────────────────────────────────────
-- Benutzer einladen: Konto ohne brauchbares Passwort ('!' passt auf keinen Hash),
-- dazu ein RESET-Token (72 h); der Link fuehrt in der Fach-App auf /passwort-neu.
CREATE OR REPLACE FUNCTION ops_invite_user(p_email text, p_display_name text, p_role text,
                                           p_location_id integer, p_organization_id integer)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_raw text;
BEGIN
  IF p_role NOT IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG','SACHBEARBEITER') THEN
    RAISE EXCEPTION 'Unbekannte Rolle %', p_role;
  END IF;
  INSERT INTO users (email, password_hash, display_name, role, location_id, organization_id, is_active, email_verified)
  VALUES (lower(trim(p_email)), '!', trim(p_display_name), p_role, p_location_id, p_organization_id, true, true)
  RETURNING id INTO v_id;
  v_raw := encode(gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
  VALUES (v_id, 'RESET', encode(sha256(v_raw::bytea), 'hex'), now() + interval '72 hours');
  RETURN v_raw;
END $$;

-- Passwort-Link fuer ein bestehendes Konto (24 h), z. B. wenn die Mail verloren ging.
CREATE OR REPLACE FUNCTION ops_password_reset_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_raw text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND is_active) THEN
    RAISE EXCEPTION 'Benutzer nicht gefunden oder gesperrt';
  END IF;
  v_raw := encode(gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
  VALUES (p_user_id, 'RESET', encode(sha256(v_raw::bytea), 'hex'), now() + interval '24 hours');
  RETURN v_raw;
END $$;

-- Zweiten Faktor zuruecksetzen (Handy verloren): Geheimnis und Codes loeschen.
CREATE OR REPLACE FUNCTION ops_reset_totp(p_user_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users SET totp_enabled = false, totp_secret = NULL, totp_recovery = '{}', totp_last_window = NULL
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION ops_invite_user(text, text, text, integer, integer) FROM PUBLIC, tdd_app;
REVOKE ALL ON FUNCTION ops_password_reset_token(uuid) FROM PUBLIC, tdd_app;
REVOKE ALL ON FUNCTION ops_reset_totp(uuid) FROM PUBLIC, tdd_app;
GRANT EXECUTE ON FUNCTION ops_invite_user(text, text, text, integer, integer) TO tdd_ops;
GRANT EXECUTE ON FUNCTION ops_password_reset_token(uuid) TO tdd_ops;
GRANT EXECUTE ON FUNCTION ops_reset_totp(uuid) TO tdd_ops;

-- ── 3) Protokoll ohne Personenbezug ───────────────────────────────────────
-- audit_logs selbst bleibt fuer tdd_ops gesperrt (entity_id/after enthalten z. B. E-Mail-Adressen).
DROP VIEW IF EXISTS v_audit_daily;
CREATE VIEW v_audit_daily AS
SELECT date_trunc('day', at)::date AS tag, action, entity_type, count(*)::int AS n
FROM audit_logs
GROUP BY 1, 2, 3;

DROP VIEW IF EXISTS v_audit_recent;
CREATE VIEW v_audit_recent AS
SELECT a.at, a.action, a.entity_type, u.display_name AS akteur, u.role AS akteur_rolle
FROM audit_logs a
LEFT JOIN users u ON u.id = a.actor_user_id
ORDER BY a.at DESC
LIMIT 500;

-- Anmeldungen/Fehlversuche je Tag – Angriffserkennung ohne Namen.
DROP VIEW IF EXISTS v_login_daily;
CREATE VIEW v_login_daily AS
SELECT date_trunc('day', at)::date AS tag,
       count(*) FILTER (WHERE action = 'login')::int            AS ok,
       count(*) FILTER (WHERE action = 'login.failed')::int     AS fehl,
       count(*) FILTER (WHERE action = 'login.locked')::int     AS gesperrt,
       count(*) FILTER (WHERE action LIKE 'login.2fa.%')::int   AS zweiter_faktor_fehl
FROM audit_logs
WHERE action LIKE 'login.%'
GROUP BY 1;

REVOKE ALL ON audit_logs FROM tdd_ops;
GRANT INSERT ON audit_logs TO tdd_ops;   -- eigene Aktionen der Wartungsplattform protokollieren
GRANT SELECT ON v_audit_daily, v_audit_recent, v_login_daily TO tdd_ops;

-- Kennzahlen, die die Fach-App schon liefert, auch der Wartung: Standort-Namen sind keine PII.
GRANT SELECT ON locations, lookup_lists, lookup_values, retention_rules, organizations TO tdd_ops;
GRANT UPDATE (is_active) ON organizations TO tdd_ops;   -- Organisation stilllegen, sonst nichts
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tdd_ops;
