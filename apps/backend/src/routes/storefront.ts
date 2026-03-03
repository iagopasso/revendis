import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { StorefrontOrderInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID, STOREFRONT_PIX_EXPIRES_MINUTES } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import {
  storefrontOrderAcceptSchema,
  storefrontOrderCancelByTokenSchema,
  storefrontOrderPaymentConfirmSchema,
  storefrontOrderSchema
} from '../schemas/storefront';
import {
  createMercadoPagoPixPayment,
  createMercadoPagoPreference,
  getMercadoPagoPayment,
  isMercadoPagoEnabled
} from '../services/mercado-pago';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';
import { parseSaleCreatedAt } from '../utils/sale-date';

const router = Router();
const DEFAULT_STOREFRONT_COLOR = '#7D58D4';
const DEFAULT_STOREFRONT_SUBDOMAIN = 'revendis-prime';

type PublicStoreSettingsRow = {
  organization_id: string;
  organization_name: string;
  business_name: string | null;
  storefront_subdomain: string | null;
  storefront_color: string | null;
  storefront_only_stock: boolean | null;
  storefront_show_out_of_stock: boolean | null;
  storefront_filter_category: boolean | null;
  storefront_filter_brand: boolean | null;
  storefront_filter_price: boolean | null;
  storefront_whatsapp: string | null;
  storefront_show_whatsapp_button: boolean | null;
  storefront_selected_brands: string[] | null;
  storefront_selected_categories: string[] | null;
  storefront_price_from: string | null;
  storefront_price_to: string | null;
  storefront_logo_url: string | null;
  storefront_credit_card_link: string | null;
  storefront_boleto_link: string | null;
  pix_key_value: string | null;
  storefront_runtime_state: unknown | null;
  storefront_catalog_snapshot: unknown | null;
};

type StorefrontRuntimePromotion = {
  id: string;
  name: string;
  discount: number;
  productIds: string[];
  mode?: 'global' | 'per_product';
  discountsByProduct?: Record<string, number>;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'scheduled' | 'ended';
  createdAt?: string;
};

type StorefrontRuntimeState = {
  activeProducts: Array<{
    id: string;
    name: string;
    price?: number | string;
    active?: boolean;
  }>;
  promotions: StorefrontRuntimePromotion[];
  hiddenProductIds: string[];
  productDescriptions: Record<string, string>;
  storePriceOverrides: Record<string, number>;
};

type StorefrontOrderStatus = 'pending' | 'accepted' | 'cancelled';

type StorefrontPaymentProvider = 'mercado_pago' | null;
type StorefrontPaymentMethod = 'pix' | 'credit_card';
type StorefrontPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';

type StorefrontOrderRow = {
  id: string;
  store_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  status: string | null;
  total: number | string;
  created_at: string;
  items_count: number | string;
  sale_id: string | null;
  accepted_at: string | null;
  cancelled_at: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  payment_provider?: string | null;
  payment_status?: string | null;
  payment_expires_at?: string | null;
  payment_paid_at?: string | null;
  payment_token?: string | null;
  payment_installments?: number | string | null;
};

type StorefrontOrderItemRow = {
  id: string;
  storefront_order_id: string;
  product_id: string | null;
  sku: string;
  quantity: number | string;
  price: number | string;
  product_name: string | null;
  product_brand: string | null;
  product_image_url: string | null;
  reserved_unit_ids?: unknown;
};

const toNumeric = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeOrderStatus = (value?: string | null): StorefrontOrderStatus => {
  const status = (value || '').trim().toLowerCase();
  if (status === 'accepted') return 'accepted';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
};

const normalizePaymentStatus = (value?: string | null): StorefrontPaymentStatus => {
  const status = (value || '').trim().toLowerCase();
  if (status === 'paid') return 'paid';
  if (status === 'failed') return 'failed';
  if (status === 'expired') return 'expired';
  return 'pending';
};

const mapOrderItem = (row: StorefrontOrderItemRow) => ({
  id: row.id,
  storefront_order_id: row.storefront_order_id,
  product_id: row.product_id,
  sku: row.sku,
  quantity: Math.max(0, Math.trunc(toNumeric(row.quantity))),
  price: Math.max(0, toNumeric(row.price)),
  product_name: row.product_name || null,
  product_brand: row.product_brand || null,
  product_image_url: row.product_image_url || null
});

const mapOrder = (row: StorefrontOrderRow, items: StorefrontOrderItemRow[]) => ({
  id: row.id,
  store_id: row.store_id,
  customer_name: row.customer_name,
  customer_phone: row.customer_phone || '',
  customer_email: row.customer_email || '',
  status: normalizeOrderStatus(row.status),
  total: Math.max(0, toNumeric(row.total)),
  created_at: row.created_at,
  items_count: Math.max(0, Math.trunc(toNumeric(row.items_count))),
  sale_id: row.sale_id,
  accepted_at: row.accepted_at,
  cancelled_at: row.cancelled_at,
  payment_method: row.payment_method || '',
  payment_reference: row.payment_reference || '',
  payment_provider: row.payment_provider || '',
  payment_status: normalizePaymentStatus(row.payment_status),
  payment_expires_at: row.payment_expires_at || null,
  payment_paid_at: row.payment_paid_at || null,
  payment_installments: Math.max(1, Math.trunc(toNumeric(row.payment_installments) || 1)),
  items: items.map(mapOrderItem)
});

