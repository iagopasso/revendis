CREATE TABLE IF NOT EXISTS reseller_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_brand text,
  profitability numeric(5,2) NOT NULL DEFAULT 0,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_brands_org_name_unique
  ON reseller_brands (organization_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_reseller_brands_org_created_at
  ON reseller_brands (organization_id, created_at DESC);
