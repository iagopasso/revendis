-- Bootstrap default tenant context used by local development defaults.
-- Keep this migration minimal: no sample business data.

INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Revendis')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO stores (id, organization_id, name, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'Loja Principal',
  'America/Sao_Paulo'
)
ON CONFLICT (id) DO UPDATE
SET
  organization_id = EXCLUDED.organization_id,
  name = EXCLUDED.name,
  timezone = EXCLUDED.timezone;

