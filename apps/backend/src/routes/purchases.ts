import { Router } from 'express';
import type { PoolClient } from 'pg';
import type { PurchaseInput, PurchaseStatusUpdateInput, PurchaseUpdateInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { purchaseInputSchema, purchaseStatusUpdateSchema, purchaseUpdateSchema } from '../schemas/purchases';
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

const toIsoDateFromParts = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (!Number.isFinite(parsed.getTime())) return null;
  if (parsed.getUTCFullYear() !== year) return null;
  if (parsed.getUTCMonth() + 1 !== month) return null;
  if (parsed.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const parseIsoDateInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return toIsoDateFromParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoPrefix?.[1]) {
    return parseIsoDateInput(isoPrefix[1]);
  }

  const slashOrDashDate = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashOrDashDate) {
    const first = Number(slashOrDashDate[1]);
    const second = Number(slashOrDashDate[2]);
    const year = Number(slashOrDashDate[3]);

    const candidates: Array<{ day: number; month: number }> = [];
    if (first > 12 && second <= 12) {
      candidates.push({ day: first, month: second });
    } else if (second > 12 && first <= 12) {
      candidates.push({ day: second, month: first });
    } else {
      candidates.push({ day: first, month: second });
      candidates.push({ day: second, month: first });
    }

    for (const candidate of candidates) {
      const normalized = toIsoDateFromParts(year, candidate.month, candidate.day);
      if (normalized) return normalized;
    }
  }

  return null;
};

const toDateOnly = (value: unknown) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (isoPrefix?.[1]) return isoPrefix[1];
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  return '';
};

const formatPurchaseRow = <
  T extends { purchase_date?: unknown; created_at?: unknown; payment_due_date?: unknown }
>(
  row: T
) => ({
  ...row,
  purchase_date: toDateOnly(row.purchase_date) || toDateOnly(row.created_at),
  payment_due_date: toDateOnly(row.payment_due_date) || null
});

const formatPurchaseItemRow = <T extends { expires_at?: unknown }>(row: T) => ({
  ...row,
  expires_at: toDateOnly(row.expires_at) || null
});

const buildPurchaseExpenseDescription = ({
  supplier,
  brand
}: {
  supplier: string;
  brand?: string | null;
}) => {
  const normalizedSupplier = supplier.trim() || 'Fornecedor nao informado';
  const normalizedBrand = normalizeOptional(brand || undefined);
  if (normalizedBrand) {
    return `Pedido de compra ${normalizedBrand} - ${normalizedSupplier}`;
  }
  return `Pedido de compra - ${normalizedSupplier}`;
};

