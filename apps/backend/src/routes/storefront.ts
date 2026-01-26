import { Router } from 'express';
import type { StorefrontOrderInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { storefrontOrderSchema } from '../schemas/storefront';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

router.get(
  '/storefront/catalog',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const result = await query(
      `SELECT id, sku, name, barcode, price, active
       FROM products
       WHERE organization_id = $1 AND active = true
       ORDER BY created_at DESC
       LIMIT 100`,
      [orgId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/storefront/orders',
  validateRequest({ body: storefrontOrderSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const { items = [], customer, shipping } = req.body as StorefrontOrderInput;
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const order = await withTransaction(async (client) => {
      const userId = req.header('x-user-id') || null;
      const orderRes = await client.query(
        `INSERT INTO storefront_orders (store_id, customer_name, customer_phone, customer_email, total)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status, total, created_at`,
        [storeId, customer.name, customer.phone || null, customer.email || null, total]
      );
      const orderId = orderRes.rows[0].id;

      for (const item of items) {
        const productRes = await client.query(
          `SELECT id FROM products WHERE organization_id = $1 AND sku = $2`,
          [orgId, item.sku]
        );
        const productId = productRes.rows[0]?.id || null;
        await client.query(
          `INSERT INTO storefront_order_items (storefront_order_id, product_id, sku, quantity, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, productId, item.sku, item.quantity, item.price]
        );
      }

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'storefront_order',
        entityId: orderId,
        action: 'created',
        payload: { total, items: items.length }
      });

      return orderRes.rows[0];
    });

    res.status(201).json({
      data: {
        ...order,
        items,
        customer,
        shipping
      }
    });
  })
);

export default router;
