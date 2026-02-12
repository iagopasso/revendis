import { createHash } from 'crypto';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_PAGES = 120;
const MAX_SITEMAP_FILES = 30;
const MAX_LINKS_FROM_HTML = 300;

export type CollectedCatalogProduct = {
  code: string;
  sku: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  price: number | null;
  purchasePrice: number | null;
  inStock: boolean;
  imageUrl: string | null;
  sourceCategory: string;
  sourceUrl: string | null;
};

export type WebsiteCatalogCollectionResult = {
  products: CollectedCatalogProduct[];
  scannedUrls: number;
  sourceUrls: string[];
  failedUrls: Array<{ url: string; error: string }>;
};

type CollectWebsiteCatalogProductsInput = {
  siteUrl: string;
  productUrls?: string[];
  pathHints?: string[];
  maxPages?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const normalizeText = (value?: string | null) =>
  (value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

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

const normalizeBarcode = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return null;
  const digits = text.replace(/\D+/g, '');
  if (digits.length >= 8 && digits.length <= 18) return digits;
  return null;
};

const normalizeCodeToken = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();

const hashToken = (value: string) =>
  createHash('sha1').update(value, 'utf8').digest('hex').slice(0, 16).toUpperCase();

const withTimeoutSignal = (timeoutMs: number, signal?: AbortSignal) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  const abortListener = () => controller.abort();
  if (signal) {
    signal.addEventListener('abort', abortListener);
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  };
};

const fetchTextWithTimeout = async ({
  url,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal
}: {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}) => {
  const wrapped = withTimeoutSignal(timeoutMs, signal);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; RevendisCatalogCollector/1.0)'
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

const toAbsoluteUrl = (baseUrl: string, value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return null;
  }
};

const getNestedValue = (raw: Record<string, unknown>, path: string[]) => {
  let current: unknown = raw;
  for (const part of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const extractImageFromValue = (value: unknown, pageUrl: string): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    return toAbsoluteUrl(pageUrl, value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractImageFromValue(item, pageUrl);
      if (extracted) return extracted;
    }
    return null;
  }

  if (typeof value !== 'object') return null;
  const objectValue = value as Record<string, unknown>;
  for (const key of ['url', 'src', 'href', 'content', 'absURL', 'absUrl']) {
    const extracted = extractImageFromValue(objectValue[key], pageUrl);
    if (extracted) return extracted;
  }

  for (const nested of Object.values(objectValue)) {
    const extracted = extractImageFromValue(nested, pageUrl);
    if (extracted) return extracted;
  }

  return null;
};

const extractBarcodeFromRaw = (raw: Record<string, unknown>) => {
  const directCandidates = [
    raw.gtin13,
    raw.gtin14,
    raw.gtin12,
    raw.gtin8,
    raw.gtin,
    raw.barcode,
    raw.ean,
    raw.upc
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeBarcode(candidate);
    if (normalized) return normalized;
  }

  const paths = [
    ['offers', 'gtin13'],
    ['offers', 'gtin14'],
    ['offers', 'gtin12'],
    ['offers', 'gtin8'],
    ['offers', 'gtin'],
    ['offers', 'barcode'],
    ['offers', 'ean'],
    ['offers', 'upc']
  ];

  for (const path of paths) {
    const normalized = normalizeBarcode(getNestedValue(raw, path));
    if (normalized) return normalized;
  }

  return null;
};

const extractSourceCategoryFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return 'website';
    return parts[0].toLowerCase();
  } catch {
    return 'website';
  }
};

const parseJsonLdProductsFromHtml = (html: string, pageUrl: string): CollectedCatalogProduct[] => {
  const products = new Map<string, CollectedCatalogProduct>();
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const pushProduct = (raw: Record<string, unknown>) => {
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

    const code = normalizeText(
      typeof raw.sku === 'string'
        ? raw.sku
        : typeof raw.productID === 'string'
          ? raw.productID
          : typeof raw.mpn === 'string'
            ? raw.mpn
            : ''
    );

    const brandValue = raw.brand;
    const brand =
      typeof brandValue === 'string'
        ? normalizeText(brandValue)
        : brandValue &&
            typeof brandValue === 'object' &&
            typeof (brandValue as { name?: unknown }).name === 'string'
          ? normalizeText((brandValue as { name: string }).name)
          : '';

    const offersValue = Array.isArray(raw.offers) ? raw.offers[0] : raw.offers;
    const offer =
      offersValue && typeof offersValue === 'object'
        ? (offersValue as Record<string, unknown>)
        : null;
    const price = toPrice(offer?.price ?? offer?.lowPrice ?? offer?.highPrice ?? raw.price);
    const availability = normalizeText(
      typeof offer?.availability === 'string' ? offer.availability : ''
    ).toLowerCase();
    const inStock = availability
      ? availability.includes('instock') && !availability.includes('outofstock')
      : true;

    const imageValue = Array.isArray(raw.image) ? raw.image[0] : raw.image;
    const imageUrl = extractImageFromValue(imageValue, pageUrl);
    const barcode = extractBarcodeFromRaw(raw);
    const rawUrl =
      typeof raw.url === 'string'
        ? raw.url
        : typeof raw['@id'] === 'string'
          ? raw['@id']
          : pageUrl;
    const sourceUrl = toAbsoluteUrl(pageUrl, rawUrl) || pageUrl;

    const resolvedCode = code || `AUTO-${hashToken(`${name}|${sourceUrl}`)}`;
    const sku = code || resolvedCode;
    const key = normalizeCodeToken(`${barcode || ''}|${resolvedCode}|${sourceUrl}|${name}`);
    if (products.has(key)) return;

    products.set(key, {
      code: resolvedCode,
      sku,
      name,
      brand: brand || null,
      barcode,
      price,
      purchasePrice: null,
      inStock,
      imageUrl,
      sourceCategory: extractSourceCategoryFromUrl(sourceUrl),
      sourceUrl
    });
  };

  const visitNode = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visitNode(item));
      return;
    }
    if (typeof node !== 'object') return;
    const raw = node as Record<string, unknown>;
    pushProduct(raw);
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
        // Ignore malformed blocks and continue.
      }
    }
    match = scriptRegex.exec(html);
  }

  return Array.from(products.values());
};

