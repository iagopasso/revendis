import { query } from '../db';

let ensureCustomerStoreColumnPromise: Promise<void> | null = null;

export const ensureCustomerStoreColumn = async () => {
  if (ensureCustomerStoreColumnPromise) {
    await ensureCustomerStoreColumnPromise;
    return;
  }

  ensureCustomerStoreColumnPromise = (async () => {
    await query(
      `ALTER TABLE customers
         ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_customers_store_id
         ON customers (store_id, created_at DESC)`
    );

    // Legacy customers created before store-level isolation are assigned to the
    // earliest store seen in their linked sales. Remaining records fall back to
    // the primary store of the organization so they stop leaking across stores.
    await query(
      `WITH ranked_sales AS (
         SELECT DISTINCT ON (s.customer_id)
                s.customer_id,
                s.store_id
         FROM sales s
         WHERE s.customer_id IS NOT NULL
         ORDER BY s.customer_id, s.created_at ASC
       )
       UPDATE customers c
       SET store_id = ranked_sales.store_id
       FROM ranked_sales
       WHERE c.id = ranked_sales.customer_id
         AND c.store_id IS NULL`
    );

    await query(
      `WITH primary_stores AS (
         SELECT DISTINCT ON (organization_id)
                organization_id,
                id AS store_id
         FROM stores
         ORDER BY organization_id, created_at ASC
       )
       UPDATE customers c
       SET store_id = primary_stores.store_id
       FROM primary_stores
       WHERE c.organization_id = primary_stores.organization_id
         AND c.store_id IS NULL`
    );
  })().catch((error) => {
    ensureCustomerStoreColumnPromise = null;
    throw error;
  });

  await ensureCustomerStoreColumnPromise;
};
