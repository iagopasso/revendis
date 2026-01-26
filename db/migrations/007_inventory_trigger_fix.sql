-- Fix inventory movement trigger to handle negative quantities with existing balances

CREATE OR REPLACE FUNCTION apply_inventory_movement()
RETURNS trigger AS $$
BEGIN
  UPDATE inventory_balances
  SET quantity = inventory_balances.quantity + NEW.quantity,
      updated_at = now()
  WHERE store_id = NEW.store_id AND product_id = NEW.product_id;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO inventory_balances (store_id, product_id, quantity)
  VALUES (NEW.store_id, NEW.product_id, NEW.quantity);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
