import { Router } from 'express';
import type { QueryResultRow } from 'pg';
import { DEFAULT_ORG_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { authLoginSchema, authRegisterSchema, authSocialSyncSchema } from '../schemas/auth';
import { asyncHandler } from '../utils/async-handler';

type AuthUserRow = QueryResultRow & {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  organization_id: string;
  store_id: string | null;
};

const router = Router();

const toAccessType = (role: string) => {
  const normalized = role.trim().toLowerCase();
  return normalized === 'owner' ? 'admin' : 'revendedora';
};

const isUniqueConstraintError = (error: unknown): error is { code: string } =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');

const isUndefinedTableError = (error: unknown): error is { code: string } =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42P01');

const ensurePrimaryStoreForOrganization = async (organizationId: string) => {
  const orgId = organizationId.trim();
  if (!orgId) return null;

  return withTransaction(async (client) => {
    await client.query(`SELECT id FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE`, [orgId]);

    const existingStore = await client.query<{ id: string }>(
      `SELECT id
       FROM stores
       WHERE organization_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [orgId]
    );

    const storeId = existingStore.rows[0]?.id || null;
    if (storeId) return storeId;

    const createdStore = await client.query<{ id: string }>(
      `INSERT INTO stores (organization_id, name, timezone)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [orgId, 'Loja Principal', 'America/Sao_Paulo']
    );

    return createdStore.rows[0]?.id || null;
  });
};

const hydrateUserStore = async (user: AuthUserRow | null) => {
  if (!user) return null;
  if (user.store_id) return user;

  const storeId = await ensurePrimaryStoreForOrganization(user.organization_id || DEFAULT_ORG_ID);
  if (!storeId) return user;

  return {
    ...user,
    store_id: storeId
  };
};

const createIsolatedReseller = async (
  name: string,
  email: string,
  password?: string
) => {
  return withTransaction(async (client) => {
    const organizationName = `Conta ${name.trim()}`;
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const createdOrganization = await client.query<{ id: string }>(
      `INSERT INTO organizations (name)
       VALUES ($1)
       RETURNING id`,
      [organizationName]
    );
    const orgId = createdOrganization.rows[0]?.id;
    if (!orgId) {
      throw new Error('failed_to_create_organization');
    }

    const createdStore = await client.query<{ id: string }>(
      `INSERT INTO stores (organization_id, name, timezone)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [orgId, 'Loja Principal', 'America/Sao_Paulo']
    );
    const storeId = createdStore.rows[0]?.id || null;

    await client.query(
      `INSERT INTO organization_settings (organization_id, owner_name, owner_email, business_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id) DO NOTHING`,
      [orgId, normalizedName, normalizedEmail, organizationName]
    );

    const inserted = await client.query<AuthUserRow>(
      `INSERT INTO users (organization_id, name, email, role, active, created_at)
       VALUES ($1, $2, $3, 'seller', true, now())
       RETURNING id, name, email, role, active, organization_id, NULL::uuid AS store_id`,
      [orgId, normalizedName, normalizedEmail]
    );

    const user = inserted.rows[0];
    user.store_id = storeId;

    if (password) {
      await client.query(
        `INSERT INTO user_credentials (user_id, password_hash)
         VALUES ($1, crypt($2, gen_salt('bf')))`,
        [user.id, password]
      );
    }

    return user;
  });
};

router.post(
  '/auth/register',
  validateRequest({ body: authRegisterSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as {
      name: string;
      email: string;
      password: string;
    };

    try {
      const created = await createIsolatedReseller(payload.name, payload.email, payload.password);

      return res.status(201).json({
        data: {
          id: created.id,
          name: created.name,
          email: created.email,
          role: created.role,
          accessType: toAccessType(created.role),
          organizationId: created.organization_id,
          storeId: created.store_id
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({
          code: 'email_conflict',
          message: 'Este email ja esta em uso por outro usuario.'
        });
      }
      if (isUndefinedTableError(error)) {
        return res.status(503).json({
          code: 'auth_not_ready',
          message: 'Cadastro indisponivel. Aplique as migracoes mais recentes.'
        });
      }
      throw error;
    }
  })
);

router.post(
  '/auth/social-sync',
  validateRequest({ body: authSocialSyncSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as { name?: string; email: string };
    const email = payload.email.trim().toLowerCase();
    const name = payload.name?.trim() || 'Revendedora';

    try {
      const existing = await query<AuthUserRow>(
        `SELECT u.id,
                u.name,
                u.email,
                u.role,
                u.active,
                u.organization_id,
                first_store.id AS store_id
         FROM users u
         LEFT JOIN LATERAL (
           SELECT s.id
           FROM stores s
           WHERE s.organization_id = u.organization_id
           ORDER BY s.created_at ASC
           LIMIT 1
         ) first_store ON true
         WHERE lower(u.email) = lower($1)
         LIMIT 1`,
        [email]
      );

      const existingUser = await hydrateUserStore(existing.rows[0] || null);
      if (existingUser) {
        if (!existingUser.active) {
          return res.status(403).json({
            code: 'account_disabled',
            message: 'Conta desativada. Fale com o suporte.'
          });
        }

        return res.json({
          data: {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            role: existingUser.role,
            accessType: toAccessType(existingUser.role),
            organizationId: existingUser.organization_id || DEFAULT_ORG_ID,
            storeId: existingUser.store_id
          }
        });
      }

      const created = await createIsolatedReseller(name, email);
      return res.status(201).json({
        data: {
          id: created.id,
          name: created.name,
          email: created.email,
          role: created.role,
          accessType: toAccessType(created.role),
          organizationId: created.organization_id,
          storeId: created.store_id
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await query<AuthUserRow>(
          `SELECT u.id,
                  u.name,
                  u.email,
                  u.role,
                  u.active,
                  u.organization_id,
                  first_store.id AS store_id
           FROM users u
           LEFT JOIN LATERAL (
             SELECT s.id
             FROM stores s
             WHERE s.organization_id = u.organization_id
             ORDER BY s.created_at ASC
             LIMIT 1
           ) first_store ON true
           WHERE lower(u.email) = lower($1)
           LIMIT 1`,
          [email]
        );
        const user = await hydrateUserStore(existing.rows[0] || null);
        if (user) {
          return res.json({
            data: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              accessType: toAccessType(user.role),
              organizationId: user.organization_id || DEFAULT_ORG_ID,
              storeId: user.store_id
            }
          });
        }
      }
      if (isUndefinedTableError(error)) {
        return res.status(503).json({
          code: 'auth_not_ready',
          message: 'Login social indisponivel. Aplique as migracoes mais recentes.'
        });
      }
      throw error;
    }
  })
);

router.post(
  '/auth/login',
  validateRequest({ body: authLoginSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as { email: string; password: string };
    try {
      const result = await query<AuthUserRow>(
        `SELECT u.id,
                u.name,
                u.email,
                u.role,
                u.active,
                u.organization_id,
                first_store.id AS store_id
         FROM users u
         INNER JOIN user_credentials c ON c.user_id = u.id
         LEFT JOIN LATERAL (
           SELECT s.id
           FROM stores s
           WHERE s.organization_id = u.organization_id
           ORDER BY s.created_at ASC
           LIMIT 1
         ) first_store ON true
         WHERE lower(u.email) = lower($1)
           AND u.active = true
           AND c.password_hash = crypt($2, c.password_hash)
         LIMIT 1`,
        [payload.email.trim().toLowerCase(), payload.password]
      );

      const user = await hydrateUserStore(result.rows[0] || null);
      if (!user) {
        return res.status(401).json({
          code: 'invalid_credentials',
          message: 'Email ou senha invalidos.'
        });
      }

      return res.json({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          accessType: toAccessType(user.role),
          organizationId: user.organization_id || DEFAULT_ORG_ID,
          storeId: user.store_id
        }
      });
    } catch (error) {
      if (isUndefinedTableError(error)) {
        return res.status(503).json({
          code: 'auth_not_ready',
          message: 'Login por credenciais indisponivel. Aplique as migracoes mais recentes.'
        });
      }
      throw error;
    }
  })
);

export default router;
