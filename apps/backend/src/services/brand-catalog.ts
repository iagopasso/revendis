import { createHash } from 'crypto';
import {
  fetchNaturaCatalogProducts,
  type NaturaCatalogProduct
} from './natura-catalog';

export const CATALOG_BRANDS = [
  'avon',
  'mary-kay',
  'tupperware',
  'eudora',
  'boticario',
  'oui',
  'natura',
  'extase',
  'diamante'
] as const;

export type CatalogBrandSlug = (typeof CATALOG_BRANDS)[number];

export type BrandCatalogProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: number | null;
  inStock: boolean;
  url: string | null;
  imageUrl: string | null;
  sourceCategory: string;
  sourceBrand: CatalogBrandSlug;
};

export type BrandCatalogSource = 'sample' | 'upstream';

export type FetchBrandCatalogResult = {
  products: BrandCatalogProduct[];
  source: BrandCatalogSource;
  failedSources: string[];
};

export const CATALOG_BRAND_LABELS: Record<CatalogBrandSlug, string> = {
  avon: 'Avon',
  'mary-kay': 'Mary Kay',
  tupperware: 'Tupperware',
  eudora: 'Eudora',
  boticario: 'Boticario',
  oui: 'Oui',
  natura: 'Natura',
  extase: 'Extase',
  diamante: 'Diamante'
};

const CATALOG_BRAND_ALIASES: Record<CatalogBrandSlug, string[]> = {
  avon: ['avon'],
  'mary-kay': ['mary-kay', 'mary kay', 'marykay'],
  tupperware: ['tupperware', 'tupper', 'tuppware', 'tupparware', 'tupware'],
  eudora: ['eudora'],
  boticario: ['boticario', 'o boticario', 'o-boticario'],
  oui: ['oui'],
  natura: ['natura'],
  extase: ['extase', 'extasee', 'extasis', 'extasecosmeticos'],
  diamante: ['diamante']
};

const BRAND_BASE_URL: Record<CatalogBrandSlug, string> = {
  avon: 'https://www.avon.com.br',
  'mary-kay': 'https://loja.marykay.com.br',
  tupperware: 'https://www.tupperware.com.br',
  eudora: 'https://www.eudora.com.br',
  boticario: 'https://www.boticario.com.br',
  oui: 'https://www.boticario.com.br/perfumaria/oui',
  natura: 'https://www.natura.com.br',
  extase: 'https://www.extase.com.br',
  diamante: 'https://www.diamante.com.br'
};

type SampleProductInput = {
  sku: string;
  name: string;
  category: string;
  price: number;
  inStock?: boolean;
  imageUrl?: string | null;
};

type UpstreamFetchResult = {
  products: BrandCatalogProduct[];
  failedSources: string[];
};

type FetchJsonResult = {
  ok: boolean;
  status: number;
  json: unknown;
};

const DEFAULT_UPSTREAM_TIMEOUT_MS = 8000;
const MAX_VTEX_PAGES = 4;
const VTEX_PAGE_SIZE = 50;
const MAX_SHOPIFY_PAGES = 4;
const SHOPIFY_PAGE_SIZE = 250;
const AVON_PATHS = ['/', '/c/perfumaria', '/c/maquiagem', '/c/corpo-e-banho'] as const;

const BYPASS_UPSTREAM_FETCH =
  process.env.NODE_ENV === 'test' && process.env.CATALOG_ENABLE_UPSTREAM !== '1';

const normalizeBrandToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

const BRAND_BY_ALIAS = Object.entries(CATALOG_BRAND_ALIASES).reduce<
  Record<string, CatalogBrandSlug>
>((acc, [brand, aliases]) => {
  const typedBrand = brand as CatalogBrandSlug;
  aliases.forEach((alias) => {
    const token = normalizeBrandToken(alias);
    if (token) {
      acc[token] = typedBrand;
    }
  });
  acc[normalizeBrandToken(typedBrand)] = typedBrand;
  return acc;
}, {});

const decodeHtmlText = (value: string) =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeText = (value?: string | null) => {
  if (!value) return '';
  return decodeHtmlText(value.replace(/\\n/g, ' '));
};

const toAbsoluteUrl = (baseUrl: string, value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  if (normalized.startsWith('/')) return `${base}${normalized}`;
  return `${base}/${normalized}`;
};

