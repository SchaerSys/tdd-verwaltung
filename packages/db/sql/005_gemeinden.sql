-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 005_gemeinden.sql · Alle 96 Gemeinden Vorarlbergs
--  Ersetzt die 5 Platzhalter-Gemeinden aus 004 durch die vollständige Liste.
-- ════════════════════════════════════════════════════════════════════════

-- Platzhalter aus 004 entfernen (nur wenn nicht referenziert – aktuell keine Nutzer/Anträge)
DELETE FROM organizations
WHERE type = 'GEMEINDE'
  AND name IN ('Stadt Bludenz','Stadt Feldkirch','Stadt Dornbirn','Marktgemeinde Götzis','Marktgemeinde Hard')
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.organization_id = organizations.id)
  AND NOT EXISTS (SELECT 1 FROM antraege a WHERE a.organization_id = organizations.id);

INSERT INTO organizations (name, type) VALUES
  -- Bezirk Bludenz (29)
  ('Bartholomäberg','GEMEINDE'),('Blons','GEMEINDE'),('Bludenz','GEMEINDE'),('Bludesch','GEMEINDE'),
  ('Brand','GEMEINDE'),('Bürs','GEMEINDE'),('Bürserberg','GEMEINDE'),('Dalaas','GEMEINDE'),
  ('Fontanella','GEMEINDE'),('Gaschurn','GEMEINDE'),('Innerbraz','GEMEINDE'),('Klösterle','GEMEINDE'),
  ('Lech','GEMEINDE'),('Lorüns','GEMEINDE'),('Ludesch','GEMEINDE'),('Nenzing','GEMEINDE'),
  ('Nüziders','GEMEINDE'),('Raggal','GEMEINDE'),('St. Anton im Montafon','GEMEINDE'),
  ('St. Gallenkirch','GEMEINDE'),('St. Gerold','GEMEINDE'),('Schruns','GEMEINDE'),('Silbertal','GEMEINDE'),
  ('Sonntag','GEMEINDE'),('Stallehr','GEMEINDE'),('Thüringen','GEMEINDE'),('Thüringerberg','GEMEINDE'),
  ('Tschagguns','GEMEINDE'),('Vandans','GEMEINDE'),
  -- Bezirk Bregenz (40)
  ('Alberschwende','GEMEINDE'),('Andelsbuch','GEMEINDE'),('Au','GEMEINDE'),('Bezau','GEMEINDE'),
  ('Bildstein','GEMEINDE'),('Bizau','GEMEINDE'),('Bregenz','GEMEINDE'),('Buch','GEMEINDE'),
  ('Damüls','GEMEINDE'),('Doren','GEMEINDE'),('Egg','GEMEINDE'),('Eichenberg','GEMEINDE'),
  ('Fußach','GEMEINDE'),('Gaißau','GEMEINDE'),('Hard','GEMEINDE'),('Hittisau','GEMEINDE'),
  ('Höchst','GEMEINDE'),('Hörbranz','GEMEINDE'),('Hohenweiler','GEMEINDE'),('Kennelbach','GEMEINDE'),
  ('Krumbach','GEMEINDE'),('Langen bei Bregenz','GEMEINDE'),('Langenegg','GEMEINDE'),('Lauterach','GEMEINDE'),
  ('Lingenau','GEMEINDE'),('Lochau','GEMEINDE'),('Mellau','GEMEINDE'),('Mittelberg','GEMEINDE'),
  ('Möggers','GEMEINDE'),('Reuthe','GEMEINDE'),('Riefensberg','GEMEINDE'),('Schnepfau','GEMEINDE'),
  ('Schoppernau','GEMEINDE'),('Schröcken','GEMEINDE'),('Schwarzach','GEMEINDE'),('Schwarzenberg','GEMEINDE'),
  ('Sibratsgfäll','GEMEINDE'),('Sulzberg','GEMEINDE'),('Warth','GEMEINDE'),('Wolfurt','GEMEINDE'),
  -- Bezirk Dornbirn (3)
  ('Dornbirn','GEMEINDE'),('Hohenems','GEMEINDE'),('Lustenau','GEMEINDE'),
  -- Bezirk Feldkirch (24)
  ('Altach','GEMEINDE'),('Düns','GEMEINDE'),('Dünserberg','GEMEINDE'),('Feldkirch','GEMEINDE'),
  ('Fraxern','GEMEINDE'),('Frastanz','GEMEINDE'),('Göfis','GEMEINDE'),('Götzis','GEMEINDE'),
  ('Klaus','GEMEINDE'),('Koblach','GEMEINDE'),('Laterns','GEMEINDE'),('Mäder','GEMEINDE'),
  ('Meiningen','GEMEINDE'),('Rankweil','GEMEINDE'),('Röns','GEMEINDE'),('Röthis','GEMEINDE'),
  ('Satteins','GEMEINDE'),('Schlins','GEMEINDE'),('Schnifis','GEMEINDE'),('Sulz','GEMEINDE'),
  ('Übersaxen','GEMEINDE'),('Viktorsberg','GEMEINDE'),('Weiler','GEMEINDE'),('Zwischenwasser','GEMEINDE')
ON CONFLICT (name) DO NOTHING;
