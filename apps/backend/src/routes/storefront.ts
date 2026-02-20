import { Router } from 'express';
import type { StorefrontOrderInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import { storefrontOrderAcceptSchema, storefrontOrderSchema } from '../schemas/storefront';
import { asyncHandler } from '../utils/async-handler';
import { writeAudit } from '../utils/audit';

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
  storefront_catalog_snapshot: unknown | null;
};

type StorefrontOrderStatus = 'pending' | 'accepted' | 'cancelled';

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
         ADD COLUMN IF NOT EXISTS storefront_catalog_snapshot jsonb`
    );

    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_settings_storefront_subdomain
         ON organization_settings (lower(storefront_subdomain))
         WHERE storefront_subdomain IS NOT NULL`
    );
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
         ADD COLUMN IF NOT EXISTS cancelled_at timestamptz`
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
              os.storefront_catalog_snapshot
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
          logoUrl: settingsRow.storefront_logo_url || ''
        },
        products
      }
    });
  })
);

router.post(
  '/storefront/orders',
  validateRequest({ body: storefrontOrderSchema }),
  asyncHandler(async (req, res) => {
    let orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    let storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const { items = [], customer, shipping, subdomain } = req.body as StorefrontOrderInput;
    const requestedSubdomain = normalizeSubdomain(subdomain);
    await ensureStorefrontOrderColumns();

    const buildError = (status: number, code: string, message: string) => {
      const error = new Error(message) as Error & { status?: number; code?: string };
      error.status = status;
      error.code = code;
      return error;
    };

    try {
      if (requestedSubdomain) {
        await ensureStorefrontColumns();
        const settingsRes = await query<{ organization_id: string }>(
          `SELECT organization_id
           FROM organization_settings
           WHERE lower(storefront_subdomain) = lower($1)
           LIMIT 1`,
          [requestedSubdomain]
        );
        const orgFromSubdomain = settingsRes.rows[0]?.organization_id;
        if (!orgFromSubdomain) {
          return res.status(404).json({
            code: 'storefront_not_found',
            message: 'Loja nao encontrada.'
          });
        }

        orgId = orgFromSubdomain;
        const storeRes = await query<{ id: string }>(
          `SELECT id
           FROM stores
           WHERE organization_id = $1
           ORDER BY created_at ASC
           LIMIT 1`,
          [orgId]
        );
        storeId = storeRes.rows[0]?.id || DEFAULT_STORE_ID;
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

      const order = await withTransaction(async (client): Promise<StorefrontOrderRow> => {
        const userId = req.header('x-user-id') || null;
        const orderRes = await client.query<StorefrontOrderRow>(
          `INSERT INTO storefront_orders (
             store_id,
             customer_name,
             customer_phone,
             customer_email,
             status,
             total
           )
           VALUES ($1, $2, $3, $4, 'pending', $5)
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
                     cancelled_at`,
          [storeId, customer.name, customer.phone || null, customer.email || null, total]
        );
        const orderId = orderRes.rows[0].id;

        for (const item of resolvedItems) {
          await client.query(
            `INSERT INTO storefront_order_items (storefront_order_id, product_id, sku, quantity, price)
             VALUES ($1, $2, $3, $4, $5)`,
            [orderId, item.productId, item.sku, item.quantity, item.price]
          );
        }

        await writeAudit(client, {
          organizationId: orgId,
          storeId,
          userId,
          entityType: 'storefront_order',
          entityId: orderId,
          action: 'created',
          payload: { total, items: resolvedItems.length }
        });

        return orderRes.rows[0];
      });

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
          shipping
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
              so.cancelled_at
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
              so.cancelled_at
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
                   AND status = 'available'
                 FOR UPDATE`,
                [explicitUnitIds, productId, storeId]
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
                const productLabel = item.product_name || item.sku;
                throw buildError(409, 'insufficient_stock', `Estoque insuficiente para ${productLabel}.`);
              }
              unitIds = unitRes.rows.map((row) => row.id);
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

        const saleDateRaw = (payload.saleDate || '').trim();
        const saleDateNormalized = saleDateRaw
          ? saleDateRaw.includes('T')
            ? saleDateRaw
            : `${saleDateRaw}T00:00:00`
          : '';
        const saleDateParsed = saleDateNormalized ? new Date(saleDateNormalized) : new Date();
        const saleCreatedAt = Number.isNaN(saleDateParsed.getTime()) ? new Date() : saleDateParsed;

        const subtotal = preparedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const saleRes = await client.query<{ id: string; status: string; customer_name: string }>(
          `INSERT INTO sales (store_id, customer_id, customer_name, status, subtotal, discount_total, total, created_at)
           VALUES ($1, $2, $3, 'pending', $4, 0, $4, $5)
           RETURNING id, status`,
          [storeId, customerId, customerName, subtotal, saleCreatedAt]
        );
        const saleId = saleRes.rows[0].id;

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

export default router;
