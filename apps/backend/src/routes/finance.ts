import { Router } from 'express';
import type { ReceivableInput, ReceivableSettleInput } from '../dto';
import { DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { receivableInputSchema, receivableSettleSchema } from '../schemas/finance';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

router.get(
  '/finance/receivables',
  asyncHandler(async (req, res) => {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `SELECT r.id, r.sale_id, r.amount, r.due_date, r.status, r.settled_at, r.created_at
       FROM receivables r
       JOIN sales s ON s.id = r.sale_id
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
        `INSERT INTO receivables (sale_id, amount, due_date, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id, sale_id, amount, due_date, status, settled_at, created_at`,
        [saleId, amount, dueDate]
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
         RETURNING id, sale_id, amount, due_date, status, settled_at`,
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

export default router;
