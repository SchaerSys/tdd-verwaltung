-- ════════════════════════════════════════════════════════════════════════
--  042_ops_registrierung.sql · Portal-Registrierungen (Gemeinden/Institutionen) gibt nur
--  noch der Betreiber frei oder lehnt sie ab (Dario 16.09.: "das sehe nur ich in der
--  Wartungsplattform"). Ablehnen = Loeschen eines nie aktivierten Kontos; tdd_ops bekommt
--  dafuer kein allgemeines DELETE, sondern genau diese Funktion.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION ops_reject_registration(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM users WHERE id = p_user_id AND is_active = false AND role = 'SACHBEARBEITER' AND last_login IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION ops_reject_registration(uuid) FROM PUBLIC, tdd_app;
GRANT EXECUTE ON FUNCTION ops_reject_registration(uuid) TO tdd_ops;
