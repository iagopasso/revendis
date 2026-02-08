import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Router } from 'express';
import type {
  AccessMemberInput,
  AccessMemberUpdateInput,
  SettingsAccountInput,
  SettingsAlertInput,
  SettingsPixInput,
  SettingsSubscriptionInput
} from '../dto';
import { DEFAULT_ORG_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import {
  accessMemberInputSchema,
  accessMemberUpdateSchema,
  settingsAccountUpdateSchema,
  settingsAlertUpdateSchema,
  settingsPixUpdateSchema,
  settingsSubscriptionUpdateSchema
} from '../schemas/settings';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

type DbExecutor = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: Array<unknown>
  ) => Promise<QueryResult<T>>;
};

type AccountRow = {
  organization_name: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  business_name: string | null;
  owner_user_name: string | null;
  owner_user_email: string | null;
};

type SettingsRow = {
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  business_name: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_renewal_date: string | null;
  subscription_monthly_price: number | string | null;
  pix_key_type: string | null;
  pix_key_value: string | null;
  pix_holder_name: string | null;
  alert_enabled: boolean | null;
  alert_days_before_due: number | null;
};

type AccessMemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at: string;
};

const router = Router();

const normalizeOptional = (value?: string) => {
  const next = value?.trim();
  return next ? next : null;
};

const normalizeRole = (value?: string) => {
  const next = value?.trim().toLowerCase();
  return next || 'seller';
};

const toAmount = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const isUniqueConstraintError = (error: unknown): error is { code: string } =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');

const ensureSettingsRow = async (db: DbExecutor, orgId: string) => {
  await db.query(
    `INSERT INTO organization_settings (organization_id, business_name)
     SELECT o.id, o.name
     FROM organizations o
     WHERE o.id = $1
     ON CONFLICT (organization_id) DO NOTHING`,
    [orgId]
  );
};

const selectAccount = async (db: DbExecutor, orgId: string) => {
  const result = await db.query<AccountRow>(
    `SELECT o.name AS organization_name,
            os.owner_name,
            os.owner_email,
            os.owner_phone,
            os.business_name,
            owner_user.name AS owner_user_name,
            owner_user.email AS owner_user_email
     FROM organizations o
     LEFT JOIN organization_settings os ON os.organization_id = o.id
     LEFT JOIN LATERAL (
       SELECT u.name, u.email
       FROM users u
       WHERE u.organization_id = o.id
       ORDER BY CASE WHEN lower(u.role) = 'owner' THEN 0 ELSE 1 END, u.created_at ASC
       LIMIT 1
     ) owner_user ON TRUE
     WHERE o.id = $1
     LIMIT 1`,
    [orgId]
  );

  const row = result.rows[0];
  return {
    ownerName: row?.owner_name || row?.owner_user_name || '',
    ownerEmail: row?.owner_email || row?.owner_user_email || '',
    ownerPhone: row?.owner_phone || '',
    businessName: row?.business_name || row?.organization_name || ''
  };
};

const selectSettings = async (db: DbExecutor, orgId: string) => {
  const result = await db.query<SettingsRow>(
    `SELECT owner_name,
            owner_email,
            owner_phone,
            business_name,
            subscription_plan,
            subscription_status,
            subscription_renewal_date,
            subscription_monthly_price,
            pix_key_type,
            pix_key_value,
            pix_holder_name,
            alert_enabled,
            alert_days_before_due
     FROM organization_settings
     WHERE organization_id = $1
     LIMIT 1`,
    [orgId]
  );

  const row = result.rows[0];
  return {
    ownerName: row?.owner_name || '',
    ownerEmail: row?.owner_email || '',
    ownerPhone: row?.owner_phone || '',
    businessName: row?.business_name || '',
    plan: row?.subscription_plan || 'Essencial',
    status: row?.subscription_status || 'active',
    renewalDate: row?.subscription_renewal_date || '',
    monthlyPrice: toAmount(row?.subscription_monthly_price),
    keyType: row?.pix_key_type || '',
    keyValue: row?.pix_key_value || '',
    holderName: row?.pix_holder_name || '',
    enabled: row?.alert_enabled ?? true,
    daysBeforeDue: row?.alert_days_before_due ?? 3
  };
};

