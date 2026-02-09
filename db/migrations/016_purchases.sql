CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier text NOT NULL,
  brand text,
  status text NOT NULL DEFAULT 'pending',
  total numeric(12,2) NOT NULL,
  items integer NOT NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_total_positive;

ALTER TABLE purchases
  ADD CONSTRAINT purchases_total_positive CHECK (total > 0);

ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_items_positive;

ALTER TABLE purchases
  ADD CONSTRAINT purchases_items_positive CHECK (items > 0);

ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_status_valid;

ALTER TABLE purchases
  ADD CONSTRAINT purchases_status_valid CHECK (status IN ('pending', 'received', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_purchases_store_created
  ON purchases (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_status
  ON purchases (status);

CREATE INDEX IF NOT EXISTS idx_purchases_brand
  ON purchases (brand);
