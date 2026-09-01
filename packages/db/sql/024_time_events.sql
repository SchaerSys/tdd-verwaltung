-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 024_time_events.sql · A2 Zeiterfassung
--  Stempel-Ereignisse (Kommen/Gehen/Pause) je Mitarbeiter:in. Aus den
--  Ereignissen werden Tages-/Wochensummen berechnet (§ 26 AZG-Aufzeichnung).
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS time_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  kind        text NOT NULL,                              -- IN | OUT | BREAK_START | BREAK_END
  at          timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL DEFAULT 'TERMINAL_MANUAL',    -- TERMINAL_NFC | TERMINAL_MANUAL | KORREKTUR
  note        text,
  edited      boolean NOT NULL DEFAULT false,             -- true = manuell korrigiert/nacherfasst
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_time_events_staff_at ON time_events (staff_id, at);

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'tdd_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON time_events TO tdd_app;
  END IF;
END $$;