const updateSettingsFields = async (
  client: PoolClient,
  orgId: string,
  fields: string[],
  values: Array<string | number | boolean | null>
) => {
  const nextValues = [...values, orgId];
  const whereIndex = values.length + 1;
  await client.query(
    `UPDATE organization_settings
     SET ${fields.join(', ')}, updated_at = now()
     WHERE organization_id = $${whereIndex}`,
    nextValues
  );
};

router.get(
  '/settings/account',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    await ensureSettingsRow({ query }, orgId);
    const account = await selectAccount({ query }, orgId);
    res.json({ data: account });
  })
);

router.patch(
  '/settings/account',
  validateRequest({ body: settingsAccountUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const payload = req.body as SettingsAccountInput;

    try {
      await withTransaction(async (client) => {
        await ensureSettingsRow(client, orgId);

        const fields: string[] = [];
        const values: Array<string | null> = [];

        if (payload.ownerName !== undefined) {
          fields.push(`owner_name = $${fields.length + 1}`);
          values.push(normalizeOptional(payload.ownerName));
        }
        if (payload.ownerEmail !== undefined) {
          fields.push(`owner_email = $${fields.length + 1}`);
          values.push(normalizeOptional(payload.ownerEmail)?.toLowerCase() || null);
        }
        if (payload.ownerPhone !== undefined) {
          fields.push(`owner_phone = $${fields.length + 1}`);
          values.push(normalizeOptional(payload.ownerPhone));
        }
        if (payload.businessName !== undefined) {
          fields.push(`business_name = $${fields.length + 1}`);
          values.push(normalizeOptional(payload.businessName));
        }

        await updateSettingsFields(client, orgId, fields, values);

        if (payload.businessName !== undefined) {
          await client.query(
            `UPDATE organizations
             SET name = $1
             WHERE id = $2`,
            [payload.businessName.trim(), orgId]
          );
        }

        if (payload.ownerName !== undefined || payload.ownerEmail !== undefined) {
          const ownerResult = await client.query<{ id: string }>(
            `SELECT id
             FROM users
             WHERE organization_id = $1
             ORDER BY CASE WHEN lower(role) = 'owner' THEN 0 ELSE 1 END, created_at ASC
             LIMIT 1`,
            [orgId]
          );

          const owner = ownerResult.rows[0];
          if (owner) {
            const userFields: string[] = [];
            const userValues: string[] = [];

            if (payload.ownerName !== undefined) {
              userFields.push(`name = $${userFields.length + 1}`);
              userValues.push(payload.ownerName.trim());
            }
            if (payload.ownerEmail !== undefined) {
              userFields.push(`email = $${userFields.length + 1}`);
              userValues.push(payload.ownerEmail.trim().toLowerCase());
            }

            if (userFields.length > 0) {
              userValues.push(owner.id);
              await client.query(
                `UPDATE users
                 SET ${userFields.join(', ')}
                 WHERE id = $${userFields.length + 1}`,
                userValues
              );
            }
          }
        }

        await writeAudit(client, {
          organizationId: orgId,
          userId,
          entityType: 'settings_account',
          entityId: orgId,
          action: 'updated',
          payload: {
            ownerName: payload.ownerName,
            ownerEmail: payload.ownerEmail,
            businessName: payload.businessName
          }
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({
          code: 'email_conflict',
          message: 'Este email ja esta em uso por outro usuario.'
        });
      }
      throw error;
    }

    const account = await selectAccount({ query }, orgId);
    res.json({ data: account });
  })
);

router.get(
  '/settings/subscription',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    await ensureSettingsRow({ query }, orgId);
    const settings = await selectSettings({ query }, orgId);
    res.json({
      data: {
        plan: settings.plan,
        status: settings.status,
        renewalDate: settings.renewalDate,
        monthlyPrice: settings.monthlyPrice
      }
    });
  })
);

router.patch(
  '/settings/subscription',
  validateRequest({ body: settingsSubscriptionUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const payload = req.body as SettingsSubscriptionInput;

    await withTransaction(async (client) => {
      await ensureSettingsRow(client, orgId);

      const fields: string[] = [];
      const values: Array<string | number> = [];

      if (payload.plan !== undefined) {
        fields.push(`subscription_plan = $${fields.length + 1}`);
        values.push(payload.plan.trim());
      }
      if (payload.status !== undefined) {
        fields.push(`subscription_status = $${fields.length + 1}`);
        values.push(payload.status);
      }
      if (payload.renewalDate !== undefined) {
        fields.push(`subscription_renewal_date = $${fields.length + 1}`);
        values.push(payload.renewalDate);
      }
      if (payload.monthlyPrice !== undefined) {
        fields.push(`subscription_monthly_price = $${fields.length + 1}`);
        values.push(Math.max(0, payload.monthlyPrice));
      }

      await updateSettingsFields(client, orgId, fields, values);

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'settings_subscription',
        entityId: orgId,
        action: 'updated',
        payload: {
          plan: payload.plan,
          status: payload.status,
          renewalDate: payload.renewalDate,
          monthlyPrice: payload.monthlyPrice
        }
      });
    });

    const settings = await selectSettings({ query }, orgId);
    res.json({
      data: {
        plan: settings.plan,
        status: settings.status,
        renewalDate: settings.renewalDate,
        monthlyPrice: settings.monthlyPrice
      }
    });
  })
);

