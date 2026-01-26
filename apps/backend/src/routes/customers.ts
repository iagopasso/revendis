import { Router } from 'express';
import type { CustomerInput } from '../dto';
import { DEFAULT_ORG_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { customerInputSchema } from '../schemas/customers';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const result = await query(
      `SELECT id, name, phone, email, created_at
       FROM customers
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [orgId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/customers',
  validateRequest({ body: customerInputSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const { name, phone, email } = req.body as CustomerInput;
    const inserted = await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO customers (organization_id, name, phone, email)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, phone, email, created_at`,
        [orgId, name, phone, email || null]
      );

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'customer',
        entityId: created.rows[0].id,
        action: 'created',
        payload: { phone }
      });

      return created;
    });
    res.status(201).json({
      data: inserted.rows[0]
    });
  })
);

export default router;
