-- ════════════════════════════════════════════════════════════════════════
--  031_portal_ausbau.sql · Portal Gemeinde/Institution: Verlaengerung + Rueckfragen
--  Auftrag Dario 15.09.2026 ("zur gemeinde baue alle 6").
--
--  1) antraege.vorgaenger_antrag_id: ein Verlaengerungsantrag kennt seinen Vorgaenger
--     (vorbefuellt statt neu erfasst), Historie je Klient:in bleibt nachvollziehbar.
--  2) antrag_nachrichten: Rueckfragen/Verlauf zwischen Organisation und TDD je Antrag.
--     RLS: mit gesetztem app.org_id nur die eigene Organisation (Portal); ohne
--     app.org_id (TDD-Backoffice) alle – die Nachrichten sind ausdruecklich an TDD
--     gerichtet. Die Antraege selbst bleiben fuer TDD weiterhin unsichtbar (004).
--  3) v_rueckfragen_tdd: Owner-View, damit TDD zum Beantworten Name/Organisation
--     sieht – nur fuer Antraege, zu denen es Nachrichten gibt (Kontakt von der
--     Organisation ausdruecklich eroeffnet), keine Finanzdaten.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE antraege ADD COLUMN IF NOT EXISTS vorgaenger_antrag_id uuid REFERENCES antraege(id);
CREATE INDEX IF NOT EXISTS idx_antraege_vorgaenger ON antraege (vorgaenger_antrag_id) WHERE vorgaenger_antrag_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS antrag_nachrichten (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  antrag_id       uuid NOT NULL REFERENCES antraege(id) ON DELETE CASCADE,
  organization_id integer NOT NULL REFERENCES organizations(id),
  seite           text NOT NULL CHECK (seite IN ('ORG', 'TDD')),
  autor_user_id   uuid REFERENCES users(id),
  autor_name      text NOT NULL DEFAULT '',
  text            text NOT NULL CHECK (length(text) BETWEEN 1 AND 4000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  gelesen_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_antrag_nachrichten_antrag ON antrag_nachrichten (antrag_id, created_at);
CREATE INDEX IF NOT EXISTS idx_antrag_nachrichten_ungelesen ON antrag_nachrichten (organization_id, seite) WHERE gelesen_at IS NULL;

ALTER TABLE antrag_nachrichten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS antrag_nachrichten_sicht ON antrag_nachrichten;
CREATE POLICY antrag_nachrichten_sicht ON antrag_nachrichten FOR ALL
  USING (NULLIF(current_setting('app.org_id', true), '') IS NULL
         OR organization_id = NULLIF(current_setting('app.org_id', true), '')::int)
  WITH CHECK (NULLIF(current_setting('app.org_id', true), '') IS NULL
         OR organization_id = NULLIF(current_setting('app.org_id', true), '')::int);

GRANT SELECT, INSERT, UPDATE ON antrag_nachrichten TO tdd_app;

DROP VIEW IF EXISTS v_rueckfragen_tdd;
CREATE VIEW v_rueckfragen_tdd AS
SELECT a.id AS antrag_id, a.organization_id, o.name AS org_name, o.type AS org_type,
       a.first_name, a.last_name, a.birth_date, a.status, a.transferred_person_id, a.created_at AS antrag_am,
       (SELECT count(*) FROM antrag_nachrichten n WHERE n.antrag_id = a.id AND n.seite = 'ORG' AND n.gelesen_at IS NULL)::int AS ungelesen,
       (SELECT max(n.created_at) FROM antrag_nachrichten n WHERE n.antrag_id = a.id) AS letzte_am
FROM antraege a
JOIN organizations o ON o.id = a.organization_id
WHERE EXISTS (SELECT 1 FROM antrag_nachrichten n WHERE n.antrag_id = a.id);

GRANT SELECT ON v_rueckfragen_tdd TO tdd_app;