const normalizeSubdomain = (value?: string | null) =>
  (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

const normalizeUuidArray = (value: unknown) => {
  const candidates: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') candidates.push(item);
    }
  } else if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.startsWith('{') && normalized.endsWith('}')) {
      const inner = normalized.slice(1, -1).trim();
      if (inner) {
        for (const part of inner.split(',')) {
          candidates.push(part.replace(/^"+|"+$/g, ''));
        }
      }
    } else if (normalized) {
      candidates.push(normalized);
    }
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of candidates) {
    const value = entry.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

const createPaymentToken = () => randomUUID().replace(/-/g, '');

const toIsoStringOrNull = (value: Date | null) => (value ? value.toISOString() : null);

const mapStorefrontPaymentMethodToSalePayment = (method?: string | null) => {
  if (method === 'pix') return 'Pix';
  if (method === 'credit_card') return 'Cartao de Credito';
  return 'Pagamento online';
};

const normalizeStorefrontPaymentMethod = (value?: string | null): StorefrontPaymentMethod | null => {
  const method = (value || '').trim().toLowerCase();
  if (method === 'pix' || method === 'credit_card') return method;
  return null;
};

const mapMercadoPagoMethodToStorefront = ({
  paymentMethodId,
  paymentTypeId
}: {
  paymentMethodId?: string;
  paymentTypeId?: string;
}): StorefrontPaymentMethod | null => {
  const normalizedMethodId = (paymentMethodId || '').trim().toLowerCase();
  const normalizedTypeId = (paymentTypeId || '').trim().toLowerCase();
  if (normalizedMethodId === 'pix') return 'pix';
  if (normalizedTypeId === 'credit_card') return 'credit_card';
  if (normalizedTypeId === 'bank_transfer' && normalizedMethodId === 'pix') return 'pix';
  return null;
};

const isApprovedGatewayStatus = (value: string) =>
  value === 'approved' || value === 'accredited' || value === 'sucesso' || value === 'success';

const resolveGatewayPaymentStatus = (value: string): StorefrontPaymentStatus => {
  const status = (value || '').trim().toLowerCase();
  if (isApprovedGatewayStatus(status)) return 'paid';
  if (status === 'expired' || status === 'expiration') return 'expired';
  if (
    status === 'rejected' ||
    status === 'cancelled' ||
    status === 'falha' ||
    status === 'failed' ||
    status === 'failure' ||
    status === 'refunded' ||
    status === 'charged_back'
  ) {
    return 'failed';
  }
  return 'pending';
};

const releaseStorefrontOrderReservations = async (
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  orderId: string
) => {
  await client.query(
    `WITH reserved_units AS (
       SELECT DISTINCT unnest(COALESCE(soi.reserved_unit_ids, '{}'::uuid[])) AS unit_id
       FROM storefront_order_items soi
       WHERE soi.storefront_order_id = $1
     )
     UPDATE inventory_units iu
     SET status = 'available',
         updated_at = now()
     FROM reserved_units ru
     WHERE iu.id = ru.unit_id
       AND iu.status = 'reserved'
       AND iu.sale_id IS NULL`,
    [orderId]
  );

  await client.query(
    `UPDATE storefront_order_items
     SET reserved_unit_ids = '{}'::uuid[]
     WHERE storefront_order_id = $1`,
    [orderId]
  );
};

const resolveSubdomainContext = async (subdomain?: string | null) => {
  const requestedSubdomain = normalizeSubdomain(subdomain);
  if (!requestedSubdomain) return null;

  await ensureStorefrontColumns();
  const settingsRes = await query<{ organization_id: string }>(
    `SELECT organization_id
     FROM organization_settings
     WHERE lower(storefront_subdomain) = lower($1)
     LIMIT 1`,
    [requestedSubdomain]
  );
  const orgId = settingsRes.rows[0]?.organization_id || '';
  if (!orgId) return null;

  const storeRes = await query<{ id: string }>(
    `SELECT id
     FROM stores
     WHERE organization_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [orgId]
  );

  return {
    orgId,
    storeId: storeRes.rows[0]?.id || DEFAULT_STORE_ID,
    subdomain: requestedSubdomain
  };
};

const finalizePaidStorefrontOrder = async (input: {
  orgId: string;
  storeId: string;
  orderId: string;
  userId?: string | null;
}) => {
  return withTransaction(async (client) => {
    const orderRes = await client.query<StorefrontOrderRow>(
      `SELECT id,
              store_id,
              customer_name,
              customer_phone,
              customer_email,
              status,
              total,
              created_at,
              0::int AS items_count,
              sale_id,
              accepted_at,
              cancelled_at,
              payment_method,
              payment_reference,
              payment_provider,
              payment_status,
              payment_expires_at,
              payment_paid_at,
              payment_token,
              payment_installments
       FROM storefront_orders
       WHERE id = $1 AND store_id = $2
       FOR UPDATE`,
      [input.orderId, input.storeId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      return { type: 'not_found' as const };
    }

    const status = normalizeOrderStatus(order.status);
    if (status === 'cancelled') {
      return { type: 'cancelled' as const };
    }
    if (status === 'accepted' && order.sale_id) {
      const orderTotal = Math.max(0, toNumeric(order.total));
      const paidAt = order.payment_paid_at || null;
      const normalizedPaymentStatus = normalizePaymentStatus(order.payment_status);

      if (normalizedPaymentStatus !== 'paid') {
        await client.query(
          `UPDATE storefront_orders
           SET payment_status = 'paid',
               payment_paid_at = COALESCE(payment_paid_at, now())
           WHERE id = $1`,
          [input.orderId]
        );
      }

      const paymentRes = await client.query<{ paid_total: number | string }>(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS paid_total
         FROM payments
         WHERE sale_id = $1`,
        [order.sale_id]
      );
      const paidTotal = Math.max(0, toNumeric(paymentRes.rows[0]?.paid_total));
      const missingAmount = Math.max(0, orderTotal - paidTotal);

      if (missingAmount > 0) {
        await client.query(
          `INSERT INTO payments (sale_id, method, amount, created_at)
           VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))`,
          [order.sale_id, mapStorefrontPaymentMethodToSalePayment(order.payment_method), missingAmount, paidAt]
        );
      }

      await releaseStorefrontOrderReservations(client, input.orderId);

      return { type: 'already_paid' as const, saleId: order.sale_id };
    }

    const itemsRes = await client.query<StorefrontOrderItemRow>(
      `SELECT soi.id,
              soi.storefront_order_id,
              soi.product_id,
              soi.sku,
              soi.quantity,
              soi.price,
              soi.reserved_unit_ids,
              p.name AS product_name,
              p.brand AS product_brand,
              p.image_url AS product_image_url
       FROM storefront_order_items soi
       LEFT JOIN products p ON p.id = soi.product_id
       WHERE soi.storefront_order_id = $1
       ORDER BY soi.id ASC`,
      [input.orderId]
    );

    if (!itemsRes.rows.length) {
      return { type: 'empty_order' as const };
    }

    const preparedItems: Array<{
      productId: string;
      sku: string;
      quantity: number;
      price: number;
      unitIds: string[];
    }> = [];

    for (const item of itemsRes.rows) {
      const quantity = Math.max(0, Math.trunc(toNumeric(item.quantity)));
      if (quantity <= 0) continue;

      let productId = item.product_id || '';
      if (!productId) {
        const productRes = await client.query<{ id: string }>(
          `SELECT id
           FROM products
           WHERE organization_id = $1 AND sku = $2
           LIMIT 1`,
          [input.orgId, item.sku]
        );
        productId = productRes.rows[0]?.id || '';
      }

      if (!productId) {
        return { type: 'product_not_found' as const, label: item.product_name || item.sku };
      }

      const reservedUnitIds = normalizeUuidArray(item.reserved_unit_ids);
      const reservedUnitsRes =
        reservedUnitIds.length > 0
          ? await client.query<{ id: string }>(
              `SELECT id
               FROM inventory_units
               WHERE id = ANY($1::uuid[])
                 AND product_id = $2
                 AND store_id = $3
                 AND status = 'reserved'
               ORDER BY expires_at NULLS LAST, created_at ASC
               LIMIT $4
               FOR UPDATE`,
              [reservedUnitIds, productId, input.storeId, quantity]
            )
          : { rows: [] as Array<{ id: string }> };

      const missingUnits = Math.max(0, quantity - reservedUnitsRes.rows.length);
      let fallbackUnitRows: Array<{ id: string }> = [];
      if (missingUnits > 0) {
        const availableUnitsRes = await client.query<{ id: string }>(
          `SELECT id
           FROM inventory_units
           WHERE product_id = $1
             AND store_id = $2
             AND status = 'available'
           ORDER BY expires_at NULLS LAST, created_at ASC
           LIMIT $3
           FOR UPDATE SKIP LOCKED`,
          [productId, input.storeId, missingUnits]
        );
        fallbackUnitRows = availableUnitsRes.rows;
      }

      const unitIds = [...reservedUnitsRes.rows.map((row) => row.id), ...fallbackUnitRows.map((row) => row.id)];
      if (unitIds.length < quantity) {
        return { type: 'insufficient_stock' as const, label: item.product_name || item.sku };
      }

      preparedItems.push({
        productId,
        sku: item.sku,
        quantity,
        price: Math.max(0, toNumeric(item.price)),
        unitIds
      });
    }

    if (!preparedItems.length) {
      return { type: 'empty_order' as const };
    }

    const subtotal = preparedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const saleRes = await client.query<{ id: string }>(
      `INSERT INTO sales (store_id, customer_name, status, subtotal, discount_total, total, created_at)
       VALUES ($1, $2, 'pending', $3, 0, $3, now())
       RETURNING id`,
      [input.storeId, normalizeOptional(order.customer_name) || 'Cliente', subtotal]
    );
    const saleId = saleRes.rows[0].id;

    await client.query(
      `INSERT INTO payments (sale_id, method, amount, created_at)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))`,
      [
        saleId,
        mapStorefrontPaymentMethodToSalePayment(order.payment_method),
        subtotal,
        order.payment_paid_at || null
      ]
    );

    for (const item of preparedItems) {
      const saleItemRes = await client.query<{ id: string }>(
        `INSERT INTO sale_items (sale_id, product_id, sku, quantity, price)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [saleId, item.productId, item.sku, item.quantity, item.price]
      );
      const saleItemId = saleItemRes.rows[0].id;

      await client.query(
        `UPDATE inventory_units
         SET status = 'sold',
             sale_id = $1,
             sale_item_id = $2,
             sold_at = now(),
             updated_at = now()
         WHERE id = ANY($3::uuid[])`,
        [saleId, saleItemId, item.unitIds]
      );

      await client.query(
        `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason, reference_id)
         VALUES ($1, $2, 'sale_out', $3, $4, $5)`,
        [input.storeId, item.productId, -Math.abs(item.quantity), 'storefront_payment_confirmed', saleId]
      );
    }

    await releaseStorefrontOrderReservations(client, input.orderId);

    await client.query(
      `UPDATE storefront_orders
       SET status = 'accepted',
           sale_id = $2,
           accepted_at = COALESCE(accepted_at, now()),
           payment_status = 'paid',
           payment_paid_at = COALESCE(payment_paid_at, now())
       WHERE id = $1`,
      [input.orderId, saleId]
    );

    await writeAudit(client, {
      organizationId: input.orgId,
      storeId: input.storeId,
      userId: input.userId || null,
      entityType: 'storefront_order',
      entityId: input.orderId,
      action: 'payment_confirmed',
      payload: {
        saleId,
        items: preparedItems.length
      }
    });

    return { type: 'paid' as const, saleId };
  });
};

const loadStorefrontOrderForPayment = async (orderId: string) => {
  const result = await query<StorefrontOrderRow>(
    `SELECT id,
            store_id,
            customer_name,
            customer_phone,
            customer_email,
            status,
            total,
            created_at,
            0::int AS items_count,
            sale_id,
            accepted_at,
            cancelled_at,
            payment_method,
            payment_reference,
            payment_provider,
            payment_status,
            payment_expires_at,
            payment_paid_at,
            payment_token,
            payment_installments
     FROM storefront_orders
     WHERE id = $1
     LIMIT 1`,
    [orderId]
  );
  return result.rows[0] || null;
};

const resolveOrganizationByStoreId = async (storeId: string) => {
  const storeRes = await query<{ organization_id: string }>(
    `SELECT organization_id
     FROM stores
     WHERE id = $1
     LIMIT 1`,
    [storeId]
  );
  return storeRes.rows[0]?.organization_id || DEFAULT_ORG_ID;
};

const isPermissionDeniedError = (error: unknown): error is { code: string } =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42501');

const toUniqueTrimmedArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
};

const normalizeRuntimePromotion = (value: unknown): StorefrontRuntimePromotion | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    id?: unknown;
    name?: unknown;
    discount?: unknown;
    productIds?: unknown;
    mode?: unknown;
    discountsByProduct?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    status?: unknown;
    createdAt?: unknown;
  };
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;

  const discountsByProduct =
    record.discountsByProduct && typeof record.discountsByProduct === 'object'
      ? Object.fromEntries(
          Object.entries(record.discountsByProduct)
            .filter(
              ([key, val]) =>
                typeof key === 'string' && key.trim().length > 0 && Number.isFinite(Number(val))
            )
            .map(([key, val]) => [key.trim(), Math.max(0, Number(val) || 0)])
        )
      : undefined;
  const mode = record.mode === 'per_product' ? 'per_product' : record.mode === 'global' ? 'global' : undefined;
  const status =
    record.status === 'active' || record.status === 'scheduled' || record.status === 'ended'
      ? record.status
      : undefined;

  return {
    id: record.id.trim(),
    name: record.name.trim(),
    discount: Math.max(0, Number(record.discount) || 0),
    productIds: toUniqueTrimmedArray(record.productIds),
    mode,
    discountsByProduct:
      discountsByProduct && Object.keys(discountsByProduct).length > 0 ? discountsByProduct : undefined,
    startDate: typeof record.startDate === 'string' ? record.startDate : undefined,
    endDate: typeof record.endDate === 'string' ? record.endDate : undefined,
    status,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined
  };
};

const normalizeStorefrontRuntimeState = (value: unknown): StorefrontRuntimeState => {
  if (!value || typeof value !== 'object') {
    return {
      activeProducts: [],
      promotions: [],
      hiddenProductIds: [],
      productDescriptions: {},
      storePriceOverrides: {}
    };
  }

  const record = value as {
    activeProducts?: unknown;
    promotions?: unknown;
    hiddenProductIds?: unknown;
    productDescriptions?: unknown;
    storePriceOverrides?: unknown;
  };

  const activeProducts = Array.isArray(record.activeProducts)
    ? record.activeProducts
        .filter((item): item is { id: string; name: string; price?: number | string; active?: boolean } =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as { id?: unknown }).id === 'string' &&
          typeof (item as { name?: unknown }).name === 'string'
        )
        .map((item) => ({
          id: item.id.trim(),
          name: item.name.trim(),
          price: item.price,
          active: item.active
        }))
    : [];
  const promotions = Array.isArray(record.promotions)
    ? record.promotions
        .map(normalizeRuntimePromotion)
        .filter((item): item is StorefrontRuntimePromotion => Boolean(item))
    : [];
  const hiddenProductIds = toUniqueTrimmedArray(record.hiddenProductIds);
  const productDescriptions =
    record.productDescriptions && typeof record.productDescriptions === 'object'
      ? Object.fromEntries(
          Object.entries(record.productDescriptions)
            .filter(
              ([key, val]) =>
                typeof key === 'string' && key.trim().length > 0 && typeof val === 'string'
            )
            .map(([key, val]) => [key.trim(), val])
        )
      : {};
  const storePriceOverrides =
    record.storePriceOverrides && typeof record.storePriceOverrides === 'object'
      ? Object.fromEntries(
          Object.entries(record.storePriceOverrides)
            .filter(
              ([key, val]) =>
                typeof key === 'string' && key.trim().length > 0 && Number.isFinite(Number(val))
            )
            .map(([key, val]) => [key.trim(), Math.max(0, Number(val) || 0)])
        )
      : {};

  return {
    activeProducts,
    promotions,
    hiddenProductIds,
    productDescriptions,
    storePriceOverrides
  };
};

const parseStorefrontCatalogSnapshot = (value: unknown): Array<Record<string, unknown>> | null => {
  if (!value) return null;
  let parsed: unknown = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as { id?: unknown }).id === 'string' &&
      typeof (item as { name?: unknown }).name === 'string'
  );
};

const loadPublicStoreCatalog = async (orgId: string, storefrontStoreId: string) => {
  const productsResult = await query(
    `SELECT p.id,
            p.sku,
            p.name,
            p.barcode,
            p.brand,
            p.price,
            p.active,
            p.image_url,
            p.category_id,
            c.name AS category,
            GREATEST(COALESCE(b.quantity, 0) - COALESCE(pending.quantity, 0), 0)::int AS quantity
     FROM products p
     LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.store_id = $2
     LEFT JOIN (
       SELECT soi.product_id, COALESCE(SUM(soi.quantity), 0)::int AS quantity
       FROM storefront_order_items soi
       INNER JOIN storefront_orders so ON so.id = soi.storefront_order_id
       WHERE so.store_id = $2
         AND lower(COALESCE(so.status, 'pending')) IN ('pending', 'confirmed')
         AND (
           to_jsonb(so) ->> 'payment_method' IS NULL
           OR NULLIF(btrim(COALESCE(to_jsonb(so) ->> 'payment_reference', '')), '') IS NOT NULL
         )
       GROUP BY soi.product_id
     ) pending ON pending.product_id = p.id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.organization_id = $1 AND p.active = true
     ORDER BY p.created_at DESC`,
    [orgId, storefrontStoreId]
  );
  return productsResult.rows;
};

let ensureStorefrontColumnsPromise: Promise<void> | null = null;
let ensureStorefrontOrderColumnsPromise: Promise<void> | null = null;

const ensureStorefrontColumns = async () => {
  if (ensureStorefrontColumnsPromise) {
    await ensureStorefrontColumnsPromise;
    return;
  }

  ensureStorefrontColumnsPromise = (async () => {
    try {
      await query(
        `ALTER TABLE organization_settings
           ADD COLUMN IF NOT EXISTS storefront_subdomain text,
           ADD COLUMN IF NOT EXISTS storefront_color text NOT NULL DEFAULT '#7D58D4',
           ADD COLUMN IF NOT EXISTS storefront_only_stock boolean NOT NULL DEFAULT false,
           ADD COLUMN IF NOT EXISTS storefront_show_out_of_stock boolean NOT NULL DEFAULT true,
           ADD COLUMN IF NOT EXISTS storefront_filter_category boolean NOT NULL DEFAULT true,
           ADD COLUMN IF NOT EXISTS storefront_filter_brand boolean NOT NULL DEFAULT true,
           ADD COLUMN IF NOT EXISTS storefront_filter_price boolean NOT NULL DEFAULT true,
           ADD COLUMN IF NOT EXISTS storefront_whatsapp text,
           ADD COLUMN IF NOT EXISTS storefront_show_whatsapp_button boolean NOT NULL DEFAULT false,
           ADD COLUMN IF NOT EXISTS storefront_selected_brands text[] NOT NULL DEFAULT '{}',
           ADD COLUMN IF NOT EXISTS storefront_selected_categories text[] NOT NULL DEFAULT '{}',
           ADD COLUMN IF NOT EXISTS storefront_price_from text NOT NULL DEFAULT '',
           ADD COLUMN IF NOT EXISTS storefront_price_to text NOT NULL DEFAULT '',
           ADD COLUMN IF NOT EXISTS storefront_logo_url text,
           ADD COLUMN IF NOT EXISTS storefront_credit_card_link text,
           ADD COLUMN IF NOT EXISTS storefront_boleto_link text,
           ADD COLUMN IF NOT EXISTS storefront_catalog_snapshot jsonb,
           ADD COLUMN IF NOT EXISTS storefront_runtime_state jsonb`
      );
    } catch (error) {
      if (!isPermissionDeniedError(error)) throw error;
    }

    try {
      await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_settings_storefront_subdomain
           ON organization_settings (lower(storefront_subdomain))
           WHERE storefront_subdomain IS NOT NULL`
      );
    } catch (error) {
      if (!isPermissionDeniedError(error)) throw error;
    }
  })().catch((error) => {
    ensureStorefrontColumnsPromise = null;
    throw error;
  });

  await ensureStorefrontColumnsPromise;
};

