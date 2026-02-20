import { Router } from 'express';
import { DEFAULT_ORG_ID } from '../config';
import { query, withTransaction } from '../db';
import { validateRequest } from '../middleware/validate';
import {
  catalogPreloadedCollectSchema,
  catalogPreloadedManualImportSchema,
  catalogBrandsPreloadSchema,
  catalogBrandsSyncSchema,
  naturaMagazineCatalogSchema,
  naturaConsultantCatalogSchema
} from '../schemas/catalog';
import { asyncHandler } from '../utils/async-handler';
import {
  CATALOG_BRANDS,
  CATALOG_BRAND_LABELS,
  fetchBrandCatalogProducts,
  resolveCatalogProductImageUrl,
  resolveCatalogBrandSlug,
  type CatalogBrandSlug
} from '../services/brand-catalog';
import {
  fetchNaturaCatalogProductsByCodes,
  fetchNaturaCatalogProducts,
  fetchNaturaConsultantCatalogProducts,
  NATURA_CATEGORY_PATHS,
  type NaturaConsultantCredentials
} from '../services/natura-catalog';
import { extractNaturaMagazineProducts } from '../services/natura-magazine';
import { collectWebsiteCatalogProducts } from '../services/catalog-ingestion';

const router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_CACHE_LIMIT = 3000;
const MAX_CACHE_LIMIT = 10000;
const DEFAULT_PRELOAD_SYNC_MAX_AGE_HOURS = 24;
const MAX_PRELOAD_SYNC_MAX_AGE_HOURS = 24 * 30;

const pathToSlug = (path: string) => (path.startsWith('/c/') ? path.slice(3) : path);

const parseQueryValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
};

const parseLimit = (value: unknown) => {
  const raw = parseQueryValue(value);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed)));
};

const parseCacheLimit = (value: unknown) => {
  const raw = parseQueryValue(value);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_CACHE_LIMIT;
  return Math.min(MAX_CACHE_LIMIT, Math.max(1, Math.trunc(parsed)));
};

const parseInStock = (value: unknown) => {
  const raw = parseQueryValue(value).trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
};

const parseBool = (value: unknown, fallback: boolean) => {
  const raw = parseQueryValue(value).trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return fallback;
};

const parseBrands = (value: unknown): CatalogBrandSlug[] => {
  const input = parseQueryValue(value);
  if (!input.trim()) return [...CATALOG_BRANDS];

  const mapped = input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolveCatalogBrandSlug(item))
    .filter((item): item is CatalogBrandSlug => item !== null);

  return mapped.length ? Array.from(new Set(mapped)) : [...CATALOG_BRANDS];
};

const parseOptionalBrands = (value: unknown): CatalogBrandSlug[] | null => {
  const input = parseQueryValue(value);
  if (!input.trim()) return null;

  const mapped = input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolveCatalogBrandSlug(item))
    .filter((item): item is CatalogBrandSlug => item !== null);

  return Array.from(new Set(mapped));
};

const parseBrand = (value: string): CatalogBrandSlug | null => resolveCatalogBrandSlug(value);

const mapCategorySlugs = (requested: string[]) => {
  const mapped = requested
    .map((slug) => {
      const normalized = slug
        .replace(/^\/?c\//i, '')
        .trim()
        .toLowerCase();
      if (!normalized) return null;

      const known = NATURA_CATEGORY_PATHS.find((path) => pathToSlug(path) === normalized);
      return known || `/c/${normalized}`;
    })
    .filter((path): path is string => typeof path === 'string' && path.length > 0);

  return Array.from(new Set(mapped));
};

const parseCategories = (value: unknown) => {
  const input = parseQueryValue(value);
  if (!input.trim()) return [];

  return mapCategorySlugs(
    input
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
};

const parseCategoryList = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  return mapCategorySlugs(
    value
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
};

const parseBodyLimit = (value: unknown, fallback: number, max = 1000) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.trunc(value)));
};

const parsePreloadBodyLimit = (value: unknown, fallback: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(MAX_CACHE_LIMIT, Math.max(1, Math.trunc(value)));
};

const parsePreloadMaxAgeHours = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PRELOAD_SYNC_MAX_AGE_HOURS;
  }
  return Math.min(MAX_PRELOAD_SYNC_MAX_AGE_HOURS, Math.max(1, Math.trunc(value)));
};

const parseOptionalText = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseOptionalNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const raw = value.trim().replace(/\s/g, '').replace(/^R\$/i, '');
    const cleaned = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseOptionalInStock = (value: unknown, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', '1', 'sim', 's', 'yes', 'y', 'ativo', 'disponivel'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'nao', 'n', 'no', 'inativo', 'indisponivel'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
};

const parseOptionalBarcode = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return null;
  const digits = text.replace(/\D+/g, '');
  if (digits.length >= 8 && digits.length <= 18) return digits;
  return null;
};

type SearchableCatalogProduct = {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  inStock: boolean;
  sourceBrand?: string;
};

type NaturaConsultantCatalogInput = {
  login?: string;
  password?: string;
  categories?: string[];
  limit?: number;
  inStockOnly?: boolean;
  deactivateMissing?: boolean;
  classifyBrand?: string;
};

type NaturaMagazineCatalogInput = {
  pdfPath?: string;
  pdfUrl?: string;
  pdfHeaders?: Record<string, string>;
  limit?: number;
  inStockOnly?: boolean;
  enrichWithCatalog?: boolean;
  clearMissing?: boolean;
};

type CatalogBrandsSyncInput = {
  brands?: string[];
  allBrands?: boolean;
  limit?: number;
  inStockOnly?: boolean;
  deactivateMissing?: boolean;
  allowSampleFallback?: boolean;
};

type CatalogBrandsPreloadInput = {
  brands?: string[];
  allBrands?: boolean;
  limit?: number;
  inStockOnly?: boolean;
  clearMissing?: boolean;
  allowSampleFallback?: boolean;
  maxAgeHours?: number;
  force?: boolean;
};

type ManualPreloadedImportProductInput = {
  sourceBrand?: string;
  code?: string;
  sku?: string;
  barcode?: string;
  name: string;
  brand?: string;
  sourceLineBrand?: string;
  price?: number | string;
  purchasePrice?: number | string;
  inStock?: boolean | number | string;
  imageUrl?: string;
  sourceCategory?: string;
  sourceUrl?: string;
};

type CatalogPreloadedManualImportInput = {
  sourceBrand?: string;
  clearMissing?: boolean;
  products: ManualPreloadedImportProductInput[];
};

type CatalogPreloadedCollectInput = {
  sourceBrand?: string;
  clearMissing?: boolean;
  mode: 'website' | 'magazine';
  website?: {
    siteUrl: string;
    productUrls?: string[];
    pathHints?: string[];
    maxPages?: number;
  };
  magazine?: {
    pdfPath?: string;
    pdfUrl?: string;
    pdfHeaders?: Record<string, string>;
    limit?: number;
    inStockOnly?: boolean;
    enrichWithCatalog?: boolean;
  };
};

type NaturaCatalogSyncItem = {
  code: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string;
  price: number;
  purchasePrice: number;
  inStock: boolean;
  imageUrl: string | null;
  sourceCategory: string;
};

type NaturaMagazineNormalizedItem = {
  id: string;
  code: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string;
  lineBrand: string | null;
  price: number | null;
  purchasePrice: number | null;
  inStock: boolean;
  imageUrl: string;
  sourceCategory: string;
  sourceUrl: string | null;
  page: number | null;
};

type BrandCatalogSyncItem = {
  code: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string;
  sourceBrand: CatalogBrandSlug;
  price: number;
  purchasePrice: number;
  inStock: boolean;
  imageUrl: string | null;
  sourceCategory: string;
};

type CatalogPreloadItem = {
  sourceBrand: CatalogBrandSlug;
  code: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string;
  sourceLineBrand: string | null;
  price: number | null;
  purchasePrice: number | null;
  inStock: boolean;
  imageUrl: string | null;
  sourceCategory: string;
  sourceUrl: string | null;
};

type PreloadedCatalogProductRow = {
  id: string;
  code: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string;
  sourceBrand: CatalogBrandSlug;
  sourceLineBrand: string | null;
  price: number | null;
  purchasePrice: number | null;
  inStock: boolean;
  imageUrl: string | null;
  sourceCategory: string | null;
  sourceUrl: string | null;
  fetchedSource: 'upstream' | 'sample';
  updatedAt: string | Date;
};

