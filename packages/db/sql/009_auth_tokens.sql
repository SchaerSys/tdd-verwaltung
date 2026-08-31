-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 009_auth_tokens.sql · Passwort-Reset + Konto-Bestätigung
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('RESET','VERIFY')),
  token_hash text NOT NULL,           -- sha256 des per E-Mail versandten Tokens
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens (token_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON auth_tokens TO tdd_app;
