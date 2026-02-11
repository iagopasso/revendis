-- Cleanup legacy demo records from the old seed migration.
-- Keeps only minimal tenant bootstrap data (organization/store).

DELETE FROM payments
WHERE id = '00000000-0000-0000-0000-000000000801';

DELETE FROM receivables
WHERE id = '00000000-0000-0000-0000-000000000901';

DELETE FROM sale_items
WHERE id = '00000000-0000-0000-0000-000000000701';

DELETE FROM inventory_units
WHERE product_id = '00000000-0000-0000-0000-000000000301';

DELETE FROM sales
WHERE id = '00000000-0000-0000-0000-000000000601';

DELETE FROM inventory_balances
WHERE id = '00000000-0000-0000-0000-000000000401'
   OR product_id = '00000000-0000-0000-0000-000000000301';

DELETE FROM products
WHERE id = '00000000-0000-0000-0000-000000000301';

DELETE FROM customers
WHERE id = '00000000-0000-0000-0000-000000000501';

DELETE FROM users
WHERE id = '00000000-0000-0000-0000-000000000201'
   OR email = 'owner@revendis.local';

UPDATE organizations
SET name = 'Revendis'
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE stores
SET name = 'Loja Principal',
    timezone = 'America/Sao_Paulo'
WHERE id = '00000000-0000-0000-0000-000000000101';

