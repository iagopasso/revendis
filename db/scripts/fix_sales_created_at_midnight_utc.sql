-- Corrige vendas antigas com created_at em 00:00:00 UTC (bug de deslocamento de dia no frontend).
-- Estrategia:
-- 1) Mantem o mesmo dia de calendario.
-- 2) Move o horario para 12:00:00 UTC (evita cair no dia anterior em fusos negativos).
--
-- Ajuste o cutoff abaixo se necessario:
-- - somente vendas com created_at < cutoff_utc serao alteradas.
-- - use a data/hora em que o fix foi para producao.

-- 1) PREVIEW: resumo de linhas candidatas
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

-- 2) PREVIEW: amostra (ultimas 100 linhas candidatas)
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

-- 3) APPLY: executa a correcao
BEGIN;

WITH params AS (
  SELECT TIMESTAMPTZ '2026-02-22 00:00:00+00' AS cutoff_utc
),
updated AS (
  UPDATE sales s
     SET created_at = s.created_at + INTERVAL '12 hours'
    FROM params p
   WHERE s.created_at < p.cutoff_utc
     AND (s.created_at AT TIME ZONE 'UTC')::time = TIME '00:00:00'
  RETURNING s.id,
            s.created_at - INTERVAL '12 hours' AS old_created_at,
            s.created_at AS new_created_at
)
SELECT COUNT(*)::int AS rows_updated,
       MIN(old_created_at) AS oldest_updated_created_at,
       MAX(old_created_at) AS newest_updated_created_at
FROM updated;

COMMIT;

-- 4) VERIFY: confirma se ainda restou linha candidata
WITH params AS (
  SELECT TIMESTAMPTZ '2026-02-22 00:00:00+00' AS cutoff_utc
)
SELECT COUNT(*)::int AS remaining_candidates
FROM sales s
CROSS JOIN params p
WHERE s.created_at < p.cutoff_utc
  AND (s.created_at AT TIME ZONE 'UTC')::time = TIME '00:00:00';