router.get(
  '/settings/pix',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    await ensureSettingsRow({ query }, orgId);
    const settings = await selectSettings({ query }, orgId);
    res.json({
      data: {
        keyType: settings.keyType,
        keyValue: settings.keyValue,
        holderName: settings.holderName
      }
    });
  })
);

router.patch(
  '/settings/pix',
  validateRequest({ body: settingsPixUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const payload = req.body as SettingsPixInput;

    await withTransaction(async (client) => {
      await ensureSettingsRow(client, orgId);

      const fields: string[] = [];
      const values: Array<string | null> = [];

      if (payload.keyType !== undefined) {
        fields.push(`pix_key_type = $${fields.length + 1}`);
        values.push(normalizeOptional(payload.keyType));
      }
      if (payload.keyValue !== undefined) {
        fields.push(`pix_key_value = $${fields.length + 1}`);
        values.push(normalizeOptional(payload.keyValue));
      }
      if (payload.holderName !== undefined) {
        fields.push(`pix_holder_name = $${fields.length + 1}`);
        values.push(normalizeOptional(payload.holderName));
      }

      await updateSettingsFields(client, orgId, fields, values);

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'settings_pix',
        entityId: orgId,
        action: 'updated',
        payload: {
          keyType: payload.keyType,
          keyValue: payload.keyValue ? '***' : undefined,
          holderName: payload.holderName
        }
      });
    });

    const settings = await selectSettings({ query }, orgId);
    res.json({
      data: {
        keyType: settings.keyType,
        keyValue: settings.keyValue,
        holderName: settings.holderName
      }
    });
  })
);

router.get(
  '/settings/alerts',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    await ensureSettingsRow({ query }, orgId);
    const settings = await selectSettings({ query }, orgId);
    res.json({
      data: {
        enabled: settings.enabled,
        daysBeforeDue: settings.daysBeforeDue
      }
    });
  })
);

