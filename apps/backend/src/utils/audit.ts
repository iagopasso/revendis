import type { PoolClient } from 'pg';

export type AuditEntry = {
  organizationId?: string | null;
  storeId?: string | null;
  userId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  payload?: Record<string, unknown> | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toUuidOrNull = (value?: string | null) => {
  const normalized = `${value || ''}`.trim();
  if (!normalized) return null;
  return UUID_PATTERN.test(normalized) ? normalized : null;
};

export const writeAudit = async (client: PoolClient, entry: AuditEntry) => {
  await client.query(
    `INSERT INTO audit_logs (organization_id, store_id, user_id, entity_type, entity_id, action, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      toUuidOrNull(entry.organizationId),
      toUuidOrNull(entry.storeId),
      toUuidOrNull(entry.userId),
      entry.entityType,
      entry.entityId || null,
      entry.action,
      entry.payload || null
    ]
  );
};
