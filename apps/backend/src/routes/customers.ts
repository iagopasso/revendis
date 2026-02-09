import { Router } from 'express';
import type { CustomerInput } from '../dto';
import { DEFAULT_ORG_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { customerInputSchema, customerUpdateSchema } from '../schemas/customers';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

const router = Router();

const normalizeOptional = (value?: string) => {
  const next = value?.trim();
  return next ? next : null;
};

router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const result = await query(
      `SELECT id,
              name,
              phone,
              email,
              birth_date,
              description,
              photo_url,
              cpf_cnpj,
              postal_code AS cep,
              street,
              street_number AS number,
              complement,
              neighborhood,
              city,
              state,
              tags,
              created_at
       FROM customers
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
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
    const {
      name,
      phone,
      email,
      birthDate,
      description,
      photoUrl,
      cpfCnpj,
      cep,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      tags
    } = req.body as CustomerInput;

    const normalizedTags = Array.from(
      new Set(
        (tags || [])
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 40)
      )
    );

    const inserted = await withTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO customers (
           organization_id,
           name,
           phone,
           email,
           birth_date,
           description,
           photo_url,
           cpf_cnpj,
           postal_code,
           street,
           street_number,
           complement,
           neighborhood,
           city,
           state,
           tags
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14,
           $15,
           $16
         )
         RETURNING id,
                   name,
                   phone,
                   email,
                   birth_date,
                   description,
                   photo_url,
                   cpf_cnpj,
                   postal_code AS cep,
                   street,
                   street_number AS number,
                   complement,
                   neighborhood,
                   city,
                   state,
                   tags,
                   created_at`,
        [
          orgId,
          name,
          phone,
          normalizeOptional(email),
          normalizeOptional(birthDate),
          normalizeOptional(description),
          normalizeOptional(photoUrl),
          normalizeOptional(cpfCnpj),
          normalizeOptional(cep),
          normalizeOptional(street),
          normalizeOptional(number),
          normalizeOptional(complement),
          normalizeOptional(neighborhood),
          normalizeOptional(city),
          normalizeOptional(state)?.slice(0, 2).toUpperCase() || null,
          normalizedTags
        ]
      );

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'customer',
        entityId: created.rows[0].id,
        action: 'created',
        payload: {
          phone,
          city: normalizeOptional(city),
          tags: normalizedTags
        }
      });

      return created;
    });
    res.status(201).json({
      data: inserted.rows[0]
    });
  })
);

router.patch(
  '/customers/:id',
  validateRequest({ params: idParamSchema, body: customerUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const customerId = req.params.id;
    const updates = req.body as Partial<CustomerInput>;

    const fields: string[] = [];
    const values: Array<string | string[] | null> = [];
    let index = 1;

    if (typeof updates.name === 'string') {
      const normalizedName = updates.name.trim();
      if (!normalizedName) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe um nome valido.'
        });
      }
      fields.push(`name = $${index++}`);
      values.push(normalizedName);
    }

    if (typeof updates.phone === 'string') {
      const normalizedPhone = updates.phone.trim();
      if (!normalizedPhone) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe um telefone valido.'
        });
      }
      fields.push(`phone = $${index++}`);
      values.push(normalizedPhone);
    }

    if (typeof updates.email === 'string') {
      fields.push(`email = $${index++}`);
      values.push(normalizeOptional(updates.email));
    }
    if (typeof updates.birthDate === 'string') {
      fields.push(`birth_date = $${index++}`);
      values.push(normalizeOptional(updates.birthDate));
    }
    if (typeof updates.description === 'string') {
      fields.push(`description = $${index++}`);
      values.push(normalizeOptional(updates.description));
    }
    if (typeof updates.photoUrl === 'string') {
      fields.push(`photo_url = $${index++}`);
      values.push(normalizeOptional(updates.photoUrl));
    }
    if (typeof updates.cpfCnpj === 'string') {
      fields.push(`cpf_cnpj = $${index++}`);
      values.push(normalizeOptional(updates.cpfCnpj));
    }
    if (typeof updates.cep === 'string') {
      fields.push(`postal_code = $${index++}`);
      values.push(normalizeOptional(updates.cep));
    }
    if (typeof updates.street === 'string') {
      fields.push(`street = $${index++}`);
      values.push(normalizeOptional(updates.street));
    }
    if (typeof updates.number === 'string') {
      fields.push(`street_number = $${index++}`);
      values.push(normalizeOptional(updates.number));
    }
    if (typeof updates.complement === 'string') {
      fields.push(`complement = $${index++}`);
      values.push(normalizeOptional(updates.complement));
    }
    if (typeof updates.neighborhood === 'string') {
      fields.push(`neighborhood = $${index++}`);
      values.push(normalizeOptional(updates.neighborhood));
    }
    if (typeof updates.city === 'string') {
      fields.push(`city = $${index++}`);
      values.push(normalizeOptional(updates.city));
    }
    if (typeof updates.state === 'string') {
      fields.push(`state = $${index++}`);
      values.push(normalizeOptional(updates.state)?.slice(0, 2).toUpperCase() || null);
    }
    if (updates.tags) {
      const normalizedTags = Array.from(
        new Set(
          updates.tags
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 40)
        )
      );
      fields.push(`tags = $${index++}`);
      values.push(normalizedTags);
    }

    if (!fields.length) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Nenhuma alteracao enviada.'
      });
    }

    values.push(customerId, orgId);

    const updatedCustomer = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE customers
         SET ${fields.join(', ')}
         WHERE id = $${index++} AND organization_id = $${index}
         RETURNING id,
                   name,
                   phone,
                   email,
                   birth_date,
                   description,
                   photo_url,
                   cpf_cnpj,
                   postal_code AS cep,
                   street,
                   street_number AS number,
                   complement,
                   neighborhood,
                   city,
                   state,
                   tags,
                   created_at`,
        values
      );

      if (!updated.rows.length) return null;

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'customer',
        entityId: customerId,
        action: 'updated',
        payload: updates
      });

      return updated.rows[0];
    });

    if (!updatedCustomer) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Cliente nao encontrado.'
      });
    }

    return res.json({ data: updatedCustomer });
  })
);

router.delete(
  '/customers/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const customerId = req.params.id;

    const removed = await withTransaction(async (client) => {
      const result = await client.query(
        `DELETE FROM customers
         WHERE id = $1 AND organization_id = $2
         RETURNING id`,
        [customerId, orgId]
      );

      if (!result.rows.length) return result;

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'customer',
        entityId: customerId,
        action: 'deleted'
      });

      return result;
    });

    if (!removed.rows.length) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Cliente nao encontrado.'
      });
    }

    return res.status(204).send();
  })
);

export default router;
