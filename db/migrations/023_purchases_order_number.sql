ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS order_number text;

CREATE INDEX IF NOT EXISTS idx_purchases_order_number
  ON purchases (order_number);
