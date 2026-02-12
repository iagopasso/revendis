CREATE TABLE IF NOT EXISTS catalog_preloaded_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_brand text NOT NULL,
  code text NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  brand text NOT NULL,
  source_line_brand text,
  price numeric(12,2),
  purchase_price numeric(12,2),
  in_stock boolean NOT NULL DEFAULT true,
  image_url text,
  source_category text,
  source_url text,
  fetched_source text NOT NULL DEFAULT 'upstream' CHECK (fetched_source IN ('upstream', 'sample')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_brand, sku)
);

CREATE INDEX IF NOT EXISTS idx_catalog_preloaded_products_org_brand
  ON catalog_preloaded_products (organization_id, source_brand);

CREATE INDEX IF NOT EXISTS idx_catalog_preloaded_products_org_name
  ON catalog_preloaded_products (organization_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_catalog_preloaded_products_org_sku
  ON catalog_preloaded_products (organization_id, sku);
