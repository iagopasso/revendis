import { createHash } from 'crypto';
import {
  fetchNaturaCatalogProducts,
  type FetchNaturaFailureDetail,
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
  'demillus',
  'farmasi',
  'hinode',
  'jequiti',
  'loccitane-au-bresil',
  'mahogany',
  'moments-paris',
  'odorata',
  'quem-disse-berenice',
  'racco',
  'skelt',
  'extase',
  'diamante'
] as const;

export type CatalogBrandSlug = (typeof CATALOG_BRANDS)[number];

export type BrandCatalogProduct = {
  id: string;
  sku: string;
  barcode?: string | null;
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
  failedDetails: FetchNaturaFailureDetail[];
};

export const CATALOG_BRAND_LABELS: Record<CatalogBrandSlug, string> = {
  avon: 'Avon',
  'mary-kay': 'Mary Kay',
  tupperware: 'Tupperware',
  eudora: 'Eudora',
  boticario: 'Boticario',
  oui: 'Oui',
  natura: 'Natura',
  demillus: 'Demillus',
  farmasi: 'Farmasi',
  hinode: 'Hinode',
  jequiti: 'Jequiti',
  'loccitane-au-bresil': "L'Occitane au Bresil",
  mahogany: 'Mahogany',
  'moments-paris': 'Moments Paris',
  odorata: 'Odorata',
  'quem-disse-berenice': 'Quem Disse, Berenice?',
  racco: 'Racco',
  skelt: 'Skelt',
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
  demillus: ['demillus', 'de millus'],
  farmasi: ['farmasi'],
  hinode: ['hinode'],
  jequiti: ['jequiti'],
  'loccitane-au-bresil': ["l'occitane au bresil", 'loccitane au bresil', 'loccitane', 'l occitane'],
  mahogany: ['mahogany'],
  'moments-paris': ['moments paris', 'moments-paris'],
  odorata: ['odorata'],
  'quem-disse-berenice': ['quem disse berenice', 'quem disse, berenice?', 'qdb', 'quemdisseberenice'],
  racco: ['racco'],
  skelt: ['skelt'],
  extase: ['extase', 'extasee', 'extasis', 'extasecosmeticos'],
  diamante: ['diamante', 'diamanteq', 'diamante q']
};

const BRAND_BASE_URL: Record<CatalogBrandSlug, string> = {
  avon: 'https://www.avon.com.br',
  'mary-kay': 'https://loja.marykay.com.br',
  tupperware: 'https://www.tupperware.com.br',
  eudora: 'https://www.eudora.com.br',
  boticario: 'https://www.boticario.com.br',
  oui: 'https://www.boticario.com.br/perfumaria/oui',
  natura: 'https://www.natura.com.br',
  demillus: 'https://www.demillus.com.br',
  farmasi: 'https://www.farmasi.com.br',
  hinode: 'https://www.hinode.com.br',
  jequiti: 'https://www.jequiti.com.br',
  'loccitane-au-bresil': 'https://br.loccitaneaubresil.com',
  mahogany: 'https://www.mahogany.com.br',
  'moments-paris': 'https://www.momentsparis.com.br',
  odorata: 'https://www.odorata.com.br',
  'quem-disse-berenice': 'https://www.quemdisseberenice.com.br',
  racco: 'https://www.racco.com.br',
  skelt: 'https://www.skelt.com.br',
  // Uses a public storefront with Extase products.
  extase: 'https://www.flattercosmeticos.com.br',
  // Official e-commerce storefront for Diamante.
  diamante: 'https://www.diamanteprofissional.com.br'
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
const MAX_VTEX_PAGES = 20;
const VTEX_PAGE_SIZE = 50;
const VTEX_MAX_PAGES_BY_BRAND: Partial<Record<CatalogBrandSlug, number>> = {
  'mary-kay': 60,
  eudora: 80,
  boticario: 80,
  oui: 80
};
const MAX_SHOPIFY_PAGES = 40;
const SHOPIFY_PAGE_SIZE = 250;
const MAX_SITEMAP_FILES = 25;
const MAX_SITEMAP_PRODUCT_URLS = 220;
const MAX_SITEMAP_FETCH_CONCURRENCY = 6;
const TRAY_PAGE_SIZE = 50;
const MAX_TRAY_PAGES = 80;
const DIAMANTE_PRODUCT_SITEMAP_PREFIX = '/sitemap/product-';
const MAX_DIAMANTE_PRODUCT_URLS = 1200;
const AVON_BFF_PATH = '/bff-app-avon-brazil/search';
const AVON_BFF_CATEGORY = 'todos-produtos';
const AVON_BFF_PAGE_SIZE = 200;
const MAX_AVON_BFF_PAGES = 30;
const DEFAULT_AVON_BFF_API_KEY = '39643690-ecee-455d-8d8c-f313cef95da6';
const DEFAULT_AVON_BFF_TENANT = 'brazil-avon';
const AVON_PATHS = ['/', '/c/perfumaria', '/c/maquiagem', '/c/corpo-e-banho'] as const;
const GENERIC_BRAND_PATHS: Record<
  Exclude<CatalogBrandSlug, 'avon' | 'mary-kay' | 'tupperware' | 'eudora' | 'boticario' | 'oui' | 'natura'>,
  string[]
> = {
  demillus: ['/', '/produtos', '/catalogo'],
  farmasi: ['/', '/collections/all', '/produtos'],
  hinode: ['/', '/produtos', '/perfumaria'],
  jequiti: ['/', '/perfumes', '/maquiagem'],
  'loccitane-au-bresil': ['/', '/perfume', '/cuidado-corporal'],
  mahogany: ['/', '/perfumes', '/corpo-e-banho'],
  'moments-paris': ['/', '/produtos'],
  odorata: ['/', '/produtos'],
  'quem-disse-berenice': ['/', '/maquiagem'],
  racco: ['/', '/produtos'],
  skelt: ['/', '/autobronzeadores'],
  extase: ['/', '/produtos', '/perfumes-femininos', '/cuidados-corporais'],
  diamante: ['/', '/produtos']
};

const shouldBypassUpstreamFetch = () =>
  process.env.NODE_ENV === 'test' && process.env.CATALOG_ENABLE_UPSTREAM !== '1';

const normalizeBrandToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();

const BRAND_UPSTREAM_PRODUCT_FILTERS: Partial<
  Record<CatalogBrandSlug, (product: BrandCatalogProduct) => boolean>
> = {
  extase: (product) => {
    const token = normalizeBrandToken(`${product.name} ${product.url || ''}`);
    return token.includes('extase') || token.includes('xtase');
  }
};

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

const normalizeBarcode = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!text) return null;
  const digits = text.replace(/\D+/g, '');
  if (digits.length >= 8 && digits.length <= 18) return digits;
  return null;
};

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return fallback;
    if (
      ['1', 'true', 'sim', 'yes', 'y', 'disponivel', 'available', 'instock', 'in stock'].includes(
        normalized
      )
    ) {
      return true;
    }
    if (
      ['0', 'false', 'nao', 'no', 'n', 'indisponivel', 'unavailable', 'outofstock', 'out of stock'].includes(
        normalized
      )
    ) {
      return false;
    }
  }
  return fallback;
};

