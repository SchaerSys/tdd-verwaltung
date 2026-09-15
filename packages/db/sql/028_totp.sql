-- ════════════════════════════════════════════════════════════════════════
--  028_totp.sql · Zweiter Faktor (TOTP) und Wiederherstellungscodes
-- ════════════════════════════════════════════════════════════════════════
-- totp_secret gab es schon (001). Dazu: ob der Faktor aktiv ist, die gehashten
-- Wiederherstellungscodes, und das zuletzt akzeptierte Zeitfenster gegen
-- Wiederverwendung desselben Codes innerhalb der 30 Sekunden.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled     boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery    text[]  NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_window bigint;

-- Die Wartungsrolle darf Benutzer verwalten, aber weder Passwort-Hash noch
-- TOTP-Geheimnis noch Wiederherstellungscodes lesen oder schreiben.
-- Vorher galt ein Tabellen-GRANT auf alles; jetzt Spaltenrechte.
REVOKE SELECT, INSERT, UPDATE ON users FROM tdd_ops;
GRANT SELECT (id, email, display_name, role, location_id, organization_id, is_active,
              email_verified, failed_attempts, locked_until, last_login, created_at, totp_enabled)
  ON users TO tdd_ops;
GRANT INSERT (id, email, display_name, role, location_id, organization_id, is_active, email_verified)
  ON users TO tdd_ops;
GRANT UPDATE (email, display_name, role, location_id, organization_id, is_active,
              email_verified, failed_attempts, locked_until)
  ON users TO tdd_ops;
