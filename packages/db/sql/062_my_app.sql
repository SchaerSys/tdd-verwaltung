-- ════════════════════════════════════════════════════════════════════════
--  062_my_app.sql · myTafelwerk (Handy-App): Aufgaben, Push-Abos, Stempeln aus der App
--  * aufgaben: Buero verteilt Arbeiten an eine Person oder an alle; Erledigt-Vermerk aus der App.
--  * push_abos: Web-Push-Abonnements je Personal-Datensatz (Endpunkt beim Browser-Push-Dienst,
--    Schluessel fuer die verschluesselte Zustellung). Inhalte gehen verschluesselt, der Push-
--    Dienst des Browserherstellers sieht nur, DASS eine Nachricht kommt.
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS aufgaben (
  tenant_id     uuid NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titel         text NOT NULL,
  beschreibung  text,
  staff_id      uuid REFERENCES staff(id) ON DELETE CASCADE,   -- NULL = fuer alle
  faellig_am    date,
  prio          text NOT NULL DEFAULT 'NORMAL' CHECK (prio IN ('NIEDRIG','NORMAL','HOCH')),
  erledigt_am   timestamptz,
  erledigt_von  uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aufgaben_tenant_offen ON aufgaben (tenant_id, erledigt_am) WHERE erledigt_am IS NULL;
CREATE INDEX IF NOT EXISTS idx_aufgaben_staff ON aufgaben (staff_id);

CREATE TABLE IF NOT EXISTS push_abos (
  tenant_id     uuid NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  zuletzt_ok    timestamptz,
  fehler        integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_abos_staff ON push_abos (staff_id);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['aufgaben','push_abos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL TO tdd_app USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_all ON %I', t);
    EXECUTE format('CREATE POLICY tenant_all ON %I AS PERMISSIVE FOR ALL TO tdd_app USING (true) WITH CHECK (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_ops ON %I', t);
    EXECUTE format('CREATE POLICY tenant_ops ON %I AS PERMISSIVE FOR ALL TO tdd_ops USING (current_tenant_id() IS NULL OR tenant_id = current_tenant_id()) WITH CHECK (current_tenant_id() IS NULL OR tenant_id = current_tenant_id())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO tdd_app', t);
  END LOOP;
END $$;
-- Betreiber: nur Zaehler (keine Aufgabentexte, keine Endpunkte)
REVOKE ALL ON aufgaben, push_abos FROM tdd_ops;
GRANT SELECT (tenant_id, id, staff_id, created_at, zuletzt_ok, fehler) ON push_abos TO tdd_ops;
