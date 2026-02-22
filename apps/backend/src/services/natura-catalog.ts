import { createHash } from 'crypto';

const NATURA_BASE_URL = 'https://www.natura.com.br';
const NATURA_BFF_BASE_URL = `${NATURA_BASE_URL}/bff-app-natura-brazil`;
const NATURA_BFF_SEARCH_EXPAND = 'prices,availability,images,variations';
const NATURA_BFF_API_KEY =
  process.env.NATURA_BFF_API_KEY || 'fTo8UT5bjg9C6EIidaTEG7Zs3Syz6CzR7ADI4sL7';
const NATURA_BFF_TENANT_ID = process.env.NATURA_BFF_TENANT_ID || 'brazil-natura-web';
const NATURA_BFF_PAGE_SIZE = Number(process.env.NATURA_BFF_PAGE_SIZE || 100);
const NATURA_BFF_MAX_PAGES = Number(process.env.NATURA_BFF_MAX_PAGES || 120);
const NATURA_ENABLE_ROOT_CATALOG_STRATEGY = process.env.NATURA_ENABLE_ROOT_CATALOG_STRATEGY !== '0';
const NATURA_ROOT_CATALOG_PATHS = ['/c/root', '/c/natura'] as const;
const NATURA_ROOT_CATALOG_MIN_PRODUCTS = Number(process.env.NATURA_ROOT_CATALOG_MIN_PRODUCTS || 80);
const DEFAULT_TIMEOUT_MS = 12000;
const NATURA_CONSULTANT_AUTH_URL =
  process.env.NATURA_CONSULTANT_AUTH_URL ||
  'https://www.natura.com.br/login?redirect=/acesso-consultor';
const NATURA_CONSULTANT_AUTH_USER_FIELD =
  process.env.NATURA_CONSULTANT_AUTH_USER_FIELD || 'login';
const NATURA_CONSULTANT_AUTH_PASSWORD_FIELD =
  process.env.NATURA_CONSULTANT_AUTH_PASSWORD_FIELD || 'password';
const NATURA_CONSULTANT_AUTH_BODY_FORMAT =
  process.env.NATURA_CONSULTANT_AUTH_BODY_FORMAT === 'json' ? 'json' : 'form';

const CONSULTANT_TOKEN_KEYS = new Set([
  'token',
  'accessToken',
  'access_token',
  'idToken',
  'id_token',
  'jwt'
]);

export const NATURA_CATEGORY_PATHS = [
  '/c/promocoes',
  '/c/presentes',
  '/c/perfumaria',
  '/c/corpo-e-banho',
  '/c/cabelos',
  '/c/maquiagem',
  '/c/rosto',
  '/c/casa',
  '/c/infantil',
  '/c/homens',
  '/c/marcas'
] as const;

const NATURA_FETCH_PROFILES: Array<{
  id: string;
  headers: Record<string, string>;
}> = [
  {
    id: 'undici-default',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8'
    }
  },
  {
    id: 'curl',
    headers: {
      accept: '*/*',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'user-agent': 'curl/8.7.1'
    }
  },
  {
    id: 'revendis-bot',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'user-agent': 'Mozilla/5.0 (compatible; RevendisNaturaCatalogBot/1.0)'
    }
  }
];

const NATURA_BFF_FETCH_PROFILES: Array<{
  id: string;
  userAgent?: string;
}> = [
  {
    id: 'bff-default'
  },
  {
    id: 'bff-curl',
    userAgent: 'curl/8.7.1'
  },
  {
    id: 'bff-bot',
    userAgent: 'Mozilla/5.0 (compatible; RevendisNaturaCatalogBot/1.0)'
  }
];

export type NaturaCategoryPath = (typeof NATURA_CATEGORY_PATHS)[number];

export type NaturaCatalogProduct = {
  id: string;
  sku: string;
  code: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  price: number | null;
  purchasePrice: number | null;
  inStock: boolean;
  url: string;
  imageUrl: string | null;
  sourceCategory: string;
};

type FetchNaturaRequestAuth = {
  bearerToken?: string;
  cookie?: string;
  headers?: Record<string, string>;
};

type FetchNaturaCatalogOptions = {
  paths?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
  requestAuth?: FetchNaturaRequestAuth;
};

type FetchNaturaCatalogResult = {
  products: NaturaCatalogProduct[];
  failedSources: string[];
  failedDetails: FetchNaturaFailureDetail[];
  resolvedPaths: string[];
};

export type NaturaFetchAttempt = {
  profile: string;
  error: string;
};

export type FetchNaturaFailureDetail = {
  source: string;
  error: string;
  attempts: NaturaFetchAttempt[];
};

export type NaturaConsultantCredentials = {
  login: string;
  password: string;
};

type NaturaConsultantSession = {
  bearerToken: string | null;
  cookie: string | null;
};

