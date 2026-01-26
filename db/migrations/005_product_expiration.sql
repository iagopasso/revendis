-- Add product expiration tracking

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS expires_at date;

CREATE INDEX IF NOT EXISTS idx_products_expires_at ON products (expires_at);

UPDATE products
SET expires_at = CURRENT_DATE + 7
WHERE id = '00000000-0000-0000-0000-000000000301'
  AND expires_at IS NULL;