const toPrice = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d,.-]/g, '');
    if (!cleaned) return null;
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const slugifyCategory = (value: string) => {
  const normalized = normalizeBrandToken(value);
  return normalized || 'catalogo';
};

const hashId = (value: string) =>
  createHash('sha1').update(value, 'utf8').digest('hex').slice(0, 16).toUpperCase();

const buildSampleProducts = (
  brand: CatalogBrandSlug,
  items: SampleProductInput[]
): BrandCatalogProduct[] => {
  const baseUrl = BRAND_BASE_URL[brand];
  return items.map((item) => ({
    id: `${brand.toUpperCase()}-${item.sku}`,
    sku: item.sku,
    name: item.name,
    brand: CATALOG_BRAND_LABELS[brand],
    price: item.price,
    inStock: item.inStock ?? true,
    url: `${baseUrl}/produto/${item.sku}`,
    imageUrl: item.imageUrl ?? null,
    sourceCategory: item.category,
    sourceBrand: brand
  }));
};

const SAMPLE_BRAND_PRODUCTS: Record<CatalogBrandSlug, BrandCatalogProduct[]> = {
  avon: buildSampleProducts('avon', [
    { sku: 'AV-FA-BEYOND-050', name: 'Far Away Beyond Deo Parfum 50ml', category: 'perfumaria', price: 119.9 },
    { sku: 'AV-PS-BASE-030', name: 'Power Stay Base Liquida 30ml', category: 'maquiagem', price: 69.9 },
    { sku: 'AV-RW-CR-DIA', name: 'Renew Creme Dia Antissinais', category: 'rosto', price: 89.9 }
  ]),
  'mary-kay': buildSampleProducts('mary-kay', [
    { sku: 'MK-TW3D-CR-DIA', name: 'TimeWise 3D Creme Dia FPS 30', category: 'rosto', price: 139.9 },
    { sku: 'MK-BT-GEL-SM', name: 'Batom Gel Semi-Matte', category: 'maquiagem', price: 49.9 },
    { sku: 'MK-SH-CR-MAOS', name: 'Satin Hands Creme para Maos', category: 'corpo-e-banho', price: 69.9 }
  ]),
  tupperware: buildSampleProducts('tupperware', [
    { sku: 'TP-TM-43L', name: 'Tigela Maravilhosa 4.3L', category: 'casa', price: 119.0 },
    { sku: 'TP-ET-10L', name: 'Eco Tupper Garrafa 1L', category: 'casa', price: 55.0 },
    { sku: 'TP-CF-14L', name: 'Caixa Fresh 1.4L', category: 'casa', price: 48.0 }
  ]),
  eudora: buildSampleProducts('eudora', [
    { sku: 'EU-SI-SHAM-NR', name: 'Siage Shampoo Nutri Rose 250ml', category: 'cabelos', price: 42.9 },
    { sku: 'EU-GL-BASE-SPF', name: 'Glam Skin Perfection Base', category: 'maquiagem', price: 79.9 },
    { sku: 'EU-IM-BLACK-100', name: 'Impression In Black Colonia 100ml', category: 'perfumaria', price: 109.9 }
  ]),
  boticario: buildSampleProducts('boticario', [
    { sku: 'BO-MALBEC-100', name: 'Malbec Desodorante Colonia 100ml', category: 'perfumaria', price: 149.9 },
    { sku: 'BO-NS-LO-AMEIXA', name: 'Nativa SPA Locao Ameixa', category: 'corpo-e-banho', price: 79.9 },
    { sku: 'BO-MB-BASE-CUSH', name: 'Make B. Base Cushion', category: 'maquiagem', price: 99.9 }
  ]),
  oui: buildSampleProducts('oui', [
    { sku: 'OUI-MADAME-075', name: 'Oui Madame Olympe Deo Parfum 75ml', category: 'perfumaria', price: 239.9 },
    { sku: 'OUI-GRASSE-075', name: 'Oui Jardin de Grasse Deo Parfum 75ml', category: 'perfumaria', price: 239.9 },
    { sku: 'OUI-LAMOUR-075', name: "Oui L'Amour Est Simple Deo Parfum 75ml", category: 'perfumaria', price: 219.9 }
  ]),
  natura: buildSampleProducts('natura', [
    { sku: 'NAT-ESS-EXCL-100', name: 'Essencial Exclusivo Deo Parfum 100ml', category: 'perfumaria', price: 198.9 },
    { sku: 'NAT-KAIAK-OCE-100', name: 'Kaiak Oceano Masculino 100ml', category: 'perfumaria', price: 134.9 },
    { sku: 'NAT-CHR-SERUM-30', name: 'Chronos Derma Serum Intensivo 30ml', category: 'rosto', price: 132.9 }
  ]),
  extase: buildSampleProducts('extase', [
    { sku: 'EX-EAU-GOLD-100', name: 'Extase Gold Eau de Parfum 100ml', category: 'perfumaria', price: 169.9 },
    { sku: 'EX-HY-BODY-200', name: 'Extase Hydration Body Lotion 200ml', category: 'corpo-e-banho', price: 64.9 },
    { sku: 'EX-LIP-VELVET', name: 'Extase Velvet Lip Tint', category: 'maquiagem', price: 39.9 }
  ]),
  diamante: buildSampleProducts('diamante', [
    { sku: 'DI-BR-PERF-100', name: 'Diamante Brilho Perfume 100ml', category: 'perfumaria', price: 114.9 },
    { sku: 'DI-SL-SAB-250', name: 'Diamante Sabonete Liquido 250ml', category: 'corpo-e-banho', price: 34.9 },
    { sku: 'DI-SK-BASE-030', name: 'Diamante Skin Base Fluida 30ml', category: 'maquiagem', price: 72.9 }
  ])
};

