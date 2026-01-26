import { Router } from 'express';
import type { SaleInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { saleInputSchema } from '../schemas/sales';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

router.get(
  '/sales/orders',
  asyncHandler(async (req, res) => {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `SELECT id, status, subtotal, discount_total, total, created_at
       FROM sales WHERE store_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [storeId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/sales/checkout',
  validateRequest({ body: saleInputSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const { items = [], discounts = [], payments = [], storeId } = req.body as SaleInput;
    const targetStore = storeId || req.header('x-store-id') || DEFAULT_STORE_ID;
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 0);
    }, 0);
    const discountTotal = 0;
    const total = subtotal - discountTotal;

    const sale = await withTransaction(async (client) => {
      const userId = req.header('x-user-id') || null;
      const saleRes = await client.query(
        `INSERT INTO sales (store_id, subtotal, discount_total, total)
         VALUES ($1, $2, $3, $4)
         RETURNING id, status, subtotal, discount_total, total, created_at`,
        [targetStore, subtotal, discountTotal, total]
      );
      const saleId = saleRes.rows[0].id;

      for (const item of items) {
        const productRes = await client.query(
          `SELECT id FROM products WHERE organization_id = $1 AND sku = $2`,
          [orgId, item.sku]
        );
        const productId = productRes.rows[0]?.id || null;
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, sku, quantity, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [saleId, productId, item.sku, item.quantity, item.price]
        );

        if (productId) {
          await client.query(
            `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason)
             VALUES ($1, $2, 'sale_out', $3, $4)`,
            [targetStore, productId, -Math.abs(item.quantity), 'sale']
          );
        }
      }

      for (const payment of payments || []) {
        await client.query(
          `INSERT INTO payments (sale_id, method, amount)
           VALUES ($1, $2, $3)`,
          [saleId, payment.method, payment.amount]
        );
      }

      await writeAudit(client, {
        organizationId: orgId,
        storeId: targetStore,
        userId,
        entityType: 'sale',
        entityId: saleId,
        action: 'created',
        payload: { total, items: items.length }
      });

      return saleRes.rows[0];
    });

    res.status(201).json({
      data: {
        ...sale,
        items,
        discounts,
        payments
      }
    });
  })
);

router.post(
  '/sales/orders/:id/cancel',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE sales SET status = 'cancelled' WHERE id = $1
         RETURNING id, status`,
        [id]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'sale',
        entityId: id,
        action: 'cancelled'
      });

      return updated;
    });
    res.json({
      data: {
        id: result.rows[0]?.id || id,
        status: result.rows[0]?.status || 'cancelled',
        stockReverted: true,
        receivableReversed: true
      }
    });
  })
);

export default router;
