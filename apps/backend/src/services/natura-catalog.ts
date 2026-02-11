const NATURA_BASE_URL = 'https://www.natura.com.br';
const DEFAULT_TIMEOUT_MS = 12000;

export const NATURA_CATEGORY_PATHS = [
  '/c/perfumaria',
  '/c/corpo-e-banho',
  '/c/cabelos',
  '/c/maquiagem',
  '/c/rosto',
  '/c/casa',
  '/c/infantil',
  '/c/homens'
] as const;

export type NaturaCategoryPath = (typeof NATURA_CATEGORY_PATHS)[number];

export type NaturaCatalogProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  price: number | null;
  inStock: boolean;
  url: string;
  imageUrl: string | null;
  sourceCategory: string;
};

type FetchNaturaCatalogOptions = {
  paths?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
};

type FetchNaturaCatalogResult = {
  products: NaturaCatalogProduct[];
  failedSources: string[];
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
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

const mapRawProduct = (raw: Record<string, unknown>, sourcePath: string): NaturaCatalogProduct | null => {
  const productId = typeof raw.productId === 'string' ? normalizeText(raw.productId) : '';
  if (!productId.startsWith('NATBRA-')) return null;

  const name =
    typeof raw.name === 'string'
      ? normalizeText(raw.name)
      : typeof raw.friendlyName === 'string'
        ? normalizeText(raw.friendlyName)
        : '';
  if (!name) return null;

  const url = typeof raw.url === 'string' ? normalizeText(raw.url) : '';
  if (!url) return null;

  const images = Array.isArray(raw.images) ? raw.images : [];
  const firstImage = typeof images[0] === 'string' ? normalizeText(images[0]) : '';
  const brand = typeof raw.brand === 'string' ? normalizeText(raw.brand) : '';

  const price =
    raw.price && typeof raw.price === 'object'
      ? toPrice((raw.price as { sales?: { value?: unknown } }).sales?.value)
      : null;

  const sourceCategory = sourcePath.startsWith('/c/') ? sourcePath.slice(3) : sourcePath;

  return {
    id: productId,
    sku: productId,
    name,
    brand: brand || null,
    price,
    inStock: raw.inStock === true,
    url: toAbsoluteUrl(url),
    imageUrl: firstImage ? toAbsoluteUrl(firstImage) : null,
    sourceCategory
  };
};

export const parseNaturaCatalogProducts = (html: string, sourcePath: string): NaturaCatalogProduct[] => {
  const normalized = decodeNaturaHtml(html);
  const needle = '"productId":"NATBRA-';
  const seen = new Set<string>();
  const products: NaturaCatalogProduct[] = [];

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
          if (mapped && !seen.has(mapped.id)) {
            seen.add(mapped.id);
            products.push(mapped);
          }
        } catch {
          // Ignore invalid blocks and keep scanning.
        }
      }
    }

    searchIndex = matchIndex + needle.length;
  }

  return products;
};

const fetchNaturaPage = async (path: string, signal: AbortSignal) => {
  const response = await fetch(`${NATURA_BASE_URL}${path}`, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8'
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`natura_http_${response.status}`);
  }

  return response.text();
};

export const fetchNaturaCatalogProducts = async ({
  paths = [...NATURA_CATEGORY_PATHS],
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal
}: FetchNaturaCatalogOptions = {}): Promise<FetchNaturaCatalogResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  const abortListener = () => controller.abort();

  if (signal) {
    signal.addEventListener('abort', abortListener);
  }

  try {
    const settled = await Promise.allSettled(
      paths.map(async (path) => {
        const html = await fetchNaturaPage(path, controller.signal);
        return {
          path,
          products: parseNaturaCatalogProducts(html, path)
        };
      })
    );

    const failedSources: string[] = [];
    const deduped = new Map<string, NaturaCatalogProduct>();

    settled.forEach((result, index) => {
      if (result.status === 'rejected') {
        if (paths[index]) {
          failedSources.push(paths[index]);
        }
        return;
      }

      for (const product of result.value.products) {
        if (!deduped.has(product.id)) {
          deduped.set(product.id, product);
        }
      }
    });

    return {
      products: Array.from(deduped.values()),
      failedSources: Array.from(new Set(failedSources))
    };
  } finally {
    clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener('abort', abortListener);
    }
  }
};
