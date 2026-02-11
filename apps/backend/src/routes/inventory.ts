import { Router } from 'express';
import type {
  CategoryInput,
  CategoryUpdateInput,
  InventoryAdjustmentInput,
  InventoryReturnInput,
  InventoryTransferInput,
  ProductInput,
  ProductUpdateInput
} from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import {
  categoryInputSchema,
  categoryUpdateSchema,
  inventoryAdjustmentSchema,
  inventoryReturnSchema,
  inventoryTransferSchema,
  inventoryUnitUpdateSchema,
  productInputSchema,
  productUpdateSchema
} from '../schemas/inventory';
import { idParamSchema } from '../schemas/common';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

router.get(
  '/inventory/products',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `SELECT p.id, p.sku, p.name, p.brand, p.barcode, p.image_url, p.price, p.cost, p.active, p.created_at, p.expires_at,
              p.category_id, COALESCE(b.quantity, 0) AS quantity
       FROM products p
       LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.store_id = $2
       WHERE p.organization_id = $1
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [orgId, storeId]
    );
    res.json({
      data: result.rows
    });
  })
);

router.post(
  '/inventory/products',
  validateRequest({ body: productInputSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const product = req.body as ProductInput;
    const storeId =
      req.header('x-store-id') || (typeof product.stock === 'number' ? DEFAULT_STORE_ID : undefined);

    const created = await withTransaction(async (client) => {
      const userId = req.header('x-user-id') || null;
      const inserted = await client.query(
        `INSERT INTO products (organization_id, sku, name, brand, barcode, image_url, price, cost, active, expires_at, category_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, sku, name, brand, barcode, image_url, price, cost, active, created_at, expires_at, category_id`,
        [
          orgId,
          product.sku,
          product.name,
          product.brand || null,
          product.barcode || null,
          product.imageUrl || null,
          product.price,
          product.cost || 0,
          typeof product.active === 'boolean' ? product.active : true,
          product.expiresAt || null,
          product.categoryId || null
        ]
      );

      if (typeof product.stock === 'number' && storeId) {
        await client.query(
          `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason)
           VALUES ($1, $2, 'adjustment_in', $3, $4)`,
          [storeId, inserted.rows[0].id, product.stock, 'initial_stock']
        );
        await client.query(
          `INSERT INTO inventory_units (store_id, product_id, cost, expires_at)
           SELECT $1, $2, $3, $4
           FROM generate_series(1, $5)`,
          [
            storeId,
            inserted.rows[0].id,
            product.cost || 0,
            product.expiresAt || null,
            product.stock
          ]
        );
      }

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'product',
        entityId: inserted.rows[0].id,
        action: 'created',
        payload: { sku: product.sku, name: product.name }
      });

      return inserted.rows[0];
    });

    res.status(201).json({
      data: created
    });
  })
);

router.patch(
  '/inventory/products/:id',
  validateRequest({ body: productUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const productId = req.params.id;
    const updates = req.body as ProductUpdateInput;

    const fields: string[] = [];
    const values: Array<string | number | boolean | null> = [];
    let index = 1;

    if (updates.name) {
      fields.push(`name = $${index++}`);
      values.push(updates.name);
    }
    if (updates.sku) {
      fields.push(`sku = $${index++}`);
      values.push(updates.sku);
    }
    if (typeof updates.brand === 'string') {
      fields.push(`brand = $${index++}`);
      values.push(updates.brand || null);
    }
    if (typeof updates.barcode === 'string') {
      fields.push(`barcode = $${index++}`);
      values.push(updates.barcode || null);
    }
    if (typeof updates.imageUrl === 'string') {
      fields.push(`image_url = $${index++}`);
      values.push(updates.imageUrl || null);
    }
    if (typeof updates.price === 'number') {
      fields.push(`price = $${index++}`);
      values.push(updates.price);
    }
    if (typeof updates.cost === 'number') {
      fields.push(`cost = $${index++}`);
      values.push(updates.cost);
    }
    if (typeof updates.active === 'boolean') {
      fields.push(`active = $${index++}`);
      values.push(updates.active);
    }
    if (typeof updates.expiresAt === 'string') {
      fields.push(`expires_at = $${index++}`);
      values.push(updates.expiresAt || null);
    }
    if (typeof updates.categoryId === 'string') {
      fields.push(`category_id = $${index++}`);
      values.push(updates.categoryId || null);
    }

    if (!fields.length) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Nenhuma alteracao enviada.'
      });
    }

    values.push(productId, orgId);

    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE products
         SET ${fields.join(', ')}
         WHERE id = $${index++} AND organization_id = $${index}
         RETURNING id, sku, name, brand, barcode, image_url, price, cost, active, created_at, expires_at, category_id`,
        values
      );

      if (!updated.rows.length) return null;

      await writeAudit(client, {
        organizationId: orgId,
        storeId: req.header('x-store-id') || DEFAULT_STORE_ID,
        userId: req.header('x-user-id') || null,
        entityType: 'product',
        entityId: productId,
        action: 'updated',
        payload: updates
      });

      return updated.rows[0];
    });

    if (!result) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Produto nao encontrado.'
      });
    }

    return res.json({ data: result });
  })
);