const normalizeCatalogBrand = (brand?: string | null) => {
  const value = brand?.trim();
  return value ? value : 'Natura';
};

const normalizeCodeToken = (value?: string | null) =>
  (value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

const normalizeDigitsToken = (value?: string | null) => (value || '').replace(/\D+/g, '');

const buildMagazineFallbackName = (code: string) => `Produto Natura ${code}`;

const summarizeBrands = (products: Array<{ brand?: string | null }>) => {
  const counts = new Map<string, number>();

  products.forEach((product) => {
    const brand = normalizeCatalogBrand(product.brand);
    counts.set(brand, (counts.get(brand) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

const summarizeCycles = (products: Array<{ sourceCategory?: string | null }>) => {
  const counts = new Map<string, number>();

  products.forEach((product) => {
    const cycle = product.sourceCategory?.trim();
    if (!cycle) return;
    counts.set(cycle, (counts.get(cycle) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};

const parseBodyBrands = (value: unknown): CatalogBrandSlug[] => {
  if (!Array.isArray(value) || value.length === 0) return [];

  const mapped = value
    .map((item) => (typeof item === 'string' ? resolveCatalogBrandSlug(item.trim()) : null))
    .filter((item): item is CatalogBrandSlug => item !== null);

  return Array.from(new Set(mapped));
};

const resolveConfiguredCatalogBrands = async (orgId: string): Promise<CatalogBrandSlug[]> => {
  const result = await query<{ sourceBrand: string | null }>(
    `SELECT source_brand AS "sourceBrand"
     FROM reseller_brands
     WHERE organization_id = $1
       AND source_brand IS NOT NULL`,
    [orgId]
  );

  const mapped = result.rows
    .map((row) => resolveCatalogBrandSlug(row.sourceBrand || ''))
    .filter((item): item is CatalogBrandSlug => item !== null);

  return Array.from(new Set(mapped));
};

const resolveRequestedCatalogBrands = async ({
  orgId,
  requestedBrands,
  allBrands
}: {
  orgId: string;
  requestedBrands: CatalogBrandSlug[] | null;
  allBrands: boolean;
}): Promise<CatalogBrandSlug[]> => {
  if (requestedBrands) {
    return requestedBrands;
  }
  if (allBrands) {
    return [...CATALOG_BRANDS];
  }

  const configured = await resolveConfiguredCatalogBrands(orgId);
  return configured.length > 0 ? configured : [...CATALOG_BRANDS];
};

const resolveManualSourceBrand = ({
  itemSourceBrand,
  itemBrand,
  fallbackSourceBrand
}: {
  itemSourceBrand?: string | null;
  itemBrand?: string | null;
  fallbackSourceBrand?: CatalogBrandSlug | null;
}) => {
  const parsedSourceBrand = resolveCatalogBrandSlug(itemSourceBrand || '');
  if (parsedSourceBrand) return parsedSourceBrand;

  const parsedBrand = resolveCatalogBrandSlug(itemBrand || '');
  if (parsedBrand) return parsedBrand;

  return fallbackSourceBrand || null;
};

const normalizeSkuToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();

const toBrandSkuToken = (brand: CatalogBrandSlug) => normalizeSkuToken(brand).replace(/-/g, '');

const toCatalogSyncSku = (
  sourceBrand: CatalogBrandSlug,
  rawSku: string,
  rawId: string
) => {
  const brandToken = toBrandSkuToken(sourceBrand) || 'CATALOG';
  const productToken = normalizeSkuToken(rawSku || rawId).slice(0, 80) || normalizeSkuToken(rawId);
  return `CATBRA-${brandToken}-${productToken || rawId}`;
};

const normalizeCatalogSku = (rawSku: string, rawId: string) => {
  const sku = (rawSku || rawId).trim();
  return sku || rawId;
};

const resolveConsultantCredentials = (
  payload: NaturaConsultantCatalogInput
): NaturaConsultantCredentials | null => {
  const login =
    payload.login?.trim() || process.env.NATURA_CONSULTANT_LOGIN?.trim() || '';
  const password = payload.password || process.env.NATURA_CONSULTANT_PASSWORD || '';

  if (!login || !password) {
    return null;
  }

  return {
    login,
    password
  };
};

const filterProducts = (
  products: SearchableCatalogProduct[],
  query: string,
  inStock: boolean | null
) => {
  const normalizedQuery = query.trim().toLowerCase();

  return products.filter((product) => {
    if (inStock !== null && product.inStock !== inStock) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchText =
      `${product.id} ${product.sku} ${product.name} ${product.brand || ''} ${product.sourceBrand || ''}`.toLowerCase();
    return searchText.includes(normalizedQuery);
  });
};

const filterPreloadedProducts = (
  products: PreloadedCatalogProductRow[],
  query: string
) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return products;

  return products.filter((product) => {
    const searchText = [
      product.code,
      product.sku,
      product.barcode || '',
      product.name,
      product.brand,
      product.sourceLineBrand || '',
      product.sourceBrand,
      product.sourceCategory || '',
      product.sourceUrl || ''
    ]
      .join(' ')
      .toLowerCase();
    return searchText.includes(normalizedQuery);
  });
};

const mapToPreloadItem = (
  sourceBrand: CatalogBrandSlug,
  product: {
    id: string;
    sku: string;
    barcode?: string | null;
    name: string;
    brand: string;
    price: number | null;
    inStock: boolean;
    imageUrl: string | null;
    sourceCategory: string;
    url: string | null;
  }
): CatalogPreloadItem => {
  const normalizedSku = normalizeCatalogSku(product.sku, product.id);
  return {
    sourceBrand,
    code: normalizedSku,
    sku: normalizedSku,
    barcode: parseOptionalBarcode(product.barcode || normalizedSku),
    name: product.name,
    brand: CATALOG_BRAND_LABELS[sourceBrand],
    sourceLineBrand: product.brand?.trim() || null,
    price: product.price,
    purchasePrice: product.price,
    inStock: product.inStock,
    imageUrl: resolveCatalogProductImageUrl(sourceBrand, product.imageUrl),
    sourceCategory: product.sourceCategory,
    sourceUrl: product.url
  };
};

const mapCachedRowToPreloadItem = (row: PreloadedCatalogProductRow): CatalogPreloadItem => ({
  sourceBrand: row.sourceBrand,
  code: row.code || row.sku || row.id,
  sku: row.sku || row.code || row.id,
  barcode: row.barcode || parseOptionalBarcode(row.code || row.sku || row.id),
  name: row.name,
  brand: row.brand,
  sourceLineBrand: row.sourceLineBrand,
  price: row.price,
  purchasePrice: row.purchasePrice,
  inStock: row.inStock,
  imageUrl: resolveCatalogProductImageUrl(row.sourceBrand, row.imageUrl),
  sourceCategory: row.sourceCategory || 'catalogo',
  sourceUrl: row.sourceUrl
});

const buildNaturaMagazineCatalogProducts = async ({
  payload
}: {
  payload: NaturaMagazineCatalogInput;
}): Promise<{
  items: NaturaMagazineNormalizedItem[];
  extractionMeta: Record<string, unknown>;
  source: { type: 'path' | 'url'; value: string };
  enrichedCount: number;
  failedEnrichCodes: string[];
  failedEnrichDetails: Array<{
    source: string;
    error: string;
    attempts: Array<{ profile: string; error: string }>;
  }>;
}> => {
  const inStockOnly = payload.inStockOnly === true;
  const enrichWithCatalog = payload.enrichWithCatalog !== false;
  const limit = parsePreloadBodyLimit(payload.limit, MAX_CACHE_LIMIT);

  const extracted = await extractNaturaMagazineProducts({
    pdfPath: payload.pdfPath,
    pdfUrl: payload.pdfUrl,
    pdfHeaders: payload.pdfHeaders,
    limit
  });

  const byCode = new Map(
    extracted.products.map((item) => [normalizeCodeToken(item.code), item] as const)
  );
  const codes = extracted.products.map((item) => item.code);

  const enrichedByCode = new Map<string, Awaited<
    ReturnType<typeof fetchNaturaCatalogProductsByCodes>
  >['products'][number]>();
  let failedEnrichCodes: string[] = [];
  let failedEnrichDetails: Array<{
    source: string;
    error: string;
    attempts: Array<{ profile: string; error: string }>;
  }> = [];

  if (enrichWithCatalog && codes.length > 0) {
    const enriched = await fetchNaturaCatalogProductsByCodes({
      codes
    });
    failedEnrichCodes = enriched.failedCodes;
    failedEnrichDetails = enriched.failedDetails;

    enriched.products.forEach((product) => {
      const productTokens = [
        normalizeCodeToken(product.code),
        normalizeCodeToken(product.sku),
        normalizeCodeToken(product.id)
      ];
      const matchedToken = productTokens.find((token) => byCode.has(token));
      if (matchedToken) {
        enrichedByCode.set(matchedToken, product);
        return;
      }

      const productDigits = [
        normalizeDigitsToken(product.code),
        normalizeDigitsToken(product.sku),
        normalizeDigitsToken(product.id)
      ];
      const fallbackToken = Array.from(byCode.keys()).find((token) => {
        const lookupDigits = normalizeDigitsToken(byCode.get(token)?.code || '');
        if (!lookupDigits) return false;
        return productDigits.some((digits) => digits === lookupDigits);
      });
      if (fallbackToken) {
        enrichedByCode.set(fallbackToken, product);
      }
    });
  }

  const normalized = extracted.products
    .map((item): NaturaMagazineNormalizedItem => {
      const token = normalizeCodeToken(item.code);
      const enriched = enrichedByCode.get(token);
      const name = (enriched?.name || item.name || '').trim() || buildMagazineFallbackName(item.code);
      const sku =
        (enriched?.sku || enriched?.code || item.code).trim() || item.code;
      const code = item.code;
      const barcode = parseOptionalBarcode(enriched?.barcode || sku || code);
      const price = enriched?.price ?? item.price ?? null;
      const purchasePrice = enriched?.purchasePrice ?? item.price ?? price ?? null;
      const inStock = enriched ? enriched.inStock : true;
      const sourceCategory = enriched?.sourceCategory || 'magazine';
      const sourceUrl = enriched?.url || payload.pdfUrl || null;
      const lineBrand = (enriched?.brand || '').trim() || null;

      return {
        id: enriched?.id || sku || code,
        code,
        sku,
        barcode,
        name,
        brand: 'Natura',
        lineBrand,
        price,
        purchasePrice,
        inStock,
        imageUrl: resolveCatalogProductImageUrl('natura', enriched?.imageUrl || null),
        sourceCategory,
        sourceUrl,
        page: item.page
      };
    })
    .filter((item) => !inStockOnly || item.inStock)
    .slice(0, limit);

  const enrichedTokenSet = new Set(enrichedByCode.keys());

  return {
    items: normalized,
    extractionMeta: extracted.meta || {},
    source: extracted.source,
    enrichedCount: normalized.filter((item) =>
      enrichedTokenSet.has(normalizeCodeToken(item.code))
    ).length,
    failedEnrichCodes,
    failedEnrichDetails
  };
};

router.get(
  '/catalog/brands',
  asyncHandler(async (_req, res) => {
    return res.json({
      data: CATALOG_BRANDS.map((slug) => ({
        slug,
        label: CATALOG_BRAND_LABELS[slug]
      }))
    });
  })
);

router.get(
  '/catalog/preloaded/products',
  asyncHandler(async (req, res) => {
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const requestedBrands = parseOptionalBrands(req.query.brands);
    const allBrands = parseBool(req.query.allBrands, false);
    const brands = await resolveRequestedCatalogBrands({
      orgId,
      requestedBrands,
      allBrands
    });
    const queryValue = parseQueryValue(req.query.q).trim();
    const inStock = parseInStock(req.query.inStock);
    const limit = parseCacheLimit(req.query.limit);

    const params: unknown[] = [orgId, brands];
    const inStockClause =
      inStock === null ? '' : `AND in_stock = $${params.push(inStock)}`;

    const cached = await query<PreloadedCatalogProductRow>(
      `SELECT id,
              code,
              sku,
              barcode,
              name,
              brand,
              source_brand AS "sourceBrand",
              source_line_brand AS "sourceLineBrand",
              price::float8 AS price,
              purchase_price::float8 AS "purchasePrice",
              in_stock AS "inStock",
              image_url AS "imageUrl",
              source_category AS "sourceCategory",
              source_url AS "sourceUrl",
              fetched_source AS "fetchedSource",
              updated_at AS "updatedAt"
       FROM catalog_preloaded_products
       WHERE organization_id = $1
         AND source_brand = ANY($2::text[])
         ${inStockClause}
       ORDER BY lower(brand), lower(name)`,
      params
    );

    const filtered = filterPreloadedProducts(cached.rows, queryValue);
    const limited = filtered.slice(0, limit);

    const brandsWithProducts = Array.from(
      new Set(filtered.map((item) => item.sourceBrand))
    );
    const sourceMap = new Map<
      CatalogBrandSlug,
      {
        brand: CatalogBrandSlug;
        source: 'sample' | 'upstream';
        count: number;
      }
    >();

    filtered.forEach((item) => {
      const current = sourceMap.get(item.sourceBrand);
      if (current) {
        sourceMap.set(item.sourceBrand, {
          ...current,
          count: current.count + 1
        });
        return;
      }
      sourceMap.set(item.sourceBrand, {
        brand: item.sourceBrand,
        source: item.fetchedSource,
        count: 1
      });
    });

    const lastSyncedAtRaw = filtered.reduce<number | null>((latest, item) => {
      const timestamp = new Date(item.updatedAt).getTime();
      if (Number.isNaN(timestamp)) return latest;
      if (latest === null) return timestamp;
      return timestamp > latest ? timestamp : latest;
    }, null);
    const lastSyncedAt = lastSyncedAtRaw ? new Date(lastSyncedAtRaw).toISOString() : null;

    return res.json({
      data: limited,
      meta: {
        brands,
        allBrands,
        brandsWithProducts,
        total: filtered.length,
        count: limited.length,
        limit,
        query: queryValue,
        inStock,
        sources: Array.from(sourceMap.values()),
        lastSyncedAt,
        fetchedAt: new Date().toISOString()
      }
    });
  })
);

router.post(
  '/catalog/preloaded/sync',
  validateRequest({ body: catalogBrandsPreloadSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as CatalogBrandsPreloadInput;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const requestedBrands = parseBodyBrands(payload.brands);
    const allBrands = payload.allBrands === true;
    const selectedBrands = await resolveRequestedCatalogBrands({
      orgId,
      requestedBrands: requestedBrands.length > 0 ? requestedBrands : null,
      allBrands
    });
    const inStockOnly = payload.inStockOnly === true;
    const clearMissing = payload.clearMissing !== false;
    const allowSampleFallback = payload.allowSampleFallback === true;
    const perBrandLimit = parsePreloadBodyLimit(payload.limit, MAX_CACHE_LIMIT);
    const maxAgeHours = parsePreloadMaxAgeHours(payload.maxAgeHours);
    const force = payload.force === true;
    const freshnessCutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;

    const cachedByBrand = new Map<CatalogBrandSlug, CatalogPreloadItem[]>();
    const freshBrands = new Set<CatalogBrandSlug>();
    const sourceByBrand = new Map<CatalogBrandSlug, 'upstream' | 'sample'>();

    if (!force && selectedBrands.length > 0) {
      await withTransaction(async (client) => {
        const freshness = await client.query<{
          sourceBrand: CatalogBrandSlug;
          lastUpdatedAt: string | Date | null;
          total: number;
        }>(
          `SELECT source_brand AS "sourceBrand",
                  max(updated_at) AS "lastUpdatedAt",
                  count(*)::int AS total
           FROM catalog_preloaded_products
           WHERE organization_id = $1
             AND source_brand = ANY($2::text[])
           GROUP BY source_brand`,
          [orgId, selectedBrands]
        );

        freshness.rows.forEach((row) => {
          if (!selectedBrands.includes(row.sourceBrand)) return;
          const updatedAtMs = row.lastUpdatedAt ? new Date(row.lastUpdatedAt).getTime() : NaN;
          if (row.total > 0 && Number.isFinite(updatedAtMs) && updatedAtMs >= freshnessCutoffMs) {
            freshBrands.add(row.sourceBrand);
          }
        });

        if (freshBrands.size === 0) {
          return;
        }

        const freshBrandList = Array.from(freshBrands);
        const cached = await client.query<PreloadedCatalogProductRow>(
          `SELECT id,
                  code,
                  sku,
                  barcode,
                  name,
                  brand,
                  source_brand AS "sourceBrand",
                  source_line_brand AS "sourceLineBrand",
                  price::float8 AS price,
                  purchase_price::float8 AS "purchasePrice",
                  in_stock AS "inStock",
                  image_url AS "imageUrl",
                  source_category AS "sourceCategory",
                  source_url AS "sourceUrl",
                  fetched_source AS "fetchedSource",
                  updated_at AS "updatedAt"
           FROM catalog_preloaded_products
           WHERE organization_id = $1
             AND source_brand = ANY($2::text[])
             ${inStockOnly ? 'AND in_stock = true' : ''}
           ORDER BY source_brand, lower(name)`,
          [orgId, freshBrandList]
        );

        const countsByBrand = new Map<CatalogBrandSlug, { upstream: number; sample: number }>();

        cached.rows.forEach((row) => {
          if (!freshBrands.has(row.sourceBrand)) return;

          const sourceCounts = countsByBrand.get(row.sourceBrand) || {
            upstream: 0,
            sample: 0
          };
          if (row.fetchedSource === 'sample') {
            sourceCounts.sample += 1;
          } else {
            sourceCounts.upstream += 1;
          }
          countsByBrand.set(row.sourceBrand, sourceCounts);

          const bucket = cachedByBrand.get(row.sourceBrand) || [];
          if (bucket.length < perBrandLimit) {
            bucket.push(mapCachedRowToPreloadItem(row));
            cachedByBrand.set(row.sourceBrand, bucket);
          }
        });

        freshBrandList.forEach((brand) => {
          const sourceCounts = countsByBrand.get(brand);
          sourceByBrand.set(
            brand,
            sourceCounts && sourceCounts.sample > sourceCounts.upstream ? 'sample' : 'upstream'
          );
        });
      });
    }

    const staleBrands = selectedBrands.filter((brand) => !freshBrands.has(brand));

    const fetchedStaleBrands = await Promise.all(
      staleBrands.map(async (brand) => {
        const fetched = await fetchBrandCatalogProducts({
          brand,
          useSampleFallback: allowSampleFallback
        });
        const filtered = (inStockOnly
          ? fetched.products.filter((product) => product.inStock)
          : fetched.products
        )
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .slice(0, perBrandLimit);

        return {
          brand,
          source: fetched.source,
          failedSources: fetched.failedSources,
          failedDetails: fetched.failedDetails,
          cacheHit: false,
          products: filtered.map((product) => mapToPreloadItem(brand, product))
        };
      })
    );

    const cacheEntries = Array.from(freshBrands).map((brand) => ({
      brand,
      source: sourceByBrand.get(brand) || 'upstream',
      failedSources: [] as string[],
      failedDetails: [] as Array<{
        source: string;
        error: string;
        attempts: Array<{ profile: string; error: string }>;
      }>,
      cacheHit: true,
      products: cachedByBrand.get(brand) || []
    }));

    const entriesByBrand = new Map<CatalogBrandSlug, (typeof cacheEntries)[number]>();
    [...cacheEntries, ...fetchedStaleBrands].forEach((entry) => {
      entriesByBrand.set(entry.brand, entry);
    });

    const fetchedByBrand = selectedBrands
      .map((brand) => entriesByBrand.get(brand))
      .filter(
        (
          entry
        ): entry is {
          brand: CatalogBrandSlug;
          source: 'sample' | 'upstream';
          failedSources: string[];
          failedDetails: Array<{
            source: string;
            error: string;
            attempts: Array<{ profile: string; error: string }>;
          }>;
          cacheHit: boolean;
          products: CatalogPreloadItem[];
        } => Boolean(entry)
      );

    const normalized = fetchedByBrand.flatMap((entry) => entry.products);

    const persisted = await withTransaction(async (client) => {
      let upsertedProducts = 0;
      let removedProducts = 0;
      const skippedSampleBrands = new Set<CatalogBrandSlug>();

      for (const entry of fetchedByBrand) {
        if (entry.cacheHit) {
          continue;
        }

        if (entry.source === 'sample') {
          const existingUpstream = await client.query<{ total: number }>(
            `SELECT count(*)::int AS total
             FROM catalog_preloaded_products
             WHERE organization_id = $1
               AND source_brand = $2
               AND fetched_source = 'upstream'`,
            [orgId, entry.brand]
          );
          const hasUpstream = Number(existingUpstream.rows[0]?.total || 0) > 0;
          if (hasUpstream) {
            skippedSampleBrands.add(entry.brand);
            continue;
          }
        }

        const cachedSkus: string[] = [];
        for (const product of entry.products) {
          await client.query(
            `INSERT INTO catalog_preloaded_products (
               organization_id,
               source_brand,
               code,
               sku,
               barcode,
               name,
               brand,
               source_line_brand,
               price,
               purchase_price,
               in_stock,
               image_url,
               source_category,
               source_url,
               fetched_source
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT (organization_id, source_brand, sku)
             DO UPDATE SET
               code = EXCLUDED.code,
               barcode = EXCLUDED.barcode,
               name = EXCLUDED.name,
               brand = EXCLUDED.brand,
               source_line_brand = EXCLUDED.source_line_brand,
               price = EXCLUDED.price,
               purchase_price = EXCLUDED.purchase_price,
               in_stock = EXCLUDED.in_stock,
               image_url = EXCLUDED.image_url,
               source_category = EXCLUDED.source_category,
               source_url = EXCLUDED.source_url,
               fetched_source = EXCLUDED.fetched_source,
               updated_at = now()`,
            [
              orgId,
              product.sourceBrand,
              product.code,
              product.sku,
              product.barcode,
              product.name,
              product.brand,
              product.sourceLineBrand,
              product.price,
              product.purchasePrice,
              product.inStock,
              product.imageUrl,
              product.sourceCategory,
              product.sourceUrl,
              entry.source
            ]
          );
          upsertedProducts += 1;
          cachedSkus.push(product.sku);
        }

        if (clearMissing && entry.products.length > 0) {
          const removed = cachedSkus.length
            ? await client.query(
                `DELETE FROM catalog_preloaded_products
                 WHERE organization_id = $1
                   AND source_brand = $2
                   AND NOT (sku = ANY($3::text[]))`,
                [orgId, entry.brand, cachedSkus]
              )
            : await client.query(
                `DELETE FROM catalog_preloaded_products
                 WHERE organization_id = $1
                   AND source_brand = $2`,
                [orgId, entry.brand]
              );
          removedProducts += removed.rowCount || 0;
        }
      }

      return {
        upsertedProducts,
        removedProducts,
        skippedSampleBrands: Array.from(skippedSampleBrands)
      };
    });

    return res.json({
      data: normalized,
      meta: {
        selectedBrands,
        allBrands,
        cachedBrands: fetchedByBrand.filter((entry) => entry.cacheHit).map((entry) => entry.brand),
        syncedBrands: fetchedByBrand.filter((entry) => !entry.cacheHit).map((entry) => entry.brand),
        total: normalized.length,
        upsertedProducts: persisted.upsertedProducts,
        removedProducts: persisted.removedProducts,
        skippedSampleBrands: persisted.skippedSampleBrands,
        inStockOnly,
        clearMissing,
        allowSampleFallback,
        maxAgeHours,
        force,
        realCatalogOnly: !allowSampleFallback,
        perBrandLimit,
        sources: fetchedByBrand.map((entry) => ({
          brand: entry.brand,
          source: entry.source,
          cacheHit: entry.cacheHit,
          failedSources: entry.failedSources,
          failedDetails: entry.failedDetails,
          count: entry.products.length
        })),
        brands: summarizeBrands(normalized),
        syncedAt: new Date().toISOString()
      }
    });
  })
);

router.post(
  '/catalog/preloaded/manual/import',
  validateRequest({ body: catalogPreloadedManualImportSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as CatalogPreloadedManualImportInput;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const clearMissing = payload.clearMissing === true;
    const fallbackSourceBrand = resolveCatalogBrandSlug(payload.sourceBrand || '');

    const invalidRows: Array<{ row: number; reason: string }> = [];
    const normalizedRows: CatalogPreloadItem[] = [];

    payload.products.forEach((item, index) => {
      const name = parseOptionalText(item.name);
      const sourceBrand = resolveManualSourceBrand({
        itemSourceBrand: parseOptionalText(item.sourceBrand),
        itemBrand: parseOptionalText(item.brand),
        fallbackSourceBrand
      });

      if (!name) {
        invalidRows.push({
          row: index + 1,
          reason: 'name_required'
        });
        return;
      }

      if (!sourceBrand) {
        invalidRows.push({
          row: index + 1,
          reason: 'source_brand_not_mapped'
        });
        return;
      }

      const code =
        parseOptionalText(item.code) ||
        parseOptionalText(item.sku) ||
        `${sourceBrand.toUpperCase()}-MAN-${index + 1}`;
      const sku = parseOptionalText(item.sku) || code;
      const barcode =
        parseOptionalBarcode(item.barcode) ||
        parseOptionalBarcode(item.code) ||
        parseOptionalBarcode(item.sku) ||
        null;
      const catalogBrandLabel = CATALOG_BRAND_LABELS[sourceBrand];
      const itemBrand = parseOptionalText(item.brand);
      const sourceLineBrand =
        parseOptionalText(item.sourceLineBrand) ||
        (itemBrand && itemBrand.toLowerCase() !== catalogBrandLabel.toLowerCase()
          ? itemBrand
          : null);
      const price = parseOptionalNumber(item.price);
      const purchasePrice = parseOptionalNumber(item.purchasePrice) ?? price;
      const inStock = parseOptionalInStock(item.inStock, true);
      const imageUrl = resolveCatalogProductImageUrl(
        sourceBrand,
        parseOptionalText(item.imageUrl)
      );
      const sourceCategory = parseOptionalText(item.sourceCategory) || 'manual';
      const sourceUrl = parseOptionalText(item.sourceUrl);

      normalizedRows.push({
        sourceBrand,
        code,
        sku,
        barcode,
        name,
        brand: catalogBrandLabel,
        sourceLineBrand,
        price,
        purchasePrice,
        inStock,
        imageUrl,
        sourceCategory,
        sourceUrl
      });
    });

    const dedupedMap = new Map<string, CatalogPreloadItem>();
    normalizedRows.forEach((item) => {
      dedupedMap.set(`${item.sourceBrand}:${item.sku.toLowerCase()}`, item);
    });
    const normalized = Array.from(dedupedMap.values());

    if (!normalized.length) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Nenhum produto valido foi enviado para importacao.',
        meta: {
          received: payload.products.length,
          invalidRows
        }
      });
    }

    const syncedSkusByBrand = normalized.reduce<Map<CatalogBrandSlug, string[]>>((acc, item) => {
      const bucket = acc.get(item.sourceBrand) || [];
      bucket.push(item.sku);
      acc.set(item.sourceBrand, bucket);
      return acc;
    }, new Map<CatalogBrandSlug, string[]>());

    const persisted = await withTransaction(async (client) => {
      let upsertedProducts = 0;
      let removedProducts = 0;

      for (const item of normalized) {
        await client.query(
          `INSERT INTO catalog_preloaded_products (
             organization_id,
             source_brand,
             code,
             sku,
             barcode,
             name,
             brand,
             source_line_brand,
             price,
             purchase_price,
             in_stock,
             image_url,
             source_category,
             source_url,
             fetched_source
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'sample')
           ON CONFLICT (organization_id, source_brand, sku)
           DO UPDATE SET
             code = EXCLUDED.code,
             barcode = EXCLUDED.barcode,
             name = EXCLUDED.name,
             brand = EXCLUDED.brand,
             source_line_brand = EXCLUDED.source_line_brand,
             price = EXCLUDED.price,
             purchase_price = EXCLUDED.purchase_price,
             in_stock = EXCLUDED.in_stock,
             image_url = EXCLUDED.image_url,
             source_category = EXCLUDED.source_category,
             source_url = EXCLUDED.source_url,
             fetched_source = EXCLUDED.fetched_source,
             updated_at = now()`,
          [
            orgId,
            item.sourceBrand,
            item.code,
            item.sku,
            item.barcode,
            item.name,
            item.brand,
            item.sourceLineBrand,
            item.price,
            item.purchasePrice,
            item.inStock,
            item.imageUrl,
            item.sourceCategory,
            item.sourceUrl
          ]
        );
        upsertedProducts += 1;
      }

      if (clearMissing) {
        for (const [brand, skus] of syncedSkusByBrand) {
          const removed = skus.length
            ? await client.query(
                `DELETE FROM catalog_preloaded_products
                 WHERE organization_id = $1
                   AND source_brand = $2
                   AND NOT (sku = ANY($3::text[]))`,
                [orgId, brand, skus]
              )
            : await client.query(
                `DELETE FROM catalog_preloaded_products
                 WHERE organization_id = $1
                   AND source_brand = $2`,
                [orgId, brand]
              );
          removedProducts += removed.rowCount || 0;
        }
      }

      return {
        upsertedProducts,
        removedProducts
      };
    });

    return res.json({
      data: normalized,
      meta: {
        total: normalized.length,
        upsertedProducts: persisted.upsertedProducts,
        removedProducts: persisted.removedProducts,
        clearMissing,
        receivedProducts: payload.products.length,
        ignoredProducts: payload.products.length - normalized.length,
        invalidRows,
        brands: summarizeBrands(normalized),
        sources: Array.from(syncedSkusByBrand.keys()).map((brand) => ({
          brand,
          source: 'sample',
          count: syncedSkusByBrand.get(brand)?.length || 0
        })),
        syncedAt: new Date().toISOString()
      }
    });
  })
);

router.post(
  '/catalog/preloaded/collect',
  validateRequest({ body: catalogPreloadedCollectSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as CatalogPreloadedCollectInput;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const clearMissing = payload.clearMissing === true;
    const fallbackSourceBrand = resolveCatalogBrandSlug(payload.sourceBrand || '');
    const invalidRows: Array<{ row: number; reason: string }> = [];
    const collectedRows: CatalogPreloadItem[] = [];

    let collectMeta: Record<string, unknown> = {};

    if (payload.mode === 'website') {
      const websiteInput = payload.website;
      if (!websiteInput) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe o objeto website para mode=website.'
        });
      }

      const collected = await collectWebsiteCatalogProducts({
        siteUrl: websiteInput.siteUrl,
        productUrls: websiteInput.productUrls || [],
        pathHints: websiteInput.pathHints || [],
        maxPages: websiteInput.maxPages
      });

      collectMeta = {
        siteUrl: websiteInput.siteUrl,
        scannedUrls: collected.scannedUrls,
        failedUrls: collected.failedUrls,
        sourceUrls: collected.sourceUrls
      };

      collected.products.forEach((item, index) => {
        const sourceBrand = resolveManualSourceBrand({
          itemSourceBrand: null,
          itemBrand: parseOptionalText(item.brand),
          fallbackSourceBrand
        });

        if (!sourceBrand) {
          invalidRows.push({
            row: index + 1,
            reason: 'source_brand_not_mapped'
          });
          return;
        }

        const code =
          parseOptionalText(item.code) ||
          parseOptionalText(item.sku) ||
          `${sourceBrand.toUpperCase()}-WEB-${index + 1}`;
        const sku = parseOptionalText(item.sku) || code;
        const barcode =
          parseOptionalBarcode(item.barcode) ||
          parseOptionalBarcode(code) ||
          parseOptionalBarcode(sku) ||
          null;
        const catalogBrandLabel = CATALOG_BRAND_LABELS[sourceBrand];
        const itemBrand = parseOptionalText(item.brand);
        const sourceLineBrand =
          itemBrand && itemBrand.toLowerCase() !== catalogBrandLabel.toLowerCase()
            ? itemBrand
            : null;

        collectedRows.push({
          sourceBrand,
          code,
          sku,
          barcode,
          name: item.name,
          brand: catalogBrandLabel,
          sourceLineBrand,
          price: item.price,
          purchasePrice: item.purchasePrice ?? item.price,
          inStock: item.inStock,
          imageUrl: resolveCatalogProductImageUrl(sourceBrand, item.imageUrl),
          sourceCategory: parseOptionalText(item.sourceCategory) || 'website',
          sourceUrl: parseOptionalText(item.sourceUrl)
        });
      });
    }

    if (payload.mode === 'magazine') {
      const magazineInput = payload.magazine;
      if (!magazineInput) {
        return res.status(400).json({
          code: 'invalid_payload',
          message: 'Informe o objeto magazine para mode=magazine.'
        });
      }

      const magazineResult = await buildNaturaMagazineCatalogProducts({
        payload: {
          pdfPath: magazineInput.pdfPath,
          pdfUrl: magazineInput.pdfUrl,
          pdfHeaders: magazineInput.pdfHeaders,
          limit: magazineInput.limit,
          inStockOnly: magazineInput.inStockOnly,
          enrichWithCatalog: magazineInput.enrichWithCatalog
        }
      });

      collectMeta = {
        source: magazineResult.source,
        extractionMeta: magazineResult.extractionMeta,
        enrichedCount: magazineResult.enrichedCount,
        failedEnrichCodes: magazineResult.failedEnrichCodes,
        failedEnrichDetails: magazineResult.failedEnrichDetails
      };

      magazineResult.items.forEach((item, index) => {
        const sourceBrand =
          fallbackSourceBrand ||
          resolveManualSourceBrand({
            itemSourceBrand: null,
            itemBrand: item.brand,
            fallbackSourceBrand: 'natura'
          });

        if (!sourceBrand) {
          invalidRows.push({
            row: index + 1,
            reason: 'source_brand_not_mapped'
          });
          return;
        }

        collectedRows.push({
          sourceBrand,
          code: item.code,
          sku: item.sku,
          barcode:
            parseOptionalBarcode(item.barcode) ||
            parseOptionalBarcode(item.code) ||
            parseOptionalBarcode(item.sku),
          name: item.name,
          brand: CATALOG_BRAND_LABELS[sourceBrand],
          sourceLineBrand: item.lineBrand,
          price: item.price,
          purchasePrice: item.purchasePrice,
          inStock: item.inStock,
          imageUrl: resolveCatalogProductImageUrl(sourceBrand, item.imageUrl),
          sourceCategory: item.sourceCategory || 'magazine',
          sourceUrl: item.sourceUrl
        });
      });
    }

    const dedupedMap = new Map<string, CatalogPreloadItem>();
    collectedRows.forEach((item) => {
      dedupedMap.set(`${item.sourceBrand}:${item.sku.toLowerCase()}`, item);
    });
    const normalized = Array.from(dedupedMap.values());

    if (!normalized.length) {
      return res.status(400).json({
        code: 'invalid_payload',
        message: 'Nenhum produto valido foi coletado para importacao.',
        meta: {
          mode: payload.mode,
          invalidRows,
          collectMeta
        }
      });
    }

    const syncedSkusByBrand = normalized.reduce<Map<CatalogBrandSlug, string[]>>((acc, item) => {
      const bucket = acc.get(item.sourceBrand) || [];
      bucket.push(item.sku);
      acc.set(item.sourceBrand, bucket);
      return acc;
    }, new Map<CatalogBrandSlug, string[]>());

    const persisted = await withTransaction(async (client) => {
      let upsertedProducts = 0;
      let removedProducts = 0;

      for (const item of normalized) {
        await client.query(
          `INSERT INTO catalog_preloaded_products (
             organization_id,
             source_brand,
             code,
             sku,
             barcode,
             name,
             brand,
             source_line_brand,
             price,
             purchase_price,
             in_stock,
             image_url,
             source_category,
             source_url,
             fetched_source
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'upstream')
           ON CONFLICT (organization_id, source_brand, sku)
           DO UPDATE SET
             code = EXCLUDED.code,
             barcode = EXCLUDED.barcode,
             name = EXCLUDED.name,
             brand = EXCLUDED.brand,
             source_line_brand = EXCLUDED.source_line_brand,
             price = EXCLUDED.price,
             purchase_price = EXCLUDED.purchase_price,
             in_stock = EXCLUDED.in_stock,
             image_url = EXCLUDED.image_url,
             source_category = EXCLUDED.source_category,
             source_url = EXCLUDED.source_url,
             fetched_source = EXCLUDED.fetched_source,
             updated_at = now()`,
          [
            orgId,
            item.sourceBrand,
            item.code,
            item.sku,
            item.barcode,
            item.name,
            item.brand,
            item.sourceLineBrand,
            item.price,
            item.purchasePrice,
            item.inStock,
            item.imageUrl,
            item.sourceCategory,
            item.sourceUrl
          ]
        );
        upsertedProducts += 1;
      }

      if (clearMissing) {
        for (const [brand, skus] of syncedSkusByBrand) {
          const removed = skus.length
            ? await client.query(
                `DELETE FROM catalog_preloaded_products
                 WHERE organization_id = $1
                   AND source_brand = $2
                   AND NOT (sku = ANY($3::text[]))`,
                [orgId, brand, skus]
              )
            : await client.query(
                `DELETE FROM catalog_preloaded_products
                 WHERE organization_id = $1
                   AND source_brand = $2`,
                [orgId, brand]
              );
          removedProducts += removed.rowCount || 0;
        }
      }

      return {
        upsertedProducts,
        removedProducts
      };
    });

    return res.json({
      data: normalized,
      meta: {
        mode: payload.mode,
        total: normalized.length,
        upsertedProducts: persisted.upsertedProducts,
        removedProducts: persisted.removedProducts,
        clearMissing,
        invalidRows,
        brands: summarizeBrands(normalized),
        collectMeta,
        syncedAt: new Date().toISOString()
      }
    });
  })
);

router.post(
  '/catalog/natura/magazine/products',
  validateRequest({ body: naturaMagazineCatalogSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as NaturaMagazineCatalogInput;
    const result = await buildNaturaMagazineCatalogProducts({
      payload
    });

    return res.json({
      data: result.items,
      meta: {
        source: result.source,
        total: result.items.length,
        enrichedCount: result.enrichedCount,
        extractedCodes: result.extractionMeta.uniqueCodes || result.items.length,
        failedEnrichCodes: result.failedEnrichCodes,
        failedEnrichDetails: result.failedEnrichDetails,
        extractionMeta: result.extractionMeta,
        fetchedAt: new Date().toISOString()
      }
    });
  })
);

router.post(
  '/catalog/natura/magazine/sync',
  validateRequest({ body: naturaMagazineCatalogSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as NaturaMagazineCatalogInput;
    const clearMissing = payload.clearMissing !== false;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;

    const result = await buildNaturaMagazineCatalogProducts({
      payload
    });

    const sync = await withTransaction(async (client) => {
      let upsertedProducts = 0;
      const syncedSkus: string[] = [];

      for (const item of result.items) {
        await client.query(
          `INSERT INTO catalog_preloaded_products (
             organization_id,
             source_brand,
             code,
             sku,
             barcode,
             name,
             brand,
             source_line_brand,
             price,
             purchase_price,
             in_stock,
             image_url,
             source_category,
             source_url,
             fetched_source
           )
           VALUES ($1, 'natura', $2, $3, $4, $5, 'Natura', $6, $7, $8, $9, $10, $11, $12, 'upstream')
           ON CONFLICT (organization_id, source_brand, sku)
           DO UPDATE SET
             code = EXCLUDED.code,
             barcode = EXCLUDED.barcode,
             name = EXCLUDED.name,
             brand = EXCLUDED.brand,
             source_line_brand = EXCLUDED.source_line_brand,
             price = EXCLUDED.price,
             purchase_price = EXCLUDED.purchase_price,
             in_stock = EXCLUDED.in_stock,
             image_url = EXCLUDED.image_url,
             source_category = EXCLUDED.source_category,
             source_url = EXCLUDED.source_url,
             fetched_source = EXCLUDED.fetched_source,
             updated_at = now()`,
          [
            orgId,
            item.code,
            item.sku,
            item.barcode,
            item.name,
            item.lineBrand,
            item.price,
            item.purchasePrice,
            item.inStock,
            item.imageUrl,
            item.sourceCategory,
            item.sourceUrl
          ]
        );
        upsertedProducts += 1;
        syncedSkus.push(item.sku);
      }

      let removedProducts = 0;
      if (clearMissing) {
        const removed = syncedSkus.length
          ? await client.query(
              `DELETE FROM catalog_preloaded_products
               WHERE organization_id = $1
                 AND source_brand = 'natura'
                 AND NOT (sku = ANY($2::text[]))`,
              [orgId, syncedSkus]
            )
          : await client.query(
              `DELETE FROM catalog_preloaded_products
               WHERE organization_id = $1
                 AND source_brand = 'natura'`,
              [orgId]
            );
        removedProducts = removed.rowCount || 0;
      }

      return {
        upsertedProducts,
        removedProducts
      };
    });

    return res.json({
      data: result.items,
      meta: {
        source: result.source,
        total: result.items.length,
        upsertedProducts: sync.upsertedProducts,
        removedProducts: sync.removedProducts,
        clearMissing,
        enrichedCount: result.enrichedCount,
        failedEnrichCodes: result.failedEnrichCodes,
        failedEnrichDetails: result.failedEnrichDetails,
        extractionMeta: result.extractionMeta,
        syncedAt: new Date().toISOString()
      }
    });
  })
);

router.get(
  '/catalog/brands/:brand/products',
  asyncHandler(async (req, res) => {
    const brand = parseBrand(req.params.brand || '');
    if (!brand) {
      return res.status(400).json({
        code: 'invalid_brand',
        message: 'Marca nao suportada para consulta de catalogo.'
      });
    }

    const query = parseQueryValue(req.query.q).trim();
    const inStock = parseInStock(req.query.inStock);
    const limit = parseLimit(req.query.limit);
    const allowSampleFallback = parseBool(req.query.allowSampleFallback, false);

    const { products, source, failedSources, failedDetails } = await fetchBrandCatalogProducts({
      brand,
      useSampleFallback: allowSampleFallback
    });
    const filtered = filterProducts(products, query, inStock).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR')
    );
    const limited = filtered.slice(0, limit);

    return res.json({
      data: limited,
      meta: {
        brand,
        brandLabel: CATALOG_BRAND_LABELS[brand],
        total: filtered.length,
        count: limited.length,
        limit,
        query,
        inStock,
        allowSampleFallback,
        source,
        failedSources,
        failedDetails,
        fetchedAt: new Date().toISOString()
      }
    });
  })
);

router.get(
  '/catalog/brands/products',
  asyncHandler(async (req, res) => {
    const brands = parseBrands(req.query.brands);
    const query = parseQueryValue(req.query.q).trim();
    const inStock = parseInStock(req.query.inStock);
    const limit = parseLimit(req.query.limit);
    const allowSampleFallback = parseBool(req.query.allowSampleFallback, false);

    const catalogResults = await Promise.all(
      brands.map(async (brand) => {
        const fetched = await fetchBrandCatalogProducts({
          brand,
          useSampleFallback: allowSampleFallback
        });
        return {
          brand,
          ...fetched
        };
      })
    );

    const products = catalogResults.flatMap((result) => result.products);
    const filtered = filterProducts(products, query, inStock).sort((a, b) => {
      const brandA = a.brand || '';
      const brandB = b.brand || '';
      return brandA.localeCompare(brandB, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR');
    });
    const limited = filtered.slice(0, limit);

    return res.json({
      data: limited,
      meta: {
        brands,
        total: filtered.length,
        count: limited.length,
        limit,
        query,
        inStock,
        allowSampleFallback,
        sources: catalogResults.map((result) => ({
          brand: result.brand,
          source: result.source,
          failedSources: result.failedSources,
          failedDetails: result.failedDetails
        })),
        fetchedAt: new Date().toISOString()
      }
    });
  })
);

router.post(
  '/catalog/brands/sync',
  validateRequest({ body: catalogBrandsSyncSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as CatalogBrandsSyncInput;
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const requestedBrands = parseBodyBrands(payload.brands);
    const allBrands = payload.allBrands === true;
    const selectedBrands = await resolveRequestedCatalogBrands({
      orgId,
      requestedBrands: requestedBrands.length > 0 ? requestedBrands : null,
      allBrands
    });
    const inStockOnly = payload.inStockOnly === true;
    const deactivateMissing = payload.deactivateMissing !== false;
    const allowSampleFallback = payload.allowSampleFallback === true;
    const perBrandLimit = parseBodyLimit(payload.limit, 2000, 2000);

    const fetchedByBrand = await Promise.all(
      selectedBrands.map(async (brand) => {
        const fetched = await fetchBrandCatalogProducts({
          brand,
          useSampleFallback: allowSampleFallback
        });
        const filtered = (inStockOnly
          ? fetched.products.filter((product) => product.inStock)
          : fetched.products
        )
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .slice(0, perBrandLimit);

        return {
          brand,
          source: fetched.source,
          failedSources: fetched.failedSources,
          failedDetails: fetched.failedDetails,
          products: filtered
        };
      })
    );

    const normalized = fetchedByBrand.flatMap(
      (entry): BrandCatalogSyncItem[] =>
        entry.products.map((product) => ({
          code: product.sku || product.id,
          sku: toCatalogSyncSku(entry.brand, product.sku, product.id),
          barcode: parseOptionalBarcode(product.barcode || product.sku || product.id),
          name: product.name,
          brand: CATALOG_BRAND_LABELS[entry.brand],
          sourceBrand: entry.brand,
          price: product.price ?? 0,
          purchasePrice: product.price ?? 0,
          inStock: product.inStock,
          imageUrl: product.imageUrl,
          sourceCategory: product.sourceCategory
        }))
    );

    const sync = await withTransaction(async (client) => {
      let upsertedProducts = 0;

      for (const item of normalized) {
        await client.query(
          `INSERT INTO products (organization_id, sku, name, brand, barcode, image_url, price, cost, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (organization_id, sku)
           DO UPDATE SET
             name = EXCLUDED.name,
             brand = EXCLUDED.brand,
             barcode = EXCLUDED.barcode,
             image_url = EXCLUDED.image_url,
             price = EXCLUDED.price,
             cost = EXCLUDED.cost,
             active = EXCLUDED.active`,
          [
            orgId,
            item.sku,
            item.name,
            item.brand,
            item.barcode || item.code,
            item.imageUrl,
            item.price,
            item.purchasePrice,
            item.inStock
          ]
        );
        upsertedProducts += 1;
      }

      const brandsWithProducts = Array.from(
        new Set(normalized.map((item) => item.sourceBrand))
      );

      for (const sourceBrand of brandsWithProducts) {
        await client.query(
          `INSERT INTO reseller_brands (organization_id, name, source, source_brand, profitability)
           VALUES ($1, $2, 'catalog', $3, 0)
           ON CONFLICT (organization_id, (lower(name)))
           DO UPDATE SET
             source = EXCLUDED.source,
             source_brand = EXCLUDED.source_brand`,
          [orgId, CATALOG_BRAND_LABELS[sourceBrand], sourceBrand]
        );
      }

      let removedBrands = 0;
      if (deactivateMissing) {
        if (brandsWithProducts.length > 0) {
          const removed = await client.query(
            `DELETE FROM reseller_brands
             WHERE organization_id = $1
               AND source = 'catalog'
               AND source_brand = ANY($2::text[])
               AND NOT (source_brand = ANY($3::text[]))`,
            [orgId, selectedBrands, brandsWithProducts]
          );
          removedBrands = removed.rowCount || 0;
        } else {
          const removed = await client.query(
            `DELETE FROM reseller_brands
             WHERE organization_id = $1
               AND source = 'catalog'
               AND source_brand = ANY($2::text[])`,
            [orgId, selectedBrands]
          );
          removedBrands = removed.rowCount || 0;
        }
      }

      let deactivatedProducts = 0;
      if (deactivateMissing) {
        const skuPatterns = selectedBrands.map(
          (brand) => `CATBRA-${toBrandSkuToken(brand)}-%`
        );
        const syncedSkus = normalized.map((item) => item.sku);

        if (syncedSkus.length > 0) {
          const deactivated = await client.query(
            `UPDATE products
             SET active = false
             WHERE organization_id = $1
               AND sku LIKE ANY($2::text[])
               AND NOT (sku = ANY($3::text[]))`,
            [orgId, skuPatterns, syncedSkus]
          );
          deactivatedProducts = deactivated.rowCount || 0;
        } else {
          const deactivated = await client.query(
            `UPDATE products
             SET active = false
             WHERE organization_id = $1
               AND sku LIKE ANY($2::text[])`,
            [orgId, skuPatterns]
          );
          deactivatedProducts = deactivated.rowCount || 0;
        }
      }

      return {
        upsertedProducts,
        removedBrands,
        deactivatedProducts
      };
    });

    return res.json({
      data: normalized,
      meta: {
        selectedBrands,
        allBrands,
        total: normalized.length,
        upsertedProducts: sync.upsertedProducts,
        removedBrands: sync.removedBrands,
        deactivatedProducts: sync.deactivatedProducts,
        inStockOnly,
        deactivateMissing,
        perBrandLimit,
        allowSampleFallback,
        realCatalogOnly: !allowSampleFallback,
        sources: fetchedByBrand.map((entry) => ({
          brand: entry.brand,
          source: entry.source,
          failedSources: entry.failedSources,
          failedDetails: entry.failedDetails,
          count: entry.products.length
        })),
        brands: summarizeBrands(normalized),
        syncedAt: new Date().toISOString()
      }
    });
  })
);

router.get(
  '/catalog/natura/products',
  asyncHandler(async (req, res) => {
    const query = parseQueryValue(req.query.q).trim();
    const inStock = parseInStock(req.query.inStock);
    const limit = parseLimit(req.query.limit);
    const categories = parseCategories(req.query.categories);

    const { products, failedSources, failedDetails, resolvedPaths } = await fetchNaturaCatalogProducts({
      paths: categories
    });

    if (!products.length && resolvedPaths.length > 0 && failedSources.length === resolvedPaths.length) {
      return res.status(502).json({
        code: 'upstream_unavailable',
        message: 'Nao foi possivel consultar o catalogo da Natura neste momento.'
      });
    }

    const filtered = filterProducts(products, query, inStock).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR')
    );

    const limited = filtered.slice(0, limit);

    return res.json({
      data: limited,
      meta: {
        total: filtered.length,
        count: limited.length,
        limit,
        query,
        inStock,
        source: 'natura.com.br',
        categories: resolvedPaths.map(pathToSlug),
        failedCategories: failedSources.map(pathToSlug),
        failedDetails,
        fetchedAt: new Date().toISOString()
      }
    });
  })
);

router.post(
  '/catalog/natura/consultant/products',
  validateRequest({ body: naturaConsultantCatalogSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as NaturaConsultantCatalogInput;
    const credentials = resolveConsultantCredentials(payload);
    if (!credentials) {
      return res.status(400).json({
        code: 'missing_consultant_credentials',
        message:
          'Configure NATURA_CONSULTANT_LOGIN e NATURA_CONSULTANT_PASSWORD para validar com login real da consultoria.'
      });
    }
    const categories = parseCategoryList(payload.categories);
    const limit = parseBodyLimit(payload.limit, MAX_LIMIT, 1000);
    const inStockOnly = payload.inStockOnly === true;
    const classifyBrand = payload.classifyBrand?.trim() || null;

    const { products, failedSources, failedDetails, resolvedPaths } = await fetchNaturaConsultantCatalogProducts({
      credentials,
      paths: categories
    });

    if (!products.length && resolvedPaths.length > 0 && failedSources.length === resolvedPaths.length) {
      return res.status(502).json({
        code: 'upstream_unavailable',
        message:
          'Nao foi possivel acessar a vitrine da Natura Consultoria com as credenciais informadas.'
      });
    }

    const filtered = (inStockOnly ? products.filter((product) => product.inStock) : products)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const limited = filtered.slice(0, limit).map((product) => ({
      id: product.id,
      code: product.code || product.sku,
      sku: product.sku,
      barcode: product.barcode || product.code || product.sku,
      name: product.name,
      brand: classifyBrand || normalizeCatalogBrand(product.brand),
      price: product.price,
      purchasePrice: product.purchasePrice,
      inStock: product.inStock,
      sourceCategory: product.sourceCategory,
      url: product.url,
      imageUrl: product.imageUrl
    }));

    return res.json({
      data: limited,
      meta: {
        total: filtered.length,
        count: limited.length,
        limit,
        inStockOnly,
        classifyBrand,
        source: 'natura_consultoria',
        categories: resolvedPaths.map(pathToSlug),
        failedCategories: failedSources.map(pathToSlug),
        failedDetails,
        brands: summarizeBrands(limited),
        cycles: summarizeCycles(limited),
        fetchedAt: new Date().toISOString()
      }
    });
  })
);

router.post(
  '/catalog/natura/consultant/sync',
  validateRequest({ body: naturaConsultantCatalogSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as NaturaConsultantCatalogInput;
    const credentials = resolveConsultantCredentials(payload);
    if (!credentials) {
      return res.status(400).json({
        code: 'missing_consultant_credentials',
        message:
          'Configure NATURA_CONSULTANT_LOGIN e NATURA_CONSULTANT_PASSWORD para validar com login real da consultoria.'
      });
    }
    const orgId = req.header('x-org-id') || DEFAULT_ORG_ID;
    const categories = parseCategoryList(payload.categories);
    const inStockOnly = payload.inStockOnly === true;
    const deactivateMissing = payload.deactivateMissing !== false;
    const limit = parseBodyLimit(payload.limit, 1000, 1000);
    const classifyBrand = payload.classifyBrand?.trim() || null;

    const { products, failedSources, failedDetails, resolvedPaths } = await fetchNaturaConsultantCatalogProducts({
      credentials,
      paths: categories
    });

    if (!products.length && resolvedPaths.length > 0 && failedSources.length === resolvedPaths.length) {
      return res.status(502).json({
        code: 'upstream_unavailable',
        message:
          'Nao foi possivel acessar a vitrine da Natura Consultoria com as credenciais informadas.'
      });
    }

    const normalized = (inStockOnly ? products.filter((product) => product.inStock) : products)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, limit)
      .map(
        (product): NaturaCatalogSyncItem => ({
          code: product.code || product.sku,
          sku: product.sku,
          barcode: product.barcode || product.code || product.sku,
          name: product.name,
          brand: classifyBrand || normalizeCatalogBrand(product.brand),
          price: product.price ?? product.purchasePrice ?? 0,
          purchasePrice: product.purchasePrice ?? product.price ?? 0,
          inStock: product.inStock,
          imageUrl: product.imageUrl,
          sourceCategory: product.sourceCategory
        })
      );

    const sync = await withTransaction(async (client) => {
      let upsertedProducts = 0;

      for (const item of normalized) {
        await client.query(
          `INSERT INTO products (organization_id, sku, name, brand, barcode, image_url, price, cost, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (organization_id, sku)
           DO UPDATE SET
             name = EXCLUDED.name,
             brand = EXCLUDED.brand,
             barcode = EXCLUDED.barcode,
             image_url = EXCLUDED.image_url,
             price = EXCLUDED.price,
             cost = EXCLUDED.cost,
             active = EXCLUDED.active`,
          [
            orgId,
            item.sku,
            item.name,
            item.brand,
            item.barcode,
            item.imageUrl,
            item.price,
            item.purchasePrice,
            item.inStock
          ]
        );
        upsertedProducts += 1;
      }

      const brands = summarizeBrands(normalized).map((entry) => entry.name);
      for (const brand of brands) {
        await client.query(
          `INSERT INTO reseller_brands (organization_id, name, source, source_brand, profitability)
           VALUES ($1, $2, 'catalog', 'natura', 0)
           ON CONFLICT (organization_id, (lower(name)))
           DO UPDATE SET
             source = EXCLUDED.source,
             source_brand = EXCLUDED.source_brand`,
          [orgId, brand]
        );
      }

      let removedBrands = 0;
      if (deactivateMissing) {
        const lowerBrands = brands.map((brand) => brand.toLowerCase());
        const removed = lowerBrands.length
          ? await client.query(
              `DELETE FROM reseller_brands
               WHERE organization_id = $1
                 AND source = 'catalog'
                 AND source_brand = 'natura'
                 AND NOT (lower(name) = ANY($2::text[]))`,
              [orgId, lowerBrands]
            )
          : await client.query(
              `DELETE FROM reseller_brands
               WHERE organization_id = $1
                 AND source = 'catalog'
                 AND source_brand = 'natura'`,
              [orgId]
            );
        removedBrands = removed.rowCount || 0;
      }

      let deactivatedProducts = 0;
      if (deactivateMissing) {
        const skus = normalized.map((item) => item.sku);
        const deactivated = skus.length
          ? await client.query(
              `UPDATE products
               SET active = false
               WHERE organization_id = $1
                 AND sku LIKE 'NATBRA-%'
                 AND NOT (sku = ANY($2::text[]))`,
              [orgId, skus]
            )
          : await client.query(
              `UPDATE products
               SET active = false
               WHERE organization_id = $1
                 AND sku LIKE 'NATBRA-%'`,
              [orgId]
            );
        deactivatedProducts = deactivated.rowCount || 0;
      }

      return {
        upsertedProducts,
        removedBrands,
        deactivatedProducts
      };
    });

    return res.json({
      data: normalized,
      meta: {
        total: normalized.length,
        upsertedProducts: sync.upsertedProducts,
        removedBrands: sync.removedBrands,
        deactivatedProducts: sync.deactivatedProducts,
        inStockOnly,
        deactivateMissing,
        classifyBrand,
        categories: resolvedPaths.map(pathToSlug),
        failedCategories: failedSources.map(pathToSlug),
        failedDetails,
        brands: summarizeBrands(normalized),
        cycles: summarizeCycles(normalized),
        syncedAt: new Date().toISOString()
      }
    });
  })
);

export default router;