const ensureStorefrontOrderColumns = async () => {
  if (ensureStorefrontOrderColumnsPromise) {
    await ensureStorefrontOrderColumnsPromise;
    return;
  }

  ensureStorefrontOrderColumnsPromise = (async () => {
    await query(
      `ALTER TABLE storefront_orders
         ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
         ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
         ADD COLUMN IF NOT EXISTS payment_method text,
         ADD COLUMN IF NOT EXISTS payment_reference text,
         ADD COLUMN IF NOT EXISTS payment_provider text,
         ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
         ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz,
         ADD COLUMN IF NOT EXISTS payment_paid_at timestamptz,
         ADD COLUMN IF NOT EXISTS payment_token text,
         ADD COLUMN IF NOT EXISTS payment_installments integer`
    );

    await query(
      `ALTER TABLE storefront_order_items
         ADD COLUMN IF NOT EXISTS reserved_unit_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]`
    );

    await query(
      `DO $$
       BEGIN
         IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_units_status_valid') THEN
           ALTER TABLE inventory_units DROP CONSTRAINT inventory_units_status_valid;
         END IF;
       END $$;`
    );

    await query(
      `ALTER TABLE inventory_units
       ADD CONSTRAINT inventory_units_status_valid
       CHECK (status IN ('available', 'reserved', 'sold', 'inactive'))`
    );

    await query(
      `CREATE INDEX IF NOT EXISTS idx_storefront_orders_store_status_created
         ON storefront_orders (store_id, status, created_at DESC)`
    );

    await query(
      `CREATE INDEX IF NOT EXISTS idx_storefront_order_items_order
         ON storefront_order_items (storefront_order_id)`
    );

    await query(
      `UPDATE storefront_orders
       SET status = 'pending'
       WHERE status IS NULL OR btrim(status) = '' OR lower(status) = 'confirmed'`
    );

    await query(
      `UPDATE storefront_orders
       SET payment_status = 'pending'
       WHERE payment_status IS NULL OR btrim(payment_status) = ''`
    );

    await query(
      `UPDATE storefront_orders
       SET payment_installments = 1
       WHERE payment_installments IS NULL OR payment_installments < 1`
    );

    await query(
      `UPDATE storefront_order_items
       SET reserved_unit_ids = '{}'::uuid[]
       WHERE reserved_unit_ids IS NULL`
    );

    await query(
      `WITH dangling_units AS (
         SELECT DISTINCT unnest(COALESCE(soi.reserved_unit_ids, '{}'::uuid[])) AS unit_id
         FROM storefront_order_items soi
         INNER JOIN storefront_orders so ON so.id = soi.storefront_order_id
         WHERE lower(COALESCE(so.status, 'pending')) <> 'pending'
       )
       UPDATE inventory_units iu
       SET status = 'available',
           updated_at = now()
       FROM dangling_units du
       WHERE iu.id = du.unit_id
         AND iu.status = 'reserved'
         AND iu.sale_id IS NULL`
    );

    await query(
      `UPDATE storefront_order_items soi
       SET reserved_unit_ids = '{}'::uuid[]
       FROM storefront_orders so
       WHERE so.id = soi.storefront_order_id
         AND lower(COALESCE(so.status, 'pending')) <> 'pending'`
    );

    await query(
      `INSERT INTO payments (sale_id, method, amount, created_at)
       SELECT so.sale_id,
              CASE
                WHEN lower(COALESCE(so.payment_method, '')) = 'pix' THEN 'Pix'
                WHEN lower(COALESCE(so.payment_method, '')) = 'credit_card' THEN 'Cartao de Credito'
                ELSE 'Pagamento online'
              END AS method,
              GREATEST(0, COALESCE(s.total, so.total, 0)) AS amount,
              COALESCE(so.payment_paid_at, now()) AS created_at
       FROM storefront_orders so
       INNER JOIN sales s ON s.id = so.sale_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS payment_count
         FROM payments p
         WHERE p.sale_id = so.sale_id
       ) existing ON true
       WHERE so.sale_id IS NOT NULL
         AND lower(COALESCE(so.payment_status, '')) = 'paid'
         AND COALESCE(existing.payment_count, 0) = 0`
    );
  })().catch((error) => {
    ensureStorefrontOrderColumnsPromise = null;
    throw error;
  });

  await ensureStorefrontOrderColumnsPromise;
};

router.get(
  '/storefront/catalog',
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `SELECT p.id,
              p.sku,
              p.name,
              p.barcode,
              p.brand,
              p.price,
              p.active,
              p.image_url,
              p.category_id,
              c.name AS category,
              GREATEST(COALESCE(b.quantity, 0) - COALESCE(pending.quantity, 0), 0)::int AS quantity
       FROM products p
       LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.store_id = $2
       LEFT JOIN (
         SELECT soi.product_id, COALESCE(SUM(soi.quantity), 0)::int AS quantity
         FROM storefront_order_items soi
         INNER JOIN storefront_orders so ON so.id = soi.storefront_order_id
         WHERE so.store_id = $2
           AND lower(COALESCE(so.status, 'pending')) IN ('pending', 'confirmed')
           AND (
             to_jsonb(so) ->> 'payment_method' IS NULL
             OR NULLIF(btrim(COALESCE(to_jsonb(so) ->> 'payment_reference', '')), '') IS NOT NULL
           )
         GROUP BY soi.product_id
       ) pending ON pending.product_id = p.id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.organization_id = $1 AND p.active = true
       ORDER BY p.created_at DESC`,
      [orgId, storeId]
    );
    res.json({ data: result.rows });
  })
);

