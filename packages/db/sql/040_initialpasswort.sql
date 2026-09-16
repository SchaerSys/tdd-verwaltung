-- ════════════════════════════════════════════════════════════════════════
--  040_initialpasswort.sql · Neue Benutzer bekommen ein Initialpasswort per Mail und
--  muessen es beim ersten Login aendern (Dario 16.09.). Kein Admin kennt danach ein
--  Passwort, das jemand anderer benutzt.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
GRANT SELECT (must_change_password) ON users TO tdd_ops;
