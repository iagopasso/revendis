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

export const writeAudit = async (client: PoolClient, entry: AuditEntry) => {
  await client.query(
    `INSERT INTO audit_logs (organization_id, store_id, user_id, entity_type, entity_id, action, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.organizationId || null,
      entry.storeId || null,
      entry.userId || null,
      entry.entityType,
      entry.entityId || null,
      entry.action,
      entry.payload || null
    ]
  );
};
