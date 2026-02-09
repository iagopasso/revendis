import { Router } from 'express';
import type {
  FinanceExpenseInput,
  FinanceExpensePayInput,
  ReceivableInput,
  ReceivableSettleInput,
  ReceivableUpdateInput
} from '../dto';
import { DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import {
  financeExpenseInputSchema,
  financeExpensePaySchema,
  receivableInputSchema,
  receivableSettleSchema,
  receivableUpdateSchema
} from '../schemas/finance';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

const normalizeOptional = (value?: string) => {
  const next = value?.trim();
  return next ? next : null;
};

let ensureFinanceExpensesTablePromise: Promise<void> | null = null;

const ensureFinanceExpensesTable = async () => {
  if (ensureFinanceExpensesTablePromise) {
    await ensureFinanceExpensesTablePromise;
    return;
  }

  ensureFinanceExpensesTablePromise = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS finance_expenses (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
         customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
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
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'finance_expenses_amount_positive'
         ) THEN
           ALTER TABLE finance_expenses
             ADD CONSTRAINT finance_expenses_amount_positive CHECK (amount > 0);
         END IF;
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'finance_expenses_status_valid'
         ) THEN
           ALTER TABLE finance_expenses
             ADD CONSTRAINT finance_expenses_status_valid CHECK (status IN ('pending', 'paid'));
         END IF;
       END $$`
    );

    await query(
      `CREATE INDEX IF NOT EXISTS idx_finance_expenses_store_due
       ON finance_expenses (store_id, due_date DESC)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_finance_expenses_status_due
       ON finance_expenses (status, due_date DESC)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_finance_expenses_customer
       ON finance_expenses (customer_id)`
    );
  })();

  try {
    await ensureFinanceExpensesTablePromise;
  } catch (error) {
    ensureFinanceExpensesTablePromise = null;
    throw error;
  }
};

router.get(
  '/finance/receivables',
  asyncHandler(async (req, res) => {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `SELECT r.id,
              r.sale_id,
              s.customer_id,
              COALESCE(c.name, s.customer_name) AS customer_name,
              r.amount,
              r.due_date,
              r.status,
              r.settled_at,
              r.method,
              r.created_at
       FROM receivables r
       JOIN sales s ON s.id = r.sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.store_id = $1
       ORDER BY r.due_date DESC`,
      [storeId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/finance/receivables',
  validateRequest({ body: receivableInputSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const { saleId, amount, dueDate, method } = req.body as ReceivableInput;
    const inserted = await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO receivables (sale_id, amount, due_date, status, method)
         VALUES ($1, $2, $3, 'pending', $4)
         RETURNING id, sale_id, amount, due_date, status, settled_at, method, created_at`,
        [saleId, amount, dueDate, method || null]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'receivable',
        entityId: created.rows[0].id,
        action: 'created',
        payload: { saleId, amount }
      });

      return created;
    });
    res.status(201).json({
      data: {
        ...inserted.rows[0],
        method
      }
    });
  })
);

router.post(
  '/finance/receivables/:id/settle',
  validateRequest({ params: idParamSchema, body: receivableSettleSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, settledAt } = req.body as ReceivableSettleInput;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE receivables
         SET status = 'paid', settled_at = $2
         WHERE id = $1
         RETURNING id, sale_id, amount, due_date, status, settled_at, method`,
        [id, settledAt]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'receivable',
        entityId: id,
        action: 'settled',
        payload: { amount, settledAt }
      });

      return result;
    });
    res.json({
      data: {
        ...(updated.rows[0] || { id }),
        amount,
        settledAt
      }
    });
  })
);

router.post(
  '/finance/receivables/:id/unsettle',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE receivables
         SET status = 'pending', settled_at = NULL
         WHERE id = $1
         RETURNING id, sale_id, amount, due_date, status, settled_at, method`,
        [id]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'receivable',
        entityId: id,
        action: 'unsettled'
      });

      return result;
    });

    if (!updated.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Parcela nao encontrada.' });
    }

    res.json({ data: updated.rows[0] });
  })
);

