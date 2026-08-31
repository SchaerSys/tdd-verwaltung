-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 001_init.sql
--  Vollständiges Kernschema Phase 1. Als DB-Eigentümer/Superuser einspielen:
--     psql "$ADMIN_DATABASE_URL" -f packages/db/sql/001_init.sql
-- ════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- Trigramm-Ähnlichkeit (Dubletten)
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch; -- Levenshtein/Soundex (Ergänzung)
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()

-- ── Standorte ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  type          text NOT NULL CHECK (type IN ('LADEN','AUSGABESTELLE')),
  city          text NOT NULL,
  location_code smallint NOT NULL UNIQUE CHECK (location_code BETWEEN 0 AND 999),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Konfigurierbare Auswahllisten (Sprache, Herkunft) ─────────────────────
CREATE TABLE IF NOT EXISTS lookup_lists (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE            -- z. B. 'language', 'origin'
);

CREATE TABLE IF NOT EXISTS lookup_values (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  list_id   integer NOT NULL REFERENCES lookup_lists(id) ON DELETE CASCADE,
  label     text NOT NULL,
  sort      integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (list_id, label)
);

-- ── Benutzer & Rollen ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  display_name   text NOT NULL,
  role           text NOT NULL CHECK (role IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG')),
  location_id    integer REFERENCES locations(id),
  totp_secret    text,
  is_active      boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  last_login     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Personen (PII) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS persons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  address         text,
  postal_code     text,
  city            text,
  birth_date      date,
  phone           text,
  email           text,
  household_size  smallint,
  children_count  smallint,
  language_id     integer REFERENCES lookup_values(id),
  origin_id       integer REFERENCES lookup_values(id),
  photo_ref       text,
  note            text,
  status          text NOT NULL DEFAULT 'AKTIV' CHECK (status IN ('AKTIV','INAKTIV')),
  -- Schattenfelder für die Dublettensuche (in der App via @tdd/core berechnet)
  last_name_norm  text NOT NULL DEFAULT '',
  first_name_norm text NOT NULL DEFAULT '',
  address_norm    text NOT NULL DEFAULT '',
  last_name_phon  text NOT NULL DEFAULT '',
  first_name_phon text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES users(id),
  updated_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  retention_until date
);

CREATE INDEX IF NOT EXISTS idx_persons_lastname_trgm  ON persons USING gin (last_name_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persons_firstname_trgm ON persons USING gin (first_name_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persons_address_trgm   ON persons USING gin (address_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_persons_birthdate      ON persons (birth_date);
CREATE INDEX IF NOT EXISTS idx_persons_lastname_phon  ON persons (last_name_phon);

-- ── Person ↔ Standort (Historie; höchstens eine aktive Zuordnung) ─────────
CREATE TABLE IF NOT EXISTS person_location_assignments (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id   uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES locations(id),
  valid_from  date NOT NULL DEFAULT current_date,
  valid_to    date,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- „Laden XOR Ausgabestelle" folgt automatisch: nur eine aktive Zuordnung je Person.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_assignment
  ON person_location_assignments (person_id) WHERE is_active;

-- ── Karten ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cards (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number        text NOT NULL UNIQUE,           -- EAN-13, Präfix 2
  person_id          uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  location_id        integer NOT NULL REFERENCES locations(id),
  valid_from         date NOT NULL,
  valid_to           date NOT NULL,
  status             text NOT NULL DEFAULT 'AKTIV'
                     CHECK (status IN ('AKTIV','ABGELAUFEN','GESPERRT','ERSETZT')),
  block_reason       text,
  predecessor_card_id uuid REFERENCES cards(id),
  note               text,
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cards_person ON cards (person_id);
CREATE INDEX IF NOT EXISTS idx_cards_valid_to ON cards (valid_to);

-- ── Ausgaben (nur Ereignis, keine Häufigkeitsgrenze) ──────────────────────
CREATE TABLE IF NOT EXISTS distributions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id        uuid NOT NULL REFERENCES cards(id),
  person_id      uuid NOT NULL REFERENCES persons(id),
  location_id    integer NOT NULL REFERENCES locations(id),
  distributed_at timestamptz NOT NULL DEFAULT now(),
  distributed_by uuid REFERENCES users(id),
  note           text,
  -- Idempotenz für den Offline-Puffer am Tresen (client-seitige UUID):
  client_ref     uuid UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_distributions_location_time ON distributions (location_id, distributed_at);

-- ── Dublettenentscheidungen (Override-Protokoll) ──────────────────────────
CREATE TABLE IF NOT EXISTS duplicate_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_person_id uuid REFERENCES persons(id),
  matched_person_id uuid REFERENCES persons(id),
  score            numeric(4,3),
  band             text CHECK (band IN ('HIGH','MID')),
  shown_candidates jsonb NOT NULL DEFAULT '[]',
  decision         text NOT NULL CHECK (decision IN ('CREATE_NEW','MERGED','LINKED_EXISTING')),
  reason           text,
  decided_by       uuid REFERENCES users(id),
  decided_at       timestamptz NOT NULL DEFAULT now()
);

-- ── OCR-Scans ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       uuid REFERENCES persons(id) ON DELETE SET NULL,
  file_ref        text NOT NULL,
  doc_type        text NOT NULL DEFAULT 'VEREINSFORMULAR'
                  CHECK (doc_type IN ('VEREINSFORMULAR','AUSWEIS','ALTLISTE','SONSTIGES')),
  ocr_text        text,
  ocr_confidence  real,
  uploaded_by     uuid REFERENCES users(id),
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  retention_until date
);

-- ── Audit-Log (append-only) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES users(id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text,
  before        jsonb,
  after         jsonb,
  ip            inet,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs (at);

-- ── Löschfristen (konfigurierbar) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retention_rules (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type      text NOT NULL UNIQUE,
  retention_period interval NOT NULL,
  legal_basis      text,
  is_active        boolean NOT NULL DEFAULT true
);

-- ── Integrations-Outbox (Phase-2-Naht: Ländle-Kassa / Gemeinde) ───────────
CREATE TABLE IF NOT EXISTS integration_outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
