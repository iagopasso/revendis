import { Router } from 'express';
import type { ResellerBrandInput } from '../dto';
import { DEFAULT_ORG_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { resellerBrandInputSchema } from '../schemas/brands';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

const normalizeOptional = (value?: string) => {
  const next = value?.trim();
  return next ? next : null;
};

router.get(
  '/settings/brands',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const result = await query(
      `SELECT id,
              name,
              source,
              source_brand,
              profitability,
              logo_url,
              created_at
       FROM reseller_brands
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/settings/brands',
  validateRequest({ body: resellerBrandInputSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const payload = req.body as ResellerBrandInput;
    const name = payload.name.trim();
    if (!name) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Informe o nome da marca.'
      });
    }

    const source = payload.source || 'manual';
    const profitability = Math.max(0, Math.min(100, Number(payload.profitability ?? 30)));

    const result = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO reseller_brands (
           organization_id,
           name,
           source,
           source_brand,
           profitability,
           logo_url
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, (lower(name)))
         DO UPDATE SET
           source = EXCLUDED.source,
           source_brand = EXCLUDED.source_brand,
           profitability = EXCLUDED.profitability,
           logo_url = EXCLUDED.logo_url
         RETURNING id,
                   name,
                   source,
                   source_brand,
                   profitability,
                   logo_url,
                   created_at`,
        [
          orgId,
          name,
          source,
          normalizeOptional(payload.sourceBrand),
          profitability,
          normalizeOptional(payload.logoUrl)
        ]
      );

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'reseller_brand',
        entityId: inserted.rows[0].id,
        action: 'upserted',
        payload: {
          name,
          source,
          profitability
        }
      });

      return inserted.rows[0];
    });

    return res.status(201).json({ data: result });
  })
);

router.delete(
  '/settings/brands/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const brandId = req.params.id;

    const removed = await withTransaction(async (client) => {
      const deleted = await client.query(
        `DELETE FROM reseller_brands
         WHERE id = $1 AND organization_id = $2
         RETURNING id,
                   name,
                   source,
                   source_brand`,
        [brandId, orgId]
      );

      if (!deleted.rows.length) return null;

      const deletedBrand = deleted.rows[0] as {
        id: string;
        name: string;
        source: string;
        source_brand?: string | null;
      };

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'reseller_brand',
        entityId: brandId,
        action: 'deleted',
        payload: {
          source: deletedBrand.source,
          sourceBrand: deletedBrand.source_brand || null
        }
      });

      return deletedBrand;
    });

    if (!removed) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Marca nao encontrada.'
      });
    }

    return res.status(204).send();
  })
);

export default router;