const cloneProducts = (products: BrandCatalogProduct[]) =>
  products.map((product) => ({ ...product }));

const mapNaturaProduct = (product: NaturaCatalogProduct): BrandCatalogProduct => ({
  id: product.id,
  sku: product.sku,
  name: product.name,
  brand: product.brand || CATALOG_BRAND_LABELS.natura,
  price: product.price ?? null,
  inStock: product.inStock,
  url: product.url || null,
  imageUrl: product.imageUrl || null,
  sourceCategory: product.sourceCategory || 'catalogo',
  sourceBrand: 'natura'
});

const withTimeoutController = (timeoutMs: number, signal?: AbortSignal) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  const abortHandler = () => controller.abort();

  if (signal) {
    signal.addEventListener('abort', abortHandler);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  };
};

const fetchTextWithTimeout = async ({
  url,
  timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS,
  signal
}: {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}) => {
  const wrapped = withTimeoutController(timeoutMs, signal);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; RevendisCatalogBot/1.0)'
      },
      signal: wrapped.signal
    });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    return response.text();
  } finally {
    wrapped.cleanup();
  }
};

const fetchJsonWithTimeout = async ({
  url,
  timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS,
  signal
}: {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<FetchJsonResult> => {
  const wrapped = withTimeoutController(timeoutMs, signal);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; RevendisCatalogBot/1.0)'
      },
      signal: wrapped.signal
    });

    const body = (await response.json().catch(() => null)) as unknown;
    return {
      ok: response.ok,
      status: response.status,
      json: body
    };
  } finally {
    wrapped.cleanup();
  }
};