type LoginNaturaConsultantOptions = {
  credentials: NaturaConsultantCredentials;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type FetchNaturaConsultantCatalogOptions = {
  credentials: NaturaConsultantCredentials;
  paths?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
};

const normalizeText = (value?: string | null) => {
  if (!value) return '';
  return value
    .replace(/\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

const hashId = (value: string) =>
  createHash('sha1').update(value, 'utf8').digest('hex').slice(0, 16).toUpperCase();

const toSourceCategory = (sourcePath: string) =>
  sourcePath.startsWith('/c/') ? sourcePath.slice(3) : sourcePath;

const safePositiveInt = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;

const normalizeCategoryPath = (value: string): string | null => {
  const cleaned = normalizeText(value).replace(/&amp;/g, '&');
  if (!cleaned) return null;

  let pathname = cleaned;

  try {
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      const parsed = new URL(cleaned);
      pathname = parsed.pathname;
    } else if (cleaned.startsWith('/')) {
      pathname = new URL(cleaned, NATURA_BASE_URL).pathname;
    } else {
      pathname = new URL(`/${cleaned}`, NATURA_BASE_URL).pathname;
    }
  } catch {
    return null;
  }

  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    decodedPath = pathname;
  }

  const normalized = decodedPath.replace(/\/+$/, '').toLowerCase();
  if (!normalized.startsWith('/c/') || normalized.length <= 3) return null;

  return normalized;
};

const parseCategoryLinksFromHtml = (html: string): string[] => {
  const decoded = decodeNaturaHtml(html).replace(/&amp;/g, '&');
  const links = [...decoded.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const parsed = links
    .map((href) => normalizeCategoryPath(href))
    .filter((path): path is string => Boolean(path));

  return Array.from(new Set(parsed));
};

const toAbsoluteUrl = (value: string) => {
  if (!value) return NATURA_BASE_URL;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/')) return `${NATURA_BASE_URL}${value}`;
  return `${NATURA_BASE_URL}/${value}`;
};

const decodeNaturaHtml = (html: string) =>
  html
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"');

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

const extractJsonObject = (text: string, objectStart: number) => {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(objectStart, index + 1);
      }
    }
  }

  return null;
};

const getNestedValue = (raw: Record<string, unknown>, path: string[]) => {
  let current: unknown = raw;

  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }

  return current;
};

const pickFirstPrice = (raw: Record<string, unknown>, candidates: string[][]) => {
  for (const candidate of candidates) {
    const value = toPrice(getNestedValue(raw, candidate));
    if (value !== null) {
      return value;
    }
  }
  return null;
};

const normalizeCodeToken = (value?: string | null) =>
  normalizeText(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

const normalizeDigitsToken = (value?: string | null) =>
  normalizeText(value || '').replace(/\D+/g, '');

const extractImageFromValue = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    const normalized = normalizeText(value);
    return normalized ? toAbsoluteUrl(normalized) : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractImageFromValue(item);
      if (extracted) return extracted;
    }
    return null;
  }

  if (typeof value !== 'object') return null;
  const objectValue = value as Record<string, unknown>;

  const directKeys = ['absURL', 'absUrl', 'url', 'src', 'href'];
  for (const key of directKeys) {
    const candidate = extractImageFromValue(objectValue[key]);
    if (candidate) return candidate;
  }

  const commonGroups = [
    objectValue.medium,
    objectValue.large,
    objectValue.small,
    objectValue.zoom,
    objectValue.default
  ];
  for (const group of commonGroups) {
    const candidate = extractImageFromValue(group);
    if (candidate) return candidate;
  }

  for (const valueEntry of Object.values(objectValue)) {
    const candidate = extractImageFromValue(valueEntry);
    if (candidate) return candidate;
  }

  return null;
};

const normalizeBarcode = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = normalizeText(String(value));
  if (!text) return null;
  const digits = text.replace(/\D+/g, '');
  if (digits.length >= 8 && digits.length <= 18) return digits;
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
    ['offers', 'upc'],
    ['variations', '0', 'barcode'],
    ['variations', '0', 'ean'],
    ['variations', '0', 'upc']
  ];

  for (const path of paths) {
    const value = getNestedValue(raw, path);
    const normalized = normalizeBarcode(value);
    if (normalized) return normalized;
  }

  return null;
};

const matchCodeToken = (product: NaturaCatalogProduct, lookupCode: string) => {
  const lookupNormalized = normalizeCodeToken(lookupCode);
  if (!lookupNormalized) return false;

  const lookupDigits = normalizeDigitsToken(lookupCode);
  const productTokens = [product.code, product.sku, product.id].map((value) =>
    normalizeCodeToken(value)
  );

  if (productTokens.some((token) => token === lookupNormalized)) {
    return true;
  }

  if (!lookupDigits) return false;

  const productDigits = [product.code, product.sku, product.id].map((value) =>
    normalizeDigitsToken(value)
  );
  return productDigits.some((token) => token === lookupDigits && token.length > 0);
};

