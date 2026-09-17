-- ════════════════════════════════════════════════════════════════════════
--  059_pk_je_mandant.sql · Natuerliche Schluessel je Mandant
--  dienstplan_wochen (woche_start) und betriebsfreie_tage (datum) hatten seit 053 einen
--  mandantenuebergreifenden Primaerschluessel: zwei Mandanten konnten dieselbe Woche/den
--  selben Tag nicht beide anlegen. Jetzt (tenant_id, …). geraet_codes.code bleibt global
--  (Kopplungscodes sind kurzlebig und muessen ueber alle Mandanten eindeutig sein).
--  Idempotent.
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE cols text[];
BEGIN
  SELECT array_agg(a.attname::text ORDER BY a.attnum) INTO cols
  FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = 'dienstplan_wochen'::regclass AND i.indisprimary;
  IF cols IS DISTINCT FROM ARRAY['tenant_id','woche_start'] THEN
    ALTER TABLE dienstplan_wochen DROP CONSTRAINT IF EXISTS dienstplan_wochen_pkey;
    ALTER TABLE dienstplan_wochen ADD PRIMARY KEY (tenant_id, woche_start);
  END IF;
  SELECT array_agg(a.attname::text ORDER BY a.attnum) INTO cols
  FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = 'betriebsfreie_tage'::regclass AND i.indisprimary;
  IF cols IS DISTINCT FROM ARRAY['tenant_id','datum'] THEN
    ALTER TABLE betriebsfreie_tage DROP CONSTRAINT IF EXISTS betriebsfreie_tage_pkey;
    ALTER TABLE betriebsfreie_tage ADD PRIMARY KEY (tenant_id, datum);
  END IF;
END $$;
