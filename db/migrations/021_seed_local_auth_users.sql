-- Local credential users for development login.
-- Keeps admin and adds a reseller profile.

INSERT INTO users (organization_id, name, email, role, active)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Administrador Revendis',
    'admin@revendis.local',
    'owner',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Usuario Revenda',
    'revenda@revendis.local',
    'seller',
    true
  )
ON CONFLICT (email) DO UPDATE
SET
  organization_id = EXCLUDED.organization_id,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  active = true;
