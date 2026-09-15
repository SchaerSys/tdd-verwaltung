-- ════════════════════════════════════════════════════════════════════════
--  030_standorte_zusammenfuehren.sql · Caritas-Standorte aufloesen, Bregenz -> Hard
--  Auftrag Dario 15.09.2026. Bludenz Caritas -> Bludenz, Dornbirn Caritas -> Dornbirn,
--  Feldkirch Caritas -> Feldkirch. Die Ausgabestelle "Bregenz" heisst tatsaechlich Hard.
--
--  Datenmigration, laeuft genau einmal: nur wenn die Caritas-Standorte noch existieren.
--  Gruppe bleibt (Zeitfenster am Ausgabetag), Nummern werden hinter den bestehenden
--  fortgesetzt, weil beide Seiten je Gruppe ab 1 zaehlten (259/460/396 Kollisionen).
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  paar record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM locations WHERE name IN ('Bludenz Caritas','Dornbirn Caritas','Feldkirch Caritas')) THEN
    RAISE NOTICE '030: bereits ausgefuehrt, nichts zu tun';
    RETURN;
  END IF;

  FOR paar IN
    SELECT q.id AS quelle, q.location_code AS quelle_code, z.id AS ziel, q.name AS qname, z.name AS zname
    FROM (VALUES ('Bludenz Caritas','Bludenz'), ('Dornbirn Caritas','Dornbirn'), ('Feldkirch Caritas','Feldkirch')) v(qn, zn)
    JOIN locations q ON q.name = v.qn
    JOIN locations z ON z.name = v.zn
  LOOP
    -- 1) Nummern der uebernommenen Familien je Gruppe hinter dem Maximum des Ziels fortsetzen.
    WITH ziel_max AS (
      SELECT p.gruppe, coalesce(max(p.ausgabe_number), 0) AS m
      FROM persons p JOIN person_location_assignments a ON a.person_id = p.id AND a.is_active
      WHERE a.location_id = paar.ziel AND p.deleted_at IS NULL GROUP BY p.gruppe
    ),
    neu AS (
      SELECT p.id,
             coalesce(zm.m, 0) + row_number() OVER (PARTITION BY p.gruppe ORDER BY p.ausgabe_number, p.created_at) AS nr
      FROM persons p
      JOIN person_location_assignments a ON a.person_id = p.id AND a.is_active AND a.location_id = paar.quelle
      LEFT JOIN ziel_max zm ON zm.gruppe = p.gruppe
      WHERE p.deleted_at IS NULL AND p.gruppe IS NOT NULL AND p.ausgabe_number IS NOT NULL
    )
    UPDATE persons p SET ausgabe_number = neu.nr, updated_at = now() FROM neu WHERE p.id = neu.id;

    -- 2) Alle Verweise umhaengen.
    UPDATE person_location_assignments SET location_id = paar.ziel WHERE location_id = paar.quelle;
    UPDATE cards         SET location_id = paar.ziel WHERE location_id = paar.quelle;
    UPDATE distributions SET location_id = paar.ziel WHERE location_id = paar.quelle;
    UPDATE users         SET location_id = paar.ziel WHERE location_id = paar.quelle;
    UPDATE staff         SET location_id = paar.ziel WHERE location_id = paar.quelle;
    UPDATE antraege      SET intended_location_id = paar.ziel WHERE intended_location_id = paar.quelle;

    -- 3) Quelle entfernen (Kartennummern-Sequenz gleich mit).
    DELETE FROM card_sequences WHERE location_code = paar.quelle_code;
    DELETE FROM locations WHERE id = paar.quelle;

    RAISE NOTICE '030: % -> % zusammengefuehrt', paar.qname, paar.zname;
  END LOOP;

  -- 4) Bregenz heisst Hard.
  UPDATE locations SET name = 'Hard', city = 'Hard' WHERE name = 'Bregenz' AND type = 'AUSGABESTELLE';
  RAISE NOTICE '030: Bregenz -> Hard';
END $$;
