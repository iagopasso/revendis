import { Router } from 'express';
import type { StorefrontOrderInput } from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { storefrontOrderSchema } from '../schemas/storefront';
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
};

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

let ensureStorefrontColumnsPromise: Promise<void> | null = null;

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
         ADD COLUMN IF NOT EXISTS storefront_logo_url text`
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

router.get(
  '/storefront/catalog',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
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
              COALESCE(b.quantity, 0) AS quantity
       FROM products p
       LEFT JOIN inventory_balances b ON b.product_id = p.id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.organization_id = $1 AND p.active = true
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [orgId]
    );
    res.json({ data: result.rows });
  })
);

router.get(
  '/storefront/public/:subdomain',
  asyncHandler(async (req, res) => {
    await ensureStorefrontColumns();
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
              os.storefront_logo_url
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
              COALESCE(b.quantity, 0) AS quantity
       FROM products p
       LEFT JOIN inventory_balances b ON b.product_id = p.id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.organization_id = $1 AND p.active = true
       ORDER BY p.created_at DESC
       LIMIT 240`,
      [orgId]
    );

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
        products: productsResult.rows
      }
    });
  })
);

router.post(
  '/storefront/orders',
  validateRequest({ body: storefrontOrderSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const { items = [], customer, shipping } = req.body as StorefrontOrderInput;
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const order = await withTransaction(async (client) => {
      const userId = req.header('x-user-id') || null;
      const orderRes = await client.query(
        `INSERT INTO storefront_orders (store_id, customer_name, customer_phone, customer_email, total)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status, total, created_at`,
        [storeId, customer.name, customer.phone || null, customer.email || null, total]
      );
      const orderId = orderRes.rows[0].id;

      for (const item of items) {
        const productRes = await client.query(
          `SELECT id FROM products WHERE organization_id = $1 AND sku = $2`,
          [orgId, item.sku]
        );
        const productId = productRes.rows[0]?.id || null;
        await client.query(
          `INSERT INTO storefront_order_items (storefront_order_id, product_id, sku, quantity, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, productId, item.sku, item.quantity, item.price]
        );
      }

      await writeAudit(client, {
        organizationId: orgId,
        storeId,
        userId,
        entityType: 'storefront_order',
        entityId: orderId,
        action: 'created',
        payload: { total, items: items.length }
      });

      return orderRes.rows[0];
    });

    res.status(201).json({
      data: {
        ...order,
        items,
        customer,
        shipping
      }
    });
  })
);

export default router;
