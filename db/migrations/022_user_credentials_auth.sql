CREATE TABLE IF NOT EXISTS user_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO user_credentials (user_id, password_hash)
SELECT
  u.id,
  crypt('Admin@123456', gen_salt('bf'))
FROM users u
WHERE lower(u.email) = 'admin@revendis.local'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_credentials (user_id, password_hash)
SELECT
  u.id,
  crypt('Revenda@123456', gen_salt('bf'))
FROM users u
WHERE lower(u.email) = 'revenda@revendis.local'
ON CONFLICT (user_id) DO NOTHING;
