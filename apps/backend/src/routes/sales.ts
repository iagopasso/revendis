import { Router } from 'express';
import type { SaleInput, SalePaymentInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { saleInputSchema, salePaymentInputSchema, saleStatusUpdateSchema } from '../schemas/sales';
import { ensureCustomerStoreColumn } from '../services/customer-store';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';
import { parseSaleCreatedAt } from '../utils/sale-date';

const router = Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const buildError = (status: number, code: string, message: string) => {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
};

const assertCustomerBelongsToStore = async (
  client: { query: (text: string, params?: Array<unknown>) => Promise<{ rows: Array<{ id: string }> }> },
  {
    customerId,
    organizationId,
    storeId
  }: {
    customerId?: string | null;
    organizationId: string;
    storeId: string;
  }
) => {
  const normalizedCustomerId = `${customerId || ''}`.trim();
  if (!normalizedCustomerId) return;
  await ensureCustomerStoreColumn();

  const customerRes = await client.query(
    `SELECT id
     FROM customers
     WHERE id = $1
       AND organization_id = $2
       AND store_id = $3
     LIMIT 1`,
    [normalizedCustomerId, organizationId, storeId]
  );

  if (!customerRes.rows.length) {
    throw buildError(404, 'customer_not_found', 'Cliente nao encontrado para esta loja.');
  }
};

const toQueryString = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
};

const normalizeDateInput = (value: unknown) => {
  const input = toQueryString(value).trim();
  if (!input) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return input;
};

const resolveCustomerFilter = (value: unknown) => {
  const input = toQueryString(value).trim();
  if (!input) return { customerId: null, customerName: null };
  if (UUID_REGEX.test(input)) return { customerId: input, customerName: null };
  return { customerId: null, customerName: input };
};