const slugifyCategory = (value: string) => {
  const normalized = normalizeBrandToken(value);
  return normalized || 'catalogo';
};

const slugifyUrlSegment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();

const hashId = (value: string) =>
  createHash('sha1').update(value, 'utf8').digest('hex').slice(0, 16).toUpperCase();

const escapeSvgText = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildCatalogFallbackImage = (brand: CatalogBrandSlug) => {
  const label = CATALOG_BRAND_LABELS[brand];
  const token = normalizeBrandToken(label).toUpperCase();
  const initials = (token.slice(0, 2) || 'PD').replace(/[^A-Z0-9]/g, '');
  const safeLabel = escapeSvgText(label.toUpperCase().slice(0, 20));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#efe4ff"/><stop offset="100%" stop-color="#d5c4ff"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><circle cx="160" cy="120" r="54" fill="#ffffff" fill-opacity="0.92"/><text x="160" y="134" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="#5f3fa2">${escapeSvgText(initials || 'PD')}</text><text x="160" y="238" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="#5f3fa2">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const FALLBACK_IMAGE_BY_BRAND: Record<CatalogBrandSlug, string> = CATALOG_BRANDS.reduce(
  (acc, brand) => {
    acc[brand] = buildCatalogFallbackImage(brand);
    return acc;
  },
  {} as Record<CatalogBrandSlug, string>
);

const looksLikePlaceholderImageUrl = (value: string) => {
  const token = normalizeBrandToken(value);
  if (!token) return true;

  return (
    token.includes('placeholder') ||
    token.includes('noimage') ||
    token.includes('noimg') ||
    token.includes('semimagem') ||
    token.includes('notavailable') ||
    token.includes('imageindisponivel') ||
    token.includes('defaultimage') ||
    token.includes('missingimage') ||
    token.includes('productdefault') ||
    token.includes('imagemindisponivel')
  );
};

export const resolveCatalogProductImageUrl = (
  brand: CatalogBrandSlug,
  imageUrl?: string | null
) => {
  const normalized = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (
    normalized &&
    !looksLikePlaceholderImageUrl(normalized) &&
    (normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('data:image/') ||
      normalized.startsWith('/'))
  ) {
    return normalized;
  }
  return FALLBACK_IMAGE_BY_BRAND[brand];
};