router.delete(
  '/inventory/products/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const productId = req.params.id;

    const result = await withTransaction(async (client) => {
      const deleted = await client.query(
        `DELETE FROM products
         WHERE id = $1 AND organization_id = $2
         RETURNING id`,
        [productId, orgId]
      );
      if (!deleted.rows.length) return null;
      await writeAudit(client, {
        organizationId: orgId,
        storeId: req.header('x-store-id') || DEFAULT_STORE_ID,
        userId: req.header('x-user-id') || null,
        entityType: 'product',
        entityId: productId,
        action: 'deleted',
        payload: {}
      });
      return deleted.rows[0];
    });

    if (!result) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Produto nao encontrado.'
      });
    }

    return res.status(204).send();
  })
);

router.get(
  '/inventory/products/:id/units',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const productId = req.params.id;
    const result = await query(
      `SELECT id, product_id, cost, expires_at, status, sale_id, sale_item_id, created_at, sold_at
       FROM inventory_units
       WHERE product_id = $1 AND store_id = $2
       ORDER BY (status = 'available') DESC, expires_at NULLS LAST, created_at ASC`,
      [productId, storeId]
    );
    res.json({ data: result.rows });
  })
);

router.patch(
  '/inventory/units/:id',
  validateRequest({ params: idParamSchema, body: inventoryUnitUpdateSchema }),
  asyncHandler(async (req, res) => {
    const unitId = req.params.id;
    const { cost, expiresAt } = req.body as { cost?: number; expiresAt?: string };

    const result = await withTransaction(async (client) => {
      const unitRes = await client.query(
        `SELECT id, status FROM inventory_units WHERE id = $1 FOR UPDATE`,
        [unitId]
      );
      if (!unitRes.rows.length) {
        return { status: 'not_found' as const };
      }
      const unit = unitRes.rows[0];
      if (unit.status !== 'available') {
        return { status: 'locked' as const };
      }

      const fields: string[] = [];
      const values: Array<string | number | null> = [];
      let index = 1;

      if (typeof cost === 'number') {
        fields.push(`cost = $${index++}`);
        values.push(cost);
      }
      if (typeof expiresAt === 'string') {
        fields.push(`expires_at = $${index++}`);
        values.push(expiresAt || null);
      }
      if (!fields.length) {
        return { status: 'invalid' as const };
      }

      fields.push(`updated_at = now()`);
      values.push(unitId);
      const updated = await client.query(
        `UPDATE inventory_units
         SET ${fields.join(', ')}
         WHERE id = $${index}
         RETURNING id, product_id, cost, expires_at, status`,
        values
      );

      return { status: 'ok' as const, unit: updated.rows[0] };
    });

    if (result.status === 'not_found') {
      return res.status(404).json({ code: 'not_found', message: 'Unidade nao encontrada.' });
    }
    if (result.status === 'locked') {
      return res.status(409).json({ code: 'unit_locked', message: 'Unidade ja vendida ou inativa.' });
    }
    if (result.status === 'invalid') {
      return res.status(400).json({ code: 'invalid_payload', message: 'Nenhuma alteracao enviada.' });
    }

    return res.json({ data: result.unit });
  })
);

router.delete(
  '/inventory/units/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const unitId = req.params.id;

    const result = await withTransaction(async (client) => {
      const unitRes = await client.query(
        `SELECT id, product_id, status
         FROM inventory_units
         WHERE id = $1
         FOR UPDATE`,
        [unitId]
      );
      if (!unitRes.rows.length) {
        return { status: 'not_found' as const };
      }
      const unit = unitRes.rows[0];
      if (unit.status === 'sold') {
        return { status: 'sold' as const };
      }
      if (unit.status === 'inactive') {
        return { status: 'inactive' as const };
      }

      await client.query(
        `UPDATE inventory_units
         SET status = 'inactive', updated_at = now()
         WHERE id = $1`,
        [unitId]
      );

      await client.query(
        `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason)
         VALUES ($1, $2, 'adjustment_out', $3, $4)`,
        [storeId, unit.product_id, -1, 'unit_removed']
      );

      return { status: 'ok' as const };
    });

    if (result.status === 'not_found') {
      return res.status(404).json({ code: 'not_found', message: 'Unidade nao encontrada.' });
    }
    if (result.status === 'sold') {
      return res.status(409).json({ code: 'unit_sold', message: 'Unidade ja vendida.' });
    }

    return res.status(204).send();
  })
);

