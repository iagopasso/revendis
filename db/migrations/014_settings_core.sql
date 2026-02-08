CREATE TABLE IF NOT EXISTS organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  owner_name text,
  owner_email text,
  owner_phone text,
  business_name text,
  subscription_plan text NOT NULL DEFAULT 'Essencial',
  subscription_status text NOT NULL DEFAULT 'active',
  subscription_renewal_date date,
  subscription_monthly_price numeric(12,2) NOT NULL DEFAULT 0,
  pix_key_type text,
  pix_key_value text,
  pix_holder_name text,
  alert_enabled boolean NOT NULL DEFAULT true,
  alert_days_before_due integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_users_org_created ON users (organization_id, created_at DESC);

INSERT INTO organization_settings (organization_id, business_name)
SELECT o.id, o.name
FROM organizations o
ON CONFLICT (organization_id) DO NOTHING;
