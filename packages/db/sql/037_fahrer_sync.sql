-- ════════════════════════════════════════════════════════════════════════
--  037_fahrer_sync.sql · Fahrer-Logins ohne Personal-Datensatz nachziehen
--  Dario 16.09.: "wenn ich einen Fahrer hinzugefuegt habe, muss dieser automatisch als
--  Fahrer gesetzt sein und in der Dispo waehlbar sein." Konten mit Rolle FAHRER, die vor
--  der Automatik entstanden sind, bekommen hier ihren Personal-Datensatz (Name wird am
--  letzten Leerzeichen geteilt); bestehende gleichnamige Datensaetze werden verknuepft.
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE u record; s_id uuid; vn text; nn text;
BEGIN
  FOR u IN SELECT id, display_name, email, location_id FROM users WHERE role = 'FAHRER' AND is_active
           AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.user_id = users.id) LOOP
    IF position(' ' IN u.display_name) > 0 THEN
      vn := regexp_replace(u.display_name, '\s+\S+$', '');
      nn := regexp_replace(u.display_name, '^.*\s', '');
    ELSE
      vn := u.display_name; nn := '–';
    END IF;
    SELECT id INTO s_id FROM staff WHERE lower(first_name) = lower(vn) AND lower(last_name) = lower(nn) AND user_id IS NULL AND is_active LIMIT 1;
    IF s_id IS NOT NULL THEN
      UPDATE staff SET user_id = u.id, kann_fahren = true, updated_at = now() WHERE id = s_id;
    ELSE
      INSERT INTO staff (first_name, last_name, staff_type, kann_fahren, user_id, email, location_id)
      VALUES (vn, nn, 'FAHRER', true, u.id, u.email, u.location_id);
    END IF;
  END LOOP;
END $$;

-- Wer im Personal als Fahrer:in gefuehrt wird, kann fahren – ohne Ausnahme.
UPDATE staff SET kann_fahren = true WHERE staff_type = 'FAHRER' AND NOT kann_fahren;
