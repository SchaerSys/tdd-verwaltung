-- ════════════════════════════════════════════════════════════════════════
--  060_email_je_mandant.sql · E-Mail-Adresse eindeutig je Mandant (statt systemweit)
--  Dieselbe Person darf in zwei Unternehmen ein Konto haben (z. B. Betreiber im Demo-
--  Mandanten). Die Anmeldung ohne Host-/Mandanten-Kontext findet den Mandanten weiterhin
--  ueber tenant_fuer_login – nur noch, wenn die Adresse genau einem aktiven Mandanten
--  gehoert; sonst entscheidet der Kontext (Host, /m/<kurzname>).
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_email ON users (tenant_id, email);

CREATE OR REPLACE FUNCTION tenant_fuer_login(p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_name text := lower(trim(p_name)); v_tenant uuid; v_n integer;
BEGIN
  IF v_name IS NULL OR v_name = '' THEN RETURN NULL; END IF;
  IF position('@' in v_name) > 0 THEN
    SELECT count(DISTINCT u.tenant_id), min(u.tenant_id::text)::uuid INTO v_n, v_tenant
      FROM users u WHERE u.email = v_name AND u.is_active AND tenant_aktiv(u.tenant_id);
  ELSE
    SELECT count(DISTINCT u.tenant_id), min(u.tenant_id::text)::uuid INTO v_n, v_tenant
      FROM users u WHERE u.username = v_name AND u.is_active AND tenant_aktiv(u.tenant_id);
  END IF;
  RETURN CASE WHEN v_n = 1 THEN v_tenant ELSE NULL END;
END $$;