router.get(
  '/inventory/products/:id/sales',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const productId = req.params.id;
    const result = await query(
       `SELECT s.id AS sale_id,
              s.customer_id,
              s.status,
              s.total,
              s.created_at,
              COALESCE(c.name, s.customer_name) AS customer_name,
              c.photo_url AS customer_photo_url,
              si.quantity,
              si.price,
              si.sku,
              CASE
                WHEN COALESCE(pmt.paid_total, 0) + COALESCE(rcv.paid_total, 0) >= s.total THEN 'paid'
                ELSE 'pending'
              END AS payment_status
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(p.amount), 0) AS paid_total
         FROM payments p
         WHERE p.sale_id = s.id
       ) pmt ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(r.amount), 0) AS paid_total
         FROM receivables r
         WHERE r.sale_id = s.id AND r.status = 'paid'
       ) rcv ON true
       WHERE si.product_id = $1 AND s.store_id = $2
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [productId, storeId]
    );
    res.json({ data: result.rows });
  })
);

router.get(
  '/inventory/categories',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const result = await query(
      `SELECT id, name, color, created_at
       FROM categories
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/inventory/categories',
  validateRequest({ body: categoryInputSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const payload = req.body as CategoryUpdateInput;

    const created = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO categories (organization_id, name, color)
         VALUES ($1, $2, $3)
         RETURNING id, name, color, created_at`,
        [orgId, payload.name, payload.color || null]
      );
      return inserted.rows[0];
    });

    res.status(201).json({ data: created });
  })
);

router.patch(
  '/inventory/categories/:id',
  validateRequest({ body: categoryUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const categoryId = req.params.id;
    const payload = req.body as CategoryInput;

    const fields: string[] = [];
    const values: Array<string | null> = [];
    let index = 1;

    if (typeof payload.name === 'string') {
      fields.push(`name = $${index++}`);
      values.push(payload.name);
    }
    if (typeof payload.color === 'string') {
      fields.push(`color = $${index++}`);
      values.push(payload.color || null);
    }

    if (!fields.length) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Nenhuma alteracao enviada.'
      });
    }

    values.push(categoryId, orgId);

    const updated = await query(
      `UPDATE categories
       SET ${fields.join(', ')}
       WHERE id = $${index++} AND organization_id = $${index}
       RETURNING id, name, color, created_at`,
      values
    );

    if (!updated.rows.length) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Categoria nao encontrada.'
      });
    }

    return res.json({ data: updated.rows[0] });
  })
);

router.delete(
  '/inventory/categories/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const categoryId = req.params.id;

    const deleted = await query(
      `DELETE FROM categories
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [categoryId, orgId]
    );

    if (!deleted.rows.length) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Categoria nao encontrada.'
      });
    }

    return res.status(204).send();
  })
);

