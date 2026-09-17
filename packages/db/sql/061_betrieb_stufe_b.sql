-- ════════════════════════════════════════════════════════════════════════
--  061_betrieb_stufe_b.sql · Super-Admin Stufe B: Alarme, Mandanten-Loeschung (Zwei-Personen-Regel)
--
--  * ops_alarme: Zustand je Pruefung (aktiv seit, zuletzt gemeldet) – damit Alarm-Mails nur bei
--    Zustandswechsel und als Erinnerung alle 24 h gehen, nicht alle 15 Minuten.
--  * tenants.loeschung_*: Loeschung eines Mandanten braucht Antrag + Freigabe (zweite Person
--    oder 7 Tage Wartezeit) + Ausfuehrung fruehestens 7 Tage nach dem Antrag. ops_tenant_loeschen
--    prueft das in der Datenbank (Owner-Funktion), tdd_ops hat sonst kein DELETE auf tenants.
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ops_alarme (
  schluessel        text PRIMARY KEY,   -- z. B. web, db, backup, platte, zert:tdd.schaer-systems.at, fehler:<tenant>, job:cleanup
  aktiv             boolean NOT NULL DEFAULT false,
  text              text,
  seit              timestamptz,
  zuletzt_gemeldet  timestamptz,
  zuletzt_geprueft  timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ops_alarme FROM PUBLIC, tdd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops_alarme TO tdd_ops;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS loeschung_beantragt_am   timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS loeschung_beantragt_von  text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS loeschung_freigegeben_am timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS loeschung_freigegeben_von text;

CREATE OR REPLACE FUNCTION ops_tenant_loeschen(p_tenant uuid, p_von text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; v_name text;
BEGIN
  SELECT * INTO t FROM tenants WHERE id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mandant nicht gefunden'; END IF;
  IF t.id = 'e3b29c11-0000-4000-a000-000000000000' THEN RAISE EXCEPTION 'Der Bestandsmandant kann nicht ueber die Plattform geloescht werden'; END IF;
  IF t.loeschung_beantragt_am IS NULL THEN RAISE EXCEPTION 'Keine Loeschung beantragt'; END IF;
  IF t.loeschung_freigegeben_am IS NULL THEN RAISE EXCEPTION 'Loeschung nicht freigegeben'; END IF;
  IF t.loeschung_beantragt_am > now() - interval '7 days' THEN RAISE EXCEPTION 'Wartezeit von 7 Tagen seit dem Antrag noch nicht abgelaufen'; END IF;
  v_name := t.name;
  DELETE FROM tenants WHERE id = p_tenant;  -- alle Fachdaten haengen mit ON DELETE CASCADE daran
  INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after, tenant_id)
  VALUES (NULL, 'ops.tenant.delete', 'tenant', p_tenant::text, jsonb_build_object('name', v_name, 'von', p_von, 'beantragt', t.loeschung_beantragt_von, 'freigegeben', t.loeschung_freigegeben_von), NULL);
  RETURN v_name;
END $$;
REVOKE ALL ON FUNCTION ops_tenant_loeschen(uuid, text) FROM PUBLIC, tdd_app;
GRANT EXECUTE ON FUNCTION ops_tenant_loeschen(uuid, text) TO tdd_ops;