router.get(
  '/storefront/public/:subdomain',
  asyncHandler(async (req, res) => {
    await ensureStorefrontColumns();
    await ensureStorefrontOrderColumns();
    const requestedSubdomain = normalizeSubdomain(req.params.subdomain);
    if (!requestedSubdomain) {
      return res.status(400).json({
        code: 'invalid_subdomain',
        message: 'Subdominio invalido.'
      });
    }

    const settingsResult = await query<PublicStoreSettingsRow>(
      `SELECT os.organization_id,
              o.name AS organization_name,
              os.business_name,
              os.storefront_subdomain,
              os.storefront_color,
              os.storefront_only_stock,
              os.storefront_show_out_of_stock,
              os.storefront_filter_category,
              os.storefront_filter_brand,
              os.storefront_filter_price,
              os.storefront_whatsapp,
              os.storefront_show_whatsapp_button,
              os.storefront_selected_brands,
              os.storefront_selected_categories,
              os.storefront_price_from,
              os.storefront_price_to,
              os.storefront_logo_url,
              to_jsonb(os) ->> 'storefront_credit_card_link' AS storefront_credit_card_link,
              to_jsonb(os) ->> 'storefront_boleto_link' AS storefront_boleto_link,
              os.pix_key_value,
              to_jsonb(os) -> 'storefront_runtime_state' AS storefront_runtime_state,
              to_jsonb(os) -> 'storefront_catalog_snapshot' AS storefront_catalog_snapshot
       FROM organization_settings os
       INNER JOIN organizations o ON o.id = os.organization_id
       WHERE lower(os.storefront_subdomain) = lower($1)
       LIMIT 1`,
      [requestedSubdomain]
    );

    const settingsRow = settingsResult.rows[0];
    if (!settingsRow) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Loja nao encontrada.'
      });
    }

    const orgId = settingsRow.organization_id;
    const storeRes = await query<{ id: string }>(
      `SELECT id
       FROM stores
       WHERE organization_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [orgId]
    );
    const storefrontStoreId = storeRes.rows[0]?.id || DEFAULT_STORE_ID;
    const snapshotProducts = parseStorefrontCatalogSnapshot(settingsRow.storefront_catalog_snapshot);
    let products: Array<Record<string, unknown>> = snapshotProducts || [];
    try {
      products = await loadPublicStoreCatalog(orgId, storefrontStoreId);
      try {
        await query(
          `UPDATE organization_settings
           SET storefront_catalog_snapshot = $1::jsonb
           WHERE organization_id = $2`,
          [JSON.stringify(products), orgId]
        );
      } catch {
        // keep response even if snapshot persistence fails
      }
    } catch {
      // keep last snapshot as fallback when live query fails
    }

    const shopName = normalizeOptional(settingsRow.business_name || settingsRow.organization_name) || 'Loja';
    const fallbackSubdomain = normalizeSubdomain(shopName) || DEFAULT_STOREFRONT_SUBDOMAIN;
    const subdomain = normalizeSubdomain(settingsRow.storefront_subdomain) || fallbackSubdomain;
    const runtimeState = normalizeStorefrontRuntimeState(settingsRow.storefront_runtime_state);

    return res.json({
      data: {
        settings: {
          shopName,
          subdomain,
          shopColor: settingsRow.storefront_color || DEFAULT_STOREFRONT_COLOR,
          onlyStockProducts: settingsRow.storefront_only_stock ?? false,
          showOutOfStockProducts: settingsRow.storefront_show_out_of_stock ?? true,
          filterByCategory: settingsRow.storefront_filter_category ?? true,
          filterByBrand: settingsRow.storefront_filter_brand ?? true,
          filterByPrice: settingsRow.storefront_filter_price ?? true,
          whatsapp: settingsRow.storefront_whatsapp || '',
          showWhatsappButton: settingsRow.storefront_show_whatsapp_button ?? false,
          selectedBrands: toUniqueTrimmedArray(settingsRow.storefront_selected_brands || []),
          selectedCategories: toUniqueTrimmedArray(settingsRow.storefront_selected_categories || []),
          priceFrom: settingsRow.storefront_price_from || '',
          priceTo: settingsRow.storefront_price_to || '',
          logoUrl: settingsRow.storefront_logo_url || '',
          creditCardLink: settingsRow.storefront_credit_card_link || '',
          boletoLink: settingsRow.storefront_boleto_link || '',
          pixKey: settingsRow.pix_key_value || '',
          runtimeState,
          mercadoPagoEnabled: isMercadoPagoEnabled()
        },
        products
      }
    });
  })
);

router.post(
  '/storefront/payments/mercado-pago/webhook',
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    const payload = (req.body || {}) as {
      action?: string;
      type?: string;
      topic?: string;
      data?: { id?: string | number };
    };
    const topic = `${payload.type || payload.topic || req.query.topic || ''}`.trim().toLowerCase();
    const action = `${payload.action || req.query.type || ''}`.trim().toLowerCase();
    const isPaymentTopic = !topic || topic === 'payment' || action.startsWith('payment.');
    if (!isPaymentTopic) {
      return res.status(200).json({ received: true });
    }

    const queryDataId =
      req.query['data.id'] ||
      (typeof req.query.data === 'object' && req.query.data !== null
        ? ((req.query.data as { id?: unknown }).id as string | undefined)
        : undefined) ||
      req.query.id;
    const paymentId = normalizeOptional(`${payload.data?.id || queryDataId || ''}`);
    if (!paymentId) {
      return res.status(200).json({ received: true });
    }

    const gatewayPayment = await getMercadoPagoPayment(paymentId);
    const metadataOrderId =
      gatewayPayment.metadata && typeof gatewayPayment.metadata.storefront_order_id === 'string'
        ? normalizeOptional(gatewayPayment.metadata.storefront_order_id)
        : null;
    const orderId = normalizeOptional(gatewayPayment.externalReference) || metadataOrderId;
    if (!orderId) {
      return res.status(200).json({ received: true });
    }

    const order = await loadStorefrontOrderForPayment(orderId);
    if (!order) {
      return res.status(200).json({ received: true });
    }

    await query(
      `UPDATE storefront_orders
       SET payment_provider = 'mercado_pago'
       WHERE id = $1
         AND (payment_provider IS NULL OR btrim(payment_provider) = '')`,
      [order.id]
    );

    const orderMethod = normalizeStorefrontPaymentMethod(order.payment_method);
    const gatewayMethod = mapMercadoPagoMethodToStorefront({
      paymentMethodId: gatewayPayment.paymentMethodId,
      paymentTypeId: gatewayPayment.paymentTypeId
    });
    if (orderMethod && gatewayMethod && gatewayMethod !== orderMethod) {
      return res.status(200).json({ received: true });
    }

    let nextPaymentStatus = resolveGatewayPaymentStatus(gatewayPayment.status);
    if (nextPaymentStatus === 'pending' && orderMethod === 'pix') {
      const expiresAt = order.payment_expires_at ? new Date(order.payment_expires_at) : null;
      if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        nextPaymentStatus = 'expired';
      }
    }

    if (nextPaymentStatus === 'paid') {
      const paidAtSource = normalizeOptional(gatewayPayment.dateApproved || gatewayPayment.dateCreated);
      const paidAt = paidAtSource ? new Date(paidAtSource) : null;
      const paidAtIso = paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt.toISOString() : null;
      await query(
        `UPDATE storefront_orders
         SET payment_status = 'paid',
             payment_paid_at = COALESCE(payment_paid_at, $2::timestamptz)
         WHERE id = $1`,
        [order.id, paidAtIso]
      );

      const orgId = await resolveOrganizationByStoreId(order.store_id || DEFAULT_STORE_ID);
      await finalizePaidStorefrontOrder({
        orgId,
        storeId: order.store_id || DEFAULT_STORE_ID,
        orderId: order.id,
        userId: null
      });

      return res.status(200).json({ received: true, payment_status: 'paid' });
    }

    await query(
      `UPDATE storefront_orders
       SET payment_status = $2
       WHERE id = $1
         AND lower(COALESCE(payment_status, 'pending')) <> 'paid'`,
      [order.id, nextPaymentStatus]
    );

    return res.status(200).json({ received: true, payment_status: nextPaymentStatus });
  })
);

router.post(
  '/storefront/orders',
  validateRequest({ body: storefrontOrderSchema }),
  asyncHandler(async (req, res) => {
    let orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    let storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const { items = [], customer, shipping, subdomain, payment } = req.body as StorefrontOrderInput;
    await ensureStorefrontOrderColumns();

    const buildError = (status: number, code: string, message: string) => {
      const error = new Error(message) as Error & { status?: number; code?: string };
      error.status = status;
      error.code = code;
      return error;
    };

    try {
      const subdomainContext = await resolveSubdomainContext(subdomain);
      if (subdomain && !subdomainContext) {
        return res.status(404).json({
          code: 'storefront_not_found',
          message: 'Loja nao encontrada.'
        });
      }

      if (subdomainContext) {
        if (!subdomainContext.orgId) {
          return res.status(404).json({
            code: 'storefront_not_found',
            message: 'Loja nao encontrada.'
          });
        }
        orgId = subdomainContext.orgId;
        storeId = subdomainContext.storeId;
      }

      const requestedSkus = Array.from(new Set(items.map((item) => item.sku.trim()).filter(Boolean)));
      const productsRes = await query<{
        id: string;
        sku: string;
        name: string;
        quantity: number | string;
      }>(
        `SELECT p.id,
                p.sku,
                p.name,
                GREATEST(COALESCE(b.quantity, 0) - COALESCE(pending.quantity, 0), 0)::int AS quantity
         FROM products p
         LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.store_id = $2
         LEFT JOIN (
           SELECT soi.product_id, COALESCE(SUM(soi.quantity), 0)::int AS quantity
           FROM storefront_order_items soi
           INNER JOIN storefront_orders so ON so.id = soi.storefront_order_id
           WHERE so.store_id = $2
             AND lower(COALESCE(so.status, 'pending')) IN ('pending', 'confirmed')
             AND (
               to_jsonb(so) ->> 'payment_method' IS NULL
               OR NULLIF(btrim(COALESCE(to_jsonb(so) ->> 'payment_reference', '')), '') IS NOT NULL
             )
           GROUP BY soi.product_id
         ) pending ON pending.product_id = p.id
         WHERE p.organization_id = $1
           AND p.active = true
           AND p.sku = ANY($3::text[])`,
        [orgId, storeId, requestedSkus]
      );

      const productBySku = new Map<string, { id: string; sku: string; name: string; quantity: number }>();
      for (const row of productsRes.rows) {
        const normalizedSku = row.sku.trim();
        const mapped = {
          id: row.id,
          sku: normalizedSku,
          name: row.name,
          quantity: Math.max(0, Math.trunc(toNumeric(row.quantity)))
        };
        productBySku.set(normalizedSku, mapped);
        productBySku.set(normalizedSku.toLowerCase(), mapped);
      }

      const requestedBySku = new Map<string, number>();
      for (const item of items) {
        const requestedSku = item.sku.trim();
        const quantity = Math.max(1, Math.trunc(toNumeric(item.quantity)));
        const key = requestedSku.toLowerCase();
        requestedBySku.set(key, (requestedBySku.get(key) || 0) + quantity);
      }

      for (const [skuKey, requestedTotal] of requestedBySku.entries()) {
        const product = productBySku.get(skuKey);
        if (!product) continue;
        if (requestedTotal > product.quantity) {
          throw buildError(409, 'insufficient_stock', `Estoque insuficiente para ${product.name}.`);
        }
      }

      const resolvedItems = items.map((item) => {
        const requestedSku = item.sku.trim();
        const product = productBySku.get(requestedSku) || productBySku.get(requestedSku.toLowerCase());
        if (!product) {
          throw buildError(400, 'product_not_found', `Produto ${requestedSku} nao encontrado.`);
        }
        const quantity = Math.max(1, Math.trunc(toNumeric(item.quantity)));
        return {
          ...item,
          sku: product.sku,
          quantity,
          price: Math.max(0, toNumeric(item.price)),
          productId: product.id
        };
      });

      const total = resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const paymentMethod =
        payment?.method === 'pix' || payment?.method === 'credit_card' ? payment.method : null;
      if (!paymentMethod) {
        throw buildError(400, 'payment_required', 'Informe uma forma de pagamento valida.');
      }
      const paymentReference = normalizeOptional(payment?.reference);
      const installments =
        paymentMethod === 'pix'
          ? 1
          : Math.min(12, Math.max(1, Math.trunc(toNumeric(payment?.installments) || 1)));
      const paymentToken = createPaymentToken();
      const paymentExpiresAt =
        paymentMethod === 'pix' ? new Date(Date.now() + STOREFRONT_PIX_EXPIRES_MINUTES * 60 * 1000) : null;
      const paymentProvider: string | null = isMercadoPagoEnabled() ? 'mercado_pago' : null;

      const order = await withTransaction(async (client): Promise<StorefrontOrderRow> => {
        const userId = req.header('x-user-id') || null;
        const orderRes = await client.query<StorefrontOrderRow>(
          `INSERT INTO storefront_orders (
             store_id,
             customer_name,
             customer_phone,
             customer_email,
             status,
             total,
             payment_method,
             payment_reference,
             payment_provider,
             payment_status,
             payment_expires_at,
             payment_token,
             payment_installments
           )
           VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, 'pending', $9, $10, $11)
           RETURNING id,
                     store_id,
                     customer_name,
                     customer_phone,
                     customer_email,
                     status,
                     total,
                     created_at,
                     0::int AS items_count,
                     sale_id,
                     accepted_at,
                     cancelled_at,
                     payment_method,
                     payment_reference,
                     payment_provider,
                     payment_status,
                     payment_expires_at,
                     payment_paid_at,
                     payment_token,
                     payment_installments`,
          [
            storeId,
            customer.name,
            customer.phone || null,
            customer.email || null,
            total,
            paymentMethod,
            paymentReference,
            paymentProvider,
            toIsoStringOrNull(paymentExpiresAt),
            paymentToken,
            installments
          ]
        );
        const orderId = orderRes.rows[0].id;

        for (const item of resolvedItems) {
          const reservedUnitsRes = await client.query<{ id: string }>(
            `SELECT id
             FROM inventory_units
             WHERE product_id = $1
               AND store_id = $2
               AND status = 'available'
             ORDER BY expires_at NULLS LAST, created_at ASC
             LIMIT $3
             FOR UPDATE SKIP LOCKED`,
            [item.productId, storeId, item.quantity]
          );

          if (reservedUnitsRes.rows.length < item.quantity) {
            throw buildError(409, 'insufficient_stock', `Estoque insuficiente para ${item.sku}.`);
          }

          const reservedUnitIds = reservedUnitsRes.rows.map((row) => row.id);
          await client.query(
            `UPDATE inventory_units
             SET status = 'reserved',
                 updated_at = now()
             WHERE id = ANY($1::uuid[])`,
            [reservedUnitIds]
          );

          await client.query(
            `INSERT INTO storefront_order_items (storefront_order_id, product_id, sku, quantity, price, reserved_unit_ids)
             VALUES ($1, $2, $3, $4, $5, $6::uuid[])`,
            [orderId, item.productId, item.sku, item.quantity, item.price, reservedUnitIds]
          );
        }

        await writeAudit(client, {
          organizationId: orgId,
          storeId,
          userId,
          entityType: 'storefront_order',
          entityId: orderId,
          action: 'created',
          payload: {
            total,
            items: resolvedItems.length,
            paymentMethod: paymentMethod || undefined,
            paymentProvider: paymentProvider || undefined,
            paymentExpiresAt: toIsoStringOrNull(paymentExpiresAt) || undefined
          }
        });

        return orderRes.rows[0];
      });

      let paymentProviderResponse: StorefrontPaymentProvider = null;
      let paymentCheckoutUrl = '';
      let mercadoPagoPaymentId = '';
      let pixCopyPasteCode = '';
      let pixQrCodeBase64 = '';

      if (paymentMethod === 'credit_card' && isMercadoPagoEnabled()) {
        try {
          const paymentPreference = await createMercadoPagoPreference({
            orderId: order.id,
            subdomain: subdomainContext?.subdomain || DEFAULT_STOREFRONT_SUBDOMAIN,
            paymentToken,
            method: paymentMethod,
            installments,
            customerName: customer.name,
            customerPhone: customer.phone || '',
            customerEmail: customer.email || '',
            items: resolvedItems.map((item) => ({
              title: productBySku.get(item.sku)?.name || item.sku,
              quantity: item.quantity,
              unitPrice: item.price
            }))
          });
          paymentProviderResponse = 'mercado_pago';
          paymentCheckoutUrl = paymentPreference.checkoutUrl;
          order.payment_reference = paymentCheckoutUrl;
          order.payment_provider = 'mercado_pago';
          await query(
            `UPDATE storefront_orders
             SET payment_reference = $1,
                 payment_provider = 'mercado_pago'
             WHERE id = $2`,
            [paymentCheckoutUrl, order.id]
          );
        } catch (error) {
          await withTransaction(async (client) => {
            await releaseStorefrontOrderReservations(client, order.id);
            await client.query(
              `UPDATE storefront_orders
               SET status = 'cancelled',
                   payment_status = 'failed',
                   cancelled_at = now()
               WHERE id = $1`,
              [order.id]
            );
          }).catch(() => null);

          throw buildError(
            502,
            'payment_provider_error',
            error instanceof Error ? error.message : 'Nao foi possivel gerar pagamento no Mercado Pago.'
          );
        }
      } else if (paymentMethod === 'pix' && isMercadoPagoEnabled()) {
        try {
          const pixPayment = await createMercadoPagoPixPayment({
            orderId: order.id,
            subdomain: subdomainContext?.subdomain || DEFAULT_STOREFRONT_SUBDOMAIN,
            customerName: customer.name,
            customerPhone: customer.phone || '',
            customerEmail: customer.email || '',
            transactionAmount: total,
            expiresAt: toIsoStringOrNull(paymentExpiresAt) || undefined
          });
          paymentProviderResponse = 'mercado_pago';
          mercadoPagoPaymentId = pixPayment.paymentId;
          pixCopyPasteCode = pixPayment.qrCode;
          pixQrCodeBase64 = pixPayment.qrCodeBase64;
          paymentCheckoutUrl = pixPayment.ticketUrl;
          order.payment_reference = mercadoPagoPaymentId;
          order.payment_provider = 'mercado_pago';
          await query(
            `UPDATE storefront_orders
             SET payment_reference = $1,
                 payment_provider = 'mercado_pago'
             WHERE id = $2`,
            [mercadoPagoPaymentId, order.id]
          );
        } catch (error) {
          const fallbackPixReference = paymentReference || '';
          if (fallbackPixReference) {
            paymentProviderResponse = null;
            mercadoPagoPaymentId = '';
            pixCopyPasteCode = fallbackPixReference;
            pixQrCodeBase64 = '';
            paymentCheckoutUrl = '';
            order.payment_reference = fallbackPixReference;
            order.payment_provider = '';
            await query(
              `UPDATE storefront_orders
               SET payment_reference = $1,
                   payment_provider = NULL
               WHERE id = $2`,
              [fallbackPixReference, order.id]
            );
          } else {
            await withTransaction(async (client) => {
              await releaseStorefrontOrderReservations(client, order.id);
              await client.query(
                `UPDATE storefront_orders
                 SET status = 'cancelled',
                     payment_status = 'failed',
                     cancelled_at = now()
                 WHERE id = $1`,
                [order.id]
              );
            }).catch(() => null);

            throw buildError(
              502,
              'payment_provider_error',
              error instanceof Error ? error.message : 'Nao foi possivel gerar Pix no Mercado Pago.'
            );
          }
        }
      }

      const resolvedPaymentReference =
        paymentMethod === 'pix'
          ? pixCopyPasteCode || paymentReference || order.payment_reference || ''
          : paymentCheckoutUrl || paymentReference || order.payment_reference || '';
      order.payment_reference = resolvedPaymentReference;
      order.payment_token = paymentToken;
      order.payment_status = 'pending';
      order.payment_expires_at = toIsoStringOrNull(paymentExpiresAt);
      order.payment_installments = installments;

      const orderItemsRes = await query<StorefrontOrderItemRow>(
        `SELECT soi.id,
                soi.storefront_order_id,
                soi.product_id,
                soi.sku,
                soi.quantity,
                soi.price,
                p.name AS product_name,
                p.brand AS product_brand,
                p.image_url AS product_image_url
         FROM storefront_order_items soi
         LEFT JOIN products p ON p.id = soi.product_id
         WHERE soi.storefront_order_id = $1
         ORDER BY soi.id ASC`,
        [order.id]
      );

      return res.status(201).json({
        data: {
          ...mapOrder(order, orderItemsRes.rows),
          customer,
          shipping,
          payment: paymentMethod
            ? {
                method: paymentMethod,
                reference: resolvedPaymentReference,
                checkoutUrl: paymentCheckoutUrl || undefined,
                provider: paymentProviderResponse || paymentProvider || undefined,
                status: 'pending',
                token: paymentToken,
                expiresAt: toIsoStringOrNull(paymentExpiresAt) || undefined,
                mercadoPagoPaymentId: mercadoPagoPaymentId || undefined,
                pixQrCodeBase64: pixQrCodeBase64 || undefined
              }
            : undefined
        }
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) {
        const err = error as { status?: number; code?: string; message?: string };
        return res.status(err.status || 409).json({
          code: err.code || 'storefront_order_error',
          message: err.message || 'Nao foi possivel criar o pedido.'
        });
      }
      throw error;
    }
  })
);

router.post(
  '/storefront/orders/:id/payments/confirm',
  validateRequest({ params: idParamSchema, body: storefrontOrderPaymentConfirmSchema }),
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    let orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    let storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const { id } = req.params;
    const payload = req.body as {
      subdomain?: string;
      method: StorefrontPaymentMethod;
      token: string;
      mercadoPagoPaymentId?: string;
      mercadoPagoStatus?: string;
      returnStatus?: string;
    };

    const subdomainContext = await resolveSubdomainContext(payload.subdomain);
    if (payload.subdomain && !subdomainContext) {
      return res.status(404).json({
        code: 'storefront_not_found',
        message: 'Loja nao encontrada.'
      });
    }
    if (subdomainContext) {
      orgId = subdomainContext.orgId;
      storeId = subdomainContext.storeId;
    }

    const orderRes = await query<StorefrontOrderRow>(
      `SELECT id,
              store_id,
              customer_name,
              customer_phone,
              customer_email,
              status,
              total,
              created_at,
              0::int AS items_count,
              sale_id,
              accepted_at,
              cancelled_at,
              payment_method,
              payment_reference,
              payment_provider,
              payment_status,
              payment_expires_at,
              payment_paid_at,
              payment_token,
              payment_installments
       FROM storefront_orders
       WHERE id = $1 AND store_id = $2
       LIMIT 1`,
      [id, storeId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      return res.status(404).json({ code: 'not_found', message: 'Pedido nao encontrado.' });
    }

    const expectedToken = normalizeOptional(order.payment_token);
    const providedToken = normalizeOptional(payload.token);
    if (!expectedToken || !providedToken || expectedToken !== providedToken) {
      return res.status(403).json({
        code: 'invalid_payment_token',
        message: 'Token de pagamento invalido.'
      });
    }

    const orderMethod =
      order.payment_method === 'pix' || order.payment_method === 'credit_card' ? order.payment_method : null;
    if (!orderMethod || orderMethod !== payload.method) {
      return res.status(400).json({
        code: 'invalid_payment_method',
        message: 'Forma de pagamento nao corresponde ao pedido.'
      });
    }

    const orderStatus = normalizeOrderStatus(order.status);
    if (orderStatus === 'cancelled') {
      return res.status(409).json({
        code: 'order_cancelled',
        message: 'Este pedido foi cancelado.'
      });
    }
    if (normalizePaymentStatus(order.payment_status) === 'paid') {
      const finalized = await finalizePaidStorefrontOrder({
        orgId,
        storeId,
        orderId: id,
        userId: null
      });
      if (finalized.type === 'cancelled') {
        return res.status(409).json({ code: 'order_cancelled', message: 'Este pedido foi cancelado.' });
      }
      if (finalized.type === 'not_found') {
        return res.status(404).json({ code: 'not_found', message: 'Pedido nao encontrado.' });
      }
      return res.json({
        data: {
          id,
          status: 'accepted',
          payment_status: 'paid',
          sale_id: 'saleId' in finalized ? finalized.saleId : order.sale_id || null
        }
      });
    }

    let gatewayStatus = '';
    const gatewayStatusFromPayload =
      normalizeOptional(payload.mercadoPagoStatus || payload.returnStatus || '')?.toLowerCase() || '';
    const fallbackGatewayPaymentId =
      order.payment_provider === 'mercado_pago' &&
      /^\d+$/.test(normalizeOptional(order.payment_reference) || '')
        ? (normalizeOptional(order.payment_reference) as string)
        : null;
    const gatewayPaymentId = normalizeOptional(payload.mercadoPagoPaymentId) || fallbackGatewayPaymentId;
    let gatewayPaidAtIso: string | null = null;

    if (order.payment_provider === 'mercado_pago' && gatewayPaymentId) {
      try {
        const gatewayPayment = await getMercadoPagoPayment(gatewayPaymentId);
        const externalReference = normalizeOptional(gatewayPayment.externalReference);
        if (externalReference && externalReference !== id) {
          return res.status(400).json({
            code: 'invalid_payment_reference',
            message: 'Pagamento nao pertence a este pedido.'
          });
        }

        const gatewayMethod = mapMercadoPagoMethodToStorefront({
          paymentMethodId: gatewayPayment.paymentMethodId,
          paymentTypeId: gatewayPayment.paymentTypeId
        });
        if (gatewayMethod && gatewayMethod !== payload.method) {
          return res.status(400).json({
            code: 'invalid_payment_method',
            message: 'Forma de pagamento nao corresponde ao pedido.'
          });
        }

        gatewayStatus = normalizeOptional(gatewayPayment.status)?.toLowerCase() || gatewayStatusFromPayload;
        const paidAtSource = normalizeOptional(gatewayPayment.dateApproved || gatewayPayment.dateCreated);
        if (paidAtSource) {
          const paidAtDate = new Date(paidAtSource);
          if (!Number.isNaN(paidAtDate.getTime())) {
            gatewayPaidAtIso = paidAtDate.toISOString();
          }
        }
      } catch (error) {
        if (!gatewayStatusFromPayload) {
          return res.status(502).json({
            code: 'payment_provider_error',
            message: error instanceof Error ? error.message : 'Nao foi possivel validar o pagamento no Mercado Pago.'
          });
        }
        gatewayStatus = gatewayStatusFromPayload;
      }
    } else if (order.payment_provider !== 'mercado_pago') {
      gatewayStatus = gatewayStatusFromPayload;
    }

    const requiresGatewayApproval = order.payment_provider === 'mercado_pago';
    if (requiresGatewayApproval || payload.method === 'credit_card') {
      let nextPaymentStatus = resolveGatewayPaymentStatus(gatewayStatus);
      if (nextPaymentStatus === 'pending' && payload.method === 'pix') {
        const expiresAt = order.payment_expires_at ? new Date(order.payment_expires_at) : null;
        if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
          nextPaymentStatus = 'expired';
        }
      }

      if (nextPaymentStatus !== 'paid') {
        await query(
          `UPDATE storefront_orders
           SET payment_status = $2
           WHERE id = $1`,
          [id, nextPaymentStatus]
        );

        if (nextPaymentStatus === 'expired') {
          return res.status(409).json({
            code: 'pix_expired',
            message: 'Tempo para pagamento Pix expirado.',
            data: {
              id,
              status: 'pending',
              payment_status: 'expired',
              sale_id: null
            }
          });
        }

        return res.json({
          data: {
            id,
            status: 'pending',
            payment_status: nextPaymentStatus,
            sale_id: order.sale_id || null,
            payment_expires_at: order.payment_expires_at || null
          }
        });
      }
    }

    if (payload.method === 'pix' && !requiresGatewayApproval) {
      const expiresAt = order.payment_expires_at ? new Date(order.payment_expires_at) : null;
      if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        await query(
          `UPDATE storefront_orders
           SET payment_status = 'expired'
           WHERE id = $1`,
          [id]
        );
        return res.status(409).json({
          code: 'pix_expired',
          message: 'Tempo para pagamento Pix expirado.',
          data: {
            id,
            status: 'pending',
            payment_status: 'expired',
            sale_id: null
          }
        });
      }
    }

    if (gatewayPaidAtIso) {
      await query(
        `UPDATE storefront_orders
         SET payment_paid_at = COALESCE(payment_paid_at, $2::timestamptz)
         WHERE id = $1`,
        [id, gatewayPaidAtIso]
      );
    }

    const finalized = await finalizePaidStorefrontOrder({
      orgId,
      storeId,
      orderId: id,
      userId: null
    });

    if (finalized.type === 'not_found') {
      return res.status(404).json({ code: 'not_found', message: 'Pedido nao encontrado.' });
    }
    if (finalized.type === 'cancelled') {
      return res.status(409).json({ code: 'order_cancelled', message: 'Este pedido foi cancelado.' });
    }
    if (finalized.type === 'empty_order') {
      return res.status(400).json({ code: 'empty_order', message: 'Pedido sem itens validos.' });
    }
    if (finalized.type === 'product_not_found') {
      return res.status(409).json({
        code: 'product_not_found',
        message: `Produto nao encontrado: ${finalized.label}.`
      });
    }
    if (finalized.type === 'insufficient_stock') {
      return res.status(409).json({
        code: 'insufficient_stock',
        message: `Estoque insuficiente para ${finalized.label}.`
      });
    }

    return res.json({
      data: {
        id,
        status: 'accepted',
        payment_status: 'paid',
        sale_id: finalized.saleId
      }
    });
  })
);

router.post(
  '/storefront/orders/:id/cancel-public',
  validateRequest({ params: idParamSchema, body: storefrontOrderCancelByTokenSchema }),
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    const { id } = req.params;
    const payload = req.body as { subdomain: string; token: string };
    const token = normalizeOptional(payload.token);
    if (!token) {
      return res.status(403).json({
        code: 'invalid_payment_token',
        message: 'Token de pagamento invalido.'
      });
    }

    const subdomainContext = await resolveSubdomainContext(payload.subdomain);
    if (!subdomainContext) {
      return res.status(404).json({
        code: 'storefront_not_found',
        message: 'Loja nao encontrada.'
      });
    }

    const result = await withTransaction(async (client) => {
      const orderRes = await client.query<StorefrontOrderRow>(
        `SELECT id,
                store_id,
                customer_name,
                customer_phone,
                customer_email,
                status,
                total,
                created_at,
                0::int AS items_count,
                sale_id,
                accepted_at,
                cancelled_at,
                payment_token,
                payment_status
         FROM storefront_orders
         WHERE id = $1 AND store_id = $2
         FOR UPDATE`,
        [id, subdomainContext.storeId]
      );

      const order = orderRes.rows[0];
      if (!order) {
        return { type: 'not_found' as const };
      }

      const expectedToken = normalizeOptional(order.payment_token);
      if (!expectedToken || expectedToken !== token) {
        return { type: 'invalid_token' as const };
      }

      const status = normalizeOrderStatus(order.status);
      if (status === 'accepted') {
        return { type: 'already_accepted' as const };
      }
      if (status === 'cancelled') {
        return { type: 'already_cancelled' as const };
      }

      await releaseStorefrontOrderReservations(client, id);
      await client.query(
        `UPDATE storefront_orders
         SET status = 'cancelled',
             payment_status = CASE
               WHEN lower(COALESCE(payment_status, 'pending')) = 'paid' THEN payment_status
               ELSE 'failed'
             END,
             cancelled_at = now()
         WHERE id = $1`,
        [id]
      );

      await writeAudit(client, {
        organizationId: subdomainContext.orgId,
        storeId: subdomainContext.storeId,
        userId: null,
        entityType: 'storefront_order',
        entityId: id,
        action: 'cancelled_by_customer',
        payload: {
          source: 'public_storefront'
        }
      });

      return { type: 'cancelled' as const };
    });

    if (result.type === 'not_found') {
      return res.status(404).json({ code: 'not_found', message: 'Pedido nao encontrado.' });
    }
    if (result.type === 'invalid_token') {
      return res.status(403).json({
        code: 'invalid_payment_token',
        message: 'Token de pagamento invalido.'
      });
    }
    if (result.type === 'already_accepted') {
      return res.status(409).json({ code: 'already_accepted', message: 'Pedido ja foi aceito.' });
    }
    if (result.type === 'already_cancelled') {
      return res.status(409).json({ code: 'already_cancelled', message: 'Pedido ja foi cancelado.' });
    }

    return res.json({
      data: {
        id,
        status: 'cancelled'
      }
    });
  })
);

router.get(
  '/storefront/orders',
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'pending';
    const status = requestedStatus === 'all' ? 'all' : normalizeOrderStatus(requestedStatus);

    let statusClause = `AND lower(COALESCE(so.status, 'pending')) IN ('pending', 'confirmed')`;
    if (status === 'accepted') {
      statusClause = `AND lower(COALESCE(so.status, 'pending')) = 'accepted'`;
    } else if (status === 'cancelled') {
      statusClause = `AND lower(COALESCE(so.status, 'pending')) = 'cancelled'`;
    } else if (requestedStatus === 'all') {
      statusClause = '';
    }

    const ordersRes = await query<StorefrontOrderRow>(
      `SELECT so.id,
              so.store_id,
              so.customer_name,
              so.customer_phone,
              so.customer_email,
              so.status,
              so.total,
              so.created_at,
              COALESCE(SUM(soi.quantity), 0)::int AS items_count,
              so.sale_id,
              so.accepted_at,
              so.cancelled_at,
              so.payment_method,
              so.payment_reference,
              so.payment_provider,
              so.payment_status,
              so.payment_expires_at,
              so.payment_paid_at,
              so.payment_token,
              so.payment_installments
       FROM storefront_orders so
       LEFT JOIN storefront_order_items soi ON soi.storefront_order_id = so.id
       WHERE so.store_id = $1
         ${statusClause}
       GROUP BY so.id
       ORDER BY so.created_at DESC
       LIMIT 120`,
      [storeId]
    );

    const orderIds = ordersRes.rows.map((row) => row.id);
    const itemsByOrderId = new Map<string, StorefrontOrderItemRow[]>();
    if (orderIds.length > 0) {
      const itemsRes = await query<StorefrontOrderItemRow>(
        `SELECT soi.id,
                soi.storefront_order_id,
                soi.product_id,
                soi.sku,
                soi.quantity,
                soi.price,
                p.name AS product_name,
                p.brand AS product_brand,
                p.image_url AS product_image_url
         FROM storefront_order_items soi
         LEFT JOIN products p ON p.id = soi.product_id
         WHERE soi.storefront_order_id = ANY($1::uuid[])
         ORDER BY soi.id ASC`,
        [orderIds]
      );
      for (const item of itemsRes.rows) {
        const list = itemsByOrderId.get(item.storefront_order_id) || [];
        list.push(item);
        itemsByOrderId.set(item.storefront_order_id, list);
      }
    }

    return res.json({
      data: ordersRes.rows.map((row) => mapOrder(row, itemsByOrderId.get(row.id) || []))
    });
  })
);

router.get(
  '/storefront/orders/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const { id } = req.params;

    const orderRes = await query<StorefrontOrderRow>(
      `SELECT so.id,
              so.store_id,
              so.customer_name,
              so.customer_phone,
              so.customer_email,
              so.status,
              so.total,
              so.created_at,
              COALESCE(SUM(soi.quantity), 0)::int AS items_count,
              so.sale_id,
              so.accepted_at,
              so.cancelled_at,
              so.payment_method,
              so.payment_reference,
              so.payment_provider,
              so.payment_status,
              so.payment_expires_at,
              so.payment_paid_at,
              so.payment_token,
              so.payment_installments
       FROM storefront_orders so
       LEFT JOIN storefront_order_items soi ON soi.storefront_order_id = so.id
       WHERE so.id = $1 AND so.store_id = $2
       GROUP BY so.id
       LIMIT 1`,
      [id, storeId]
    );

    const order = orderRes.rows[0];
    if (!order) {
      return res.status(404).json({ code: 'not_found', message: 'Pedido nao encontrado.' });
    }

    const itemsRes = await query<StorefrontOrderItemRow>(
      `SELECT soi.id,
              soi.storefront_order_id,
              soi.product_id,
              soi.sku,
              soi.quantity,
              soi.price,
              p.name AS product_name,
              p.brand AS product_brand,
              p.image_url AS product_image_url
       FROM storefront_order_items soi
       LEFT JOIN products p ON p.id = soi.product_id
       WHERE soi.storefront_order_id = $1
       ORDER BY soi.id ASC`,
      [id]
    );

    return res.json({ data: mapOrder(order, itemsRes.rows) });
  })
);

router.post(
  '/storefront/orders/:id/accept',
  validateRequest({ params: idParamSchema, body: storefrontOrderAcceptSchema }),
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const { id } = req.params;
    const payload = (req.body || {}) as {
      customerId?: string;
      customerName?: string;
      saleDate?: string;
      items?: Array<{
        id?: string;
        productId?: string;
        sku?: string;
        quantity?: number;
        price?: number;
        unitIds?: string[];
      }>;
    };
    type AcceptOverrideItem = NonNullable<typeof payload.items>[number];

    const buildError = (status: number, code: string, message: string) => {
      const error = new Error(message) as Error & { status?: number; code?: string };
      error.status = status;
      error.code = code;
      return error;
    };

    const normalizeUnitIds = (values?: string[]) => {
      if (!Array.isArray(values)) return [];
      const seen = new Set<string>();
      const result: string[] = [];
      for (const value of values) {
        const normalized = (value || '').trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
      }
      return result;
    };

    try {
      const result = await withTransaction(async (client) => {
        const orderRes = await client.query<StorefrontOrderRow>(
          `SELECT id,
                  store_id,
                  customer_name,
                  customer_phone,
                  customer_email,
                  status,
                  total,
                  created_at,
                  0::int AS items_count,
                  sale_id,
                  accepted_at,
                  cancelled_at,
                  payment_method,
                  payment_status,
                  payment_paid_at
           FROM storefront_orders
           WHERE id = $1 AND store_id = $2
           FOR UPDATE`,
          [id, storeId]
        );
        const order = orderRes.rows[0];
        if (!order) {
          return { type: 'not_found' as const };
        }

        const status = normalizeOrderStatus(order.status);
        const syncAcceptedWithoutSale = status === 'accepted' && !order.sale_id;
        if (status === 'accepted' && !syncAcceptedWithoutSale) {
          return { type: 'already_accepted' as const, saleId: order.sale_id };
        }
        if (status === 'cancelled') {
          return { type: 'already_cancelled' as const };
        }

        const itemsRes = await client.query<StorefrontOrderItemRow>(
          `SELECT soi.id,
                  soi.storefront_order_id,
                  soi.product_id,
                  soi.sku,
                  soi.quantity,
                  soi.price,
                  soi.reserved_unit_ids,
                  p.name AS product_name,
                  p.brand AS product_brand,
                  p.image_url AS product_image_url
           FROM storefront_order_items soi
           LEFT JOIN products p ON p.id = soi.product_id
           WHERE soi.storefront_order_id = $1
           ORDER BY soi.id ASC`,
          [id]
        );

        if (!itemsRes.rows.length) {
          throw buildError(400, 'empty_order', 'Pedido sem itens.');
        }

        const overrideByItemId = new Map<string, AcceptOverrideItem>();
        const overrideBySku = new Map<string, AcceptOverrideItem>();
        for (const entry of payload.items || []) {
          if (!entry || typeof entry !== 'object') continue;
          if (entry.id) {
            overrideByItemId.set(entry.id, entry);
            continue;
          }
          if (entry.sku) {
            overrideBySku.set(entry.sku.trim().toLowerCase(), entry);
          }
        }

        const consumedOverrideKeys = new Set<string>();

        const preparedItems: Array<{
          orderItemId: string | null;
          sku: string;
          productId: string | null;
          quantity: number;
          price: number;
          unitIds: string[];
        }> = [];

        for (const item of itemsRes.rows) {
          const skuKey = item.sku.trim().toLowerCase();
          let override: AcceptOverrideItem | null = null;
          if (overrideByItemId.has(item.id)) {
            override = overrideByItemId.get(item.id) || null;
            consumedOverrideKeys.add(`id:${item.id}`);
          } else if (!consumedOverrideKeys.has(`sku:${skuKey}`) && overrideBySku.has(skuKey)) {
            override = overrideBySku.get(skuKey) || null;
            consumedOverrideKeys.add(`sku:${skuKey}`);
          }
          const quantity = Math.max(0, Math.trunc(toNumeric(override?.quantity ?? item.quantity)));
          const price = Math.max(0, toNumeric(override?.price ?? item.price));
          const explicitUnitIds = normalizeUnitIds(override?.unitIds);
          const reservedUnitIds = normalizeUuidArray(item.reserved_unit_ids);

          let productId = normalizeOptional(override?.productId) || item.product_id;
          if (!productId) {
            const productRes = await client.query<{ id: string }>(
              `SELECT id
               FROM products
               WHERE organization_id = $1 AND sku = $2
               LIMIT 1`,
              [orgId, item.sku]
            );
            productId = productRes.rows[0]?.id || null;
          }

          if (!productId && !syncAcceptedWithoutSale && quantity > 0) {
            throw buildError(409, 'product_not_found', `Produto ${item.sku} nao encontrado.`);
          }

          let unitIds: string[] = [];
          if (!syncAcceptedWithoutSale && quantity > 0) {
            if (explicitUnitIds.length > 0) {
              if (explicitUnitIds.length !== quantity) {
                const productLabel = item.product_name || item.sku;
                throw buildError(
                  400,
                  'invalid_unit_selection',
                  `Selecione ${quantity} unidade(s) para ${productLabel}.`
                );
              }

              const unitRes = await client.query<{ id: string }>(
                `SELECT id
                 FROM inventory_units
                 WHERE id = ANY($1::uuid[])
                   AND product_id = $2
                   AND store_id = $3
                   AND (
                     status = 'available'
                     OR (status = 'reserved' AND id = ANY($4::uuid[]))
                   )
                 FOR UPDATE`,
                [explicitUnitIds, productId, storeId, reservedUnitIds]
              );

              if (unitRes.rows.length !== explicitUnitIds.length) {
                const productLabel = item.product_name || item.sku;
                throw buildError(
                  409,
                  'unit_unavailable',
                  `Unidade indisponivel para ${productLabel}. Atualize e tente novamente.`
                );
              }
              unitIds = explicitUnitIds;
            } else {
              const reservedRes =
                reservedUnitIds.length > 0
                  ? await client.query<{ id: string }>(
                      `SELECT id
                       FROM inventory_units
                       WHERE id = ANY($1::uuid[])
                         AND product_id = $2
                         AND store_id = $3
                         AND status = 'reserved'
                       ORDER BY expires_at NULLS LAST, created_at ASC
                       LIMIT $4
                       FOR UPDATE`,
                      [reservedUnitIds, productId, storeId, quantity]
                    )
                  : { rows: [] as Array<{ id: string }> };

              const missingUnits = Math.max(0, quantity - reservedRes.rows.length);
              let availableRows: Array<{ id: string }> = [];
              if (missingUnits > 0) {
                const availableRes = await client.query<{ id: string }>(
                  `SELECT id
                   FROM inventory_units
                   WHERE product_id = $1
                     AND store_id = $2
                     AND status = 'available'
                   ORDER BY expires_at NULLS LAST, created_at ASC
                   LIMIT $3
                   FOR UPDATE SKIP LOCKED`,
                  [productId, storeId, missingUnits]
                );
                availableRows = availableRes.rows;
              }

              unitIds = [...reservedRes.rows.map((row) => row.id), ...availableRows.map((row) => row.id)];
              if (unitIds.length < quantity) {
                const productLabel = item.product_name || item.sku;
                throw buildError(409, 'insufficient_stock', `Estoque insuficiente para ${productLabel}.`);
              }
            }
          }

          preparedItems.push({
            orderItemId: item.id,
            sku: item.sku,
            productId,
            quantity,
            price,
            unitIds
          });
        }

        for (const entry of payload.items || []) {
          if (!entry || typeof entry !== 'object') continue;
          const normalizedId = normalizeOptional(entry.id);
          const normalizedSku = normalizeOptional(entry.sku);
          const skuKey = normalizedSku ? normalizedSku.toLowerCase() : '';
          if (normalizedId && consumedOverrideKeys.has(`id:${normalizedId}`)) continue;
          if (skuKey && consumedOverrideKeys.has(`sku:${skuKey}`)) continue;

          let productId = normalizeOptional(entry.productId);
          let sku = normalizedSku || '';
          let productName = sku;
          let defaultPrice = 0;

          if (productId) {
            const productRes = await client.query<{ id: string; sku: string; name: string; price: number | string }>(
              `SELECT id, sku, name, price
               FROM products
               WHERE id = $1 AND organization_id = $2
               LIMIT 1`,
              [productId, orgId]
            );
            const product = productRes.rows[0];
            if (!product) {
              throw buildError(400, 'invalid_product', 'Produto extra selecionado nao encontrado.');
            }
            productId = product.id;
            sku = sku || product.sku;
            productName = product.name || sku;
            defaultPrice = Math.max(0, toNumeric(product.price));
          } else if (sku) {
            const productRes = await client.query<{ id: string; sku: string; name: string; price: number | string }>(
              `SELECT id, sku, name, price
               FROM products
               WHERE organization_id = $1 AND sku = $2
               LIMIT 1`,
              [orgId, sku]
            );
            const product = productRes.rows[0];
            if (product) {
              productId = product.id;
              sku = product.sku;
              productName = product.name || sku;
              defaultPrice = Math.max(0, toNumeric(product.price));
            }
          }

          if (!sku) {
            throw buildError(400, 'invalid_extra_item', 'Produto extra precisa de SKU ou produto vinculado.');
          }

          const quantity = Math.max(0, Math.trunc(toNumeric(entry.quantity ?? 1)));

          if (!productId && !syncAcceptedWithoutSale && quantity > 0) {
            throw buildError(409, 'product_not_found', `Produto extra ${sku} nao encontrado.`);
          }

          const price = Math.max(0, toNumeric(entry.price ?? defaultPrice));
          const explicitUnitIds = normalizeUnitIds(entry.unitIds);

          let unitIds: string[] = [];
          if (!syncAcceptedWithoutSale && productId && quantity > 0) {
            if (explicitUnitIds.length > 0) {
              if (explicitUnitIds.length !== quantity) {
                throw buildError(
                  400,
                  'invalid_unit_selection',
                  `Selecione ${quantity} unidade(s) para ${productName || sku}.`
                );
              }

              const unitRes = await client.query<{ id: string }>(
                `SELECT id
                 FROM inventory_units
                 WHERE id = ANY($1::uuid[])
                   AND product_id = $2
                   AND store_id = $3
                   AND status = 'available'
                 FOR UPDATE`,
                [explicitUnitIds, productId, storeId]
              );

              if (unitRes.rows.length !== explicitUnitIds.length) {
                throw buildError(
                  409,
                  'unit_unavailable',
                  `Unidade indisponivel para ${productName || sku}. Atualize e tente novamente.`
                );
              }
              unitIds = explicitUnitIds;
            } else {
              const unitRes = await client.query<{ id: string }>(
                `SELECT id
                 FROM inventory_units
                 WHERE product_id = $1
                   AND store_id = $2
                   AND status = 'available'
                 ORDER BY expires_at NULLS LAST, created_at ASC
                 LIMIT $3
                 FOR UPDATE SKIP LOCKED`,
                [productId, storeId, quantity]
              );

              if (unitRes.rows.length < quantity) {
                throw buildError(409, 'insufficient_stock', `Estoque insuficiente para ${productName || sku}.`);
              }
              unitIds = unitRes.rows.map((row) => row.id);
            }
          }

          preparedItems.push({
            orderItemId: null,
            sku,
            productId,
            quantity,
            price,
            unitIds
          });
        }

        let customerId = payload.customerId || null;
        let customerName = normalizeOptional(payload.customerName) || normalizeOptional(order.customer_name) || 'Cliente';

        if (customerId) {
          const customerRes = await client.query<{ id: string; name: string }>(
            `SELECT id, name
             FROM customers
             WHERE id = $1 AND organization_id = $2
             LIMIT 1`,
            [customerId, orgId]
          );
          const customer = customerRes.rows[0];
          if (!customer) {
            throw buildError(400, 'invalid_customer', 'Cliente selecionado nao encontrado.');
          }
          customerName = customer.name || customerName;
        }

        const saleDateRaw = normalizeOptional(payload.saleDate);
        const saleCreatedAt = parseSaleCreatedAt(saleDateRaw);

        const subtotal = preparedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const saleRes = await client.query<{ id: string; status: string; customer_name: string }>(
          `INSERT INTO sales (store_id, customer_id, customer_name, status, subtotal, discount_total, total, created_at)
           VALUES ($1, $2, $3, 'pending', $4, 0, $4, $5)
           RETURNING id, status`,
          [storeId, customerId, customerName, subtotal, saleCreatedAt]
        );
        const saleId = saleRes.rows[0].id;

        if (normalizePaymentStatus(order.payment_status) === 'paid') {
          await client.query(
            `INSERT INTO payments (sale_id, method, amount, created_at)
             VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))`,
            [
              saleId,
              mapStorefrontPaymentMethodToSalePayment(order.payment_method),
              subtotal,
              order.payment_paid_at || null
            ]
          );
        }

        for (const item of preparedItems) {
          if (item.quantity <= 0) {
            continue;
          }
          const saleItemRes = await client.query<{ id: string }>(
            `INSERT INTO sale_items (sale_id, product_id, sku, quantity, price)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [saleId, item.productId, item.sku, item.quantity, item.price]
          );
          const saleItemId = saleItemRes.rows[0].id;

          if (!syncAcceptedWithoutSale && item.productId) {
            await client.query(
              `UPDATE inventory_units
               SET status = 'sold',
                   sale_id = $1,
                   sale_item_id = $2,
                   sold_at = now(),
                   updated_at = now()
               WHERE id = ANY($3::uuid[])`,
              [saleId, saleItemId, item.unitIds]
            );

            await client.query(
              `INSERT INTO inventory_movements (store_id, product_id, movement_type, quantity, reason, reference_id)
               VALUES ($1, $2, 'sale_out', $3, $4, $5)`,
              [storeId, item.productId, -Math.abs(item.quantity), 'storefront_accept', saleId]
            );
          }
        }

        await releaseStorefrontOrderReservations(client, id);

        await client.query(
          `UPDATE storefront_orders
           SET status = 'accepted',
               sale_id = $2,
               accepted_at = COALESCE(accepted_at, now())
           WHERE id = $1`,
          [id, saleId]
        );

        await writeAudit(client, {
          organizationId: orgId,
          storeId,
          userId,
          entityType: 'storefront_order',
          entityId: id,
          action: 'accepted',
          payload: {
            saleId,
            items: preparedItems.length,
            customerId,
            customerName,
            mode: syncAcceptedWithoutSale ? 'sync_missing_sale' : 'accept'
          }
        });

        return { type: 'accepted' as const, saleId };
      });

      if (result.type === 'not_found') {
        return res.status(404).json({ code: 'not_found', message: 'Pedido nao encontrado.' });
      }
      if (result.type === 'already_cancelled') {
        return res.status(409).json({ code: 'already_cancelled', message: 'Pedido ja foi cancelado.' });
      }
      if (result.type === 'already_accepted') {
        return res.status(409).json({ code: 'already_accepted', message: 'Pedido ja foi aceito.' });
      }

      return res.json({
        data: {
          id,
          status: 'accepted',
          sale_id: result.saleId
        }
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) {
        const err = error as { status?: number; code?: string; message?: string };
        return res
          .status(err.status || 409)
          .json({ code: err.code || 'storefront_accept_error', message: err.message || 'Erro ao aceitar pedido.' });
      }
      throw error;
    }
  })
);