const extractJsonLdProducts = ({
  html,
  brand,
  sourceBrand,
  sourcePath,
  baseUrl
}: {
  html: string;
  brand: string;
  sourceBrand: CatalogBrandSlug;
  sourcePath: string;
  baseUrl: string;
}) => {
  const results: BrandCatalogProduct[] = [];
  const seen = new Set<string>();
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const pushProduct = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const raw = node as Record<string, unknown>;
    const typeValue = raw['@type'];
    const type =
      typeof typeValue === 'string'
        ? typeValue.toLowerCase()
        : Array.isArray(typeValue) && typeof typeValue[0] === 'string'
          ? typeValue[0].toLowerCase()
          : '';

    if (!type.includes('product')) return;

    const name = normalizeText(
      typeof raw.name === 'string'
        ? raw.name
        : typeof raw.title === 'string'
          ? raw.title
          : ''
    );
    if (!name) return;

    const sku = normalizeText(
      typeof raw.sku === 'string'
        ? raw.sku
        : typeof raw.productID === 'string'
          ? raw.productID
          : typeof raw.mpn === 'string'
            ? raw.mpn
            : ''
    );

    const url = toAbsoluteUrl(
      baseUrl,
      typeof raw.url === 'string' ? raw.url : typeof raw['@id'] === 'string' ? raw['@id'] : ''
    );
    const imageCandidate = Array.isArray(raw.image) ? raw.image[0] : raw.image;
    const imageUrl = toAbsoluteUrl(baseUrl, typeof imageCandidate === 'string' ? imageCandidate : '');

    const offers = raw.offers;
    const offerValue = Array.isArray(offers) ? offers[0] : offers;
    const offer = offerValue && typeof offerValue === 'object' ? (offerValue as Record<string, unknown>) : null;
    const price = toPrice(offer?.price ?? offer?.lowPrice ?? offer?.highPrice ?? raw.price);

    const availability = normalizeText(
      typeof offer?.availability === 'string' ? offer.availability : ''
    ).toLowerCase();

    const inStock = availability
      ? availability.includes('instock') && !availability.includes('outofstock')
      : true;

    const explicitBrand = raw.brand;
    const resolvedBrand =
      typeof explicitBrand === 'string'
        ? normalizeText(explicitBrand)
        : explicitBrand && typeof explicitBrand === 'object' && typeof (explicitBrand as { name?: unknown }).name === 'string'
          ? normalizeText((explicitBrand as { name: string }).name)
          : brand;

    const id = sku || `AUTO-${sourceBrand.toUpperCase()}-${hashId(`${name}|${url || sourcePath}`)}`;
    if (seen.has(id)) return;
    seen.add(id);

    results.push({
      id,
      sku: sku || id,
      name,
      brand: resolvedBrand || brand,
      price,
      inStock,
      url,
      imageUrl,
      sourceCategory: slugifyCategory(sourcePath),
      sourceBrand
    });
  };

  const visitNode = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visitNode);
      return;
    }
    if (typeof node !== 'object') return;
    pushProduct(node);
    const raw = node as Record<string, unknown>;
    Object.values(raw).forEach((value) => visitNode(value));
  };

  let match = scriptRegex.exec(html);
  while (match) {
    const payload = normalizeText(match[1]);
    if (payload) {
      try {
        const parsed = JSON.parse(payload) as unknown;
        visitNode(parsed);
      } catch {
        // Ignore invalid json-ld blocks.
      }
    }
    match = scriptRegex.exec(html);
  }

  return results;
};

const parseAvonCatalogProducts = (html: string, sourcePath: string): BrandCatalogProduct[] => {
  const results: BrandCatalogProduct[] = [];
  const seen = new Set<string>();
  const needle = 'id="AVNBRA-';
  let index = 0;

  while (index < html.length) {
    const start = html.indexOf(needle, index);
    if (start === -1) break;

    const snippet = html.slice(start, Math.min(start + 8500, html.length));
    const skuMatch = snippet.match(/^id="(AVNBRA-[A-Z0-9]+)/i);
    const hrefMatch = snippet.match(/href="([^"]*\/p\/[^"]*\/(AVNBRA-[A-Z0-9]+)[^"]*)"/i);
    const nameMatch = snippet.match(/<h4[^>]*>([^<]+)<\/h4>/i);
    const brandMatch = snippet.match(/aria-label="Marca ([^"]+)"/i);
    const priceMatch = snippet.match(/id="product-price-por">([^<]+)</i);
    const imageMatch = snippet.match(/src="([^"]*AVNBRA-[^"]+)"/i);

    const sku = normalizeText(skuMatch?.[1] || hrefMatch?.[2] || '');
    const name = normalizeText(nameMatch?.[1] || '');
    const href = toAbsoluteUrl(BRAND_BASE_URL.avon, hrefMatch?.[1] || '');

    if (sku && name && href && !seen.has(sku)) {
      seen.add(sku);
      results.push({
        id: sku,
        sku,
        name,
        brand: normalizeText(brandMatch?.[1] || CATALOG_BRAND_LABELS.avon),
        price: toPrice(priceMatch?.[1] || null),
        inStock: !snippet.toLowerCase().includes('esgotado'),
        url: href,
        imageUrl: toAbsoluteUrl(BRAND_BASE_URL.avon, imageMatch?.[1] || ''),
        sourceCategory: slugifyCategory(sourcePath),
        sourceBrand: 'avon'
      });
    }

    index = start + needle.length;
  }

  if (results.length === 0) {
    return extractJsonLdProducts({
      html,
      brand: CATALOG_BRAND_LABELS.avon,
      sourceBrand: 'avon',
      sourcePath,
      baseUrl: BRAND_BASE_URL.avon
    });
  }

  return results;
};

