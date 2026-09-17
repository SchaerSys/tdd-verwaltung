-- ════════════════════════════════════════════════════════════════════════
--  058_tenants_rechte.sql · Fach-App darf Mandanten nur lesen (Spaltenrechte aus 057)
--  Ein frueheres GRANT ALL hatte tdd_app auch INSERT/UPDATE/DELETE auf tenants gelassen.
-- ════════════════════════════════════════════════════════════════════════
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON tenants FROM tdd_app;