router.post(
  '/storefront/orders/:id/cancel',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const { id } = req.params;

    const result = await withTransaction(async (client) => {
      const orderRes = await client.query<StorefrontOrderRow>(
        `SELECT id,
                store_id,
                customer_name,
                customer_phone,
                customer_email,
                status,
                total,
                created_at,
                0::int AS items_count,
                sale_id,
                accepted_at,
                cancelled_at
         FROM storefront_orders
         WHERE id = $1 AND store_id = $2
         FOR UPDATE`,
        [id, storeId]
      );

      const order = orderRes.rows[0];
      if (!order) {
        return { type: 'not_found' as const };
      }

      const status = normalizeOrderStatus(order.status);
      if (status === 'accepted') {
        return { type: 'already_accepted' as const };
      }
      if (status === 'cancelled') {
        return { type: 'already_cancelled' as const };
      }

      await releaseStorefrontOrderReservations(client, id);

      await client.query(
        `UPDATE storefront_orders
         SET status = 'cancelled',
             cancelled_at = now()
         WHERE id = $1`,
        [id]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'storefront_order',
        entityId: id,
        action: 'cancelled',
        payload: {}
      });

      return { type: 'cancelled' as const };
    });

    if (result.type === 'not_found') {
      return res.status(404).json({ code: 'not_found', message: 'Pedido nao encontrado.' });
    }
    if (result.type === 'already_accepted') {
      return res.status(409).json({ code: 'already_accepted', message: 'Pedido ja foi aceito.' });
    }
    if (result.type === 'already_cancelled') {
      return res.status(409).json({ code: 'already_cancelled', message: 'Pedido ja foi cancelado.' });
    }

    return res.json({
      data: {
        id,
        status: 'cancelled'
      }
    });
  })
);