const mapVtexProduct = ({
  raw,
  sourceBrand,
  sourceCategory
}: {
  raw: Record<string, unknown>;
  sourceBrand: CatalogBrandSlug;
  sourceCategory: string;
}): BrandCatalogProduct | null => {
  const productId = normalizeText(
    typeof raw.productId === 'string' ? raw.productId : typeof raw.productReference === 'string' ? raw.productReference : ''
  );
  const name = normalizeText(
    typeof raw.productName === 'string'
      ? raw.productName
      : typeof raw.productTitle === 'string'
        ? raw.productTitle
        : ''
  );
  const brand = normalizeText(typeof raw.brand === 'string' ? raw.brand : CATALOG_BRAND_LABELS[sourceBrand]);
  const url = toAbsoluteUrl(BRAND_BASE_URL[sourceBrand], typeof raw.link === 'string' ? raw.link : '');

  if (!name || !url) return null;

  const items = Array.isArray(raw.items) ? raw.items : [];
  const firstItem =
    items[0] && typeof items[0] === 'object' ? (items[0] as Record<string, unknown>) : null;

  const sellers = firstItem && Array.isArray(firstItem.sellers) ? firstItem.sellers : [];
  const firstSeller =
    sellers[0] && typeof sellers[0] === 'object' ? (sellers[0] as Record<string, unknown>) : null;
  const offer =
    firstSeller &&
    firstSeller.commertialOffer &&
    typeof firstSeller.commertialOffer === 'object'
      ? (firstSeller.commertialOffer as Record<string, unknown>)
      : null;

  const availableQuantity =
    typeof offer?.AvailableQuantity === 'number' ? offer.AvailableQuantity : null;
  const inStock = availableQuantity === null ? true : availableQuantity > 0;

  const images = firstItem && Array.isArray(firstItem.images) ? firstItem.images : [];
  const firstImage =
    images[0] && typeof images[0] === 'object' ? (images[0] as Record<string, unknown>) : null;
  const imageUrl = toAbsoluteUrl(
    BRAND_BASE_URL[sourceBrand],
    typeof firstImage?.imageUrl === 'string' ? firstImage.imageUrl : ''
  );

  const fallbackSku = normalizeText(
    firstItem && typeof firstItem.itemId === 'string' ? firstItem.itemId : ''
  );

  const id = productId || fallbackSku || `VTEX-${sourceBrand.toUpperCase()}-${hashId(url)}`;
  const sku = productId || fallbackSku || id;

  return {
    id,
    sku,
    name,
    brand: brand || CATALOG_BRAND_LABELS[sourceBrand],
    price: toPrice(offer?.Price ?? offer?.PriceWithoutDiscount ?? null),
    inStock,
    url,
    imageUrl,
    sourceCategory,
    sourceBrand
  };
};

