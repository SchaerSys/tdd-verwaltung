-- ════════════════════════════════════════════════════════════════════════
--  025_login_hardening.sql · Sperre nach zu vielen Fehlversuchen
--  failed_attempts existierte, wurde aber nie hochgezaehlt. Jetzt zaehlt der
--  Login mit und sperrt nach 5 Fehlversuchen fuer 15 Minuten.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_locked ON users (locked_until) WHERE locked_until IS NOT NULL;
