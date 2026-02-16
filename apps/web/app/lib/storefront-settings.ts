export type StorefrontSettings = {
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
};

export type StorefrontSettingsPayload = StorefrontSettings & {
  logoUrl?: string;
};

export type StorefrontRuntimeProduct = {
  id: string;
  name: string;
  price?: number | string;
  active?: boolean;
};

export type StorefrontRuntimePromotion = {
  id: string;
  name: string;
  discount: number;
  productIds: string[];
};

export type StorefrontRuntimeState = {
  activeProducts: StorefrontRuntimeProduct[];
  promotions: StorefrontRuntimePromotion[];
};

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  shopName: 'Revendis Prime',
  subdomain: 'revendis-prime',
  shopColor: '#7D58D4',
  onlyStockProducts: false,
  showOutOfStockProducts: true,
  filterByCategory: true,
  filterByBrand: true,
  filterByPrice: true,
  whatsapp: '',
  showWhatsappButton: false,
  selectedBrands: [],
  selectedCategories: [],
  priceFrom: '',
  priceTo: ''
};

export const DEFAULT_STOREFRONT_RUNTIME_STATE: StorefrontRuntimeState = {
  activeProducts: [],
  promotions: []
};

export const STOREFRONT_SETTINGS_EVENT = 'revendis:storefront-settings-updated';

const STOREFRONT_SETTINGS_STORAGE_KEY = 'revendis:storefront-settings:v1';
const STOREFRONT_RUNTIME_STORAGE_KEY = 'revendis:storefront-runtime:v1';

const isClient = () => typeof window !== 'undefined';

export const sanitizeSubdomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);

const toStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export const normalizeStorefrontSettings = (
  payload?: Partial<StorefrontSettings> | null
): StorefrontSettings => {
  const next = payload || {};
  const cleanSubdomain = sanitizeSubdomain(next.subdomain || DEFAULT_STOREFRONT_SETTINGS.subdomain);
  return {
    shopName: (next.shopName || DEFAULT_STOREFRONT_SETTINGS.shopName).trim() || DEFAULT_STOREFRONT_SETTINGS.shopName,
    subdomain: cleanSubdomain || DEFAULT_STOREFRONT_SETTINGS.subdomain,
    shopColor: (next.shopColor || DEFAULT_STOREFRONT_SETTINGS.shopColor).trim() || DEFAULT_STOREFRONT_SETTINGS.shopColor,
    onlyStockProducts: Boolean(next.onlyStockProducts),
    showOutOfStockProducts:
      typeof next.showOutOfStockProducts === 'boolean'
        ? next.showOutOfStockProducts
        : DEFAULT_STOREFRONT_SETTINGS.showOutOfStockProducts,
    filterByCategory:
      typeof next.filterByCategory === 'boolean'
        ? next.filterByCategory
        : DEFAULT_STOREFRONT_SETTINGS.filterByCategory,
    filterByBrand:
      typeof next.filterByBrand === 'boolean'
        ? next.filterByBrand
        : DEFAULT_STOREFRONT_SETTINGS.filterByBrand,
    filterByPrice:
      typeof next.filterByPrice === 'boolean'
        ? next.filterByPrice
        : DEFAULT_STOREFRONT_SETTINGS.filterByPrice,
    whatsapp: typeof next.whatsapp === 'string' ? next.whatsapp : DEFAULT_STOREFRONT_SETTINGS.whatsapp,
    showWhatsappButton:
      typeof next.showWhatsappButton === 'boolean'
        ? next.showWhatsappButton
        : DEFAULT_STOREFRONT_SETTINGS.showWhatsappButton,
    selectedBrands: toStringArray(next.selectedBrands),
    selectedCategories: toStringArray(next.selectedCategories),
    priceFrom: typeof next.priceFrom === 'string' ? next.priceFrom : DEFAULT_STOREFRONT_SETTINGS.priceFrom,
    priceTo: typeof next.priceTo === 'string' ? next.priceTo : DEFAULT_STOREFRONT_SETTINGS.priceTo
  };
};

export const storefrontSettingsFromPayload = (
  payload?: Partial<StorefrontSettingsPayload> | null
): StorefrontSettings => normalizeStorefrontSettings(payload || null);

export const storefrontSettingsToPayload = (settings: StorefrontSettings): StorefrontSettingsPayload => ({
  ...normalizeStorefrontSettings(settings)
});

export const buildPublicStoreUrl = (subdomain: string, origin?: string) => {
  const cleanSubdomain = sanitizeSubdomain(subdomain) || DEFAULT_STOREFRONT_SETTINGS.subdomain;
  const cleanOrigin = (origin || '').replace(/\/+$/, '');
  if (!cleanOrigin) return `/loja/${cleanSubdomain}`;
  return `${cleanOrigin}/loja/${cleanSubdomain}`;
};

export const loadStorefrontSettings = (): StorefrontSettings | null => {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(STOREFRONT_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StorefrontSettings>;
    return normalizeStorefrontSettings(parsed);
  } catch {
    return null;
  }
};

export const saveStorefrontSettings = (settings: StorefrontSettings) => {
  if (!isClient()) return;
  window.localStorage.setItem(
    STOREFRONT_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeStorefrontSettings(settings))
  );
};

export const emitStorefrontSettingsUpdated = (settings: StorefrontSettings) => {
  if (!isClient()) return;
  window.dispatchEvent(new CustomEvent(STOREFRONT_SETTINGS_EVENT, { detail: settings }));
};

const normalizeRuntimeProduct = (item: unknown): StorefrontRuntimeProduct | null => {
  if (!item || typeof item !== 'object') return null;
  const record = item as Partial<StorefrontRuntimeProduct>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  return {
    id: record.id,
    name: record.name,
    price: record.price,
    active: record.active
  };
};

const normalizeRuntimePromotion = (item: unknown): StorefrontRuntimePromotion | null => {
  if (!item || typeof item !== 'object') return null;
  const record = item as Partial<StorefrontRuntimePromotion>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  return {
    id: record.id,
    name: record.name,
    discount: Number(record.discount) || 0,
    productIds: toStringArray(record.productIds)
  };
};

export const loadStorefrontRuntimeState = (): StorefrontRuntimeState | null => {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(STOREFRONT_RUNTIME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StorefrontRuntimeState>;
    return {
      activeProducts: Array.isArray(parsed.activeProducts)
        ? parsed.activeProducts.map(normalizeRuntimeProduct).filter((item): item is StorefrontRuntimeProduct => Boolean(item))
        : [],
      promotions: Array.isArray(parsed.promotions)
        ? parsed.promotions.map(normalizeRuntimePromotion).filter((item): item is StorefrontRuntimePromotion => Boolean(item))
        : []
    };
  } catch {
    return null;
  }
};

export const saveStorefrontRuntimeState = (state: StorefrontRuntimeState) => {
  if (!isClient()) return;
  window.localStorage.setItem(
    STOREFRONT_RUNTIME_STORAGE_KEY,
    JSON.stringify({
      activeProducts: state.activeProducts,
      promotions: state.promotions
    })
  );
};
