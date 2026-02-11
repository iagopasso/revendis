import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler';
import {
  CATALOG_BRANDS,
  CATALOG_BRAND_LABELS,
  fetchBrandCatalogProducts,
  resolveCatalogBrandSlug,
  type CatalogBrandSlug
} from '../services/brand-catalog';
import {
  fetchNaturaCatalogProducts,
  NATURA_CATEGORY_PATHS
} from '../services/natura-catalog';

const router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

const parseInStock = (value: unknown) => {
  const raw = parseQueryValue(value).trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
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

const parseBrand = (value: string): CatalogBrandSlug | null => resolveCatalogBrandSlug(value);

const parseCategories = (value: unknown) => {
  const input = parseQueryValue(value);
  if (!input.trim()) return [...NATURA_CATEGORY_PATHS];

  const requested = input
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const mapped = requested
    .map((slug) => NATURA_CATEGORY_PATHS.find((path) => pathToSlug(path) === slug))
    .filter(
      (path): path is (typeof NATURA_CATEGORY_PATHS)[number] =>
        typeof path === 'string' && path.length > 0
    );

  return mapped.length ? Array.from(new Set(mapped)) : [...NATURA_CATEGORY_PATHS];
};

type SearchableCatalogProduct = {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  inStock: boolean;
  sourceBrand?: string;
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

    const { products, source, failedSources } = await fetchBrandCatalogProducts({ brand });
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
        source,
        failedSources,
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

    const catalogResults = await Promise.all(
      brands.map(async (brand) => {
        const fetched = await fetchBrandCatalogProducts({ brand });
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
        sources: catalogResults.map((result) => ({
          brand: result.brand,
          source: result.source,
          failedSources: result.failedSources
        })),
        fetchedAt: new Date().toISOString()
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

    const { products, failedSources } = await fetchNaturaCatalogProducts({
      paths: categories
    });

    if (!products.length && failedSources.length === categories.length) {
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
        categories: categories.map(pathToSlug),
        failedCategories: failedSources.map(pathToSlug),
        fetchedAt: new Date().toISOString()
      }
    });
  })
);

export default router;