const ensureCatalogProductImages = (products: BrandCatalogProduct[]) =>
  products.map((product) => ({
    ...product,
    imageUrl: resolveCatalogProductImageUrl(product.sourceBrand, product.imageUrl)
  }));

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
    { sku: '155708', name: '300 Km/h Deo Colonia Boost', category: 'perfumaria', price: 49.9 },
    { sku: '174929', name: 'Footworks Creme Hidratante para os Pes Noturno', category: 'corpo-e-banho', price: 28.9 },
    { sku: '198700', name: 'Kiss Matte Batom Rosa Rustico', category: 'maquiagem', price: 19.9 },
    { sku: 'AV-FA-BEYOND-050', name: 'Far Away Beyond Deo Parfum 50ml', category: 'perfumaria', price: 119.9 },
    { sku: 'AV-PS-BASE-030', name: 'Power Stay Base Liquida 30ml', category: 'maquiagem', price: 69.9 }
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
  demillus: buildSampleProducts('demillus', [
    { sku: 'DM-53100', name: 'Sutia DeMillus Classico Rendado', category: 'moda-intima', price: 79.9 },
    { sku: 'DM-70210', name: 'Calcinha DeMillus Confort Plus', category: 'moda-intima', price: 34.9 },
    { sku: 'DM-88030', name: 'Body DeMillus Modelador', category: 'moda-intima', price: 119.9 }
  ]),
  farmasi: buildSampleProducts('farmasi', [
    { sku: 'FA-VFX-001', name: 'Farmasi VFX Pro Camera Ready Foundation', category: 'maquiagem', price: 74.9 },
    { sku: 'FA-DRM-002', name: 'Farmasi Dr. C. Tuna Tea Tree Gel', category: 'rosto', price: 39.9 },
    { sku: 'FA-ZEN-003', name: 'Farmasi Zen Mascara Alongadora', category: 'maquiagem', price: 42.9 }
  ]),
  hinode: buildSampleProducts('hinode', [
    { sku: 'HI-FEEL-100', name: 'Feelin For Him Desodorante Colonia', category: 'perfumaria', price: 129.9 },
    { sku: 'HI-SPOT-120', name: 'Spot for Her Desodorante Colonia', category: 'perfumaria', price: 119.9 },
    { sku: 'HI-GRM-060', name: 'Grace Midnight Body Splash', category: 'corpo-e-banho', price: 59.9 }
  ]),
  jequiti: buildSampleProducts('jequiti', [
    { sku: 'JQ-EU-100', name: 'Eu Desodorante Colonia Feminina', category: 'perfumaria', price: 79.9 },
    { sku: 'JQ-ELL-001', name: 'Ellas Creme Hidratante Corporal', category: 'corpo-e-banho', price: 35.9 },
    { sku: 'JQ-BAT-014', name: 'Batom Aviva Matte Vermelho', category: 'maquiagem', price: 22.9 }
  ]),
  'loccitane-au-bresil': buildSampleProducts('loccitane-au-bresil', [
    { sku: 'LC-ENX-100', name: 'Desodorante Colonia Enxuto 100ml', category: 'perfumaria', price: 119.9 },
    { sku: 'LC-JEN-250', name: 'Bruma Perfumada Jardim Encantado', category: 'perfumaria', price: 89.9 },
    { sku: 'LC-CAJ-200', name: 'Locao Corporal Caju', category: 'corpo-e-banho', price: 69.9 }
  ]),
  mahogany: buildSampleProducts('mahogany', [
    { sku: 'MH-WLD-100', name: 'Wild Eau de Toilette 100ml', category: 'perfumaria', price: 139.9 },
    { sku: 'MH-LOV-250', name: 'Body Lotion Love Secrets', category: 'corpo-e-banho', price: 74.9 },
    { sku: 'MH-MSK-080', name: 'Mascara Capilar Nutritiva', category: 'cabelos', price: 54.9 }
  ]),
  'moments-paris': buildSampleProducts('moments-paris', [
    { sku: 'MP-LUM-100', name: 'Lumiere Eau de Parfum 100ml', category: 'perfumaria', price: 149.9 },
    { sku: 'MP-ROS-250', name: 'Body Splash Rose Classic', category: 'perfumaria', price: 79.9 },
    { sku: 'MP-CRP-180', name: 'Creme Corporal Parisienne', category: 'corpo-e-banho', price: 52.9 }
  ]),
  odorata: buildSampleProducts('odorata', [
    { sku: 'OD-SEG-100', name: 'Segredo Feminino Desodorante Colonia', category: 'perfumaria', price: 69.9 },
    { sku: 'OD-BLU-100', name: 'Blue Men Desodorante Colonia', category: 'perfumaria', price: 72.9 },
    { sku: 'OD-SAB-200', name: 'Sabonete Liquido Perfumado', category: 'corpo-e-banho', price: 29.9 }
  ]),
  'quem-disse-berenice': buildSampleProducts('quem-disse-berenice', [
    { sku: 'QDB-BAT-01', name: 'Batom Mate Marromli', category: 'maquiagem', price: 39.9 },
    { sku: 'QDB-BASE-02', name: 'Base Supermate Alta Cobertura', category: 'maquiagem', price: 69.9 },
    { sku: 'QDB-MASC-03', name: 'Mascara de Cilios Super Curvatura', category: 'maquiagem', price: 49.9 }
  ]),
  racco: buildSampleProducts('racco', [
    { sku: 'RA-VOL-100', name: 'Volata Desodorante Colonia Masculina', category: 'perfumaria', price: 109.9 },
    { sku: 'RA-SKN-050', name: 'Serum Facial Skin Care Racco', category: 'rosto', price: 84.9 },
    { sku: 'RA-BDY-250', name: 'Hidratante Corporal Frutas Vermelhas', category: 'corpo-e-banho', price: 42.9 }
  ]),
  skelt: buildSampleProducts('skelt', [
    { sku: 'SK-BRON-150', name: 'Mousse Autobronzeadora Dark', category: 'corpo-e-banho', price: 109.9 },
    { sku: 'SK-SUN-110', name: 'Protetor Solar Corporal FPS 50', category: 'corpo-e-banho', price: 69.9 },
    { sku: 'SK-GLOW-120', name: 'Iluminador Corporal Glow', category: 'corpo-e-banho', price: 64.9 }
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
  barcode: product.barcode || null,
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
  signal,
  headers
}: {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}): Promise<FetchJsonResult> => {
  const wrapped = withTimeoutController(timeoutMs, signal);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; RevendisCatalogBot/1.0)',
        ...(headers || {})
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
    const barcode =
      normalizeBarcode(raw.gtin13) ||
      normalizeBarcode(raw.gtin14) ||
      normalizeBarcode(raw.gtin12) ||
      normalizeBarcode(raw.gtin8) ||
      normalizeBarcode(raw.gtin) ||
      normalizeBarcode(raw.barcode) ||
      normalizeBarcode(raw.ean) ||
      normalizeBarcode(raw.upc) ||
      normalizeBarcode(offer?.gtin13) ||
      normalizeBarcode(offer?.gtin14) ||
      normalizeBarcode(offer?.gtin12) ||
      normalizeBarcode(offer?.gtin8) ||
      normalizeBarcode(offer?.gtin) ||
      normalizeBarcode(offer?.barcode) ||
      normalizeBarcode(offer?.ean) ||
      normalizeBarcode(offer?.upc);

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
      barcode,
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

