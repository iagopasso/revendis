-- Performance indexes for dashboard and sales listing

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_receivables_sale_id ON receivables (sale_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_created_at ON customers (organization_id, created_at DESC);
