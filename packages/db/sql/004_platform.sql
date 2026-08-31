-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 004_platform.sql · Multi-Mandanten-Plattform (ADDITIV)
--  Als DB-Eigentümer NACH 001–003 einspielen. Bricht die bestehende App nicht.
-- ════════════════════════════════════════════════════════════════════════

-- ── Organisationen (Mandanten) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      text NOT NULL UNIQUE,
  type      text NOT NULL CHECK (type IN ('TDD','GEMEINDE','INSTITUTION')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO organizations (name, type) VALUES
  ('Tischlein deck dich',            'TDD'),
  ('Caritas Vorarlberg',             'INSTITUTION'),
  ('IfS – Institut für Sozialdienste','INSTITUTION'),
  ('Volkshilfe Vorarlberg',          'INSTITUTION'),
  ('Aktion Leben Vorarlberg',        'INSTITUTION'),
  ('DOWAS',                          'INSTITUTION'),
  ('pro mente Vorarlberg',           'INSTITUTION'),
  ('Do It Yourself',                 'INSTITUTION'),
  ('aks Vorarlberg',                 'INSTITUTION'),
  ('Rettet das Kind Vorarlberg',     'INSTITUTION'),
  ('Stadt Bludenz',                  'GEMEINDE'),
  ('Stadt Feldkirch',                'GEMEINDE'),
  ('Stadt Dornbirn',                 'GEMEINDE'),
  ('Marktgemeinde Götzis',           'GEMEINDE'),
  ('Marktgemeinde Hard',             'GEMEINDE')
ON CONFLICT (name) DO NOTHING;

-- ── users: Organisation + neue Rolle SACHBEARBEITER ───────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id integer REFERENCES organizations(id);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG','SACHBEARBEITER'));
-- bestehende Nutzer der TDD-Organisation zuordnen
UPDATE users SET organization_id = (SELECT id FROM organizations WHERE type='TDD' LIMIT 1)
WHERE organization_id IS NULL;

-- ── persons: Herkunfts-Antrag (Provenienz) ────────────────────────────────
ALTER TABLE persons ADD COLUMN IF NOT EXISTS source_antrag_id uuid;

-- ── Anträge (mit Anspruchsprüfung) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS antraege (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES organizations(id),
  target_type     text NOT NULL DEFAULT 'AUSGABESTELLE' CHECK (target_type IN ('LADEN','AUSGABESTELLE')),
  intended_location_id integer REFERENCES locations(id),
  -- Antragsteller-Stammdaten
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  address         text,
  postal_code     text,
  city            text,
  birth_date      date,
  phone           text,
  email           text,
  language_id     integer REFERENCES lookup_values(id),
  origin_id       integer REFERENCES lookup_values(id),
  -- Haushalts-Aufschlüsselung (für Einkommensgrenze)
  adults          smallint NOT NULL DEFAULT 1,
  children_u12    smallint NOT NULL DEFAULT 0,
  children_o12    smallint NOT NULL DEFAULT 0,
  pets            text,
  -- Anspruchsprüfung
  financials      jsonb NOT NULL DEFAULT '{}',
  income_total    numeric(10,2),
  expense_total   numeric(10,2),
  available_income numeric(10,2),
  income_limit    numeric(10,2),
  status          text NOT NULL DEFAULT 'OFFEN' CHECK (status IN ('OFFEN','IN_PRUEFUNG','POSITIV','NEGATIV')),
  decision_reason text,
  decided_by      uuid REFERENCES users(id),
  decided_at      timestamptz,
  transferred_person_id uuid REFERENCES persons(id),
  -- DSGVO-Einwilligung (Formular)
  consent_given   boolean NOT NULL DEFAULT false,
  consent_at      date,
  -- Schattenfelder (Cross-Mandanten-Dubletten)
  last_name_norm  text NOT NULL DEFAULT '',
  first_name_norm text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_antraege_org ON antraege (organization_id);
CREATE INDEX IF NOT EXISTS idx_antraege_status ON antraege (status);
CREATE INDEX IF NOT EXISTS idx_antraege_name ON antraege (last_name_norm, first_name_norm);

CREATE TABLE IF NOT EXISTS antrag_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  antrag_id      uuid NOT NULL REFERENCES antraege(id) ON DELETE CASCADE,
  file_ref       text NOT NULL,
  doc_type       text NOT NULL DEFAULT 'SONSTIGES',
  note           text,
  uploaded_by    uuid REFERENCES users(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  retention_until date
);
CREATE INDEX IF NOT EXISTS idx_antrag_documents_antrag ON antrag_documents (antrag_id);

-- ── RLS: strikte Mandantentrennung ────────────────────────────────────────
ALTER TABLE antraege ENABLE ROW LEVEL SECURITY;
ALTER TABLE antrag_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS antraege_org ON antraege;
CREATE POLICY antraege_org ON antraege FOR ALL
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::int)
  WITH CHECK (organization_id = NULLIF(current_setting('app.org_id', true), '')::int);

DROP POLICY IF EXISTS antrag_documents_org ON antrag_documents;
CREATE POLICY antrag_documents_org ON antrag_documents FOR ALL
  USING (EXISTS (SELECT 1 FROM antraege a WHERE a.id = antrag_id
                 AND a.organization_id = NULLIF(current_setting('app.org_id', true), '')::int))
  WITH CHECK (EXISTS (SELECT 1 FROM antraege a WHERE a.id = antrag_id
                 AND a.organization_id = NULLIF(current_setting('app.org_id', true), '')::int));

-- ── Cross-Mandanten-Dublettencheck (SECURITY DEFINER: umgeht RLS,
--    liefert nur groben Hinweis, KEINE Fremddetails) ──────────────────────
CREATE OR REPLACE FUNCTION check_person_exists(p_last text, p_first text, p_birth date)
RETURNS TABLE(where_label text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'TDD'::text
    FROM persons WHERE last_name_norm = p_last AND first_name_norm = p_first
      AND (p_birth IS NULL OR birth_date = p_birth) AND deleted_at IS NULL
  UNION
  SELECT DISTINCT o.type
    FROM antraege a JOIN organizations o ON o.id = a.organization_id
    WHERE a.last_name_norm = p_last AND a.first_name_norm = p_first
      AND (p_birth IS NULL OR a.birth_date = p_birth) AND a.status <> 'NEGATIV';
$$;

-- ── Grants ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON antraege, antrag_documents TO tdd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO tdd_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tdd_app;
GRANT EXECUTE ON FUNCTION check_person_exists(text, text, date) TO tdd_app;

-- Wartungsrolle darf Organisationen (Metadaten) lesen, aber KEINE Anträge (PII).
GRANT SELECT ON organizations TO tdd_ops;
REVOKE ALL ON antraege, antrag_documents FROM tdd_ops;
