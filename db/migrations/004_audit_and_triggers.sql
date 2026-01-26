-- Audit logs and inventory triggers

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  store_id uuid,
  user_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION apply_inventory_movement()
RETURNS trigger AS $$
BEGIN
  INSERT INTO inventory_balances (store_id, product_id, quantity)
  VALUES (NEW.store_id, NEW.product_id, NEW.quantity)
  ON CONFLICT (store_id, product_id)
  DO UPDATE SET quantity = inventory_balances.quantity + EXCLUDED.quantity,
                updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_movements_apply ON inventory_movements;
CREATE TRIGGER inventory_movements_apply
AFTER INSERT ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION apply_inventory_movement();
