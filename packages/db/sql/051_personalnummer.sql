-- ════════════════════════════════════════════════════════════════════════
--  051_personalnummer.sql · Numerische Personalnummern
--  Festangestellte 1–99, Zivildiener 100–199, Ehrenamtliche und Fahrer:innen 200–9999.
--  Vergabe automatisch beim Anlegen (naechste freie Nummer im Bereich), Bestand wird
--  nachgezogen (aeltester Datensatz zuerst). Eindeutig ueber alle Bereiche.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE staff ADD COLUMN IF NOT EXISTS personalnr integer;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_personalnr ON staff (personalnr) WHERE personalnr IS NOT NULL;

CREATE OR REPLACE FUNCTION personalnr_bereich(p_typ text, OUT von integer, OUT bis integer)
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_typ = 'ANGESTELLT' THEN 1 WHEN p_typ = 'ZIVILDIENER' THEN 100 ELSE 200 END,
         CASE WHEN p_typ = 'ANGESTELLT' THEN 99 WHEN p_typ = 'ZIVILDIENER' THEN 199 ELSE 9999 END;
$$;

-- Naechste freie Nummer im Bereich der Art
CREATE OR REPLACE FUNCTION naechste_personalnr(p_typ text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE b record; n integer;
BEGIN
  SELECT * INTO b FROM personalnr_bereich(p_typ);
  SELECT min(k) INTO n FROM generate_series(b.von, b.bis) AS k
   WHERE NOT EXISTS (SELECT 1 FROM staff WHERE personalnr = k);
  IF n IS NULL THEN RAISE EXCEPTION 'Kein freier Personalnummern-Bereich fuer %', p_typ; END IF;
  RETURN n;
END $$;

-- Bestand: ohne Nummer oder mit Nummer ausserhalb des Bereichs der Art -> neu vergeben
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT s.id, s.staff_type, s.personalnr, b.von, b.bis FROM staff s, LATERAL personalnr_bereich(s.staff_type) b
           WHERE s.personalnr IS NULL OR s.personalnr < b.von OR s.personalnr > b.bis
           ORDER BY s.created_at, s.last_name LOOP
    UPDATE staff SET personalnr = naechste_personalnr(r.staff_type) WHERE id = r.id;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION naechste_personalnr(text), personalnr_bereich(text) TO tdd_app;