router.patch(
  '/finance/receivables/:id',
  validateRequest({ params: idParamSchema, body: receivableUpdateSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { amount, dueDate, method } = req.body as ReceivableUpdateInput;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    let index = 1;

    if (amount !== undefined) {
      fields.push(`amount = $${index++}`);
      values.push(amount);
    }
    if (dueDate) {
      fields.push(`due_date = $${index++}`);
      values.push(dueDate);
    }
    if (method !== undefined) {
      fields.push(`method = $${index++}`);
      values.push(method || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ code: 'invalid_input', message: 'Informe ao menos um campo para atualizar.' });
    }

    values.push(id);

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE receivables
         SET ${fields.join(', ')}
         WHERE id = $${index}
         RETURNING id, sale_id, amount, due_date, status, settled_at, method`,
        values
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'receivable',
        entityId: id,
        action: 'updated',
        payload: { amount, dueDate, method }
      });

      return result;
    });

    if (!updated.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Parcela nao encontrada.' });
    }

    res.json({ data: updated.rows[0] });
  })
);

router.delete(
  '/finance/receivables/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const removed = await withTransaction(async (client) => {
      const result = await client.query(
        `DELETE FROM receivables
         WHERE id = $1
         RETURNING id, sale_id`,
        [id]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'receivable',
        entityId: id,
        action: 'deleted'
      });

      return result;
    });

    if (!removed.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Parcela nao encontrada.' });
    }

    return res.status(204).send();
  })
);

router.get(
  '/finance/expenses',
  asyncHandler(async (req, res) => {
    await ensureFinanceExpensesTable();
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `SELECT e.id,
              e.store_id,
              e.customer_id,
              c.name AS customer_name,
              e.description,
              e.amount,
              e.due_date,
              e.status,
              e.paid_at,
              e.method,
              e.created_at
       FROM finance_expenses e
       LEFT JOIN customers c ON c.id = e.customer_id
       WHERE e.store_id = $1
       ORDER BY e.due_date DESC, e.created_at DESC`,
      [storeId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/finance/expenses',
  validateRequest({ body: financeExpenseInputSchema }),
  asyncHandler(async (req, res) => {
    await ensureFinanceExpensesTable();
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const { description, amount, dueDate, method, customerId, paid } = req.body as FinanceExpenseInput;
    const status = paid ? 'paid' : 'pending';
    const paidAt = paid ? new Date().toISOString() : null;

    const inserted = await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO finance_expenses (
           store_id,
           customer_id,
           description,
           amount,
           due_date,
           status,
           paid_at,
           method
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id,
                   store_id,
                   customer_id,
                   description,
                   amount,
                   due_date,
                   status,
                   paid_at,
                   method,
                   created_at`,
        [
          storeId,
          normalizeOptional(customerId),
          description.trim(),
          amount,
          dueDate,
          status,
          paidAt,
          normalizeOptional(method)
        ]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'finance_expense',
        entityId: created.rows[0].id,
        action: 'created',
        payload: { description, amount, dueDate, method, customerId, paid: Boolean(paid) }
      });

      return created;
    });

    res.status(201).json({ data: inserted.rows[0] });
  })
);

router.post(
  '/finance/expenses/:id/pay',
  validateRequest({ params: idParamSchema, body: financeExpensePaySchema }),
  asyncHandler(async (req, res) => {
    await ensureFinanceExpensesTable();
    const { id } = req.params;
    const { paidAt } = req.body as FinanceExpensePayInput;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const settledAt = paidAt || new Date().toISOString();

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE finance_expenses
         SET status = 'paid', paid_at = $3
         WHERE id = $1 AND store_id = $2
         RETURNING id,
                   store_id,
                   customer_id,
                   description,
                   amount,
                   due_date,
                   status,
                   paid_at,
                   method,
                   created_at`,
        [id, storeId, settledAt]
      );

      if (!result.rows.length) return result;

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'finance_expense',
        entityId: id,
        action: 'paid',
        payload: { paidAt: settledAt }
      });
      return result;
    });

    if (!updated.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Despesa nao encontrada.' });
    }

    return res.json({ data: updated.rows[0] });
  })
);

router.post(
  '/finance/expenses/:id/unpay',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureFinanceExpensesTable();
    const { id } = req.params;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE finance_expenses
         SET status = 'pending', paid_at = NULL
         WHERE id = $1 AND store_id = $2
         RETURNING id,
                   store_id,
                   customer_id,
                   description,
                   amount,
                   due_date,
                   status,
                   paid_at,
                   method,
                   created_at`,
        [id, storeId]
      );

      if (!result.rows.length) return result;

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'finance_expense',
        entityId: id,
        action: 'unpaid'
      });
      return result;
    });

    if (!updated.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Despesa nao encontrada.' });
    }

    return res.json({ data: updated.rows[0] });
  })
);

router.delete(
  '/finance/expenses/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureFinanceExpensesTable();
    const { id } = req.params;
    const orgId = req.header('x-org-id') || null;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;

    const removed = await withTransaction(async (client) => {
      const result = await client.query(
        `DELETE FROM finance_expenses
         WHERE id = $1 AND store_id = $2
         RETURNING id`,
        [id, storeId]
      );

      if (!result.rows.length) return result;

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'finance_expense',
        entityId: id,
        action: 'deleted'
      });
      return result;
    });

    if (!removed.rows.length) {
      return res.status(404).json({ code: 'not_found', message: 'Despesa nao encontrada.' });
    }

    return res.status(204).send();
  })
);

export default router;