const fetchVtexCatalogProducts = async ({
  brand,
  baseUrl,
  filterFn,
  signal
}: {
  brand: CatalogBrandSlug;
  baseUrl: string;
  filterFn?: (product: BrandCatalogProduct) => boolean;
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const products: BrandCatalogProduct[] = [];
  const deduped = new Map<string, BrandCatalogProduct>();
  const failedSources: string[] = [];

  for (let page = 0; page < MAX_VTEX_PAGES; page += 1) {
    const from = page * VTEX_PAGE_SIZE;
    const to = from + VTEX_PAGE_SIZE - 1;
    const url = `${baseUrl.replace(/\/$/, '')}/api/catalog_system/pub/products/search?_from=${from}&_to=${to}`;

    try {
      const response = await fetchJsonWithTimeout({ url, signal });
      if (!response.ok || !Array.isArray(response.json)) {
        failedSources.push(url);
        break;
      }

      const parsed = (response.json as unknown[])
        .map((item) =>
          item && typeof item === 'object'
            ? mapVtexProduct({
                raw: item as Record<string, unknown>,
                sourceBrand: brand,
                sourceCategory: 'catalogo'
              })
            : null
        )
        .filter((item): item is BrandCatalogProduct => item !== null);

      if (!parsed.length) {
        break;
      }

      parsed.forEach((product) => {
        if (!filterFn || filterFn(product)) {
          deduped.set(product.id, product);
        }
      });

      if (parsed.length < VTEX_PAGE_SIZE) {
        break;
      }
    } catch {
      failedSources.push(url);
      break;
    }
  }

  products.push(...Array.from(deduped.values()));
  return {
    products,
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchTupperwareCatalogProducts = async ({
  signal
}: {
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const failedSources: string[] = [];
  const deduped = new Map<string, BrandCatalogProduct>();

  for (let page = 1; page <= MAX_SHOPIFY_PAGES; page += 1) {
    const url = `${BRAND_BASE_URL.tupperware}/products.json?limit=${SHOPIFY_PAGE_SIZE}&page=${page}`;

    try {
      const response = await fetchJsonWithTimeout({ url, signal });
      if (!response.ok || !response.json || typeof response.json !== 'object') {
        failedSources.push(url);
        break;
      }

      const productsRaw = (response.json as { products?: unknown[] }).products;
      if (!Array.isArray(productsRaw) || productsRaw.length === 0) {
        break;
      }

      for (const raw of productsRaw) {
        if (!raw || typeof raw !== 'object') continue;
        const product = raw as Record<string, unknown>;
        const variants = Array.isArray(product.variants) ? product.variants : [];
        const firstVariant =
          variants[0] && typeof variants[0] === 'object'
            ? (variants[0] as Record<string, unknown>)
            : null;

        const images = Array.isArray(product.images) ? product.images : [];
        const firstImage =
          images[0] && typeof images[0] === 'object'
            ? (images[0] as Record<string, unknown>)
            : null;

        const name = normalizeText(typeof product.title === 'string' ? product.title : '');
        const handle = normalizeText(typeof product.handle === 'string' ? product.handle : '');
        const sku = normalizeText(
          firstVariant && typeof firstVariant.sku === 'string' ? firstVariant.sku : ''
        );
        const id = sku || `TW-${normalizeText(String(product.id ?? ''))}`;
        const urlValue = handle ? `${BRAND_BASE_URL.tupperware}/products/${handle}` : null;

        if (!name || !id || !urlValue) continue;

        const mapped: BrandCatalogProduct = {
          id,
          sku: sku || id,
          name,
          brand: CATALOG_BRAND_LABELS.tupperware,
          price: toPrice(firstVariant?.price ?? null),
          inStock:
            firstVariant && typeof firstVariant.available === 'boolean'
              ? firstVariant.available
              : true,
          url: urlValue,
          imageUrl: toAbsoluteUrl(BRAND_BASE_URL.tupperware, typeof firstImage?.src === 'string' ? firstImage.src : ''),
          sourceCategory: slugifyCategory(
            typeof product.product_type === 'string' ? product.product_type : 'casa'
          ),
          sourceBrand: 'tupperware'
        };

        deduped.set(mapped.id, mapped);
      }

      if (productsRaw.length < SHOPIFY_PAGE_SIZE) {
        break;
      }
    } catch {
      failedSources.push(url);
      break;
    }
  }

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchMaryKayCatalogProducts = async ({
  signal
}: {
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> =>
  fetchVtexCatalogProducts({
    brand: 'mary-kay',
    baseUrl: BRAND_BASE_URL['mary-kay'],
    signal
  });

const fetchAvonCatalogProducts = async ({
  signal
}: {
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const deduped = new Map<string, BrandCatalogProduct>();
  const failedSources: string[] = [];

  for (const path of AVON_PATHS) {
    const url = `${BRAND_BASE_URL.avon}${path}`;
    try {
      const html = await fetchTextWithTimeout({ url, signal });
      const parsed = parseAvonCatalogProducts(html, path);
      parsed.forEach((product) => {
        deduped.set(product.id, product);
      });
    } catch {
      failedSources.push(url);
    }
  }

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchGenericBrandCatalogProducts = async ({
  brand,
  baseUrl,
  paths,
  signal
}: {
  brand: CatalogBrandSlug;
  baseUrl: string;
  paths: string[];
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const deduped = new Map<string, BrandCatalogProduct>();
  const failedSources: string[] = [];

  for (const path of paths) {
    const url = `${baseUrl}${path}`;
    try {
      const html = await fetchTextWithTimeout({ url, signal });
      const parsed = extractJsonLdProducts({
        html,
        brand: CATALOG_BRAND_LABELS[brand],
        sourceBrand: brand,
        sourcePath: path,
        baseUrl
      });
      parsed.forEach((product) => {
        deduped.set(product.id, product);
      });
    } catch {
      failedSources.push(url);
    }
  }

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchUpstreamBrandProducts = async ({
  brand,
  signal
}: {
  brand: CatalogBrandSlug;
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  switch (brand) {
    case 'avon':
      return fetchAvonCatalogProducts({ signal });
    case 'mary-kay':
      return fetchMaryKayCatalogProducts({ signal });
    case 'tupperware':
      return fetchTupperwareCatalogProducts({ signal });
    case 'eudora':
      return fetchVtexCatalogProducts({
        brand: 'eudora',
        baseUrl: BRAND_BASE_URL.eudora,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('eudora'),
        signal
      });
    case 'boticario':
      return fetchVtexCatalogProducts({
        brand: 'boticario',
        baseUrl: BRAND_BASE_URL.boticario,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('boticario'),
        signal
      });
    case 'oui':
      return fetchVtexCatalogProducts({
        brand: 'oui',
        baseUrl: BRAND_BASE_URL.boticario,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('oui'),
        signal
      });
    case 'extase':
      return fetchGenericBrandCatalogProducts({
        brand: 'extase',
        baseUrl: BRAND_BASE_URL.extase,
        paths: ['/', '/shop'],
        signal
      });
    case 'diamante':
      return fetchGenericBrandCatalogProducts({
        brand: 'diamante',
        baseUrl: BRAND_BASE_URL.diamante,
        paths: ['/'],
        signal
      });
    case 'natura':
      return {
        products: [],
        failedSources: []
      };
  }
};

export const resolveCatalogBrandSlug = (value: string): CatalogBrandSlug | null => {
  const token = normalizeBrandToken(value);
  if (!token) return null;
  return BRAND_BY_ALIAS[token] || null;
};

export const getSampleBrandCatalogProducts = (brand: CatalogBrandSlug): BrandCatalogProduct[] =>
  cloneProducts(SAMPLE_BRAND_PRODUCTS[brand]);

export const fetchBrandCatalogProducts = async ({
  brand,
  signal
}: {
  brand: CatalogBrandSlug;
  signal?: AbortSignal;
}): Promise<FetchBrandCatalogResult> => {
  if (BYPASS_UPSTREAM_FETCH) {
    return {
      products: getSampleBrandCatalogProducts(brand),
      source: 'sample',
      failedSources: []
    };
  }

  if (brand === 'natura') {
    try {
      const { products, failedSources } = await fetchNaturaCatalogProducts({ signal });
      const mapped = products.map(mapNaturaProduct);

      if (mapped.length > 0) {
        return {
          products: mapped,
          source: 'upstream',
          failedSources
        };
      }

      return {
        products: getSampleBrandCatalogProducts('natura'),
        source: 'sample',
        failedSources: failedSources.length ? failedSources : ['natura.com.br']
      };
    } catch {
      return {
        products: getSampleBrandCatalogProducts('natura'),
        source: 'sample',
        failedSources: ['natura.com.br']
      };
    }
  }

  const upstream = await fetchUpstreamBrandProducts({ brand, signal }).catch(
    () =>
      ({
        products: [],
        failedSources: [BRAND_BASE_URL[brand]]
      }) as UpstreamFetchResult
  );

  if (upstream.products.length > 0) {
    return {
      products: upstream.products,
      source: 'upstream',
      failedSources: upstream.failedSources
    };
  }

  return {
    products: getSampleBrandCatalogProducts(brand),
    source: 'sample',
    failedSources: upstream.failedSources.length ? upstream.failedSources : [BRAND_BASE_URL[brand]]
  };
};