router.patch(
  '/settings/alerts',
  validateRequest({ body: settingsAlertUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const payload = req.body as SettingsAlertInput;

    await withTransaction(async (client) => {
      await ensureSettingsRow(client, orgId);

      const fields: string[] = [];
      const values: Array<boolean | number> = [];

      if (payload.enabled !== undefined) {
        fields.push(`alert_enabled = $${fields.length + 1}`);
        values.push(payload.enabled);
      }
      if (payload.daysBeforeDue !== undefined) {
        fields.push(`alert_days_before_due = $${fields.length + 1}`);
        values.push(Math.max(0, Math.min(60, payload.daysBeforeDue)));
      }

      await updateSettingsFields(client, orgId, fields, values);

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'settings_alert',
        entityId: orgId,
        action: 'updated',
        payload: {
          enabled: payload.enabled,
          daysBeforeDue: payload.daysBeforeDue
        }
      });
    });

    const settings = await selectSettings({ query }, orgId);
    res.json({
      data: {
        enabled: settings.enabled,
        daysBeforeDue: settings.daysBeforeDue
      }
    });
  })
);

router.get(
  '/settings/access',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const result = await query<AccessMemberRow>(
      `SELECT id, name, email, role, active, created_at
       FROM users
       WHERE organization_id = $1
       ORDER BY created_at ASC`,
      [orgId]
    );
    res.json({ data: result.rows });
  })
);

router.post(
  '/settings/access',
  validateRequest({ body: accessMemberInputSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const payload = req.body as AccessMemberInput;

    try {
      const created = await withTransaction(async (client) => {
        const inserted = await client.query<AccessMemberRow>(
          `INSERT INTO users (organization_id, name, email, role, active)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, email, role, active, created_at`,
          [
            orgId,
            payload.name.trim(),
            payload.email.trim().toLowerCase(),
            normalizeRole(payload.role),
            payload.active ?? true
          ]
        );

        const member = inserted.rows[0];

        await writeAudit(client, {
          organizationId: orgId,
          userId,
          entityType: 'settings_access',
          entityId: member.id,
          action: 'created',
          payload: {
            role: member.role,
            active: member.active
          }
        });

        return member;
      });

      return res.status(201).json({ data: created });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({
          code: 'email_conflict',
          message: 'Este email ja esta em uso por outro usuario.'
        });
      }
      throw error;
    }
  })
);

router.patch(
  '/settings/access/:id',
  validateRequest({ params: idParamSchema, body: accessMemberUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const memberId = req.params.id;
    const updates = req.body as AccessMemberUpdateInput;

    const fields: string[] = [];
    const values: Array<string | boolean> = [];

    if (updates.name !== undefined) {
      fields.push(`name = $${fields.length + 1}`);
      values.push(updates.name.trim());
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${fields.length + 1}`);
      values.push(updates.email.trim().toLowerCase());
    }
    if (updates.role !== undefined) {
      fields.push(`role = $${fields.length + 1}`);
      values.push(normalizeRole(updates.role));
    }
    if (updates.active !== undefined) {
      fields.push(`active = $${fields.length + 1}`);
      values.push(updates.active);
    }

    try {
      const updated = await withTransaction(async (client) => {
        const result = await client.query<AccessMemberRow>(
          `UPDATE users
           SET ${fields.join(', ')}
           WHERE id = $${fields.length + 1} AND organization_id = $${fields.length + 2}
           RETURNING id, name, email, role, active, created_at`,
          [...values, memberId, orgId]
        );

        const member = result.rows[0] || null;
        if (!member) return null;

        await writeAudit(client, {
          organizationId: orgId,
          userId,
          entityType: 'settings_access',
          entityId: memberId,
          action: 'updated',
          payload: updates
        });

        return member;
      });

      if (!updated) {
        return res.status(404).json({
          code: 'not_found',
          message: 'Membro nao encontrado.'
        });
      }

      return res.json({ data: updated });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({
          code: 'email_conflict',
          message: 'Este email ja esta em uso por outro usuario.'
        });
      }
      throw error;
    }
  })
);

export default router;