const mapRawProduct = (
  raw: Record<string, unknown>,
  sourcePath: string
): NaturaCatalogProduct | null => {
  const code = normalizeText(
    typeof raw.productId === 'string'
      ? raw.productId
      : typeof raw.sku === 'string'
        ? raw.sku
        : typeof raw.code === 'string'
          ? raw.code
          : typeof raw.id === 'string'
            ? raw.id
            : ''
  );
  if (!code) return null;

  const name =
    typeof raw.name === 'string'
      ? normalizeText(raw.name)
      : typeof raw.friendlyName === 'string'
        ? normalizeText(raw.friendlyName)
        : '';
  if (!name) return null;

  const url = typeof raw.url === 'string' ? normalizeText(raw.url) : '';
  if (!url) return null;

  const firstImage = extractImageFromValue(raw.images);
  const barcode = extractBarcodeFromRaw(raw);
  const brand = typeof raw.brand === 'string' ? normalizeText(raw.brand) : '';

  const priceNode =
    raw.price && typeof raw.price === 'object' ? (raw.price as Record<string, unknown>) : null;
  const price = priceNode
    ? pickFirstPrice(priceNode, [
        ['sales', 'value'],
        ['sale', 'value'],
        ['value'],
        ['list', 'value'],
        ['listPrice', 'value']
      ])
    : null;

  const purchasePrice = priceNode
    ? pickFirstPrice(priceNode, [
        ['purchase', 'value'],
        ['consultant', 'value'],
        ['consultor', 'value'],
        ['reseller', 'value'],
        ['cost', 'value'],
        ['buy', 'value'],
        ['cost']
      ])
    : null;

  const fallbackPurchasePrice = pickFirstPrice(raw, [
    ['purchasePrice'],
    ['buyPrice'],
    ['consultantPrice'],
    ['costPrice']
  ]);

  return {
    id: code,
    sku: normalizeText(typeof raw.sku === 'string' ? raw.sku : code) || code,
    code,
    barcode,
    name,
    brand: brand || null,
    price,
    purchasePrice: purchasePrice ?? fallbackPurchasePrice,
    inStock: raw.inStock === true,
    url: toAbsoluteUrl(url),
    imageUrl: firstImage,
    sourceCategory: toSourceCategory(sourcePath)
  };
};

const mapBffProduct = (
  raw: Record<string, unknown>,
  sourcePath: string
): NaturaCatalogProduct | null => {
  const code = normalizeText(
    typeof raw.productId === 'string'
      ? raw.productId
      : typeof raw.productIdView === 'string'
        ? raw.productIdView
        : typeof raw.sku === 'string'
          ? raw.sku
          : typeof raw.id === 'string'
            ? raw.id
            : ''
  );
  if (!code) return null;

  const name =
    normalizeText(
      typeof raw.name === 'string'
        ? raw.name
        : typeof raw.friendlyName === 'string'
          ? raw.friendlyName
          : ''
    ) || null;
  if (!name) return null;

  const brand =
    typeof raw.brand === 'string'
      ? normalizeText(raw.brand)
      : typeof raw.line === 'string'
        ? normalizeText(raw.line)
        : '';

  const rawUrl = normalizeText(
    typeof raw.url === 'string'
      ? raw.url
      : typeof raw.leafletUrl === 'string'
        ? raw.leafletUrl
        : ''
  );

  const firstImage = extractImageFromValue(raw.images);
  const barcode = extractBarcodeFromRaw(raw);

  const rawPrice =
    raw.price && typeof raw.price === 'object' ? (raw.price as Record<string, unknown>) : null;

  const price = rawPrice
    ? pickFirstPrice(rawPrice, [
        ['sales', 'value'],
        ['min', 'sales', 'value'],
        ['max', 'sales', 'value'],
        ['value'],
        ['min', 'value']
      ])
    : null;

  const purchasePrice = rawPrice
    ? pickFirstPrice(rawPrice, [
        ['purchase', 'value'],
        ['consultant', 'value'],
        ['consultor', 'value'],
        ['reseller', 'value'],
        ['cost', 'value']
      ])
    : null;

  const variations = Array.isArray(raw.variations) ? raw.variations : [];
  const firstVariation =
    variations[0] && typeof variations[0] === 'object'
      ? (variations[0] as Record<string, unknown>)
      : null;

  const inStock =
    typeof raw.inStock === 'boolean'
      ? raw.inStock
      : typeof firstVariation?.inStock === 'boolean'
        ? Boolean(firstVariation.inStock)
        : typeof firstVariation?.available === 'boolean'
          ? Boolean(firstVariation.available)
          : true;

  return {
    id: code,
    sku: code,
    code,
    barcode,
    name,
    brand: brand || null,
    price,
    purchasePrice,
    inStock,
    url: rawUrl ? toAbsoluteUrl(rawUrl) : NATURA_BASE_URL,
    imageUrl: firstImage,
    sourceCategory: toSourceCategory(sourcePath)
  };
};