const resolveAvonBffProductImage = (value: unknown) => {
  const toImagePath = (entry: unknown) => {
    if (typeof entry === 'string') return entry;
    if (!entry || typeof entry !== 'object') return '';
    const image = entry as Record<string, unknown>;
    if (typeof image.absURL === 'string') return image.absURL;
    if (typeof image.url === 'string') return image.url;
    if (typeof image.src === 'string') return image.src;
    return '';
  };

  const resolveFromList = (list: unknown[]) => {
    for (const item of list) {
      const resolved = toAbsoluteUrl(BRAND_BASE_URL.avon, toImagePath(item));
      if (resolved) return resolved;
    }
    return null;
  };

  if (Array.isArray(value)) {
    return resolveFromList(value);
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const candidates = ['large', 'medium', 'small', 'desktop', 'mobile']
    .map((key) => raw[key])
    .filter((item): item is unknown[] => Array.isArray(item))
    .flatMap((bucket) => bucket);

  const preferred = resolveFromList(candidates);
  if (preferred) return preferred;

  return resolveFromList(
    Object.values(raw)
      .filter((entry): entry is unknown[] => Array.isArray(entry))
      .flatMap((entry) => entry)
  );
};

const toAvonProductUrl = ({ productId, name }: { productId: string; name: string }) => {
  const slug = slugifyUrlSegment(name) || slugifyUrlSegment(productId) || 'produto';
  return `${BRAND_BASE_URL.avon}/p/${slug}/${productId}`;
};

const mapAvonBffProduct = (raw: Record<string, unknown>): BrandCatalogProduct | null => {
  const productId = normalizeText(
    typeof raw.productId === 'string'
      ? raw.productId
      : typeof raw.productIdView === 'string'
        ? raw.productIdView
        : ''
  );
  if (!productId) return null;

  const friendlyName = normalizeText(typeof raw.friendlyName === 'string' ? raw.friendlyName : '');
  const name = normalizeText(
    typeof raw.name === 'string' ? raw.name : friendlyName || productId
  );
  if (!name) return null;

  const priceRaw =
    raw.price && typeof raw.price === 'object' ? (raw.price as Record<string, unknown>) : null;
  const salesRaw =
    priceRaw?.sales && typeof priceRaw.sales === 'object'
      ? (priceRaw.sales as Record<string, unknown>)
      : null;
  const listRaw =
    priceRaw?.list && typeof priceRaw.list === 'object'
      ? (priceRaw.list as Record<string, unknown>)
      : null;

  const url = toAbsoluteUrl(BRAND_BASE_URL.avon, typeof raw.url === 'string' ? raw.url : '') || toAvonProductUrl({
    productId,
    name: friendlyName || name
  });

  return {
    id: productId,
    sku: productId,
    barcode: null,
    name,
    brand: normalizeText(typeof raw.brand === 'string' ? raw.brand : CATALOG_BRAND_LABELS.avon),
    price: toPrice(
      salesRaw?.value ??
        salesRaw?.decimalPrice ??
        listRaw?.value ??
        listRaw?.decimalPrice ??
        priceRaw?.value ??
        null
    ),
    inStock:
      typeof raw.inStock === 'boolean'
        ? raw.inStock
        : typeof raw.orderable === 'boolean'
          ? raw.orderable
          : true,
    url,
    imageUrl: resolveAvonBffProductImage(raw.images),
    sourceCategory: slugifyCategory(
      normalizeText(
        typeof raw.categoryId === 'string'
          ? raw.categoryId
          : typeof raw.classificationId === 'string'
            ? raw.classificationId
            : 'catalogo'
      )
    ),
    sourceBrand: 'avon'
  };
};

const fetchAvonBffCatalogProducts = async ({
  signal
}: {
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const deduped = new Map<string, BrandCatalogProduct>();
  const failedSources: string[] = [];
  const apiKey = (process.env.AVON_BFF_API_KEY || DEFAULT_AVON_BFF_API_KEY).trim();
  const tenant = (process.env.AVON_BFF_TENANT || DEFAULT_AVON_BFF_TENANT).trim();

  if (!apiKey || !tenant) {
    return {
      products: [],
      failedSources: ['avon_bff_missing_credentials']
    };
  }

  for (let page = 0; page < MAX_AVON_BFF_PAGES; page += 1) {
    const start = page * AVON_BFF_PAGE_SIZE;
    const searchUrl = new URL(`${BRAND_BASE_URL.avon}${AVON_BFF_PATH}`);
    searchUrl.searchParams.set('apiMode', 'product');
    searchUrl.searchParams.set('count', String(AVON_BFF_PAGE_SIZE));
    searchUrl.searchParams.set('start', String(start));
    searchUrl.searchParams.set('refine_1', `cgid=${AVON_BFF_CATEGORY}`);

    try {
      const response = await fetchJsonWithTimeout({
        url: searchUrl.toString(),
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          x_use_Slas: 'true',
          tenant_id: tenant,
          client_app: 'Web'
        }
      });

      if (!response.ok || !response.json || typeof response.json !== 'object') {
        failedSources.push(searchUrl.toString());
        break;
      }

      const body = response.json as Record<string, unknown>;
      const rawProducts = Array.isArray(body.products) ? body.products : [];
      const totalRaw = typeof body.total === 'number' ? body.total : Number(body.total);
      const total = Number.isFinite(totalRaw) ? totalRaw : null;

      if (rawProducts.length === 0) {
        break;
      }

      rawProducts.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const mapped = mapAvonBffProduct(item as Record<string, unknown>);
        if (mapped) {
          deduped.set(mapped.id, mapped);
        }
      });

      if (total !== null) {
        if (start + rawProducts.length >= total) {
          break;
        }
      } else if (rawProducts.length < AVON_BFF_PAGE_SIZE) {
        break;
      }
    } catch {
      failedSources.push(searchUrl.toString());
      break;
    }
  }

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources))
  };
};

