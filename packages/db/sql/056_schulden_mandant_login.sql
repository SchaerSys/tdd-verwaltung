-- ════════════════════════════════════════════════════════════════════════
--  056_schulden_mandant_login.sql · Schulden am Tresen, Mandant fuer Token-Ablaeufe
--
--  * distributions.buchungsart: AUSGABE (Tresen, faellig = Preis), TILGUNG (reine Schulden-
--    zahlung), ERLASS (Buero, faellig negativ, kein Geldfluss). Saldo bleibt bezahlt - faellig.
--  * zeit_regeln.schulden_*: Grenzen je Mandant – ab Warnung roter Hinweis am Tresen, ab Sperre
--    keine Ausgabe ohne Begleichung (Freigabe nur durchs Buero = Erlass oder Zahlung).
--  * tenant_fuer_benutzer(uuid): Passwort-/Bestaetigungslinks kommen ueber den gemeinsamen Host
--    an; die Fach-App muss den Mandanten des Kontos kennen, sonst trifft das Update (RLS) nichts.
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE distributions ADD COLUMN IF NOT EXISTS buchungsart text NOT NULL DEFAULT 'AUSGABE';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'distributions_buchungsart_check') THEN
    ALTER TABLE distributions ADD CONSTRAINT distributions_buchungsart_check CHECK (buchungsart IN ('AUSGABE','TILGUNG','ERLASS'));
  END IF;
END $$;
-- Bestand: reine Schuldenzahlungen (faellig 0, bezahlt > 0) als TILGUNG kennzeichnen
UPDATE distributions SET buchungsart = 'TILGUNG'
 WHERE buchungsart = 'AUSGABE' AND coalesce(amount_due, 0) = 0 AND coalesce(amount_paid, 0) > 0
   AND (note = 'Schulden beglichen' OR note IS NULL);

ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS schulden_warnung_eur    numeric(6,2) NOT NULL DEFAULT 10.00;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS schulden_sperre_eur     numeric(6,2) NOT NULL DEFAULT 20.00;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS schulden_warnung_anzahl integer      NOT NULL DEFAULT 2;
ALTER TABLE zeit_regeln ADD COLUMN IF NOT EXISTS schulden_sperre_anzahl  integer      NOT NULL DEFAULT 4;

-- Mandant eines Kontos (fuer Token-Ablaeufe ueber den gemeinsamen Host)
CREATE OR REPLACE FUNCTION tenant_fuer_benutzer(p_user uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT u.tenant_id FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = p_user AND t.is_active LIMIT 1
$$;
REVOKE ALL ON FUNCTION tenant_fuer_benutzer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenant_fuer_benutzer(uuid) TO tdd_app;

-- Offene Schulden je Person (Owner-Sicht, mandantengefiltert): fuer Tresen-Liste und Buero
DROP VIEW IF EXISTS v_schulden;
CREATE VIEW v_schulden AS
SELECT p.tenant_id, p.id AS person_id, p.first_name, p.last_name, p.gruppe, p.ausgabe_number,
       pla.location_id, l.name AS location_name,
       round(coalesce(sum(d.amount_due), 0) - coalesce(sum(d.amount_paid), 0), 2) AS offen,
       count(*) FILTER (WHERE d.buchungsart = 'AUSGABE' AND coalesce(d.amount_paid, 0) < coalesce(d.amount_due, 0)) AS offene_ausgaben,
       max(d.distributed_at) AS zuletzt
FROM persons p
JOIN distributions d ON d.person_id = p.id
LEFT JOIN person_location_assignments pla ON pla.person_id = p.id AND pla.is_active
LEFT JOIN locations l ON l.id = pla.location_id
WHERE p.deleted_at IS NULL AND tenant_sichtbar(p.tenant_id)
GROUP BY p.tenant_id, p.id, p.first_name, p.last_name, p.gruppe, p.ausgabe_number, pla.location_id, l.name
HAVING coalesce(sum(d.amount_due), 0) - coalesce(sum(d.amount_paid), 0) > 0.005;
REVOKE ALL ON v_schulden FROM PUBLIC, tdd_ops;
GRANT SELECT ON v_schulden TO tdd_app;
