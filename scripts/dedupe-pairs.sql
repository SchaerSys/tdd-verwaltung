-- Kandidatenpaare fuer die Kalibrierung der Dubletten-Engine.
-- Laeuft auf dem Server gegen die Produktion (nur lesend) und schreibt eine CSV,
-- die ein Mensch in der letzten Spalte markiert (1 = dieselbe Person, 0 = nicht).
-- Die Datei enthaelt Personendaten und bleibt auf dem Server.
--
-- Drei Wege liefern Kandidaten, wie in der Live-Pruefung: aehnlicher Nachname
-- (Trigramm), gleiche Phonetik, oder gleiches Geburtsdatum. Bewusst grosszuegig,
-- damit auch Faelle dabei sind, die die Engine heute NICHT als Dublette sieht.
--
-- Aufruf: siehe scripts/dedupe-pairs.sh
-- Serverseitiges COPY (mehrzeilig erlaubt); die Datei entsteht im Container, das Skript holt sie.
COPY (
  SELECT
    a.first_name  AS vorname_a,  a.last_name AS nachname_a, a.birth_date AS gebdat_a, a.address AS adresse_a, a.postal_code AS plz_a,
    b.first_name  AS vorname_b,  b.last_name AS nachname_b, b.birth_date AS gebdat_b, b.address AS adresse_b, b.postal_code AS plz_b,
    ''            AS dublette
  FROM persons a
  JOIN persons b ON b.id > a.id
  WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
    AND (
      a.last_name_norm % b.last_name_norm
      OR (a.last_name_phon = b.last_name_phon AND a.last_name_phon <> '')
      OR (a.birth_date IS NOT NULL AND a.birth_date = b.birth_date)
    )
    -- ganz offensichtlich verschiedene Personen aussortieren, sonst wird die Liste unhandlich
    AND (a.last_name_norm % b.last_name_norm OR a.first_name_norm % b.first_name_norm OR a.birth_date = b.birth_date)
  ORDER BY similarity(a.last_name_norm, b.last_name_norm) DESC, a.last_name, a.first_name
  LIMIT 250
) TO '/tmp/dedupe-pairs.csv' WITH (FORMAT csv, DELIMITER ';', HEADER true);