const parseNaturaJsonLdProducts = (html: string, sourcePath: string): NaturaCatalogProduct[] => {
  const normalized = decodeNaturaHtml(html);
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const deduped = new Map<string, NaturaCatalogProduct>();

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

    const sku = normalizeText(
      typeof raw.sku === 'string'
        ? raw.sku
        : typeof raw.productID === 'string'
          ? raw.productID
          : typeof raw.mpn === 'string'
            ? raw.mpn
            : ''
    );
    const rawUrl = normalizeText(
      typeof raw.url === 'string' ? raw.url : typeof raw['@id'] === 'string' ? raw['@id'] : ''
    );
    const url = rawUrl ? toAbsoluteUrl(rawUrl) : '';
    const imageValue = Array.isArray(raw.image) ? raw.image[0] : raw.image;
    const imageUrl = toAbsoluteUrl(typeof imageValue === 'string' ? imageValue : '');

    const offersValue = Array.isArray(raw.offers) ? raw.offers[0] : raw.offers;
    const offer =
      offersValue && typeof offersValue === 'object'
        ? (offersValue as Record<string, unknown>)
        : null;

    const availability = normalizeText(
      typeof offer?.availability === 'string' ? offer.availability : ''
    ).toLowerCase();
    const inStock = availability
      ? availability.includes('instock') && !availability.includes('outofstock')
      : true;

    const brandValue = raw.brand;
    const brand =
      typeof brandValue === 'string'
        ? normalizeText(brandValue)
        : brandValue &&
            typeof brandValue === 'object' &&
            typeof (brandValue as { name?: unknown }).name === 'string'
          ? normalizeText((brandValue as { name: string }).name)
          : '';

    if (!sku && !url) return;

    const resolvedCode =
      sku || `NAT-${hashId(`${name}|${url || sourcePath}|${toSourceCategory(sourcePath)}`)}`;
    const barcode = extractBarcodeFromRaw(raw);
    const product: NaturaCatalogProduct = {
      id: resolvedCode,
      sku: resolvedCode,
      code: resolvedCode,
      barcode,
      name,
      brand: brand || null,
      price: toPrice(offer?.price ?? raw.price),
      purchasePrice: null,
      inStock,
      url: url || NATURA_BASE_URL,
      imageUrl: imageUrl || null,
      sourceCategory: toSourceCategory(sourcePath)
    };

    if (!deduped.has(product.id)) {
      deduped.set(product.id, product);
    }
  };

  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== 'object') return;
    const raw = node as Record<string, unknown>;
    pushProduct(raw);
    Object.values(raw).forEach((value) => visit(value));
  };

  let match = scriptRegex.exec(normalized);
  while (match) {
    const payload = normalizeText(match[1]);
    if (payload) {
      try {
        const parsed = JSON.parse(payload) as unknown;
        visit(parsed);
      } catch {
        // ignore malformed json-ld blocks
      }
    }
    match = scriptRegex.exec(normalized);
  }

  return Array.from(deduped.values());
};

export const parseNaturaCatalogProducts = (
  html: string,
  sourcePath: string
): NaturaCatalogProduct[] => {
  const normalized = decodeNaturaHtml(html);
  const needle = '"productId":"';
  const deduped = new Map<string, NaturaCatalogProduct>();

  let searchIndex = 0;

  while (searchIndex < normalized.length) {
    const matchIndex = normalized.indexOf(needle, searchIndex);
    if (matchIndex === -1) break;

    const objectStart = normalized.lastIndexOf('{', matchIndex);
    if (objectStart !== -1) {
      const rawObject = extractJsonObject(normalized, objectStart);
      if (rawObject) {
        try {
          const parsed = JSON.parse(rawObject) as Record<string, unknown>;
          const mapped = mapRawProduct(parsed, sourcePath);
          if (mapped && !deduped.has(mapped.id)) {
            deduped.set(mapped.id, mapped);
          }
        } catch {
          // Ignore invalid blocks and keep scanning.
        }
      }
    }

    searchIndex = matchIndex + needle.length;
  }

  if (deduped.size === 0) {
    parseNaturaJsonLdProducts(html, sourcePath).forEach((product) => {
      if (!deduped.has(product.id)) {
        deduped.set(product.id, product);
      }
    });
  }

  return Array.from(deduped.values());
};

const buildFetchHeaders = ({
  profileHeaders,
  requestAuth
}: {
  profileHeaders: Record<string, string>;
  requestAuth?: FetchNaturaRequestAuth;
}) => {
  const headers: Record<string, string> = {
    ...profileHeaders
  };

  if (requestAuth?.bearerToken) {
    headers.authorization = `Bearer ${requestAuth.bearerToken}`;
  }
  if (requestAuth?.cookie) {
    headers.cookie = requestAuth.cookie;
  }
  if (requestAuth?.headers) {
    Object.assign(headers, requestAuth.headers);
  }

  return headers;
};

const toNaturaPathUrl = (path: string) =>
  path.startsWith('http://') || path.startsWith('https://') ? path : `${NATURA_BASE_URL}${path}`;

const toNaturaBffSearchUrl = ({
  categorySlug,
  start,
  count
}: {
  categorySlug: string;
  start: number;
  count: number;
}) => {
  const params = new URLSearchParams();
  params.set('count', String(count));
  params.set('start', String(start));
  params.set('expand', NATURA_BFF_SEARCH_EXPAND);
  params.set('refine_1', `cgid=${categorySlug}`);

  return `${NATURA_BFF_BASE_URL}/search?${params.toString()}`;
};

const toNaturaBffQueryUrl = ({
  query,
  start,
  count
}: {
  query: string;
  start: number;
  count: number;
}) => {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('count', String(count));
  params.set('start', String(start));
  params.set('expand', NATURA_BFF_SEARCH_EXPAND);

  return `${NATURA_BFF_BASE_URL}/search?${params.toString()}`;
};

