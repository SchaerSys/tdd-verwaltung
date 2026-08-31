-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 021_dashboard_widgets.sql
--  (1) Öffnungszeiten je Standort (strukturiert, jsonb)
--  (2) Persönliche Dashboard-Einstellungen je Benutzer (Favoriten, Widgets,
--      Nav ein-/ausgeblendet)
-- ════════════════════════════════════════════════════════════════════════

-- (1) Öffnungszeiten: { "mon":[{"from":"09:00","to":"12:00"}], "tue":[...], ... }
--     Wochentagsschlüssel mon/tue/wed/thu/fri/sat/sun; leer/NULL = keine Angabe.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS opening_hours jsonb;

-- (2) Dashboard-Präferenzen je Benutzer.
--     favorites: Array von Nav-Pfaden, z. B. ["/personen","/karten"]
--     widgets:   Array von Widget-Specs, z. B. [{"type":"weather"},{"type":"location","id":5},{"type":"expiring"}]
CREATE TABLE IF NOT EXISTS user_dashboard_prefs (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  favorites     jsonb NOT NULL DEFAULT '[]'::jsonb,
  widgets       jsonb NOT NULL DEFAULT '[]'::jsonb,
  nav_collapsed boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
