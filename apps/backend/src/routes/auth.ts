import { Router } from 'express';
import type { QueryResultRow } from 'pg';
import { DEFAULT_ORG_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { authLoginSchema, authRegisterSchema, authSocialSyncSchema } from '../schemas/auth';
import {
  createIsolatedOrganizationForUser,
  ensureUserStoreAssignment,
  ensureUserStoreColumn
} from '../services/account-provisioning';
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

const hydrateUserStore = async (user: AuthUserRow | null) => {
  if (!user) return null;
  await ensureUserStoreColumn();
  const storeId = await ensureUserStoreAssignment({ query }, {
    userId: user.id,
    organizationId: user.organization_id || DEFAULT_ORG_ID,
    preferredStoreId: user.store_id
  });
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
    await ensureUserStoreColumn();
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const isolatedTenant = await createIsolatedOrganizationForUser(client, {
      accountName: normalizedName,
      accountEmail: normalizedEmail
    });

    const inserted = await client.query<AuthUserRow>(
      `INSERT INTO users (organization_id, store_id, name, email, role, active, created_at)
       VALUES ($1, $2, $3, $4, 'seller', true, now())
       RETURNING id, name, email, role, active, organization_id, store_id`,
      [isolatedTenant.organizationId, isolatedTenant.storeId, normalizedName, normalizedEmail]
    );

    const user = inserted.rows[0];

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
      await ensureUserStoreColumn();
      const existing = await query<AuthUserRow>(
        `SELECT u.id,
                u.name,
                u.email,
                u.role,
                u.active,
                u.organization_id,
                u.store_id
         FROM users u
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
                  u.store_id
           FROM users u
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
      await ensureUserStoreColumn();
      const result = await query<AuthUserRow>(
        `SELECT u.id,
                u.name,
                u.email,
                u.role,
                u.active,
                u.organization_id,
                u.store_id
         FROM users u
         INNER JOIN user_credentials c ON c.user_id = u.id
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
