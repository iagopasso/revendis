-- Add inventory units and optional customer name for sales

CREATE TABLE IF NOT EXISTS inventory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  expires_at date,
  status text NOT NULL DEFAULT 'available',
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  sale_item_id uuid REFERENCES sale_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_units_status_valid') THEN
    ALTER TABLE inventory_units
      ADD CONSTRAINT inventory_units_status_valid
      CHECK (status IN ('available', 'sold', 'inactive'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_units_cost_nonneg') THEN
    ALTER TABLE inventory_units
      ADD CONSTRAINT inventory_units_cost_nonneg
      CHECK (cost >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_units_product ON inventory_units (product_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_units_store ON inventory_units (store_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_units_sale ON inventory_units (sale_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name text;

-- Backfill inventory units from existing balances using product cost/expiry
INSERT INTO inventory_units (store_id, product_id, cost, expires_at)
SELECT b.store_id,
       b.product_id,
       p.cost,
       p.expires_at
FROM inventory_balances b
JOIN products p ON p.id = b.product_id
CROSS JOIN LATERAL generate_series(1, b.quantity) AS gs
WHERE b.quantity > 0;