const parseLocsFromSitemap = (xml: string) =>
  [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => normalizeText(match[1]))
    .filter(Boolean);

const extractLinksFromHtml = (html: string, baseUrl: string) =>
  [...html.matchAll(/href="([^"]+)"/gi)]
    .map((match) => toAbsoluteUrl(baseUrl, match[1]))
    .filter((value): value is string => Boolean(value));

const isLikelyProductUrl = (url: URL, hints: string[]) => {
  const pathname = url.pathname.toLowerCase();
  const defaultHints = ['/p/', '/produto', '/product', '/produtos/', '/item/', '/sku/'];
  const allHints = Array.from(new Set([...defaultHints, ...hints]));
  return allHints.some((hint) => pathname.includes(hint.toLowerCase()));
};

const discoverProductUrls = async ({
  siteUrl,
  productUrls,
  pathHints,
  maxPages,
  timeoutMs,
  signal
}: {
  siteUrl: string;
  productUrls?: string[];
  pathHints: string[];
  maxPages: number;
  timeoutMs: number;
  signal?: AbortSignal;
}) => {
  const origin = new URL(siteUrl).origin;
  const candidates = new Set<string>();

  const addCandidate = (value?: string | null) => {
    if (!value) return;
    try {
      const parsed = new URL(value, siteUrl);
      if (parsed.origin !== origin) return;
      if (!isLikelyProductUrl(parsed, pathHints)) return;
      candidates.add(parsed.toString());
    } catch {
      // ignore malformed urls
    }
  };

  (productUrls || []).forEach((url) => addCandidate(url));

  try {
    const landingHtml = await fetchTextWithTimeout({
      url: siteUrl,
      timeoutMs,
      signal
    });
    extractLinksFromHtml(landingHtml, siteUrl)
      .slice(0, MAX_LINKS_FROM_HTML)
      .forEach((href) => addCandidate(href));
  } catch {
    // Keep going with provided URLs/sitemap.
  }

  const sitemapQueue = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const visitedSitemaps = new Set<string>();

  while (sitemapQueue.length > 0 && visitedSitemaps.size < MAX_SITEMAP_FILES) {
    const sitemapUrl = sitemapQueue.shift();
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);

    try {
      const xml = await fetchTextWithTimeout({
        url: sitemapUrl,
        timeoutMs,
        signal
      });
      const locs = parseLocsFromSitemap(xml);
      locs.forEach((loc) => {
        if (loc.endsWith('.xml')) {
          if (visitedSitemaps.size + sitemapQueue.length < MAX_SITEMAP_FILES) {
            sitemapQueue.push(loc);
          }
          return;
        }
        addCandidate(loc);
      });
    } catch {
      // sitemap optional
    }
  }

  return Array.from(candidates).slice(0, maxPages);
};

export const collectWebsiteCatalogProducts = async ({
  siteUrl,
  productUrls = [],
  pathHints = [],
  maxPages = DEFAULT_MAX_PAGES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal
}: CollectWebsiteCatalogProductsInput): Promise<WebsiteCatalogCollectionResult> => {
  const sanitizedMaxPages = Math.min(400, Math.max(1, Math.trunc(maxPages)));
  const urls = await discoverProductUrls({
    siteUrl,
    productUrls,
    pathHints,
    maxPages: sanitizedMaxPages,
    timeoutMs,
    signal
  });

  const productsMap = new Map<string, CollectedCatalogProduct>();
  const failedUrls: Array<{ url: string; error: string }> = [];

  const concurrency = Math.min(6, Math.max(1, urls.length));
  let pointer = 0;
  const workers = Array.from({ length: concurrency }).map(async () => {
    while (true) {
      if (signal?.aborted) return;
      const index = pointer;
      pointer += 1;
      if (index >= urls.length) return;

      const url = urls[index];
      try {
        const html = await fetchTextWithTimeout({
          url,
          timeoutMs,
          signal
        });
        const parsed = parseJsonLdProductsFromHtml(html, url);
        parsed.forEach((item) => {
          const key = normalizeCodeToken(
            `${item.barcode || ''}|${item.code}|${item.sku}|${item.sourceUrl || url}`
          );
          if (!productsMap.has(key)) {
            productsMap.set(key, item);
          }
        });
      } catch (error) {
        failedUrls.push({
          url,
          error: error instanceof Error ? error.message : 'fetch_failed'
        });
      }
    }
  });

  await Promise.all(workers);

  return {
    products: Array.from(productsMap.values()),
    scannedUrls: urls.length,
    sourceUrls: urls,
    failedUrls
  };
};
