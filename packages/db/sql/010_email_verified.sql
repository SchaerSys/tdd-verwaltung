-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 010_email_verified.sql · Admin-Freigabe für Registrierungen
--  is_active = finaler Login-Gate (erst nach Admin-Freigabe true).
--  email_verified = E-Mail-Bestätigung erfolgt (Zwischenschritt).
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT true;
-- Bestehende Nutzer gelten als verifiziert (default true).
