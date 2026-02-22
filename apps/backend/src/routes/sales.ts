import { Router } from 'express';
import type { SaleInput, SalePaymentInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { saleInputSchema, salePaymentInputSchema, saleStatusUpdateSchema } from '../schemas/sales';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';
import { parseSaleCreatedAt } from '../utils/sale-date';

const router = Router();

router.get(
  '/sales/orders',
  asyncHandler(async (req, res) => {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `WITH base_sales AS (
         SELECT s.id,
                s.status,
                s.subtotal,
                s.discount_total,
                s.total,
                s.created_at,
                s.customer_id,
                s.customer_name
         FROM sales s
         WHERE s.store_id = $1
         ORDER BY s.created_at DESC
         LIMIT 100
       ),
       item_totals AS (
         SELECT si.sale_id, COALESCE(SUM(si.quantity), 0) AS total_quantity
         FROM sale_items si
         INNER JOIN base_sales bs ON bs.id = si.sale_id
         GROUP BY si.sale_id
       ),
       cost_totals AS (
         SELECT iu.sale_id, COALESCE(SUM(iu.cost), 0) AS cost_total
         FROM inventory_units iu
         INNER JOIN base_sales bs ON bs.id = iu.sale_id
         GROUP BY iu.sale_id
       )
       SELECT bs.id,
              bs.customer_id,
              bs.status,
              bs.subtotal,
              bs.discount_total,
              bs.total,
              bs.created_at,
              COALESCE(c.name, bs.customer_name) AS customer_name,
              c.photo_url AS customer_photo_url,
              COALESCE(items.total_quantity, 0) AS items_count,
              COALESCE(costs.cost_total, 0) AS cost_total,
              (bs.total - COALESCE(costs.cost_total, 0)) AS profit
       FROM base_sales bs
       LEFT JOIN customers c ON c.id = bs.customer_id
       LEFT JOIN item_totals items ON items.sale_id = bs.id
       LEFT JOIN cost_totals costs ON costs.sale_id = bs.id
       ORDER BY bs.created_at DESC`,
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
    const {
      items = [],
      discounts = [],
      payments = [],
      storeId,
      customerId,
      customerName,
      createdAt
    } = req.body as SaleInput;
    const targetStore = storeId || req.header('x-store-id') || DEFAULT_STORE_ID;
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 0);
    }, 0);
    const discountTotal = 0;
    const total = subtotal - discountTotal;
    const createdAtValue = parseSaleCreatedAt(createdAt);

    const buildError = (status: number, code: string, message: string) => {
      const error = new Error(message) as Error & { status?: number; code?: string };
      error.status = status;
      error.code = code;
      return error;
    };

    try {
      const sale = await withTransaction(async (client) => {
        const userId = req.header('x-user-id') || null;
        const saleRes = await client.query(
          `INSERT INTO sales (store_id, customer_id, customer_name, status, subtotal, discount_total, total, created_at)
           VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
           RETURNING id, status, subtotal, discount_total, total, created_at, customer_name`,
          [
            targetStore,
            customerId || null,
            customerName?.trim() || null,
            subtotal,
            discountTotal,
            total,
            createdAtValue
          ]
        );
        const saleId = saleRes.rows[0].id;

        for (const item of items) {
          const origin = item.origin === 'order' ? 'order' : 'stock';
          if (item.unitId && item.quantity !== 1) {
            throw buildError(400, 'invalid_unit_selection', 'Quantidade invalida para unidade especifica.');
          }
          const explicitUnitIds = item.unitIds ?? (item.unitId ? [item.unitId] : []);
          if (origin === 'order' && explicitUnitIds.length) {
            throw buildError(400, 'invalid_unit_selection', 'Itens de encomenda nao aceitam unidades especificas.');
          }
          if (explicitUnitIds.length && explicitUnitIds.length !== item.quantity) {
            throw buildError(400, 'invalid_unit_selection', 'Quantidade nao corresponde as unidades informadas.');
          }

          const productRes = await client.query(
            `SELECT id FROM products WHERE organization_id = $1 AND sku = $2`,
            [orgId, item.sku]
          );
          const productId = productRes.rows[0]?.id || null;
          if (explicitUnitIds.length && !productId) {
            throw buildError(400, 'invalid_unit_selection', 'Produto nao encontrado para a unidade informada.');
          }
          const saleItemRes = await client.query(
            `INSERT INTO sale_items (sale_id, product_id, sku, quantity, price)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [saleId, productId, item.sku, item.quantity, item.price]
          );
          const saleItemId = saleItemRes.rows[0].id;

          if (productId && origin !== 'order') {
            if (explicitUnitIds.length) {
              const unitsRes = await client.query(
                `SELECT id, status
                 FROM inventory_units
                 WHERE id = ANY($1::uuid[]) AND product_id = $2 AND store_id = $3
                 FOR UPDATE`,
                [explicitUnitIds, productId, targetStore]
              );
              if (unitsRes.rows.length !== explicitUnitIds.length) {
                throw buildError(409, 'unit_not_found', 'Unidade nao encontrada.');
              }
              if (unitsRes.rows.some((row) => row.status !== 'available')) {
                throw buildError(409, 'unit_unavailable', 'Unidade indisponivel.');
              }
              await client.query(
                `UPDATE inventory_units
                 SET status = 'sold', sale_id = $1, sale_item_id = $2, sold_at = now(), updated_at = now()
                 WHERE id = ANY($3::uuid[])`,
                [saleId, saleItemId, explicitUnitIds]
              );
            } else {
              const unitsRes = await client.query(
                `SELECT id
                 FROM inventory_units
                 WHERE product_id = $1 AND store_id = $2 AND status = 'available'
                 ORDER BY expires_at NULLS LAST, created_at ASC
                 LIMIT $3
                 FOR UPDATE SKIP LOCKED`,
                [productId, targetStore, item.quantity]
              );
              if (unitsRes.rows.length < item.quantity) {
                throw buildError(409, 'insufficient_stock', 'Estoque insuficiente.');
              }
              const unitIds = unitsRes.rows.map((row) => row.id);
              await client.query(
                `UPDATE inventory_units
                 SET status = 'sold', sale_id = $1, sale_item_id = $2, sold_at = now(), updated_at = now()
                 WHERE id = ANY($3::uuid[])`,
                [saleId, saleItemId, unitIds]
              );
            }

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
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) {
        const err = error as { status?: number; code?: string; message?: string };
        return res
          .status(err.status || 409)
          .json({ code: err.code || 'sale_error', message: err.message || 'Erro ao registrar venda.' });
      }
      throw error;
    }
  })
);

router.get(
  '/sales/orders/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const saleRes = await query(
      `SELECT s.id, s.status, s.subtotal, s.discount_total, s.total, s.created_at,
              s.customer_id,
              COALESCE(c.name, s.customer_name) AS customer_name,
              c.photo_url AS customer_photo_url
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1 AND s.store_id = $2`,
      [id, storeId]
    );

    if (!saleRes.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Venda nao encontrada.' });
    }

    const itemsRes = await query(
      `SELECT si.id, si.sku, si.quantity, si.price,
              p.name AS product_name, p.brand AS product_brand, p.image_url AS product_image_url
       FROM sale_items si
       LEFT JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1`,
      [id]
    );

    const paymentsRes = await query(
      `SELECT id, method, amount, created_at
       FROM payments
       WHERE sale_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const receivablesRes = await query(
      `SELECT id, amount, due_date, status, settled_at, method
       FROM receivables
       WHERE sale_id = $1
       ORDER BY due_date ASC`,
      [id]
    );

    const costRes = await query(
      `SELECT COALESCE(SUM(cost), 0) AS cost_total
       FROM inventory_units
       WHERE sale_id = $1`,
      [id]
    );

    const saleRow = saleRes.rows[0];
    const totalValue = Number(saleRow.total) || 0;
    const costTotal = Number(costRes.rows[0]?.cost_total) || 0;
    const profit = totalValue - costTotal;

    res.json({
      data: {
        ...saleRow,
        items: itemsRes.rows,
        payments: paymentsRes.rows,
        receivables: receivablesRes.rows,
        cost_total: costTotal,
        profit
      }
    });
  })
);

router.patch(
  '/sales/orders/:id/status',
  validateRequest({ params: idParamSchema, body: saleStatusUpdateSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status: 'pending' | 'delivered' };
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE sales
         SET status = $2
         WHERE id = $1 AND store_id = $3
         RETURNING id, status`,
        [id, status, storeId]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'sale',
        entityId: id,
        action: 'status_updated',
        payload: { status }
      });

      return result;
    });

    if (!updated.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Venda nao encontrada.' });
    }

    res.json({ data: updated.rows[0] });
  })
);

router.post(
  '/sales/orders/:id/payments',
  validateRequest({ params: idParamSchema, body: salePaymentInputSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const { amount, method, paidAt } = req.body as SalePaymentInput;
    const paidDate = paidAt ? new Date(paidAt) : new Date();
    const createdAtValue = Number.isNaN(paidDate.getTime()) ? new Date() : paidDate;

    const created = await withTransaction(async (client) => {
      const paymentRes = await client.query(
        `INSERT INTO payments (sale_id, method, amount, created_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, sale_id, method, amount, created_at`,
        [id, method, amount, createdAtValue]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'payment',
        entityId: paymentRes.rows[0].id,
        action: 'created',
        payload: { saleId: id, amount, method }
      });

      return paymentRes.rows[0];
    });

    res.status(201).json({ data: created });
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
      const saleRes = await client.query(
        `SELECT id
         FROM sales
         WHERE id = $1 AND store_id = $2`,
        [id, storeId]
      );

      if (!saleRes.rows.length) {
        return { status: 'not_found' as const };
      }

      const itemsRes = await client.query(
        `SELECT product_id, quantity
         FROM sale_items
         WHERE sale_id = $1`,
        [id]
      );

      await client.query(
        `UPDATE inventory_units
         SET status = 'available',
             sale_id = NULL,
             sale_item_id = NULL,
             sold_at = NULL,
             updated_at = now()
         WHERE sale_id = $1 AND store_id = $2`,
        [id, storeId]
      );

      const quantitiesByProduct = new Map<string, number>();
      for (const row of itemsRes.rows) {
        if (!row.product_id) continue;
        const current = quantitiesByProduct.get(row.product_id) || 0;
        quantitiesByProduct.set(row.product_id, current + Number(row.quantity || 0));
      }

      for (const [productId, quantity] of quantitiesByProduct.entries()) {
        if (!quantity) continue;
        await client.query(
          `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason, reference_id)
           VALUES ($1, $2, 'return_in', $3, $4, $5)`,
          [storeId, productId, Math.abs(quantity), 'sale_undo', id]
        );
      }

      await client.query(`DELETE FROM sales WHERE id = $1 AND store_id = $2`, [id, storeId]);

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'sale',
        entityId: id,
        action: 'deleted',
        payload: { stockReverted: true }
      });

      return { status: 'deleted' as const };
    });

    if (result.status === 'not_found') {
      return res.status(404).json({ code: 'not_found', message: 'Venda nao encontrada.' });
    }

    return res.json({
      data: {
        id,
        deleted: true,
        stockReverted: true
      }
    });
  })
);

export default router;
