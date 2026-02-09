CREATE TABLE IF NOT EXISTS finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_expenses
  DROP CONSTRAINT IF EXISTS finance_expenses_amount_positive;

ALTER TABLE finance_expenses
  ADD CONSTRAINT finance_expenses_amount_positive CHECK (amount > 0);

ALTER TABLE finance_expenses
  DROP CONSTRAINT IF EXISTS finance_expenses_status_valid;

ALTER TABLE finance_expenses
  ADD CONSTRAINT finance_expenses_status_valid CHECK (status IN ('pending', 'paid'));

CREATE INDEX IF NOT EXISTS idx_finance_expenses_store_due
  ON finance_expenses (store_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_finance_expenses_status_due
  ON finance_expenses (status, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_finance_expenses_customer
  ON finance_expenses (customer_id);
