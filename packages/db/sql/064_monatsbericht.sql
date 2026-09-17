-- ════════════════════════════════════════════════════════════════════════
--  064_monatsbericht.sql · Monatsbericht per E-Mail (Empfaenger je Mandant, z. B. Obmann)
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS monatsbericht_email text;   -- leer = kein Versand; mehrere mit Komma
