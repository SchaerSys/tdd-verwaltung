-- ════════════════════════════════════════════════════════════════════════
--  039_fahrer_stammdaten.sql · Fahrer:innen ohne Login, aber mit Adresse
--  Dario 16.09.: "man muss trotzdem wissen, wer gefahren ist – Fahrer sollen kein Login
--  erhalten, sondern einfach als Fahrer hinterlegt werden mit Name, Adresse, Telefon."
--  Adresse kommt ans Personal; wer gefahren ist, waehlt der Fahrer beim Start am Tablet.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE staff ADD COLUMN IF NOT EXISTS strasse text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS plz text;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS ort text;
