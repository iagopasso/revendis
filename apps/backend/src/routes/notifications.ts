import { Router } from 'express';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query } from '../db';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const NOTIFICATIONS_TTL_HOURS = 24;

type NotificationCategory =
  | 'order'
  | 'sale'
  | 'inventory'
  | 'finance'
  | 'customer'
  | 'settings'
  | 'general';

type AuditLogRow = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: unknown;
  created_at: string;
};

let ensureAuditLogsTablePromise: Promise<void> | null = null;

const ensureAuditLogsTable = async () => {
  if (ensureAuditLogsTablePromise) {
    await ensureAuditLogsTablePromise;
    return;
  }

  ensureAuditLogsTablePromise = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS audit_logs (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         organization_id uuid,
         store_id uuid,
         user_id uuid,
         entity_type text NOT NULL,
         entity_id uuid,
         action text NOT NULL,
         payload jsonb,
         created_at timestamptz NOT NULL DEFAULT now()
       )`
    );

    await query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_org_store_created
       ON audit_logs (organization_id, store_id, created_at DESC)`
    );
  })().catch((error) => {
    ensureAuditLogsTablePromise = null;
    throw error;
  });

  await ensureAuditLogsTablePromise;
};

const parseLimit = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === 'string' ? Number(raw) : Number(raw || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  const rounded = Math.trunc(parsed);
  return Math.min(MAX_LIMIT, Math.max(1, rounded));
};

const toPayloadObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const readPayloadText = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return normalized;
};

const readPayloadNumber = (payload: Record<string, unknown>, key: string) => {
  const value = payload[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const prettify = (value: string) =>
  value
    .replace(/_/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const resolveNotificationCopy = (
  entityType: string,
  action: string,
  payload: Record<string, unknown>
): { message: string; category: NotificationCategory } => {
  if (entityType === 'storefront_order') {
    if (action === 'created') return { message: 'Novo pedido na loja.', category: 'order' };
    if (action === 'accepted') return { message: 'Pedido da loja aceito.', category: 'order' };
    if (action === 'cancelled') return { message: 'Pedido da loja cancelado.', category: 'order' };
  }

  if (entityType === 'sale') {
    if (action === 'created') return { message: 'Nova venda registrada.', category: 'sale' };
    if (action === 'status_updated') {
      const status = readPayloadText(payload, 'status');
      return {
        message: status ? `Status da venda atualizado para ${status}.` : 'Status da venda atualizado.',
        category: 'sale'
      };
    }
    if (action === 'deleted') return { message: 'Venda cancelada.', category: 'sale' };
  }

  if (entityType === 'payment' && action === 'created') {
    return { message: 'Pagamento registrado.', category: 'sale' };
  }

  if (entityType === 'purchase') {
    if (action === 'created') {
      const supplier = readPayloadText(payload, 'supplier');
      return {
        message: supplier ? `Compra registrada de ${supplier}.` : 'Nova compra registrada.',
        category: 'inventory'
      };
    }
    if (action === 'status_updated') {
      const status = readPayloadText(payload, 'status');
      return {
        message: status ? `Status da compra atualizado para ${status}.` : 'Status da compra atualizado.',
        category: 'inventory'
      };
    }
    if (action === 'deleted') return { message: 'Compra removida.', category: 'inventory' };
  }

  if (entityType === 'inventory_movement' && action === 'adjusted') {
    const quantity = readPayloadNumber(payload, 'quantity');
    if (quantity !== null) {
      return {
        message: `Ajuste de estoque aplicado (${quantity} unidade(s)).`,
        category: 'inventory'
      };
    }
    return { message: 'Ajuste de estoque aplicado.', category: 'inventory' };
  }

  if (entityType === 'inventory_transfer' && action === 'transferred') {
    return { message: 'Transferencia de estoque registrada.', category: 'inventory' };
  }

  if (entityType === 'return' && action === 'created') {
    return { message: 'Devolucao registrada.', category: 'inventory' };
  }

  if (entityType === 'product') {
    const sku = readPayloadText(payload, 'sku');
    const name = readPayloadText(payload, 'name');
    const label = sku || name || 'produto';
    if (action === 'created') return { message: `Novo ${label} cadastrado.`, category: 'inventory' };
    if (action === 'updated') return { message: `${label} atualizado.`, category: 'inventory' };
    if (action === 'deleted') return { message: `${label} removido.`, category: 'inventory' };
  }

  if (entityType === 'receivable') {
    if (action === 'created') return { message: 'Recebivel criado.', category: 'finance' };
    if (action === 'settled') return { message: 'Recebivel baixado.', category: 'finance' };
    if (action === 'unsettled') return { message: 'Baixa de recebivel desfeita.', category: 'finance' };
    if (action === 'updated') return { message: 'Recebivel atualizado.', category: 'finance' };
    if (action === 'deleted') return { message: 'Recebivel removido.', category: 'finance' };
  }

  if (entityType === 'finance_expense') {
    if (action === 'created') return { message: 'Despesa criada.', category: 'finance' };
    if (action === 'paid') return { message: 'Despesa paga.', category: 'finance' };
    if (action === 'unpaid') return { message: 'Pagamento de despesa desfeito.', category: 'finance' };
    if (action === 'deleted') return { message: 'Despesa removida.', category: 'finance' };
  }

  if (entityType === 'customer') {
    if (action === 'created') return { message: 'Novo cliente cadastrado.', category: 'customer' };
    if (action === 'updated') return { message: 'Cliente atualizado.', category: 'customer' };
    if (action === 'deleted') return { message: 'Cliente removido.', category: 'customer' };
  }

  if (entityType.startsWith('settings_') || entityType === 'brand') {
    return { message: 'Configuracoes atualizadas.', category: 'settings' };
  }

  const entityLabel = prettify(entityType) || 'registro';
  const actionLabel = prettify(action) || 'atualizado';
  return {
    message: `${entityLabel} ${actionLabel}.`,
    category: 'general'
  };
};

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    await ensureAuditLogsTable();
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const limit = parseLimit(req.query.limit);

    const result = await query<AuditLogRow>(
      `SELECT id, entity_type, entity_id, action, payload, created_at
       FROM audit_logs
       WHERE (organization_id = $1 OR organization_id IS NULL)
         AND (store_id = $2 OR store_id IS NULL)
         AND created_at >= now() - ($4::int * interval '1 hour')
       ORDER BY created_at DESC
       LIMIT $3`,
      [orgId, storeId, limit, NOTIFICATIONS_TTL_HOURS]
    );

    const data = result.rows.map((row) => {
      const payload = toPayloadObject(row.payload);
      const copy = resolveNotificationCopy(row.entity_type, row.action, payload);
      return {
        id: row.id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
        payload,
        created_at: row.created_at,
        message: copy.message,
        category: copy.category
      };
    });

    res.json({ data });
  })
);

export default router;
