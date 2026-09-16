-- ════════════════════════════════════════════════════════════════════════
--  026_card_sequences.sql · Atomare Nummernvergabe je Standort
--  Vorher: count(*) als Startwert und bis zu 100 Einzelabfragen; bei gleichzeitiger
--  Ausstellung an zwei Tresen entschied der Unique-Constraint, ohne Retry.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS card_sequences (
  location_code smallint PRIMARY KEY,
  next_value    bigint NOT NULL DEFAULT 1
);

-- Bestand übernehmen: höchste bereits vergebene laufende Nummer je Standort.
-- Alt-Karten (6-stellige Familien-IDs) passen nicht auf das Muster und bleiben außen vor.
INSERT INTO card_sequences (location_code, next_value)
SELECT substring(card_number FROM 2 FOR 3)::smallint,
       MAX(substring(card_number FROM 5 FOR 8)::bigint) + 1
FROM cards
WHERE card_number ~ '^2[0-9]{12}$'
GROUP BY 1
ON CONFLICT DO NOTHING;   -- Wiederholungslauf: bestehende Zaehler bleiben (seit 053 je Mandant)

-- Atomar: sperrt die Zeile, erhöht, gibt die vergebene Nummer zurück.
-- plpgsql: Body wird erst bei Ausfuehrung geprueft – 053 ersetzt die Funktion durch die Mandanten-Variante.
CREATE OR REPLACE FUNCTION next_card_sequence(p_code smallint) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE v bigint;
BEGIN
  INSERT INTO card_sequences (location_code, next_value) VALUES (p_code, 2)
  ON CONFLICT (location_code) DO UPDATE SET next_value = card_sequences.next_value + 1
  RETURNING next_value - 1 INTO v;
  RETURN v;
END $$;

GRANT SELECT, INSERT, UPDATE ON card_sequences TO tdd_app;
GRANT EXECUTE ON FUNCTION next_card_sequence(smallint) TO tdd_app;
REVOKE ALL ON card_sequences FROM tdd_ops;
