import { Router } from 'express';
import type { PurchaseInput, PurchaseStatusUpdateInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { purchaseInputSchema, purchaseStatusUpdateSchema } from '../schemas/purchases';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

const normalizeOptional = (value?: string) => {
  const next = value?.trim();
  return next ? next : null;
};

const buildError = (status: number, code: string, message: string) => {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
};

let ensurePurchasesTablePromise: Promise<void> | null = null;

const ensurePurchasesTable = async () => {
  if (ensurePurchasesTablePromise) {
    await ensurePurchasesTablePromise;
    return;
  }

  ensurePurchasesTablePromise = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS purchases (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
         supplier text NOT NULL,
         brand text,
         status text NOT NULL DEFAULT 'pending',
         total numeric(12,2) NOT NULL,
         items integer NOT NULL,
         purchase_date date NOT NULL DEFAULT CURRENT_DATE,
         created_at timestamptz NOT NULL DEFAULT now()
       )`
    );

    await query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'purchases_total_positive'
         ) THEN
           ALTER TABLE purchases
             ADD CONSTRAINT purchases_total_positive CHECK (total > 0);
         END IF;
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'purchases_items_positive'
         ) THEN
           ALTER TABLE purchases
             ADD CONSTRAINT purchases_items_positive CHECK (items > 0);
         END IF;
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'purchases_status_valid'
         ) THEN
           ALTER TABLE purchases
             ADD CONSTRAINT purchases_status_valid CHECK (status IN ('pending', 'received', 'cancelled'));
         END IF;
       END $$`
    );

    await query(
      `CREATE TABLE IF NOT EXISTS purchase_items (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
         product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
         sku text NOT NULL,
         quantity integer NOT NULL,
         unit_cost numeric(12,2) NOT NULL DEFAULT 0,
         expires_at date,
         created_at timestamptz NOT NULL DEFAULT now()
       )`
    );

    await query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_quantity_positive'
         ) THEN
           ALTER TABLE purchase_items
             ADD CONSTRAINT purchase_items_quantity_positive CHECK (quantity > 0);
         END IF;
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_unit_cost_nonneg'
         ) THEN
           ALTER TABLE purchase_items
             ADD CONSTRAINT purchase_items_unit_cost_nonneg CHECK (unit_cost >= 0);
         END IF;
       END $$`
    );

    await query(
      `CREATE INDEX IF NOT EXISTS idx_purchases_store_created
       ON purchases (store_id, created_at DESC)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_purchases_status
       ON purchases (status)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_purchases_brand
       ON purchases (brand)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
       ON purchase_items (purchase_id, created_at DESC)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_product
       ON purchase_items (product_id)`
    );
  })();

  try {
    await ensurePurchasesTablePromise;
  } catch (error) {
    ensurePurchasesTablePromise = null;
    throw error;
  }
};

router.get(
  '/purchases',
  asyncHandler(async (req, res) => {
    await ensurePurchasesTable();
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `SELECT id,
              supplier,
              brand,
              status,
              total,
              items,
              purchase_date,
              created_at
       FROM purchases
       WHERE store_id = $1
       ORDER BY purchase_date DESC, created_at DESC
       LIMIT 200`,
      [storeId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/purchases',
  validateRequest({ body: purchaseInputSchema }),
  asyncHandler(async (req, res) => {
    await ensurePurchasesTable();
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const { supplier, total, items, brand, status, purchaseDate, purchaseItems = [] } =
      req.body as PurchaseInput;
    const nextStatus = status || 'pending';

    try {
      const inserted = await withTransaction(async (client) => {
        const created = await client.query(
          `INSERT INTO purchases (store_id, supplier, brand, status, total, items, purchase_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, supplier, brand, status, total, items, purchase_date, created_at`,
          [
            storeId,
            supplier.trim(),
            normalizeOptional(brand),
            nextStatus,
            total,
            items,
            purchaseDate || new Date().toISOString().slice(0, 10)
          ]
        );

        const purchaseId = created.rows[0].id as string;

        for (const item of purchaseItems) {
          const productRes = await client.query(
            `SELECT id, sku
             FROM products
             WHERE id = $1 AND organization_id = $2`,
            [item.productId, orgId]
          );
          if (!productRes.rows.length) {
            throw buildError(400, 'invalid_purchase_item', 'Produto da compra nao encontrado.');
          }

          const productId = productRes.rows[0].id as string;
          const sku = productRes.rows[0].sku as string;
          const quantity = Math.max(1, Math.trunc(item.quantity));
          const unitCost = typeof item.unitCost === 'number' ? Math.max(0, item.unitCost) : 0;
          const expiresAt = item.expiresAt || null;

          await client.query(
            `INSERT INTO purchase_items (purchase_id, product_id, sku, quantity, unit_cost, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [purchaseId, productId, sku, quantity, unitCost, expiresAt]
          );

          if (nextStatus === 'cancelled') continue;

          await client.query(
            `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason, reference_id)
             VALUES ($1, $2, 'adjustment_in', $3, $4, $5)`,
            [storeId, productId, quantity, 'purchase', purchaseId]
          );

          await client.query(
            `INSERT INTO inventory_units (store_id, product_id, cost, expires_at)
             SELECT $1, $2, $3, $4
             FROM generate_series(1, $5)`,
            [storeId, productId, unitCost, expiresAt, quantity]
          );
        }

        await writeAudit(client, {
          organizationId: orgId,
          storeId,
          userId,
          entityType: 'purchase',
          entityId: purchaseId,
          action: 'created',
          payload: {
            supplier,
            total,
            items,
            brand: normalizeOptional(brand),
            status: nextStatus,
            purchaseDate,
            purchaseItemsCount: purchaseItems.length
          }
        });

        return created.rows[0];
      });

      res.status(201).json({ data: inserted });
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) {
        const err = error as { status?: number; code?: string; message?: string };
        return res.status(err.status || 400).json({
          code: err.code || 'invalid_purchase',
          message: err.message || 'Erro ao registrar compra.'
        });
      }
      throw error;
    }
  })
);

router.patch(
  '/purchases/:id/status',
  validateRequest({ params: idParamSchema, body: purchaseStatusUpdateSchema }),
  asyncHandler(async (req, res) => {
    await ensurePurchasesTable();
    const { id } = req.params;
    const { status } = req.body as PurchaseStatusUpdateInput;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE purchases
         SET status = $3
         WHERE id = $1 AND store_id = $2
         RETURNING id, supplier, brand, status, total, items, purchase_date, created_at`,
        [id, storeId, status]
      );

      if (!result.rows.length) return null;

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'purchase',
        entityId: id,
        action: 'status_updated',
        payload: { status }
      });

      return result.rows[0];
    });

    if (!updated) {
      return res.status(404).json({ code: 'not_found', message: 'Compra nao encontrada.' });
    }

    return res.json({ data: updated });
  })
);

router.delete(
  '/purchases/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await ensurePurchasesTable();
    const { id } = req.params;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const removed = await withTransaction(async (client) => {
      const result = await client.query(
        `DELETE FROM purchases
         WHERE id = $1 AND store_id = $2
         RETURNING id`,
        [id, storeId]
      );

      if (!result.rows.length) return false;

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'purchase',
        entityId: id,
        action: 'deleted'
      });

      return true;
    });

    if (!removed) {
      return res.status(404).json({ code: 'not_found', message: 'Compra nao encontrada.' });
    }

    return res.status(204).send();
  })
);

export default router;
