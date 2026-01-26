-- Sprint 2 constraints and indexes (idempotent)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_price_nonneg') THEN
    ALTER TABLE products ADD CONSTRAINT products_price_nonneg CHECK (price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_nonneg') THEN
    ALTER TABLE products ADD CONSTRAINT products_cost_nonneg CHECK (cost >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_nonneg') THEN
    ALTER TABLE inventory_balances ADD CONSTRAINT inventory_balances_nonneg CHECK (quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_qty_nonzero') THEN
    ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_qty_nonzero CHECK (quantity <> 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_qty_positive') THEN
    ALTER TABLE sale_items ADD CONSTRAINT sale_items_qty_positive CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_amount_positive') THEN
    ALTER TABLE receivables ADD CONSTRAINT receivables_amount_positive CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receivables_status_valid') THEN
    ALTER TABLE receivables ADD CONSTRAINT receivables_status_valid CHECK (status IN ('pending', 'paid', 'overdue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_status_valid') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_status_valid CHECK (status IN ('confirmed', 'cancelled', 'pending'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_type_valid') THEN
    ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_type_valid CHECK (
      movement_type IN (
        'adjustment_in', 'adjustment_out',
        'transfer_in', 'transfer_out',
        'sale_out', 'return_in'
      )
    );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_customers_org_phone ON customers (organization_id, phone);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