router.get(
  '/sales/orders',
  asyncHandler(async (req, res) => {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const from = normalizeDateInput(req.query.from);
    const to = normalizeDateInput(req.query.to);
    const { customerId, customerName } = resolveCustomerFilter(req.query.customer);
    const hasFilters = Boolean(from || to || customerId || customerName);
    const result = await query(
      `WITH base_sales AS (
         SELECT s.id,
                s.customer_id,
                s.status,
                s.subtotal,
                s.discount_total,
                s.total,
                s.created_at,
                COALESCE(c.name, s.customer_name) AS customer_name,
                c.photo_url AS customer_photo_url
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.store_id = $1
           AND ($2::date IS NULL OR (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= $2::date)
           AND ($3::date IS NULL OR (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= $3::date)
           AND ($4::uuid IS NULL OR s.customer_id = $4::uuid)
           AND (
             $5::text IS NULL
             OR lower(trim(COALESCE(c.name, s.customer_name, ''))) = lower(trim($5::text))
           )
         ORDER BY s.created_at DESC
         LIMIT CASE WHEN $6::boolean THEN 100 ELSE 5000 END
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
       ),
       sale_brands AS (
         SELECT si.sale_id,
                array_agg(DISTINCT COALESCE(NULLIF(trim(p.brand), ''), 'Sem marca')) AS brands
         FROM sale_items si
         INNER JOIN base_sales bs ON bs.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         GROUP BY si.sale_id
       )
       SELECT bs.id,
              bs.customer_id,
              bs.status,
              bs.subtotal,
              bs.discount_total,
              bs.total,
              bs.created_at,
              bs.customer_name,
              bs.customer_photo_url,
              COALESCE(items.total_quantity, 0) AS items_count,
              COALESCE(costs.cost_total, 0) AS cost_total,
              (bs.total - COALESCE(costs.cost_total, 0)) AS profit,
              COALESCE(brand_names.brands, ARRAY['Sem marca']::text[]) AS brands
        FROM base_sales bs
        LEFT JOIN item_totals items ON items.sale_id = bs.id
        LEFT JOIN cost_totals costs ON costs.sale_id = bs.id
        LEFT JOIN sale_brands brand_names ON brand_names.sale_id = bs.id
       ORDER BY bs.created_at DESC`,
      [storeId, from, to, customerId, customerName, !hasFilters]
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

    try {
      const sale = await withTransaction(async (client) => {
        const userId = req.header('x-user-id') || null;
        await assertCustomerBelongsToStore(client, {
          customerId,
          organizationId: orgId,
          storeId: targetStore
        });
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

router.patch(
  '/sales/orders/:id',
  validateRequest({ params: idParamSchema, body: saleInputSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const {
      items = [],
      payments = [],
      storeId,
      customerId,
      customerName,
      createdAt
    } = req.body as SaleInput;
    const targetStore = storeId || req.header('x-store-id') || DEFAULT_STORE_ID;
    const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
    const discountTotal = 0;
    const total = subtotal - discountTotal;
    const createdAtValue = parseSaleCreatedAt(createdAt);

    try {
      const sale = await withTransaction(async (client) => {
        const existingSaleRes = await client.query(
          `SELECT id
           FROM sales
           WHERE id = $1
             AND store_id = $2
           LIMIT 1`,
          [id, targetStore]
        );
        if (!existingSaleRes.rows.length) {
          throw buildError(404, 'not_found', 'Venda nao encontrada.');
        }

        await assertCustomerBelongsToStore(client, {
          customerId,
          organizationId: orgId,
          storeId: targetStore
        });

        const previousStockRes = await client.query(
          `SELECT product_id, COUNT(*)::int AS quantity
           FROM inventory_units
           WHERE sale_id = $1
             AND store_id = $2
             AND product_id IS NOT NULL
           GROUP BY product_id`,
          [id, targetStore]
        );

        await client.query(
          `UPDATE inventory_units
           SET status = 'available',
               sale_id = NULL,
               sale_item_id = NULL,
               sold_at = NULL,
               updated_at = now()
           WHERE sale_id = $1
             AND store_id = $2`,
          [id, targetStore]
        );

        await client.query(`DELETE FROM sale_items WHERE sale_id = $1`, [id]);
        await client.query(`DELETE FROM payments WHERE sale_id = $1`, [id]);
        await client.query(`DELETE FROM receivables WHERE sale_id = $1`, [id]);

        await client.query(
          `UPDATE sales
           SET customer_id = $2,
               customer_name = $3,
               status = 'pending',
               subtotal = $4,
               discount_total = $5,
               total = $6,
               created_at = $7
           WHERE id = $1
             AND store_id = $8`,
          [
            id,
            customerId || null,
            customerName?.trim() || null,
            subtotal,
            discountTotal,
            total,
            createdAtValue,
            targetStore
          ]
        );

        for (const row of previousStockRes.rows) {
          const productId = row.product_id as string | null;
          const quantity = Number(row.quantity || 0);
          if (!productId || quantity <= 0) continue;
          await client.query(
            `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason, reference_id)
             VALUES ($1, $2, 'return_in', $3, $4, $5)`,
            [targetStore, productId, Math.abs(quantity), 'sale_edit_revert', id]
          );
        }

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
            `SELECT id, sku
             FROM products
             WHERE organization_id = $1
               AND sku = $2`,
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
            [id, productId, item.sku, item.quantity, item.price]
          );
          const saleItemId = saleItemRes.rows[0].id;

          if (productId && origin !== 'order') {
            if (explicitUnitIds.length) {
              const unitsRes = await client.query(
                `SELECT id, status
                 FROM inventory_units
                 WHERE id = ANY($1::uuid[])
                   AND product_id = $2
                   AND store_id = $3
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
                 SET status = 'sold',
                     sale_id = $1,
                     sale_item_id = $2,
                     sold_at = now(),
                     updated_at = now()
                 WHERE id = ANY($3::uuid[])`,
                [id, saleItemId, explicitUnitIds]
              );
            } else {
              const unitsRes = await client.query(
                `SELECT id
                 FROM inventory_units
                 WHERE product_id = $1
                   AND store_id = $2
                   AND status = 'available'
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
                 SET status = 'sold',
                     sale_id = $1,
                     sale_item_id = $2,
                     sold_at = now(),
                     updated_at = now()
                 WHERE id = ANY($3::uuid[])`,
                [id, saleItemId, unitIds]
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
            [id, payment.method, payment.amount]
          );
        }

        await writeAudit(client, {
          organizationId: orgId,
          storeId: targetStore,
          userId,
          entityType: 'sale',
          entityId: id,
          action: 'updated',
          payload: { total, items: items.length }
        });

        const refreshed = await client.query(
          `SELECT id, status, subtotal, discount_total, total, created_at, customer_name
           FROM sales
           WHERE id = $1
             AND store_id = $2
           LIMIT 1`,
          [id, targetStore]
        );
        return refreshed.rows[0];
      });

      return res.json({
        data: {
          ...sale,
          items,
          payments
        }
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) {
        const err = error as { status?: number; code?: string; message?: string };
        return res
          .status(err.status || 409)
          .json({ code: err.code || 'sale_error', message: err.message || 'Erro ao atualizar venda.' });
      }
      return res.status(500).json({
        code: 'sale_update_failed',
        message: 'Erro ao atualizar venda.'
      });
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

    let itemsRows: unknown[] = [];
    try {
      const itemsRes = await query(
        `SELECT si.id,
                si.product_id,
                si.sku,
                si.quantity,
                si.price,
                COALESCE(stock_info.stock_units, 0) AS stock_units,
                p.name AS product_name, p.brand AS product_brand, p.image_url AS product_image_url
         FROM sale_items si
         LEFT JOIN (
           SELECT sale_item_id, COUNT(*)::int AS stock_units
           FROM inventory_units
           WHERE sale_id = $1
             AND sale_item_id IS NOT NULL
           GROUP BY sale_item_id
         ) stock_info ON stock_info.sale_item_id = si.id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = $1
         ORDER BY si.id ASC`,
        [id]
      );
      itemsRows = itemsRes.rows;
    } catch {
      const fallbackItemsRes = await query(
        `SELECT si.id,
                si.product_id,
                si.sku,
                si.quantity,
                si.price,
                0::int AS stock_units,
                p.name AS product_name,
                p.brand AS product_brand,
                p.image_url AS product_image_url
         FROM sale_items si
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = $1
         ORDER BY si.id ASC`,
        [id]
      );
      itemsRows = fallbackItemsRes.rows;
    }

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
        items: itemsRows,
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
