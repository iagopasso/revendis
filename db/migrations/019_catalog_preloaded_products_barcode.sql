ALTER TABLE catalog_preloaded_products
  ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS idx_catalog_preloaded_products_org_barcode
  ON catalog_preloaded_products (organization_id, barcode);
