-- ════════════════════════════════════════════════════════════════════════
--  TDD-Verwaltung · 008_reporting.sql · Anträge-Reporting (RLS-konform)
--  Owner-View umgeht RLS und liefert NUR Aggregatzahlen (keine PII) an TDD.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_antraege_by_origin_month AS
SELECT o.name AS org_name, o.type AS org_type,
       to_char(date_trunc('month', a.created_at), 'YYYY-MM') AS monat,
       count(*) AS n
FROM antraege a
JOIN organizations o ON o.id = a.organization_id
GROUP BY o.name, o.type, to_char(date_trunc('month', a.created_at), 'YYYY-MM');

GRANT SELECT ON v_antraege_by_origin_month TO tdd_app;
GRANT SELECT ON v_antraege_by_origin_month TO tdd_ops;