const syncPurchaseExpense = async ({
  client,
  purchase
}: {
  client: PoolClient;
  purchase: {
    id: string;
    store_id?: string | null;
    supplier: string;
    brand?: string | null;
    status: string;
    total: number | string;
    purchase_date: string;
    due_date?: string | null;
    force_due_date_from_purchase?: boolean;
  };
}) => {
  const storeId = purchase.store_id || DEFAULT_STORE_ID;
  if (purchase.status === 'cancelled') {
    await client.query(
      `DELETE FROM finance_expenses
       WHERE store_id = $1
         AND purchase_id = $2`,
      [storeId, purchase.id]
    );
    return;
  }

  await client.query(
    `INSERT INTO finance_expenses (
       store_id,
       purchase_id,
       description,
       amount,
       due_date,
       status
     )
     VALUES ($1, $2, $3, $4, COALESCE($6::date, $5::date), 'pending')
     ON CONFLICT (store_id, purchase_id)
     DO UPDATE SET
       description = EXCLUDED.description,
       amount = EXCLUDED.amount,
       due_date = CASE
         WHEN $6::date IS NOT NULL THEN $6::date
         WHEN $7::boolean THEN EXCLUDED.due_date
         ELSE finance_expenses.due_date
       END`,
    [
      storeId,
      purchase.id,
      buildPurchaseExpenseDescription({
        supplier: purchase.supplier,
        brand: purchase.brand
      }),
      purchase.total,
      purchase.purchase_date,
      purchase.due_date || null,
      Boolean(purchase.force_due_date_from_purchase)
    ]
  );
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
         order_number text,
         status text NOT NULL DEFAULT 'pending',
         total numeric(12,2) NOT NULL,
         items integer NOT NULL,
         purchase_date date NOT NULL DEFAULT CURRENT_DATE,
         created_at timestamptz NOT NULL DEFAULT now()
       )`
    );

    await query(
      `ALTER TABLE purchases
       ADD COLUMN IF NOT EXISTS order_number text`
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
      `CREATE INDEX IF NOT EXISTS idx_purchases_order_number
       ON purchases (order_number)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
       ON purchase_items (purchase_id, created_at DESC)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_product
       ON purchase_items (product_id)`
    );

    await query(
      `CREATE TABLE IF NOT EXISTS finance_expenses (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
         customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
         purchase_id uuid,
         description text NOT NULL,
         amount numeric(12,2) NOT NULL,
         due_date date NOT NULL,
         status text NOT NULL DEFAULT 'pending',
         paid_at timestamptz,
         method text,
         created_at timestamptz NOT NULL DEFAULT now()
       )`
    );

    await query(
      `ALTER TABLE finance_expenses
       ADD COLUMN IF NOT EXISTS purchase_id uuid`
    );

    await query(
      `DELETE FROM finance_expenses older
       USING finance_expenses newer
       WHERE older.store_id = newer.store_id
         AND older.purchase_id = newer.purchase_id
         AND older.purchase_id IS NOT NULL
         AND older.id < newer.id`
    );

    await query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'finance_expenses_store_purchase_unique'
         ) THEN
           ALTER TABLE finance_expenses
             ADD CONSTRAINT finance_expenses_store_purchase_unique UNIQUE (store_id, purchase_id);
         END IF;
       END $$`
    );

    await query(
      `INSERT INTO finance_expenses (store_id, purchase_id, description, amount, due_date, status)
       SELECT
         p.store_id,
         p.id,
         CASE
           WHEN p.brand IS NULL OR btrim(p.brand) = '' THEN 'Pedido de compra - ' || p.supplier
           ELSE 'Pedido de compra ' || btrim(p.brand) || ' - ' || p.supplier
         END,
         p.total,
         p.purchase_date,
         'pending'
       FROM purchases p
       LEFT JOIN finance_expenses fe
         ON fe.store_id = p.store_id
        AND fe.purchase_id = p.id
       WHERE p.status <> 'cancelled'
         AND fe.id IS NULL`
    );

    await query(
      `DELETE FROM finance_expenses fe
       USING purchases p
       WHERE fe.purchase_id = p.id
         AND fe.store_id = p.store_id
         AND p.status = 'cancelled'`
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
      `SELECT p.id,
              p.supplier,
              p.brand,
              p.order_number,
              p.status,
              p.total,
              p.items,
              p.purchase_date,
              p.created_at,
              fe.due_date AS payment_due_date
       FROM purchases p
       LEFT JOIN finance_expenses fe
         ON fe.store_id = p.store_id
        AND fe.purchase_id = p.id
       WHERE p.store_id = $1
       ORDER BY p.purchase_date DESC, p.created_at DESC
       LIMIT 200`,
      [storeId]
    );
    res.json({ data: result.rows.map((row) => formatPurchaseRow(row)) });
  })
);

