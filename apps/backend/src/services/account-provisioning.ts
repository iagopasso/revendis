import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { query, withTransaction } from '../db';

type DbExecutor = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: Array<unknown>
  ) => Promise<QueryResult<T>>;
};

const DEFAULT_STORE_NAME = 'Loja Principal';
const DEFAULT_STORE_TIMEZONE = 'America/Sao_Paulo';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeName = (value: string) => value.trim() || 'Revendedora';
const normalizeEmail = (value?: string | null) => {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return normalized || null;
};

const normalizeStoreName = (accountName: string) => {
  const normalized = normalizeName(accountName);
  return normalized.toLowerCase() === DEFAULT_STORE_NAME.toLowerCase()
    ? DEFAULT_STORE_NAME
    : `Loja ${normalized}`;
};

const isPermissionDeniedError = (error: unknown): error is { code: string } =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42501');

let ensureUserStoreColumnPromise: Promise<void> | null = null;

export const ensureUserStoreColumn = async () => {
  if (ensureUserStoreColumnPromise) {
    await ensureUserStoreColumnPromise;
    return;
  }

  ensureUserStoreColumnPromise = (async () => {
    try {
      await query(
        `ALTER TABLE users
           ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES stores(id) ON DELETE SET NULL`
      );
    } catch (error) {
      if (!isPermissionDeniedError(error)) throw error;
    }

    try {
      await query(
        `CREATE INDEX IF NOT EXISTS idx_users_store_id
           ON users (store_id)`
      );
    } catch (error) {
      if (!isPermissionDeniedError(error)) throw error;
    }
  })().catch((error) => {
    ensureUserStoreColumnPromise = null;
    throw error;
  });

  await ensureUserStoreColumnPromise;
};

const selectStoreForOrganization = async (db: DbExecutor, organizationId: string, storeId: string) => {
  const normalizedStoreId = storeId.trim();
  if (!UUID_PATTERN.test(normalizedStoreId)) return null;

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM stores
     WHERE id = $1
       AND organization_id = $2
     LIMIT 1`,
    [normalizedStoreId, organizationId]
  );

  return result.rows[0]?.id || null;
};

export const ensurePrimaryStoreForOrganization = async (organizationId: string) => {
  const orgId = organizationId.trim();
  if (!orgId) return null;

  await ensureUserStoreColumn();

  return withTransaction(async (client) => {
    return ensurePrimaryStoreForOrganizationInClient(client, orgId);
  });
};

export const ensurePrimaryStoreForOrganizationInClient = async (client: PoolClient, organizationId: string) => {
  const orgId = organizationId.trim();
  if (!orgId) return null;

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
    [orgId, DEFAULT_STORE_NAME, DEFAULT_STORE_TIMEZONE]
  );

  return createdStore.rows[0]?.id || null;
};

export const createStoreForOrganizationMember = async (
  client: PoolClient,
  options: {
    organizationId: string;
    accountName: string;
  }
) => {
  const storeName = normalizeStoreName(options.accountName);

  const createdStore = await client.query<{ id: string; name: string }>(
    `INSERT INTO stores (organization_id, name, timezone)
     VALUES ($1, $2, $3)
     RETURNING id, name`,
    [options.organizationId, storeName, DEFAULT_STORE_TIMEZONE]
  );

  return {
    storeId: createdStore.rows[0]?.id || null,
    storeName: createdStore.rows[0]?.name || storeName
  };
};

export const createIsolatedOrganizationForUser = async (
  client: PoolClient,
  options: {
    accountName: string;
    accountEmail?: string | null;
  }
) => {
  const accountName = normalizeName(options.accountName);
  const accountEmail = normalizeEmail(options.accountEmail);
  const organizationName = `Conta ${accountName}`;

  const createdOrganization = await client.query<{ id: string }>(
    `INSERT INTO organizations (name)
     VALUES ($1)
     RETURNING id`,
    [organizationName]
  );
  const organizationId = createdOrganization.rows[0]?.id || '';
  if (!organizationId) {
    throw new Error('failed_to_create_organization');
  }

  const primaryStoreId = await ensurePrimaryStoreForOrganizationInClient(client, organizationId);

  await client.query(
    `INSERT INTO organization_settings (organization_id, owner_name, owner_email, business_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId, accountName, accountEmail, organizationName]
  );

  return {
    organizationId,
    storeId: primaryStoreId,
    organizationName
  };
};

export const ensureUserStoreAssignment = async (
  db: DbExecutor,
  options: {
    userId: string;
    organizationId: string;
    preferredStoreId?: string | null;
  }
) => {
  const preferredStoreId = options.preferredStoreId?.trim() || '';
  const validPreferredStoreId = preferredStoreId
    ? await selectStoreForOrganization(db, options.organizationId, preferredStoreId)
    : null;
  if (validPreferredStoreId) {
    await db.query(
      `UPDATE users
       SET store_id = $2
       WHERE id = $1
         AND organization_id = $3
         AND store_id IS DISTINCT FROM $2`,
      [options.userId, validPreferredStoreId, options.organizationId]
    );
    return validPreferredStoreId;
  }

  const primaryStoreId =
    db && typeof db === 'object' && 'release' in db
      ? await ensurePrimaryStoreForOrganizationInClient(db as PoolClient, options.organizationId)
      : await ensurePrimaryStoreForOrganization(options.organizationId);

  if (!primaryStoreId) return null;

  await db.query(
    `UPDATE users
     SET store_id = $2
     WHERE id = $1
       AND organization_id = $3
       AND store_id IS DISTINCT FROM $2`,
    [options.userId, primaryStoreId, options.organizationId]
  );

  return primaryStoreId;
};