router.delete(
  '/storefront/orders/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await ensureStorefrontOrderColumns();
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const userId = req.header('x-user-id') || null;
    const { id } = req.params;

    const result = await withTransaction(async (client) => {
      const orderRes = await client.query<StorefrontOrderRow>(
        `SELECT id,
                store_id,
                customer_name,
                customer_phone,
                customer_email,
                status,
                total,
                created_at,
                0::int AS items_count,
                sale_id,
                accepted_at,
                cancelled_at
         FROM storefront_orders
         WHERE id = $1 AND store_id = $2
         FOR UPDATE`,
        [id, storeId]
      );

      const order = orderRes.rows[0];
      if (!order) {
        return { type: 'not_found' as const };
      }

      const status = normalizeOrderStatus(order.status);
      if (status !== 'cancelled') {
        return { type: 'invalid_status' as const, status };
      }

      await releaseStorefrontOrderReservations(client, id);

      await client.query(
        `DELETE FROM storefront_order_items
         WHERE storefront_order_id = $1`,
        [id]
      );

      await client.query(
        `DELETE FROM storefront_orders
         WHERE id = $1
           AND store_id = $2`,
        [id, storeId]
      );

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'storefront_order',
        entityId: id,
        action: 'deleted',
        payload: {
          status: 'cancelled'
        }
      });

      return { type: 'deleted' as const };
    });

    if (result.type === 'not_found') {
      return res.status(404).json({ code: 'not_found', message: 'Pedido nao encontrado.' });
    }
    if (result.type === 'invalid_status') {
      return res.status(409).json({
        code: 'invalid_status',
        message: 'Apenas pedidos cancelados podem ser excluidos.'
      });
    }

    return res.json({
      data: {
        id,
        deleted: true
      }
    });
  })
);

export default router;