router.post(
  '/inventory/adjustments',
  validateRequest({ body: inventoryAdjustmentSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const { sku, quantity, reason, storeId, cost, expiresAt } =
      req.body as InventoryAdjustmentInput;
    const targetStore = storeId || DEFAULT_STORE_ID;
    const movementType = quantity >= 0 ? 'adjustment_in' : 'adjustment_out';

    try {
      const result = await withTransaction(async (client) => {
        const userId = req.header('x-user-id') || null;
        const productRes = await client.query(
          `SELECT id FROM products WHERE organization_id = $1 AND sku = $2`,
          [orgId, sku]
        );
        if (!productRes.rows.length) {
          return null;
        }
        const productId = productRes.rows[0].id;

        const movementRes = await client.query(
          `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [targetStore, productId, movementType, quantity, reason]
        );

        if (quantity > 0) {
          const unitCost = typeof cost === 'number' ? cost : 0;
          const unitExpiry = typeof expiresAt === 'string' ? expiresAt : null;
          await client.query(
            `INSERT INTO inventory_units (store_id, product_id, cost, expires_at)
             SELECT $1, $2, $3, $4
             FROM generate_series(1, $5)`,
            [targetStore, productId, unitCost, unitExpiry, quantity]
          );
        } else if (quantity < 0) {
          const removeCount = Math.abs(quantity);
          const unitsRes = await client.query(
            `SELECT id
             FROM inventory_units
             WHERE store_id = $1 AND product_id = $2 AND status = 'available'
             ORDER BY expires_at NULLS LAST, created_at ASC
             LIMIT $3
             FOR UPDATE SKIP LOCKED`,
            [targetStore, productId, removeCount]
          );
          if (unitsRes.rows.length < removeCount) {
            const err = new Error('Insufficient units') as Error & { status?: number; code?: string };
            err.status = 409;
            err.code = 'insufficient_stock';
            throw err;
          }
          const unitIds = unitsRes.rows.map((row) => row.id);
          await client.query(
            `UPDATE inventory_units
             SET status = 'inactive', updated_at = now()
             WHERE id = ANY($1::uuid[])`,
            [unitIds]
          );
        }

        await writeAudit(client, {
          organizationId: orgId,
          storeId: targetStore,
          userId,
          entityType: 'inventory_movement',
          entityId: movementRes.rows[0].id,
          action: 'adjusted',
          payload: { sku, quantity, reason }
        });

        return {
          id: movementRes.rows[0].id,
          sku,
          quantity,
          reason,
          storeId: targetStore,
          status: 'applied'
        };
      });

      if (!result) {
        return res.status(400).json({ code: 'not_found', message: 'SKU not found' });
      }

      res.status(201).json({ data: result });
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) {
        const err = error as { status?: number; code?: string; message?: string };
        return res
          .status(err.status || 409)
          .json({ code: err.code || 'insufficient_stock', message: err.message || 'Estoque insuficiente' });
      }
      throw error;
    }
  })
);

router.post(
  '/inventory/transfers',
  validateRequest({ body: inventoryTransferSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const { sku, quantity, fromStoreId, toStoreId } = req.body as InventoryTransferInput;

    const result = await withTransaction(async (client) => {
      const userId = req.header('x-user-id') || null;
      const productRes = await client.query(
        `SELECT id FROM products WHERE organization_id = $1 AND sku = $2`,
        [orgId, sku]
      );
      if (!productRes.rows.length) {
        return null;
      }
      const productId = productRes.rows[0].id;

      const transferRes = await client.query(
        `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason)
         VALUES ($1, $2, 'transfer_out', $3, $4)
         RETURNING id`,
        [fromStoreId, productId, -Math.abs(quantity), 'transfer_out']
      );
      await client.query(
        `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason)
         VALUES ($1, $2, 'transfer_in', $3, $4)`,
        [toStoreId, productId, Math.abs(quantity), 'transfer_in']
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId: fromStoreId,
        userId,
        entityType: 'inventory_transfer',
        entityId: transferRes.rows[0].id,
        action: 'transferred',
        payload: { sku, quantity, fromStoreId, toStoreId }
      });

      return {
        id: transferRes.rows[0].id,
        sku,
        quantity,
        fromStoreId,
        toStoreId,
        status: 'completed'
      };
    });

    if (!result) {
      return res.status(400).json({ code: 'not_found', message: 'SKU not found' });
    }

    res.status(201).json({ data: result });
  })
);

router.post(
  '/inventory/returns',
  validateRequest({ body: inventoryReturnSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const { saleId, items, condition } = req.body as InventoryReturnInput;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;

    const result = await withTransaction(async (client) => {
      const userId = req.header('x-user-id') || null;
      const returnRes = await client.query(
        `INSERT INTO returns (sale_id, condition)
         VALUES ($1, $2)
         RETURNING id`,
        [saleId, condition || 'good']
      );

      for (const item of items) {
        const productRes = await client.query(
          `SELECT id FROM products WHERE organization_id = $1 AND sku = $2`,
          [orgId, item.sku]
        );
        if (!productRes.rows.length) continue;
        const productId = productRes.rows[0].id;

        await client.query(
          `INSERT INTO return_items (return_id, product_id, sku, quantity)
           VALUES ($1, $2, $3, $4)`,
          [returnRes.rows[0].id, productId, item.sku, item.quantity]
        );

        await client.query(
          `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason)
           VALUES ($1, $2, 'return_in', $3, $4)`,
          [storeId, productId, item.quantity, 'return']
        );
      }

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'return',
        entityId: returnRes.rows[0].id,
        action: 'created',
        payload: { saleId, itemCount: items.length }
      });

      return {
        id: returnRes.rows[0].id,
        saleId,
        items,
        condition,
        receivableReversed: true
      };
    });

    res.status(201).json({ data: result });
  })
);

export default router;
