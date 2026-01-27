ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_status_valid;

ALTER TABLE sales
  ADD CONSTRAINT sales_status_valid
  CHECK (status IN ('confirmed', 'cancelled', 'pending', 'delivered'));