router.get(
  '/purchases/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await ensurePurchasesTable();
    const { id } = req.params;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;

    const purchaseRes = await query(
      `SELECT p.id,
              p.supplier,
              p.brand,
              p.order_number,
              p.status,
              p.total,
              p.items,
              p.purchase_date,
              p.created_at,
              fe.due_date AS payment_due_date
       FROM purchases p
       LEFT JOIN finance_expenses fe
         ON fe.store_id = p.store_id
        AND fe.purchase_id = p.id
       WHERE p.id = $1
         AND p.store_id = $2
       LIMIT 1`,
      [id, storeId]
    );

    if (!purchaseRes.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Compra nao encontrada.' });
    }

    const itemsRes = await query(
      `SELECT pi.id,
              pi.purchase_id,
              pi.product_id,
              pi.sku,
              pi.quantity,
              pi.unit_cost,
              pi.expires_at,
              pi.created_at,
              p.name AS product_name,
              p.brand AS product_brand,
              p.image_url AS product_image_url,
              p.barcode AS product_barcode
       FROM purchase_items pi
       LEFT JOIN products p
         ON p.id = pi.product_id
       WHERE pi.purchase_id = $1
       ORDER BY pi.created_at ASC, pi.id ASC`,
      [id]
    );

    return res.json({
      data: {
        ...formatPurchaseRow(purchaseRes.rows[0]),
        purchase_items: itemsRes.rows.map((row) => formatPurchaseItemRow(row))
      }
    });
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
    const { supplier, total, items, brand, orderNumber, status, purchaseDate, dueDate, purchaseItems = [] } =
      req.body as PurchaseInput;
    const nextStatus = status || 'pending';
    const parsedPurchaseDate = purchaseDate ? parseIsoDateInput(purchaseDate) : null;
    if (purchaseDate && !parsedPurchaseDate) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Informe uma data da compra valida.'
      });
    }
    const parsedDueDate = dueDate ? parseIsoDateInput(dueDate) : null;
    if (dueDate && !parsedDueDate) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Informe uma data de vencimento valida.'
      });
    }
    const purchaseDateValue = parsedPurchaseDate || new Date().toISOString().slice(0, 10);

    try {
      const inserted = await withTransaction(async (client) => {
        const created = await client.query(
          `INSERT INTO purchases (store_id, supplier, brand, order_number, status, total, items, purchase_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, supplier, brand, order_number, status, total, items, purchase_date, created_at`,
          [
            storeId,
            supplier.trim(),
            normalizeOptional(brand),
            normalizeOptional(orderNumber),
            nextStatus,
            total,
            items,
            purchaseDateValue
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

        await syncPurchaseExpense({
          client,
          purchase: {
            id: purchaseId,
            store_id: storeId,
            supplier: supplier.trim(),
            brand: normalizeOptional(brand) || undefined,
            status: nextStatus,
            total,
            purchase_date: purchaseDateValue,
            due_date: parsedDueDate
          }
        });

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
            orderNumber: normalizeOptional(orderNumber),
            status: nextStatus,
            purchaseDate: purchaseDateValue,
            dueDate: parsedDueDate,
            purchaseItemsCount: purchaseItems.length
          }
        });

        return created.rows[0];
      });

      res.status(201).json({ data: formatPurchaseRow(inserted) });
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
  '/purchases/:id',
  validateRequest({ params: idParamSchema, body: purchaseUpdateSchema }),
  asyncHandler(async (req, res) => {
    await ensurePurchasesTable();
    const { id } = req.params;
    const payload = req.body as PurchaseUpdateInput;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const purchaseItemsProvided = payload.purchaseItems !== undefined;
    const purchaseItemsPayload = payload.purchaseItems || [];

    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (payload.supplier !== undefined) {
      const supplier = payload.supplier.trim();
      if (!supplier) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe o fornecedor da compra.'
        });
      }
      fields.push(`supplier = $${fields.length + 1}`);
      values.push(supplier);
    }

    if (payload.brand !== undefined) {
      fields.push(`brand = $${fields.length + 1}`);
      values.push(normalizeOptional(payload.brand));
    }

    if (payload.orderNumber !== undefined) {
      fields.push(`order_number = $${fields.length + 1}`);
      values.push(normalizeOptional(payload.orderNumber));
    }

    if (payload.total !== undefined) {
      if (!Number.isFinite(payload.total) || payload.total <= 0) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe um total de compra valido.'
        });
      }
      fields.push(`total = $${fields.length + 1}`);
      values.push(payload.total);
    }

    if (payload.items !== undefined) {
      const items = Math.trunc(payload.items);
      if (!Number.isFinite(items) || items <= 0) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe uma quantidade de itens valida.'
        });
      }
      fields.push(`items = $${fields.length + 1}`);
      values.push(items);
    }

    const purchaseDateProvided = payload.purchaseDate !== undefined;
    if (purchaseDateProvided) {
      const parsedDate = parseIsoDateInput(payload.purchaseDate as string);
      if (!parsedDate) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe uma data da compra valida.'
        });
      }
      fields.push(`purchase_date = $${fields.length + 1}`);
      values.push(parsedDate);
    }

    const dueDateProvided = payload.dueDate !== undefined;
    let parsedDueDate: string | null = null;
    if (dueDateProvided) {
      parsedDueDate = parseIsoDateInput(payload.dueDate as string);
      if (!parsedDueDate) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe uma data de vencimento valida.'
        });
      }
    }

    if (purchaseItemsProvided && purchaseItemsPayload.length <= 0) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Inclua ao menos um produto na compra.'
      });
    }

    if (!fields.length && !dueDateProvided && !purchaseItemsProvided) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Informe ao menos um campo para atualizar a compra.'
      });
    }

    const updated = await withTransaction(async (client) => {
      let updatedPurchase: {
        id: string;
        store_id?: string | null;
        supplier: string;
        brand?: string | null;
        status: string;
        total: number | string;
        purchase_date: string;
      } | null = null;

      if (fields.length) {
        const result = await client.query(
          `UPDATE purchases
           SET ${fields.join(', ')}
           WHERE id = $${fields.length + 1} AND store_id = $${fields.length + 2}
           RETURNING id, store_id, supplier, brand, order_number, status, total, items, purchase_date, created_at`,
          [...values, id, storeId]
        );
        if (result.rows.length) {
          updatedPurchase = result.rows[0];
        }
      } else {
        const existing = await client.query(
          `SELECT id, store_id, supplier, brand, order_number, status, total, items, purchase_date, created_at
           FROM purchases
           WHERE id = $1 AND store_id = $2
           LIMIT 1`,
          [id, storeId]
        );
        if (existing.rows.length) {
          updatedPurchase = existing.rows[0];
        }
      }

      if (!updatedPurchase) return null;

      if (purchaseItemsProvided) {
        await client.query(
          `DELETE FROM purchase_items
           WHERE purchase_id = $1`,
          [id]
        );

        for (const item of purchaseItemsPayload) {
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
            [id, productId, sku, quantity, unitCost, expiresAt]
          );
        }
      }

      await syncPurchaseExpense({
        client,
        purchase: {
          ...updatedPurchase,
          due_date: dueDateProvided ? parsedDueDate : null,
          force_due_date_from_purchase: purchaseDateProvided && !dueDateProvided
        }
      });

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'purchase',
        entityId: id,
        action: 'updated',
        payload
      });

      const refreshed = await client.query(
        `SELECT p.id,
                p.store_id,
                p.supplier,
                p.brand,
                p.order_number,
                p.status,
                p.total,
                p.items,
                p.purchase_date,
                p.created_at,
                fe.due_date AS payment_due_date
         FROM purchases p
         LEFT JOIN finance_expenses fe
           ON fe.store_id = p.store_id
          AND fe.purchase_id = p.id
         WHERE p.id = $1
           AND p.store_id = $2
         LIMIT 1`,
        [id, storeId]
      );

      return refreshed.rows[0] || updatedPurchase;
    });

    if (!updated) {
      return res.status(404).json({ code: 'not_found', message: 'Compra nao encontrada.' });
    }

    return res.json({ data: formatPurchaseRow(updated) });
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
         RETURNING id, store_id, supplier, brand, order_number, status, total, items, purchase_date, created_at`,
        [id, storeId, status]
      );

      if (!result.rows.length) return null;

      const updatedPurchase = result.rows[0] as {
        id: string;
        store_id?: string | null;
        supplier: string;
        brand?: string | null;
        status: string;
        total: number | string;
        purchase_date: string;
      };

      await syncPurchaseExpense({
        client,
        purchase: updatedPurchase
      });

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'purchase',
        entityId: id,
        action: 'status_updated',
        payload: { status }
      });

      const refreshed = await client.query(
        `SELECT p.id,
                p.store_id,
                p.supplier,
                p.brand,
                p.order_number,
                p.status,
                p.total,
                p.items,
                p.purchase_date,
                p.created_at,
                fe.due_date AS payment_due_date
         FROM purchases p
         LEFT JOIN finance_expenses fe
           ON fe.store_id = p.store_id
          AND fe.purchase_id = p.id
         WHERE p.id = $1
           AND p.store_id = $2
         LIMIT 1`,
        [id, storeId]
      );

      return refreshed.rows[0] || result.rows[0];
    });

    if (!updated) {
      return res.status(404).json({ code: 'not_found', message: 'Compra nao encontrada.' });
    }

    return res.json({ data: formatPurchaseRow(updated) });
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
      await client.query(
        `DELETE FROM finance_expenses
         WHERE store_id = $1
           AND purchase_id = $2`,
        [storeId, id]
      );

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
