-- ════════════════════════════════════════════════════════════════════════
--  034_touren.sql · A4 Touren & Disposition (Dario 15.09.2026: "Routenplanung und
--  Disposition der Fahrer, damit die Planung ein Vielfaches einfacher wird")
--
--  Stammdaten: Abholstellen (Betriebe), Fahrzeuge, Fahrer-Eigenschaften am Personal.
--  Wochenplan: Tourvorlagen je Wochentag mit Stopp-Abfolge.
--  Tagesdisposition: Touren je Datum (aus Vorlage oder frei) mit Fahrer/Fahrzeug,
--  Stopps mit Erledigung und Mengen (gerettete Lebensmittel).
--  Abwesenheiten (Urlaub/krank) fuer die Konfliktpruefung; Posteingang der
--  Abholangebote von der Homepage (Schnittstelle docs/Schnittstelle-Tourenplanung.md).
--  Keine Klientendaten – alles Betriebsdaten; tdd_ops bekommt nur Zaehl-Sichten spaeter.
-- ════════════════════════════════════════════════════════════════════════

-- ── Rollen: FAHRER (nur eigene Tour am Handy) ─────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG','SACHBEARBEITER','FAHRER'));

-- ── Personal: Fahrer-Eigenschaften + Verknuepfung zum Login ───────────────
ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS kann_fahren boolean NOT NULL DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS fuehrerschein text;          -- z. B. "B", "B, C1"
ALTER TABLE staff ADD COLUMN IF NOT EXISTS fahrer_tage smallint[] NOT NULL DEFAULT '{}'; -- 1=Mo … 7=So, leer = alle
UPDATE staff SET kann_fahren = true WHERE staff_type = 'FAHRER' AND kann_fahren = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_user ON staff (user_id) WHERE user_id IS NOT NULL;

-- ── Abwesenheiten (Urlaub, Krankenstand, Sonstiges) ───────────────────────
CREATE TABLE IF NOT EXISTS abwesenheiten (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  art        text NOT NULL CHECK (art IN ('URLAUB','KRANK','SONSTIG')),
  von        date NOT NULL,
  bis        date NOT NULL,
  notiz      text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (bis >= von)
);
CREATE INDEX IF NOT EXISTS idx_abwesenheiten_staff ON abwesenheiten (staff_id, von, bis);

-- ── Abholstellen (Betriebe, die Ware abgeben) ─────────────────────────────
CREATE TABLE IF NOT EXISTS abholstellen (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL,
  art            text NOT NULL DEFAULT 'SONSTIGES',  -- SUPERMARKT | BAECKEREI | GROSSHANDEL | GASTRO | LANDWIRT | SONSTIGES
  strasse        text,
  plz            text,
  ort            text,
  ansprechperson text,
  telefon        text,
  email          text,
  kuehlbedarf    boolean NOT NULL DEFAULT false,
  abholtage      smallint[] NOT NULL DEFAULT '{}',   -- 1=Mo … 7=So
  fenster_von    time,
  fenster_bis    time,
  hinweise       text,                               -- "Rampe hinten, Klingel am Tor"
  lat            double precision,
  lng            double precision,
  is_active      boolean NOT NULL DEFAULT true,
  angebot_id     integer,                            -- Herkunft: Angebot von der Homepage
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abholstellen_aktiv ON abholstellen (is_active, name);

-- ── Fahrzeuge ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fahrzeuge (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kennzeichen     text NOT NULL UNIQUE,
  bezeichnung     text NOT NULL,                     -- "VW e-Crafter Kühl"
  kuehlung        boolean NOT NULL DEFAULT false,
  elektrisch      boolean NOT NULL DEFAULT false,
  reichweite_km   integer,
  ladevolumen     text,                              -- "12 Rollcontainer" / "8 m³"
  location_id     integer REFERENCES locations(id),  -- Heimatstandort
  pickerl_bis     date,                              -- §57a
  ausser_betrieb_von date,                           -- Werkstatt
  ausser_betrieb_bis date,
  hinweise        text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Wochenplan: Tourvorlagen + Stopps ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_vorlagen (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text NOT NULL,                        -- "Bludenz Montag"
  wochentag    smallint NOT NULL CHECK (wochentag BETWEEN 1 AND 7),
  startzeit    time,
  start_location_id integer REFERENCES locations(id),
  fahrzeug_id  integer REFERENCES fahrzeuge(id),
  fahrer_id    uuid REFERENCES staff(id),
  hinweise     text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tour_vorlage_stopps (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vorlage_id     integer NOT NULL REFERENCES tour_vorlagen(id) ON DELETE CASCADE,
  reihenfolge    integer NOT NULL,
  art            text NOT NULL CHECK (art IN ('ABHOLUNG','LIEFERUNG')),
  abholstelle_id integer REFERENCES abholstellen(id),
  location_id    integer REFERENCES locations(id),   -- Ziel bei LIEFERUNG (Ausgabestelle/Lager)
  hinweis        text,
  CHECK ((art = 'ABHOLUNG' AND abholstelle_id IS NOT NULL) OR (art = 'LIEFERUNG' AND location_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tour_vorlage_stopps ON tour_vorlage_stopps (vorlage_id, reihenfolge);

-- ── Tagesdisposition: Touren + Stopps ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS touren (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  datum        date NOT NULL,
  vorlage_id   integer REFERENCES tour_vorlagen(id) ON DELETE SET NULL,
  name         text NOT NULL,
  startzeit    time,
  start_location_id integer REFERENCES locations(id),
  fahrzeug_id  integer REFERENCES fahrzeuge(id),
  fahrer_id    uuid REFERENCES staff(id),
  beifahrer_id uuid REFERENCES staff(id),
  status       text NOT NULL DEFAULT 'GEPLANT' CHECK (status IN ('GEPLANT','UNTERWEGS','ABGESCHLOSSEN','AUSGEFALLEN')),
  gestartet_at timestamptz,
  beendet_at   timestamptz,
  km_start     integer,
  km_ende      integer,
  hinweise     text,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_touren_datum ON touren (datum);
CREATE INDEX IF NOT EXISTS idx_touren_fahrer ON touren (fahrer_id, datum);
-- Eine Vorlage hoechstens einmal je Tag (Erzeugen ist idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS uq_touren_vorlage_datum ON touren (vorlage_id, datum) WHERE vorlage_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tour_stopps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id        uuid NOT NULL REFERENCES touren(id) ON DELETE CASCADE,
  reihenfolge    integer NOT NULL,
  art            text NOT NULL CHECK (art IN ('ABHOLUNG','LIEFERUNG')),
  abholstelle_id integer REFERENCES abholstellen(id),
  location_id    integer REFERENCES locations(id),
  hinweis        text,
  status         text NOT NULL DEFAULT 'OFFEN' CHECK (status IN ('OFFEN','ERLEDIGT','NICHT_MOEGLICH')),
  erledigt_at    timestamptz,
  menge_kisten   integer,
  menge_kg       numeric(8,1),
  bemerkung      text
);
CREATE INDEX IF NOT EXISTS idx_tour_stopps_tour ON tour_stopps (tour_id, reihenfolge);

-- ── Posteingang: Abholangebote von der Homepage ───────────────────────────
CREATE TABLE IF NOT EXISTS angebote_eingang (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  homepage_id    integer NOT NULL UNIQUE,
  betrieb        text NOT NULL,
  daten          jsonb NOT NULL,                     -- komplettes Angebot laut Schnittstelle
  eingegangen    timestamptz NOT NULL,
  abgeholt_at    timestamptz NOT NULL DEFAULT now(),
  stand          text NOT NULL DEFAULT 'NEU' CHECK (stand IN ('NEU','UEBERNOMMEN','ABGELEHNT')),
  abholstelle_id integer REFERENCES abholstellen(id),
  entschieden_by uuid REFERENCES users(id),
  entschieden_at timestamptz,
  rueckgemeldet  boolean NOT NULL DEFAULT false      -- Rueckmeldung an die Homepage erfolgt
);

-- ── Rechte ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON abwesenheiten, abholstellen, fahrzeuge, tour_vorlagen, tour_vorlage_stopps, touren, tour_stopps, angebote_eingang TO tdd_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tdd_app;
-- Wartung: Fahrzeuge/Abholstellen sind Betriebsdaten ohne Personenbezug (Ansprechpersonen sind Geschaeftskontakte).
GRANT SELECT ON fahrzeuge TO tdd_ops;
REVOKE ALL ON abwesenheiten, abholstellen, tour_vorlagen, tour_vorlage_stopps, touren, tour_stopps, angebote_eingang FROM tdd_ops;

-- Einladung ueber die Wartungsplattform kennt die neue Rolle.
CREATE OR REPLACE FUNCTION ops_invite_user(p_email text, p_display_name text, p_role text,
                                           p_location_id integer, p_organization_id integer)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_raw text;
BEGIN
  IF p_role NOT IN ('ADMIN','ERFASSUNG','AUSGABE','AUSWERTUNG','SACHBEARBEITER','FAHRER') THEN
    RAISE EXCEPTION 'Unbekannte Rolle %', p_role;
  END IF;
  INSERT INTO users (email, password_hash, display_name, role, location_id, organization_id, is_active, email_verified)
  VALUES (lower(trim(p_email)), '!', trim(p_display_name), p_role, p_location_id, p_organization_id, true, true)
  RETURNING id INTO v_id;
  v_raw := encode(gen_random_bytes(32), 'hex');
  INSERT INTO auth_tokens (user_id, type, token_hash, expires_at)
  VALUES (v_id, 'RESET', encode(sha256(v_raw::bytea), 'hex'), now() + interval '72 hours');
  RETURN v_raw;
END $$;