const resolveTrayCatalogUrl = (baseUrl: string, value: unknown) => {
  if (typeof value === 'string') {
    return toAbsoluteUrl(baseUrl, value);
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  return toAbsoluteUrl(
    baseUrl,
    typeof raw.https === 'string'
      ? raw.https
      : typeof raw.http === 'string'
        ? raw.http
        : typeof raw.url === 'string'
          ? raw.url
          : ''
  );
};

const resolveTrayCatalogImageUrl = (baseUrl: string, value: unknown) => {
  if (typeof value === 'string') {
    return toAbsoluteUrl(baseUrl, value);
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  if (raw.ProductImage && typeof raw.ProductImage === 'object') {
    return resolveTrayCatalogImageUrl(baseUrl, raw.ProductImage);
  }

  return toAbsoluteUrl(
    baseUrl,
    typeof raw.https === 'string'
      ? raw.https
      : typeof raw.http === 'string'
        ? raw.http
        : typeof raw.src === 'string'
          ? raw.src
          : typeof raw.url === 'string'
            ? raw.url
            : ''
  );
};

const mapTrayCatalogProduct = ({
  raw,
  sourceBrand,
  baseUrl
}: {
  raw: Record<string, unknown>;
  sourceBrand: CatalogBrandSlug;
  baseUrl: string;
}): BrandCatalogProduct | null => {
  const payload =
    raw.Product && typeof raw.Product === 'object'
      ? (raw.Product as Record<string, unknown>)
      : raw;

  const id = normalizeText(String(payload.id ?? ''));
  const name = normalizeText(
    typeof payload.name === 'string' ? payload.name : typeof payload.model === 'string' ? payload.model : ''
  );
  if (!id || !name) return null;

  const trayUrl = resolveTrayCatalogUrl(baseUrl, payload.url);
  const url = trayUrl || `${baseUrl}/produto/${slugifyUrlSegment(name) || id}`;

  const images = Array.isArray(payload.ProductImage) ? payload.ProductImage : [];
  const firstImage = images[0] || null;
  const imageUrl = resolveTrayCatalogImageUrl(baseUrl, firstImage);

  const sku =
    normalizeText(typeof payload.model === 'string' ? payload.model : '') ||
    normalizeText(typeof payload.ean === 'string' ? payload.ean : '') ||
    id;
  const barcode = normalizeBarcode(payload.ean) || normalizeBarcode(sku) || null;
  const categoryRaw =
    typeof payload.category_id === 'string' || typeof payload.category_id === 'number'
      ? String(payload.category_id)
      : 'catalogo';

  return {
    id,
    sku,
    barcode,
    name,
    brand: normalizeText(typeof payload.brand === 'string' ? payload.brand : CATALOG_BRAND_LABELS[sourceBrand]),
    price: toPrice(payload.promotional_price ?? payload.price ?? null),
    inStock: toBoolean(payload.available_in_store ?? payload.available ?? payload.availability, true),
    url,
    imageUrl,
    sourceCategory: slugifyCategory(categoryRaw),
    sourceBrand
  };
};

const fetchTrayCatalogProducts = async ({
  brand,
  baseUrl,
  path = '/web_api/products',
  signal,
  filterFn
}: {
  brand: CatalogBrandSlug;
  baseUrl: string;
  path?: string;
  signal?: AbortSignal;
  filterFn?: (product: BrandCatalogProduct) => boolean;
}): Promise<UpstreamFetchResult> => {
  const deduped = new Map<string, BrandCatalogProduct>();
  const failedSources: string[] = [];
  const endpoint = toAbsoluteUrl(baseUrl, path);

  if (!endpoint) {
    return {
      products: [],
      failedSources: [`${baseUrl}${path}`]
    };
  }

  for (let page = 1; page <= MAX_TRAY_PAGES; page += 1) {
    const url = new URL(endpoint);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(TRAY_PAGE_SIZE));

    try {
      const response = await fetchJsonWithTimeout({
        url: url.toString(),
        signal
      });

      if (!response.ok || !response.json || typeof response.json !== 'object') {
        failedSources.push(url.toString());
        break;
      }

      const body = response.json as Record<string, unknown>;
      const productsRaw = Array.isArray(body.Products) ? body.Products : [];
      if (productsRaw.length === 0) {
        break;
      }

      productsRaw.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const mapped = mapTrayCatalogProduct({
          raw: entry as Record<string, unknown>,
          sourceBrand: brand,
          baseUrl
        });
        if (mapped && (!filterFn || filterFn(mapped))) {
          deduped.set(mapped.id, mapped);
        }
      });

      const paging =
        body.paging && typeof body.paging === 'object'
          ? (body.paging as Record<string, unknown>)
          : null;
      const totalRaw = typeof paging?.total === 'number' ? paging.total : Number(paging?.total);
      const total = Number.isFinite(totalRaw) ? totalRaw : null;

      if (total !== null && deduped.size >= total) {
        break;
      }
      if (productsRaw.length < TRAY_PAGE_SIZE) {
        break;
      }
    } catch {
      failedSources.push(url.toString());
      break;
    }
  }

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchExtaseCatalogProducts = async ({
  signal
}: {
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const tray = await fetchTrayCatalogProducts({
    brand: 'extase',
    baseUrl: BRAND_BASE_URL.extase,
    filterFn: BRAND_UPSTREAM_PRODUCT_FILTERS.extase,
    signal
  });

  if (tray.products.length > 0 && tray.failedSources.length === 0) {
    return tray;
  }

  const fallback = await fetchGenericBrandCatalogProducts({
    brand: 'extase',
    baseUrl: BRAND_BASE_URL.extase,
    paths: GENERIC_BRAND_PATHS.extase,
    signal,
    filterFn: BRAND_UPSTREAM_PRODUCT_FILTERS.extase
  });

  return mergeUpstreamResults(tray, fallback);
};

const parseDiamanteCatalogProductFromPage = ({
  html,
  productUrl
}: {
  html: string;
  productUrl: string;
}): BrandCatalogProduct | null => {
  const name = normalizeText(
    html.match(/<h1[^>]*itemprop=["']name["'][^>]*>([^<]+)<\/h1>/i)?.[1] ||
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"]+)["']/i)?.[1] ||
      ''
  );
  if (!name) return null;

  const sku = normalizeText(
    html.match(/<span[^>]*itemprop=["']sku["'][^>]*>([^<]+)<\/span>/i)?.[1] ||
      html.match(/<div[^>]*class=["'][^"']*produto-sku[^"']*["'][^>]*>([^<]+)<\/div>/i)?.[1] ||
      ''
  );
  const productId = normalizeText(html.match(/data-produto-id=["']([^"']+)["']/i)?.[1] || '');
  const priceValue =
    html.match(/<meta[^>]*itemprop=["']price["'][^>]*content=["']([^"]+)["']/i)?.[1] ||
    html.match(/data-sell-price=["']([^"']+)["']/i)?.[1] ||
    html.match(/var\s+produto_preco\s*=\s*([0-9.,]+)/i)?.[1] ||
    null;
  const availability = normalizeText(
    html.match(/<meta[^>]*itemprop=["']availability["'][^>]*content=["']([^"]+)["']/i)?.[1] ||
      html.match(/<div[^>]*class=["'][^"']*acoes-produto[^"']*(disponivel|indisponivel)[^"']*["']/i)?.[1] ||
      ''
  ).toLowerCase();

  const imageUrl = toAbsoluteUrl(
    BRAND_BASE_URL.diamante,
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"]+)["']/i)?.[1] || ''
  );

  const categorySlug = normalizeText(
    html.match(
      /<li>\s*<a href=["']https?:\/\/www\.diamanteprofissional\.com\.br\/([^"\/?#]+)[^"']*["']/i
    )?.[1] || 'catalogo'
  );

  return {
    id: productId || sku || `DIAMANTE-${hashId(productUrl)}`,
    sku: sku || productId || `DIAMANTE-${hashId(productUrl)}`,
    barcode: normalizeBarcode(sku),
    name,
    brand: CATALOG_BRAND_LABELS.diamante,
    price: toPrice(priceValue),
    inStock: availability
      ? (availability.includes('instock') || availability.includes('disponivel')) &&
        !availability.includes('outofstock') &&
        !availability.includes('indisponivel')
      : !html.toLowerCase().includes('esgotado'),
    url: productUrl,
    imageUrl,
    sourceCategory: slugifyCategory(categorySlug),
    sourceBrand: 'diamante'
  };
};

const fetchDiamanteSitemapProductUrls = async ({
  signal
}: {
  signal?: AbortSignal;
}) => {
  const failedSources: string[] = [];
  const collected = new Set<string>();
  const sitemapIndexUrl = `${BRAND_BASE_URL.diamante}/sitemap.xml`;
  let productSitemaps: string[] = [];

  try {
    const xml = await fetchTextWithTimeout({
      url: sitemapIndexUrl,
      signal
    });
    productSitemaps = parseXmlLocTags(xml)
      .map((loc) => toAbsoluteUrl(BRAND_BASE_URL.diamante, loc))
      .filter((loc): loc is string => Boolean(loc))
      .filter((loc) => {
        const pathname = (() => {
          try {
            return new URL(loc).pathname.toLowerCase();
          } catch {
            return '';
          }
        })();
        return pathname.includes(DIAMANTE_PRODUCT_SITEMAP_PREFIX) && pathname.endsWith('.xml');
      });
  } catch {
    failedSources.push(sitemapIndexUrl);
  }

  if (productSitemaps.length === 0) {
    productSitemaps = [`${BRAND_BASE_URL.diamante}/sitemap/product-1.xml`];
  }

  for (const sitemapUrl of productSitemaps) {
    try {
      const xml = await fetchTextWithTimeout({
        url: sitemapUrl,
        signal
      });
      parseXmlLocTags(xml)
        .map((loc) => toAbsoluteUrl(BRAND_BASE_URL.diamante, loc))
        .filter((loc): loc is string => Boolean(loc))
        .filter((loc) => {
          const pathname = (() => {
            try {
              return new URL(loc).pathname.toLowerCase();
            } catch {
              return '';
            }
          })();
          return pathname.length > 1 && !pathname.endsWith('.xml') && !pathname.includes('/sitemap/');
        })
        .slice(0, MAX_DIAMANTE_PRODUCT_URLS)
        .forEach((loc) => {
          if (collected.size < MAX_DIAMANTE_PRODUCT_URLS) {
            collected.add(loc);
          }
        });
    } catch {
      failedSources.push(sitemapUrl);
    }
  }

  return {
    urls: Array.from(collected),
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchDiamanteCatalogProductsFromSitemap = async ({
  signal
}: {
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const sitemap = await fetchDiamanteSitemapProductUrls({ signal });
  const failedSources = [...sitemap.failedSources];
  const deduped = new Map<string, BrandCatalogProduct>();
  const uniqueUrls = Array.from(new Set(sitemap.urls)).slice(0, MAX_DIAMANTE_PRODUCT_URLS);
  const concurrency = Math.min(MAX_SITEMAP_FETCH_CONCURRENCY, Math.max(1, uniqueUrls.length));
  let pointer = 0;

  const workers = Array.from({ length: concurrency }).map(async () => {
    while (pointer < uniqueUrls.length) {
      const current = uniqueUrls[pointer];
      pointer += 1;
      if (!current) continue;

      try {
        const html = await fetchTextWithTimeout({
          url: current,
          signal
        });
        const parsed = parseDiamanteCatalogProductFromPage({
          html,
          productUrl: current
        });
        if (parsed) {
          deduped.set(parsed.id, parsed);
        }
      } catch {
        failedSources.push(current);
      }
    }
  });

  await Promise.all(workers);

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchDiamanteCatalogProducts = async ({
  signal
}: {
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const dedicated = await fetchDiamanteCatalogProductsFromSitemap({ signal });
  if (dedicated.products.length > 0 && dedicated.failedSources.length === 0) {
    return dedicated;
  }

  const fallback = await fetchGenericBrandCatalogProducts({
    brand: 'diamante',
    baseUrl: BRAND_BASE_URL.diamante,
    paths: GENERIC_BRAND_PATHS.diamante,
    signal
  });

  return mergeUpstreamResults(dedicated, fallback);
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
  const barcode =
    normalizeBarcode(firstItem?.ean) ||
    normalizeBarcode(firstItem?.ean13) ||
    normalizeBarcode(firstItem?.referenceId) ||
    normalizeBarcode(fallbackSku);

  const id = productId || fallbackSku || `VTEX-${sourceBrand.toUpperCase()}-${hashId(url)}`;
  const sku = productId || fallbackSku || id;

  return {
    id,
    sku,
    barcode,
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
  maxPages = VTEX_MAX_PAGES_BY_BRAND[brand] || MAX_VTEX_PAGES,
  signal
}: {
  brand: CatalogBrandSlug;
  baseUrl: string;
  filterFn?: (product: BrandCatalogProduct) => boolean;
  maxPages?: number;
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const products: BrandCatalogProduct[] = [];
  const deduped = new Map<string, BrandCatalogProduct>();
  const failedSources: string[] = [];

  const safeMaxPages = Math.max(1, Math.min(200, Math.trunc(maxPages)));

  for (let page = 0; page < safeMaxPages; page += 1) {
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

const fetchAvonCatalogProductsFromPages = async ({
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

const fetchAvonCatalogProducts = async ({
  signal
}: {
  signal?: AbortSignal;
}): Promise<UpstreamFetchResult> => {
  const bff = await fetchAvonBffCatalogProducts({ signal });
  if (bff.products.length > 0 && bff.failedSources.length === 0) {
    return bff;
  }
  const pages = await fetchAvonCatalogProductsFromPages({ signal });
  return mergeUpstreamResults(bff, pages);
};

const parseXmlLocTags = (xml: string) =>
  Array.from(xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi))
    .map((match) => normalizeText(match[1]))
    .filter(Boolean);

const looksLikeXmlSitemap = (body: string) => {
  const normalized = normalizeText(body).toLowerCase();
  return normalized.includes('<urlset') || normalized.includes('<sitemapindex');
};

const toPathname = (value: string) => {
  try {
    return new URL(value).pathname || '/';
  } catch {
    return '/';
  }
};

const isLikelyCatalogPageUrl = (value: string) => {
  const pathname = toPathname(value).toLowerCase();
  if (!pathname || pathname === '/') return false;
  if (pathname.endsWith('.xml')) return false;
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.png')) return false;
  if (pathname.includes('/wp-json/')) return false;
  if (pathname.includes('/tag/') || pathname.includes('/categoria/') || pathname.includes('/category/')) return false;
  if (pathname.includes('/blog/') || pathname.includes('/institucional/') || pathname.includes('/contato')) {
    return false;
  }
  return true;
};

const fetchSitemapCatalogUrls = async ({
  baseUrl,
  signal
}: {
  baseUrl: string;
  signal?: AbortSignal;
}) => {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const queue: string[] = [`${normalizedBase}/sitemap.xml`, `${normalizedBase}/sitemap_index.xml`];
  const visited = new Set<string>();
  const collected = new Set<string>();
  const failedSources: string[] = [];

  while (queue.length > 0 && visited.size < MAX_SITEMAP_FILES && collected.size < MAX_SITEMAP_PRODUCT_URLS) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);

    try {
      const xml = await fetchTextWithTimeout({
        url: sitemapUrl,
        signal
      });
      if (!looksLikeXmlSitemap(xml)) {
        continue;
      }

      const locs = parseXmlLocTags(xml)
        .map((item) => toAbsoluteUrl(normalizedBase, item))
        .filter((item): item is string => Boolean(item));

      if (xml.toLowerCase().includes('<sitemapindex')) {
        locs.forEach((loc) => {
          if (!visited.has(loc) && queue.length < MAX_SITEMAP_FILES * 2) {
            queue.push(loc);
          }
        });
        continue;
      }

      locs
        .filter((loc) => isLikelyCatalogPageUrl(loc))
        .slice(0, MAX_SITEMAP_PRODUCT_URLS)
        .forEach((loc) => {
          if (collected.size < MAX_SITEMAP_PRODUCT_URLS) {
            collected.add(loc);
          }
        });
    } catch {
      failedSources.push(sitemapUrl);
    }
  }

  return {
    urls: Array.from(collected),
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchCatalogProductsFromPageUrls = async ({
  brand,
  baseUrl,
  urls,
  signal,
  filterFn
}: {
  brand: CatalogBrandSlug;
  baseUrl: string;
  urls: string[];
  signal?: AbortSignal;
  filterFn?: (product: BrandCatalogProduct) => boolean;
}): Promise<UpstreamFetchResult> => {
  const deduped = new Map<string, BrandCatalogProduct>();
  const failedSources: string[] = [];
  const uniqueUrls = Array.from(new Set(urls)).slice(0, MAX_SITEMAP_PRODUCT_URLS);
  const concurrency = Math.min(MAX_SITEMAP_FETCH_CONCURRENCY, Math.max(1, uniqueUrls.length));

  let pointer = 0;
  const workers = Array.from({ length: concurrency }).map(async () => {
    while (pointer < uniqueUrls.length) {
      const current = uniqueUrls[pointer];
      pointer += 1;
      if (!current) continue;

      try {
        const html = await fetchTextWithTimeout({
          url: current,
          signal
        });
        const parsed = extractJsonLdProducts({
          html,
          brand: CATALOG_BRAND_LABELS[brand],
          sourceBrand: brand,
          sourcePath: toPathname(current),
          baseUrl
        });

        parsed.forEach((product) => {
          if (!filterFn || filterFn(product)) {
            deduped.set(product.id, product);
          }
        });
      } catch {
        failedSources.push(current);
      }
    }
  });

  await Promise.all(workers);

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources))
  };
};

const fetchGenericBrandCatalogProducts = async ({
  brand,
  baseUrl,
  paths,
  signal,
  filterFn
}: {
  brand: CatalogBrandSlug;
  baseUrl: string;
  paths: string[];
  signal?: AbortSignal;
  filterFn?: (product: BrandCatalogProduct) => boolean;
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
        if (!filterFn || filterFn(product)) {
          deduped.set(product.id, product);
        }
      });
    } catch {
      failedSources.push(url);
    }
  }

  const sitemap = await fetchSitemapCatalogUrls({
    baseUrl,
    signal
  });
  failedSources.push(...sitemap.failedSources);

  if (sitemap.urls.length > 0) {
    const crawled = await fetchCatalogProductsFromPageUrls({
      brand,
      baseUrl,
      urls: sitemap.urls,
      signal,
      filterFn
    });
    failedSources.push(...crawled.failedSources);
    crawled.products.forEach((product) => {
      deduped.set(product.id, product);
    });
  }

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set(failedSources))
  };
};

const mergeUpstreamResults = (
  primary: UpstreamFetchResult,
  secondary: UpstreamFetchResult
): UpstreamFetchResult => {
  const deduped = new Map<string, BrandCatalogProduct>();
  [...primary.products, ...secondary.products].forEach((product) => {
    deduped.set(product.id, product);
  });

  return {
    products: Array.from(deduped.values()),
    failedSources: Array.from(new Set([...primary.failedSources, ...secondary.failedSources]))
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
    case 'avon': {
      const upstream = await fetchAvonCatalogProducts({ signal });
      if (upstream.products.length > 0) {
        return upstream;
      }
      const fallback = await fetchGenericBrandCatalogProducts({
        brand: 'avon',
        baseUrl: BRAND_BASE_URL.avon,
        paths: [...AVON_PATHS],
        signal
      });
      return mergeUpstreamResults(upstream, fallback);
    }
    case 'mary-kay':
      return fetchMaryKayCatalogProducts({ signal });
    case 'tupperware':
      return fetchTupperwareCatalogProducts({ signal });
    case 'eudora': {
      const upstream = await fetchVtexCatalogProducts({
        brand: 'eudora',
        baseUrl: BRAND_BASE_URL.eudora,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('eudora'),
        signal
      });
      if (upstream.products.length > 0) {
        return upstream;
      }
      const fallback = await fetchGenericBrandCatalogProducts({
        brand: 'eudora',
        baseUrl: BRAND_BASE_URL.eudora,
        paths: ['/'],
        signal,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('eudora')
      });
      return mergeUpstreamResults(upstream, fallback);
    }
    case 'boticario': {
      const upstream = await fetchVtexCatalogProducts({
        brand: 'boticario',
        baseUrl: BRAND_BASE_URL.boticario,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('boticario'),
        signal
      });
      if (upstream.products.length > 0) {
        return upstream;
      }
      const fallback = await fetchGenericBrandCatalogProducts({
        brand: 'boticario',
        baseUrl: BRAND_BASE_URL.boticario,
        paths: ['/'],
        signal,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('boticario')
      });
      return mergeUpstreamResults(upstream, fallback);
    }
    case 'oui': {
      const upstream = await fetchVtexCatalogProducts({
        brand: 'oui',
        baseUrl: BRAND_BASE_URL.boticario,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('oui'),
        signal
      });
      if (upstream.products.length > 0) {
        return upstream;
      }
      const fallback = await fetchGenericBrandCatalogProducts({
        brand: 'oui',
        baseUrl: BRAND_BASE_URL.oui,
        paths: ['/'],
        signal,
        filterFn: (product) => normalizeBrandToken(product.brand).includes('oui')
      });
      return mergeUpstreamResults(upstream, fallback);
    }
    case 'natura':
      return {
        products: [],
        failedSources: []
      };
    case 'quem-disse-berenice':
      return fetchVtexCatalogProducts({
        brand: 'quem-disse-berenice',
        baseUrl: BRAND_BASE_URL['quem-disse-berenice'],
        signal
      });
    case 'demillus':
    case 'farmasi':
    case 'hinode':
    case 'jequiti':
    case 'loccitane-au-bresil':
    case 'mahogany':
    case 'moments-paris':
    case 'odorata':
    case 'racco':
    case 'skelt':
      return fetchGenericBrandCatalogProducts({
        brand,
        baseUrl: BRAND_BASE_URL[brand],
        paths: GENERIC_BRAND_PATHS[brand],
        signal,
        filterFn: BRAND_UPSTREAM_PRODUCT_FILTERS[brand]
      });
    case 'extase':
      return fetchExtaseCatalogProducts({ signal });
    case 'diamante':
      return fetchDiamanteCatalogProducts({ signal });
  }
};

export const resolveCatalogBrandSlug = (value: string): CatalogBrandSlug | null => {
  const token = normalizeBrandToken(value);
  if (!token) return null;
  return BRAND_BY_ALIAS[token] || null;
};

export const getSampleBrandCatalogProducts = (brand: CatalogBrandSlug): BrandCatalogProduct[] =>
  ensureCatalogProductImages(cloneProducts(SAMPLE_BRAND_PRODUCTS[brand]));

export const fetchBrandCatalogProducts = async ({
  brand,
  signal,
  useSampleFallback = true
}: {
  brand: CatalogBrandSlug;
  signal?: AbortSignal;
  useSampleFallback?: boolean;
}): Promise<FetchBrandCatalogResult> => {
  if (shouldBypassUpstreamFetch()) {
    if (!useSampleFallback) {
      return {
        products: [],
        source: 'upstream',
        failedSources: [],
        failedDetails: []
      };
    }
    return {
      products: getSampleBrandCatalogProducts(brand),
      source: 'sample',
      failedSources: [],
      failedDetails: []
    };
  }

  if (brand === 'natura') {
    try {
      const { products, failedSources, failedDetails } = await fetchNaturaCatalogProducts({ signal });
      const mapped = products.map(mapNaturaProduct);

      if (mapped.length > 0) {
        return {
          products: ensureCatalogProductImages(mapped),
          source: 'upstream',
          failedSources,
          failedDetails
        };
      }

      if (!useSampleFallback) {
        return {
          products: [],
          source: 'upstream',
          failedSources: failedSources.length ? failedSources : ['natura.com.br'],
          failedDetails
        };
      }

      return {
        products: getSampleBrandCatalogProducts('natura'),
        source: 'sample',
        failedSources: failedSources.length ? failedSources : ['natura.com.br'],
        failedDetails
      };
    } catch {
      if (!useSampleFallback) {
        return {
          products: [],
          source: 'upstream',
          failedSources: ['natura.com.br'],
          failedDetails: [
            {
              source: 'natura.com.br',
              error: 'natura_fetch_failed',
              attempts: []
            }
          ]
        };
      }
      return {
        products: getSampleBrandCatalogProducts('natura'),
        source: 'sample',
        failedSources: ['natura.com.br'],
        failedDetails: [
          {
            source: 'natura.com.br',
            error: 'natura_fetch_failed',
            attempts: []
          }
        ]
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
      products: ensureCatalogProductImages(upstream.products),
      source: 'upstream',
      failedSources: upstream.failedSources,
      failedDetails: []
    };
  }

  if (!useSampleFallback) {
    return {
      products: [],
      source: 'upstream',
      failedSources: upstream.failedSources.length ? upstream.failedSources : [BRAND_BASE_URL[brand]],
      failedDetails: []
    };
  }

  return {
    products: getSampleBrandCatalogProducts(brand),
    source: 'sample',
    failedSources: upstream.failedSources.length ? upstream.failedSources : [BRAND_BASE_URL[brand]],
    failedDetails: []
  };
};
