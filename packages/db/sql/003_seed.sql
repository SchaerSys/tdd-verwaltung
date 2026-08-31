-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 003_seed.sql · Grundstammdaten
--  Idempotent (ON CONFLICT DO NOTHING). Nach 001/002 einspielen.
-- ════════════════════════════════════════════════════════════════════════

-- ── Standorte (location_code fließt in die EAN-13-Kartennummer) ───────────
INSERT INTO locations (name, type, city, location_code) VALUES
  ('Min Guata Lada Bludenz',   'LADEN',         'Bludenz',   101),
  ('Min Guata Lada Feldkirch', 'LADEN',         'Feldkirch', 102),
  ('Min Guata Lada Dornbirn',  'LADEN',         'Dornbirn',  103),
  ('Ausgabestelle Bludenz',    'AUSGABESTELLE', 'Bludenz',   201),
  ('Ausgabestelle Feldkirch',  'AUSGABESTELLE', 'Feldkirch', 202),
  ('Ausgabestelle Götzis',     'AUSGABESTELLE', 'Götzis',    203),
  ('Ausgabestelle Dornbirn',   'AUSGABESTELLE', 'Dornbirn',  204),
  ('Ausgabestelle Hard',       'AUSGABESTELLE', 'Hard',      205)
ON CONFLICT (name) DO NOTHING;

-- ── Auswahllisten ─────────────────────────────────────────────────────────
INSERT INTO lookup_lists (code) VALUES ('language'), ('origin')
ON CONFLICT (code) DO NOTHING;

INSERT INTO lookup_values (list_id, label, sort)
SELECT l.id, v.label, v.sort
FROM lookup_lists l
JOIN (VALUES
  ('language','Deutsch',1),('language','Türkisch',2),('language','Arabisch',3),
  ('language','Ukrainisch',4),('language','Englisch',5),('language','Sonstige',9)
) AS v(code,label,sort) ON v.code = l.code
ON CONFLICT (list_id, label) DO NOTHING;

INSERT INTO lookup_values (list_id, label, sort)
SELECT l.id, v.label, v.sort
FROM lookup_lists l
JOIN (VALUES
  ('origin','Sozialamt',1),('origin','Gemeinde',2),('origin','Caritas',3),
  ('origin','AMS',4),('origin','Eigenmeldung',5),('origin','Sonstige',9)
) AS v(code,label,sort) ON v.code = l.code
ON CONFLICT (list_id, label) DO NOTHING;

-- ── Löschfristen (Default-Vorschlag; vom Verein/DSB zu bestätigen) ─────────
INSERT INTO retention_rules (entity_type, retention_period, legal_basis) VALUES
  ('person',        interval '3 years', 'Standard: 3 Jahre nach letzter Aktivität'),
  ('scan_document', interval '90 days', 'Rohscan-Löschung nach bestätigter Übernahme'),
  ('audit_log',     interval '3 years', 'Nachvollziehbarkeit / Rechenschaftspflicht')
ON CONFLICT (entity_type) DO NOTHING;
