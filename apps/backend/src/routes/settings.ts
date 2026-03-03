import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Router } from 'express';
import type {
  AccessMemberInput,
  AccessMemberUpdateInput,
  SettingsAccountInput,
  SettingsAlertInput,
  SettingsPixInput,
  SettingsStorefrontInput,
  SettingsSubscriptionInput
} from '../dto';
import { DEFAULT_ORG_ID, DEFAULT_STORE_ID, MERCADO_PAGO_ACCESS_TOKEN } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import { idParamSchema } from '../schemas/common';
import {
  accessMemberInputSchema,
  accessMemberUpdateSchema,
  settingsAccountUpdateSchema,
  settingsAlertUpdateSchema,
  settingsPixUpdateSchema,
  settingsStorefrontUpdateSchema,
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

type StorefrontSettingsRow = {
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
  storefront_runtime_state: unknown | null;
  pix_key_value: string | null;
};

type StorefrontRuntimeProductData = {
  id: string;
  name: string;
  price?: number | string;
  active?: boolean;
};

type StorefrontRuntimePromotionData = {
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

type StorefrontRuntimeStateData = {
  activeProducts: StorefrontRuntimeProductData[];
  promotions: StorefrontRuntimePromotionData[];
  hiddenProductIds: string[];
  productDescriptions: Record<string, string>;
  storePriceOverrides: Record<string, number>;
};

type StorefrontSettingsData = {
  shopName: string;
  subdomain: string;
  shopColor: string;
  onlyStockProducts: boolean;
  showOutOfStockProducts: boolean;
  filterByCategory: boolean;
  filterByBrand: boolean;
  filterByPrice: boolean;
  whatsapp: string;
  showWhatsappButton: boolean;
  selectedBrands: string[];
  selectedCategories: string[];
  priceFrom: string;
  priceTo: string;
  logoUrl: string;
  creditCardLink: string;
  boletoLink: string;
  runtimeState: StorefrontRuntimeStateData;
  pixKey: string;
  mercadoPagoEnabled: boolean;
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
const DEFAULT_STOREFRONT_COLOR = '#7D58D4';
const DEFAULT_STOREFRONT_SUBDOMAIN = 'revendis-prime';

const normalizeOptional = (value?: string) => {
  const next = value?.trim();
  return next ? next : null;
};

const normalizeSubdomain = (value?: string | null) => {
  const raw = (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);
  return raw;
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

const normalizeRuntimeProduct = (value: unknown): StorefrontRuntimeProductData | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as {
    id?: unknown;
    name?: unknown;
    price?: unknown;
    active?: unknown;
  };
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  return {
    id: record.id.trim(),
    name: record.name.trim(),
    price: typeof record.price === 'number' || typeof record.price === 'string' ? record.price : undefined,
    active: typeof record.active === 'boolean' ? record.active : undefined
  };
};

const normalizeRuntimePromotion = (value: unknown): StorefrontRuntimePromotionData | null => {
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

  const productIds = toUniqueTrimmedArray(record.productIds);
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
    productIds,
    mode,
    discountsByProduct:
      discountsByProduct && Object.keys(discountsByProduct).length > 0 ? discountsByProduct : undefined,
    startDate: typeof record.startDate === 'string' ? record.startDate : undefined,
    endDate: typeof record.endDate === 'string' ? record.endDate : undefined,
    status,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined
  };
};

const normalizeStorefrontRuntimeState = (value: unknown): StorefrontRuntimeStateData => {
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

  const activeProducts = Array.isArray(record.activeProducts)
    ? record.activeProducts
        .map(normalizeRuntimeProduct)
        .filter((item): item is StorefrontRuntimeProductData => Boolean(item))
    : [];
  const promotions = Array.isArray(record.promotions)
    ? record.promotions
        .map(normalizeRuntimePromotion)
        .filter((item): item is StorefrontRuntimePromotionData => Boolean(item))
    : [];

  return {
    activeProducts,
    promotions,
    hiddenProductIds,
    productDescriptions,
    storePriceOverrides
  };
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

const isPermissionDeniedError = (error: unknown): error is { code: string } =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42501');

const isUndefinedColumnError = (error: unknown): error is { code: string } =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42703');

const hasOrganizationSettingsColumn = async (db: DbExecutor, columnName: string) => {
  try {
    const result = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'organization_settings'
           AND column_name = $1
       ) AS exists`,
      [columnName]
    );
    return Boolean(result.rows[0]?.exists);
  } catch {
    return false;
  }
};

let ensureStorefrontColumnsPromise: Promise<void> | null = null;

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

const ensureSettingsRow = async (db: DbExecutor, orgId: string) => {
  await ensureStorefrontColumns();
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

const selectStorefrontSettings = async (db: DbExecutor, orgId: string): Promise<StorefrontSettingsData> => {
  const result = await db.query<StorefrontSettingsRow>(
    `SELECT o.name AS organization_name,
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
            to_jsonb(os) -> 'storefront_runtime_state' AS storefront_runtime_state,
            os.pix_key_value
     FROM organizations o
     LEFT JOIN organization_settings os ON os.organization_id = o.id
     WHERE o.id = $1
     LIMIT 1`,
    [orgId]
  );

  const row = result.rows[0];
  const shopName = normalizeOptional(row?.business_name || row?.organization_name) || 'Loja';
  const fallbackSubdomain = normalizeSubdomain(shopName) || DEFAULT_STOREFRONT_SUBDOMAIN;
  const subdomain = normalizeSubdomain(row?.storefront_subdomain) || fallbackSubdomain;

  return {
    shopName,
    subdomain,
    shopColor: row?.storefront_color || DEFAULT_STOREFRONT_COLOR,
    onlyStockProducts: row?.storefront_only_stock ?? false,
    showOutOfStockProducts: row?.storefront_show_out_of_stock ?? true,
    filterByCategory: row?.storefront_filter_category ?? true,
    filterByBrand: row?.storefront_filter_brand ?? true,
    filterByPrice: row?.storefront_filter_price ?? true,
    whatsapp: row?.storefront_whatsapp || '',
    showWhatsappButton: row?.storefront_show_whatsapp_button ?? false,
    selectedBrands: toUniqueTrimmedArray(row?.storefront_selected_brands || []),
    selectedCategories: toUniqueTrimmedArray(row?.storefront_selected_categories || []),
    priceFrom: row?.storefront_price_from || '',
    priceTo: row?.storefront_price_to || '',
    logoUrl: row?.storefront_logo_url || '',
    creditCardLink: row?.storefront_credit_card_link || '',
    boletoLink: row?.storefront_boleto_link || '',
    runtimeState: normalizeStorefrontRuntimeState(row?.storefront_runtime_state),
    pixKey: row?.pix_key_value || '',
    mercadoPagoEnabled: Boolean(MERCADO_PAGO_ACCESS_TOKEN)
  };
};

const buildStorefrontCatalogSnapshot = async (db: DbExecutor, orgId: string) => {
  const storeRes = await db.query<{ id: string }>(
    `SELECT id
     FROM stores
     WHERE organization_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [orgId]
  );
  const storefrontStoreId = storeRes.rows[0]?.id || DEFAULT_STORE_ID;

  const productsResult = await db.query(
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

const updateSettingsFields = async (
  client: PoolClient,
  orgId: string,
  fields: string[],
  values: Array<string | number | boolean | string[] | null>
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

const selectCurrentUserForAccount = async (
  db: DbExecutor,
  orgId: string,
  currentUserId: string,
  currentUserEmail: string
) => {
  if (currentUserId) {
    const byIdResult = await db.query<{ name: string; email: string }>(
      `SELECT name, email
       FROM users
       WHERE organization_id = $1
         AND id = $2
       LIMIT 1`,
      [orgId, currentUserId]
    );
    const byIdUser = byIdResult.rows[0];
    if (byIdUser) return byIdUser;
  }

  if (!currentUserEmail) return null;

  const byEmailResult = await db.query<{ name: string; email: string }>(
    `SELECT name, email
     FROM users
     WHERE organization_id = $1
       AND lower(email) = lower($2)
     LIMIT 1`,
    [orgId, currentUserEmail]
  );

  return byEmailResult.rows[0] || null;
};

router.get(
  '/settings/account',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const currentUserId = `${req.header('x-user-id') || ''}`.trim();
    const currentUserEmail = `${req.header('x-user-email') || ''}`.trim().toLowerCase();
    await ensureSettingsRow({ query }, orgId);
    const account = await selectAccount({ query }, orgId);

    const currentUser = await selectCurrentUserForAccount(
      { query },
      orgId,
      currentUserId,
      currentUserEmail
    );
    if (currentUser) {
      account.ownerName = currentUser.name || account.ownerName;
      account.ownerEmail = currentUser.email || account.ownerEmail;
    }

    res.json({ data: account });
  })
);

router.patch(
  '/settings/account',
  validateRequest({ body: settingsAccountUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const currentUserId = `${req.header('x-user-id') || ''}`.trim();
    const userId = currentUserId || null;
    const currentUserEmail = `${req.header('x-user-email') || ''}`.trim().toLowerCase();
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
          let targetUserId = '';

          if (currentUserId) {
            const currentUserByIdResult = await client.query<{ id: string }>(
              `SELECT id
               FROM users
               WHERE organization_id = $1
                 AND id = $2
               LIMIT 1`,
              [orgId, currentUserId]
            );
            targetUserId = currentUserByIdResult.rows[0]?.id || '';
          }

          if (!targetUserId && currentUserEmail) {
            const currentUserResult = await client.query<{ id: string }>(
              `SELECT id
               FROM users
               WHERE organization_id = $1
                 AND lower(email) = lower($2)
               LIMIT 1`,
              [orgId, currentUserEmail]
            );
            targetUserId = currentUserResult.rows[0]?.id || '';
          }

          if (!targetUserId) {
            const ownerResult = await client.query<{ id: string }>(
              `SELECT id
               FROM users
               WHERE organization_id = $1
               ORDER BY CASE WHEN lower(role) = 'owner' THEN 0 ELSE 1 END, created_at ASC
               LIMIT 1`,
              [orgId]
            );
            targetUserId = ownerResult.rows[0]?.id || '';
          }

          if (targetUserId) {
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
              userValues.push(targetUserId);
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
    const currentUser = await selectCurrentUserForAccount(
      { query },
      orgId,
      currentUserId,
      currentUserEmail
    );
    if (currentUser) {
      account.ownerName = currentUser.name || account.ownerName;
      account.ownerEmail = currentUser.email || account.ownerEmail;
    }

    res.json({ data: account });
  })
);

router.get(
  '/settings/storefront',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    await ensureSettingsRow({ query }, orgId);
    const storefront = await selectStorefrontSettings({ query }, orgId);
    res.json({ data: storefront });
  })
);

router.patch(
  '/settings/storefront',
  validateRequest({ body: settingsStorefrontUpdateSchema }),
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const payload = req.body as SettingsStorefrontInput;

    try {
      await withTransaction(async (client) => {
        await ensureSettingsRow(client, orgId);
        const hasCreditCardColumn =
          payload.creditCardLink === undefined
            ? true
            : await hasOrganizationSettingsColumn(client, 'storefront_credit_card_link');
        const hasBoletoColumn =
          payload.boletoLink === undefined ? true : await hasOrganizationSettingsColumn(client, 'storefront_boleto_link');
        const hasRuntimeStateColumn =
          payload.runtimeState === undefined
            ? true
            : await hasOrganizationSettingsColumn(client, 'storefront_runtime_state');

        const fields: string[] = [];
        const values: Array<string | number | boolean | string[] | null> = [];

        if (payload.shopName !== undefined) {
          const businessName = payload.shopName.trim();
          fields.push(`business_name = $${fields.length + 1}`);
          values.push(businessName);
          await client.query(
            `UPDATE organizations
             SET name = $1
             WHERE id = $2`,
            [businessName, orgId]
          );
        }
        if (payload.subdomain !== undefined) {
          fields.push(`storefront_subdomain = $${fields.length + 1}`);
          values.push(normalizeSubdomain(payload.subdomain) || null);
        }
        if (payload.shopColor !== undefined) {
          fields.push(`storefront_color = $${fields.length + 1}`);
          values.push(payload.shopColor.trim().toUpperCase());
        }
        if (payload.onlyStockProducts !== undefined) {
          fields.push(`storefront_only_stock = $${fields.length + 1}`);
          values.push(payload.onlyStockProducts);
        }
        if (payload.showOutOfStockProducts !== undefined) {
          fields.push(`storefront_show_out_of_stock = $${fields.length + 1}`);
          values.push(payload.showOutOfStockProducts);
        }
        if (payload.filterByCategory !== undefined) {
          fields.push(`storefront_filter_category = $${fields.length + 1}`);
          values.push(payload.filterByCategory);
        }
        if (payload.filterByBrand !== undefined) {
          fields.push(`storefront_filter_brand = $${fields.length + 1}`);
          values.push(payload.filterByBrand);
        }
        if (payload.filterByPrice !== undefined) {
          fields.push(`storefront_filter_price = $${fields.length + 1}`);
          values.push(payload.filterByPrice);
        }
        if (payload.whatsapp !== undefined) {
          fields.push(`storefront_whatsapp = $${fields.length + 1}`);
          values.push(normalizeOptional(payload.whatsapp));
        }
        if (payload.showWhatsappButton !== undefined) {
          fields.push(`storefront_show_whatsapp_button = $${fields.length + 1}`);
          values.push(payload.showWhatsappButton);
        }
        if (payload.selectedBrands !== undefined) {
          fields.push(`storefront_selected_brands = $${fields.length + 1}`);
          values.push(toUniqueTrimmedArray(payload.selectedBrands));
        }
        if (payload.selectedCategories !== undefined) {
          fields.push(`storefront_selected_categories = $${fields.length + 1}`);
          values.push(toUniqueTrimmedArray(payload.selectedCategories));
        }
        if (payload.priceFrom !== undefined) {
          fields.push(`storefront_price_from = $${fields.length + 1}`);
          values.push(payload.priceFrom.trim());
        }
        if (payload.priceTo !== undefined) {
          fields.push(`storefront_price_to = $${fields.length + 1}`);
          values.push(payload.priceTo.trim());
        }
        if (payload.logoUrl !== undefined) {
          fields.push(`storefront_logo_url = $${fields.length + 1}`);
          values.push(normalizeOptional(payload.logoUrl));
        }
        if (payload.creditCardLink !== undefined && hasCreditCardColumn) {
          fields.push(`storefront_credit_card_link = $${fields.length + 1}`);
          values.push(normalizeOptional(payload.creditCardLink));
        }
        if (payload.boletoLink !== undefined && hasBoletoColumn) {
          fields.push(`storefront_boleto_link = $${fields.length + 1}`);
          values.push(normalizeOptional(payload.boletoLink));
        }
        if (payload.runtimeState !== undefined && hasRuntimeStateColumn) {
          fields.push(`storefront_runtime_state = $${fields.length + 1}::jsonb`);
          values.push(JSON.stringify(normalizeStorefrontRuntimeState(payload.runtimeState)));
        }

        if (fields.length > 0) {
          await updateSettingsFields(client, orgId, fields, values);
        }

        const hasCatalogSnapshotColumn = await hasOrganizationSettingsColumn(client, 'storefront_catalog_snapshot');
        if (hasCatalogSnapshotColumn) {
          const storefrontCatalogSnapshot = await buildStorefrontCatalogSnapshot(client, orgId);
          try {
            await client.query(
              `UPDATE organization_settings
               SET storefront_catalog_snapshot = $1::jsonb,
                   updated_at = now()
               WHERE organization_id = $2`,
              [JSON.stringify(storefrontCatalogSnapshot), orgId]
            );
          } catch (error) {
            if (!isPermissionDeniedError(error) && !isUndefinedColumnError(error)) throw error;
          }
        }

        await writeAudit(client, {
          organizationId: orgId,
          userId,
          entityType: 'settings_storefront',
          entityId: orgId,
          action: 'updated',
          payload
        });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({
          code: 'subdomain_conflict',
          message: 'Este link da loja ja esta em uso.'
        });
      }
      throw error;
    }

    const storefront = await selectStorefrontSettings({ query }, orgId);
    return res.json({ data: storefront });
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

router.delete(
  '/settings/access/self',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const userId = req.header('x-user-id') || null;
    const queryEmailRaw = req.query.email;
    const queryEmail =
      typeof queryEmailRaw === 'string'
        ? queryEmailRaw
        : Array.isArray(queryEmailRaw)
          ? `${queryEmailRaw[0] || ''}`
          : '';
    const email = `${req.header('x-user-email') || queryEmail || ''}`.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        code: 'missing_email',
        message: 'Informe o email da conta para exclusao.'
      });
    }

    const deleted = await withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `DELETE FROM users
         WHERE organization_id = $1
           AND lower(email) = lower($2)
         RETURNING id`,
        [orgId, email]
      );

      const member = result.rows[0] || null;
      if (!member) return null;

      await writeAudit(client, {
        organizationId: orgId,
        userId,
        entityType: 'settings_access',
        entityId: member.id,
        action: 'deleted',
        payload: {
          email,
          source: 'self'
        }
      });

      return member;
    });

    if (!deleted) {
      return res.status(404).json({
        code: 'not_found',
        message: 'Conta nao encontrada.'
      });
    }

    return res.status(204).send();
  })
);

export default router;