const buildBffHeaders = ({
  requestAuth,
  userAgent
}: {
  requestAuth?: FetchNaturaRequestAuth;
  userAgent?: string;
}) => {
  const headers: Record<string, string> = {
    accept: 'application/json,text/plain,*/*',
    'content-type': 'application/json',
    x_use_Slas: 'true',
    'x-api-key': NATURA_BFF_API_KEY,
    tenant_id: NATURA_BFF_TENANT_ID
  };

  if (userAgent) {
    headers['user-agent'] = userAgent;
  }
  if (requestAuth?.bearerToken) {
    headers.authorization = `Bearer ${requestAuth.bearerToken}`;
  }
  if (requestAuth?.cookie) {
    headers.cookie = requestAuth.cookie;
  }
  if (requestAuth?.headers) {
    Object.assign(headers, requestAuth.headers);
  }

  return headers;
};

const isAbortError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === 'object' &&
      ((error as { name?: string }).name === 'AbortError' ||
        normalizeText((error as { message?: string }).message || '')
          .toLowerCase()
          .includes('aborted'))
  );

const normalizeFetchError = (error: unknown) => {
  if (isAbortError(error)) return 'natura_aborted';

  const message = normalizeText(error instanceof Error ? error.message : String(error || ''));
  if (!message) return 'natura_fetch_failed';

  if (
    message.startsWith('natura_http_') ||
    message.startsWith('natura_consultant_') ||
    message.startsWith('natura_')
  ) {
    return message;
  }

  return `natura_fetch_${message.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
};

const isRetryableStatus = (status: number) => status === 403 || status === 429 || status >= 500;

const fetchNaturaPage = async (
  path: string,
  signal?: AbortSignal,
  requestAuth?: FetchNaturaRequestAuth,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
) => {
  const wrapped = withTimeoutSignal(timeoutMs, signal);
  const attempts: NaturaFetchAttempt[] = [];
  const url = toNaturaPathUrl(path);

  try {
    for (const profile of NATURA_FETCH_PROFILES) {
      try {
        const response = await fetch(url, {
          headers: buildFetchHeaders({
            profileHeaders: profile.headers,
            requestAuth
          }),
          signal: wrapped.signal
        });

        if (response.ok) {
          return {
            html: await response.text(),
            attempts
          };
        }

        const error = `natura_http_${response.status}`;
        attempts.push({
          profile: profile.id,
          error
        });

        if (!isRetryableStatus(response.status)) {
          break;
        }
      } catch (error) {
        const normalizedError = normalizeFetchError(error);
        attempts.push({
          profile: profile.id,
          error: normalizedError
        });

        if (normalizedError === 'natura_aborted') {
          const failure = new Error(normalizedError) as Error & { attempts?: NaturaFetchAttempt[] };
          failure.attempts = attempts;
          throw failure;
        }
      }
    }

    const fallbackError = attempts[attempts.length - 1]?.error || 'natura_fetch_failed';
    const failure = new Error(fallbackError) as Error & { attempts?: NaturaFetchAttempt[] };
    failure.attempts = attempts;
    throw failure;
  } finally {
    wrapped.cleanup();
  }
};

const withAttemptsError = (error: string, attempts: NaturaFetchAttempt[]) => {
  const failure = new Error(error) as Error & { attempts?: NaturaFetchAttempt[] };
  failure.attempts = attempts;
  return failure;
};

const fetchNaturaBffSearchPage = async ({
  categoryPath,
  start,
  count,
  signal,
  requestAuth,
  timeoutMs
}: {
  categoryPath: string;
  start: number;
  count: number;
  signal?: AbortSignal;
  requestAuth?: FetchNaturaRequestAuth;
  timeoutMs: number;
}): Promise<{
  products: NaturaCatalogProduct[];
  total: number | null;
  attempts: NaturaFetchAttempt[];
}> => {
  const wrapped = withTimeoutSignal(timeoutMs, signal);
  const categorySlug = toSourceCategory(categoryPath);
  const attempts: NaturaFetchAttempt[] = [];
  const url = toNaturaBffSearchUrl({
    categorySlug,
    start,
    count
  });

  try {
    for (const profile of NATURA_BFF_FETCH_PROFILES) {
      try {
        const response = await fetch(url, {
          headers: buildBffHeaders({
            requestAuth,
            userAgent: profile.userAgent
          }),
          signal: wrapped.signal
        });
        const payloadText = await response.text();

        if (!response.ok) {
          const error = `natura_bff_http_${response.status}`;
          attempts.push({
            profile: profile.id,
            error
          });
          if (!isRetryableStatus(response.status)) {
            throw withAttemptsError(error, attempts);
          }
          continue;
        }

        let parsedJson: Record<string, unknown> | null = null;
        try {
          parsedJson = JSON.parse(payloadText) as Record<string, unknown>;
        } catch {
          const htmlProducts = parseNaturaCatalogProducts(payloadText, categoryPath);
          if (htmlProducts.length > 0) {
            return {
              products: htmlProducts,
              total: htmlProducts.length,
              attempts
            };
          }

          throw new Error('natura_bff_invalid_json');
        }
        const rawProducts = Array.isArray(parsedJson.products) ? parsedJson.products : [];
        const products = rawProducts
          .map((item) =>
            item && typeof item === 'object'
              ? mapBffProduct(item as Record<string, unknown>, categoryPath)
              : null
          )
          .filter((item): item is NaturaCatalogProduct => item !== null);
        const total =
          typeof parsedJson.total === 'number' && Number.isFinite(parsedJson.total)
            ? parsedJson.total
            : null;

        return {
          products,
          total,
          attempts
        };
      } catch (error) {
        const normalizedError = normalizeFetchError(error);
        attempts.push({
          profile: profile.id,
          error: normalizedError
        });

        if (normalizedError === 'natura_aborted') {
          throw withAttemptsError(normalizedError, attempts);
        }
      }
    }

    throw withAttemptsError(
      attempts[attempts.length - 1]?.error || 'natura_bff_failed',
      attempts
    );
  } finally {
    wrapped.cleanup();
  }
};

const fetchNaturaBffQueryPage = async ({
  query,
  start,
  count,
  signal,
  requestAuth,
  timeoutMs,
  sourceCategory = '/c/root'
}: {
  query: string;
  start: number;
  count: number;
  signal?: AbortSignal;
  requestAuth?: FetchNaturaRequestAuth;
  timeoutMs: number;
  sourceCategory?: string;
}): Promise<{
  products: NaturaCatalogProduct[];
  total: number | null;
  attempts: NaturaFetchAttempt[];
}> => {
  const wrapped = withTimeoutSignal(timeoutMs, signal);
  const attempts: NaturaFetchAttempt[] = [];
  const url = toNaturaBffQueryUrl({
    query,
    start,
    count
  });

  try {
    for (const profile of NATURA_BFF_FETCH_PROFILES) {
      try {
        const response = await fetch(url, {
          headers: buildBffHeaders({
            requestAuth,
            userAgent: profile.userAgent
          }),
          signal: wrapped.signal
        });
        const payloadText = await response.text();

        if (!response.ok) {
          const error = `natura_bff_http_${response.status}`;
          attempts.push({
            profile: profile.id,
            error
          });
          if (!isRetryableStatus(response.status)) {
            throw withAttemptsError(error, attempts);
          }
          continue;
        }

        let parsedJson: Record<string, unknown> | null = null;
        try {
          parsedJson = JSON.parse(payloadText) as Record<string, unknown>;
        } catch {
          const htmlProducts = parseNaturaCatalogProducts(payloadText, sourceCategory);
          if (htmlProducts.length > 0) {
            return {
              products: htmlProducts,
              total: htmlProducts.length,
              attempts
            };
          }
          throw new Error('natura_bff_invalid_json');
        }

        const rawProducts = Array.isArray(parsedJson.products) ? parsedJson.products : [];
        const products = rawProducts
          .map((item) =>
            item && typeof item === 'object'
              ? mapBffProduct(item as Record<string, unknown>, sourceCategory)
              : null
          )
          .filter((item): item is NaturaCatalogProduct => item !== null);
        const total =
          typeof parsedJson.total === 'number' && Number.isFinite(parsedJson.total)
            ? parsedJson.total
            : null;

        return {
          products,
          total,
          attempts
        };
      } catch (error) {
        const normalizedError = normalizeFetchError(error);
        attempts.push({
          profile: profile.id,
          error: normalizedError
        });

        if (normalizedError === 'natura_aborted') {
          throw withAttemptsError(normalizedError, attempts);
        }
      }
    }

    throw withAttemptsError(
      attempts[attempts.length - 1]?.error || 'natura_bff_failed',
      attempts
    );
  } finally {
    wrapped.cleanup();
  }
};

const fetchNaturaCategoryProductsFromBff = async ({
  categoryPath,
  signal,
  requestAuth,
  timeoutMs
}: {
  categoryPath: string;
  signal?: AbortSignal;
  requestAuth?: FetchNaturaRequestAuth;
  timeoutMs: number;
}) => {
  const pageSize = Math.min(200, Math.max(20, safePositiveInt(NATURA_BFF_PAGE_SIZE, 100)));
  const maxPages = Math.min(200, Math.max(1, safePositiveInt(NATURA_BFF_MAX_PAGES, 120)));
  const deduped = new Map<string, NaturaCatalogProduct>();
  const attempts: NaturaFetchAttempt[] = [];

  let total: number | null = null;
  let start = 0;
  let page = 0;

  while (page < maxPages && (total === null || start < total)) {
    const response = await fetchNaturaBffSearchPage({
      categoryPath,
      start,
      count: pageSize,
      signal,
      requestAuth,
      timeoutMs
    });

    attempts.push(...response.attempts);
    if (typeof response.total === 'number') {
      total = response.total;
    }

    response.products.forEach((product) => {
      if (!deduped.has(product.id)) {
        deduped.set(product.id, product);
      }
    });

    if (response.products.length < pageSize) {
      break;
    }

    start += pageSize;
    page += 1;
  }

  return {
    products: Array.from(deduped.values()),
    attempts
  };
};

export const fetchNaturaCatalogProductsByCodes = async ({
  codes,
  signal,
  requestAuth,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: {
  codes: string[];
  signal?: AbortSignal;
  requestAuth?: FetchNaturaRequestAuth;
  timeoutMs?: number;
}): Promise<{
  products: NaturaCatalogProduct[];
  failedCodes: string[];
  failedDetails: FetchNaturaFailureDetail[];
}> => {
  const effectiveTimeoutMs = Math.max(3000, safePositiveInt(timeoutMs, DEFAULT_TIMEOUT_MS));
  const uniqueCodes = Array.from(
    new Set(
      codes
        .map((code) => normalizeText(code))
        .filter(Boolean)
    )
  );

  const concurrency = Math.min(6, Math.max(1, uniqueCodes.length));
  const results = new Map<string, NaturaCatalogProduct>();
  const failedCodes: string[] = [];
  const failedDetails: FetchNaturaFailureDetail[] = [];

  let pointer = 0;
  const workers = Array.from({ length: concurrency }).map(async () => {
    while (true) {
      if (signal?.aborted) return;
      const index = pointer;
      pointer += 1;
      if (index >= uniqueCodes.length) return;

      const code = uniqueCodes[index];
      try {
        const response = await fetchNaturaBffQueryPage({
          query: code,
          start: 0,
          count: 15,
          signal,
          requestAuth,
          timeoutMs: effectiveTimeoutMs,
          sourceCategory: '/c/magazine'
        });

        if (!response.products.length) {
          failedCodes.push(code);
          failedDetails.push({
            source: code,
            error: 'natura_bff_no_products',
            attempts: response.attempts
          });
          continue;
        }

        const exact = response.products.find((product) => matchCodeToken(product, code));
        const selected = exact || response.products[0];
        const normalizedKey = normalizeCodeToken(code) || code;
        results.set(normalizedKey, {
          ...selected,
          sourceCategory: 'magazine'
        });
      } catch (error) {
        const attempts =
          error &&
          typeof error === 'object' &&
          Array.isArray((error as { attempts?: unknown[] }).attempts)
            ? ((error as { attempts: NaturaFetchAttempt[] }).attempts || [])
            : [];
        failedCodes.push(code);
        failedDetails.push({
          source: code,
          error: attempts[attempts.length - 1]?.error || normalizeFetchError(error),
          attempts
        });
      }
    }
  });

  await Promise.all(workers);

  return {
    products: Array.from(results.values()),
    failedCodes,
    failedDetails
  };
};

const fetchNaturaRootCatalogProducts = async ({
  signal,
  requestAuth,
  timeoutMs
}: {
  signal?: AbortSignal;
  requestAuth?: FetchNaturaRequestAuth;
  timeoutMs: number;
}): Promise<{ products: NaturaCatalogProduct[]; resolvedPath: string } | null> => {
  for (const path of NATURA_ROOT_CATALOG_PATHS) {
    if (signal?.aborted) {
      break;
    }

    try {
      const bffResult = await fetchNaturaCategoryProductsFromBff({
        categoryPath: path,
        signal,
        requestAuth,
        timeoutMs
      });
      if (bffResult.products.length > 0) {
        return {
          products: bffResult.products,
          resolvedPath: path
        };
      }
    } catch {
      // Continue with HTML fallback for this candidate path.
    }

    try {
      const htmlResult = await fetchNaturaPage(path, signal, requestAuth, timeoutMs);
      const parsed = parseNaturaCatalogProducts(htmlResult.html, path);
      if (parsed.length > 0) {
        return {
          products: parsed,
          resolvedPath: path
        };
      }
    } catch {
      // Try next root candidate.
    }
  }

  return null;
};

const fetchDiscoveredCategoryPaths = async ({
  signal,
  requestAuth,
  timeoutMs
}: {
  signal?: AbortSignal;
  requestAuth?: FetchNaturaRequestAuth;
  timeoutMs: number;
}) => {
  const seeds = new Set<string>(NATURA_CATEGORY_PATHS);

  try {
    const home = await fetchNaturaPage('/', signal, requestAuth, timeoutMs);
    parseCategoryLinksFromHtml(home.html).forEach((path) => seeds.add(path));
  } catch {
    // keep fallback list
  }

  return Array.from(seeds);
};

const buildConsultantAuthPayload = (credentials: NaturaConsultantCredentials) => {
  const payload: Record<string, string> = {
    [NATURA_CONSULTANT_AUTH_USER_FIELD]: credentials.login,
    [NATURA_CONSULTANT_AUTH_PASSWORD_FIELD]: credentials.password
  };

  if (NATURA_CONSULTANT_AUTH_BODY_FORMAT === 'form') {
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      params.set(key, value);
    });
    return {
      body: params.toString(),
      contentType: 'application/x-www-form-urlencoded'
    };
  }

  return {
    body: JSON.stringify(payload),
    contentType: 'application/json'
  };
};

const extractTokenFromPayload = (payload: unknown): string | null => {
  if (!payload) return null;

  const queue: unknown[] = [payload];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const entries = Object.entries(current as Record<string, unknown>);
    for (const [key, value] of entries) {
      if (CONSULTANT_TOKEN_KEYS.has(key) && typeof value === 'string') {
        const token = normalizeText(value);
        if (token) return token;
      }

      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
};

const readSetCookieHeaders = (response: Response) => {
  const headers = response.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
};

const toCookieHeader = (setCookieHeaders: string[]) => {
  const parts = setCookieHeaders
    .map((header) => normalizeText(header.split(';')[0]))
    .filter(Boolean);
  return parts.length ? parts.join('; ') : null;
};

export const loginNaturaConsultant = async ({
  credentials,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal
}: LoginNaturaConsultantOptions): Promise<NaturaConsultantSession> => {
  const wrapped = withTimeoutSignal(timeoutMs, signal);
  try {
    const payload = buildConsultantAuthPayload(credentials);
    const response = await fetch(NATURA_CONSULTANT_AUTH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'content-type': payload.contentType
      },
      body: payload.body,
      redirect: 'manual',
      signal: wrapped.signal
    });

    if (!response.ok && response.status !== 302 && response.status !== 303) {
      throw new Error(`natura_consultant_auth_${response.status}`);
    }

    const responsePayload = await response
      .clone()
      .json()
      .catch(() => null);
    const bearerToken = extractTokenFromPayload(responsePayload);
    const cookie = toCookieHeader(readSetCookieHeaders(response));

    if (!bearerToken && !cookie) {
      throw new Error('natura_consultant_auth_missing_session');
    }

    return {
      bearerToken,
      cookie
    };
  } finally {
    wrapped.cleanup();
  }
};

export const fetchNaturaCatalogProducts = async ({
  paths = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
  requestAuth
}: FetchNaturaCatalogOptions = {}): Promise<FetchNaturaCatalogResult> => {
  const effectiveTimeoutMs = Math.max(3000, safePositiveInt(timeoutMs, DEFAULT_TIMEOUT_MS));
  const rootCatalogMinProducts = Math.max(
    1,
    safePositiveInt(NATURA_ROOT_CATALOG_MIN_PRODUCTS, 80)
  );

  const requestedPaths = Array.from(
    new Set(
      paths
        .map((path) => normalizeCategoryPath(path))
        .filter((path): path is string => Boolean(path))
    )
  );

  const rootSeedProducts = new Map<string, NaturaCatalogProduct>();

  if (!requestedPaths.length && NATURA_ENABLE_ROOT_CATALOG_STRATEGY) {
    const rootCatalog = await fetchNaturaRootCatalogProducts({
      signal,
      requestAuth,
      timeoutMs: effectiveTimeoutMs
    });

    if (rootCatalog && rootCatalog.products.length > 0) {
      rootCatalog.products.forEach((product) => {
        if (!rootSeedProducts.has(product.id)) {
          rootSeedProducts.set(product.id, product);
        }
      });

      // Some root endpoints return only highlighted products.
      // If the count is low, continue crawling category paths to complete the catalog.
      if (rootSeedProducts.size >= rootCatalogMinProducts) {
        return {
          products: Array.from(rootSeedProducts.values()),
          failedSources: [],
          failedDetails: [],
          resolvedPaths: [rootCatalog.resolvedPath]
        };
      }
    }
  }

  const resolvedPaths = requestedPaths.length
    ? requestedPaths
    : await fetchDiscoveredCategoryPaths({
        signal,
        requestAuth,
        timeoutMs: effectiveTimeoutMs
      });

  const failedSources: string[] = [];
  const failedDetails: FetchNaturaFailureDetail[] = [];
  const deduped = new Map<string, NaturaCatalogProduct>(rootSeedProducts);

  for (const path of resolvedPaths) {
    if (signal?.aborted) {
      break;
    }
    try {
      const bffResult = await fetchNaturaCategoryProductsFromBff({
        categoryPath: path,
        signal,
        requestAuth,
        timeoutMs: effectiveTimeoutMs
      });

      for (const product of bffResult.products) {
        if (!deduped.has(product.id)) {
          deduped.set(product.id, product);
        }
      }
    } catch (bffError) {
      const bffAttempts =
        bffError &&
        typeof bffError === 'object' &&
        Array.isArray((bffError as { attempts?: unknown[] }).attempts)
          ? ((bffError as { attempts: NaturaFetchAttempt[] }).attempts || [])
          : [];

      const bffErrorCode =
        bffAttempts[bffAttempts.length - 1]?.error || normalizeFetchError(bffError);

      try {
        const htmlFallback = await fetchNaturaPage(
          path,
          signal,
          requestAuth,
          effectiveTimeoutMs
        );
        const parsed = parseNaturaCatalogProducts(htmlFallback.html, path);
        if (parsed.length > 0) {
          parsed.forEach((product) => {
            if (!deduped.has(product.id)) {
              deduped.set(product.id, product);
            }
          });
          continue;
        }

        failedSources.push(path);
        failedDetails.push({
          source: path,
          error: bffErrorCode,
          attempts: [...bffAttempts, ...htmlFallback.attempts]
        });
      } catch (htmlError) {
        const htmlAttempts =
          htmlError &&
          typeof htmlError === 'object' &&
          Array.isArray((htmlError as { attempts?: unknown[] }).attempts)
            ? ((htmlError as { attempts: NaturaFetchAttempt[] }).attempts || [])
            : [];

        failedSources.push(path);
        failedDetails.push({
          source: path,
          error: bffErrorCode,
          attempts: [...bffAttempts, ...htmlAttempts]
        });
      }
    }
  }

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources)),
    failedDetails,
    resolvedPaths
  };
};

export const fetchNaturaConsultantCatalogProducts = async ({
  credentials,
  paths = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal
}: FetchNaturaConsultantCatalogOptions): Promise<FetchNaturaCatalogResult> => {
  const session = await loginNaturaConsultant({
    credentials,
    timeoutMs,
    signal
  });

  return fetchNaturaCatalogProducts({
    paths,
    timeoutMs,
    signal,
    requestAuth: {
      bearerToken: session.bearerToken || undefined,
      cookie: session.cookie || undefined
    }
  });
};
