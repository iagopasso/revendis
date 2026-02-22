-- Preview da correcao de datas de vendas antigas.
-- Nao altera dados.

WITH params AS (
  SELECT TIMESTAMPTZ '2026-02-22 00:00:00+00' AS cutoff_utc
),
candidates AS (
  SELECT s.id,
         s.created_at AS old_created_at,
         s.created_at + INTERVAL '12 hours' AS new_created_at
  FROM sales s
  CROSS JOIN params p
  WHERE s.created_at < p.cutoff_utc
    AND (s.created_at AT TIME ZONE 'UTC')::time = TIME '00:00:00'
)
SELECT COUNT(*)::int AS candidate_rows,
       MIN(old_created_at) AS oldest_created_at,
       MAX(old_created_at) AS newest_created_at
FROM candidates;

WITH params AS (
  SELECT TIMESTAMPTZ '2026-02-22 00:00:00+00' AS cutoff_utc
),
candidates AS (
  SELECT s.id,
         s.created_at AS old_created_at,
         s.created_at + INTERVAL '12 hours' AS new_created_at
  FROM sales s
  CROSS JOIN params p
  WHERE s.created_at < p.cutoff_utc
    AND (s.created_at AT TIME ZONE 'UTC')::time = TIME '00:00:00'
)
SELECT id, old_created_at, new_created_at
FROM candidates
ORDER BY old_created_at DESC
LIMIT 100;
