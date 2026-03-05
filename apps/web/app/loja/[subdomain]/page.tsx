import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { API_BASE } from '../../(dash)/lib';
import { resolveBrandLogo } from '../../(dash)/brand-logos';
import PublicStorefront from './public-storefront';
import type { StorefrontRuntimeState } from '../../lib/storefront-settings';

type StoreProduct = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
  quantity?: number | string;
  price?: number | string;
  active?: boolean;
};

type StorefrontSettings = {
  shopName?: string;
  subdomain?: string;
  shopColor?: string;
  onlyStockProducts?: boolean;
  showOutOfStockProducts?: boolean;
  filterByCategory?: boolean;
  filterByBrand?: boolean;
  filterByPrice?: boolean;
  whatsapp?: string;
  showWhatsappButton?: boolean;
  selectedBrands?: string[];
  selectedCategories?: string[];
  priceFrom?: string;
  priceTo?: string;
  logoUrl?: string;
  pixKey?: string;
  creditCardLink?: string;
  boletoLink?: string;
  runtimeState?: Partial<StorefrontRuntimeState>;
  mercadoPagoEnabled?: boolean;
};

type StorefrontPayload = {
  settings?: StorefrontSettings;
  products?: StoreProduct[];
};

type PublicStoreSearchParams = Record<string, string | string[] | undefined>;
const readSearchParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] || '' : value || '');
const FALLBACK_STORE_NAME = 'Revendis Prime';
const MAX_SHARE_IMAGES = 5;

const normalizeString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const hasMetadataImageShape = (value: string) => /^https?:\/\//i.test(value) || value.startsWith('/');

const fetchPublicStorefront = async (subdomain: string): Promise<StorefrontPayload | null> => {
  try {
    const response = await fetch(`${API_BASE}/storefront/public/${encodeURIComponent(subdomain)}`, {
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: StorefrontPayload };
    return payload?.data || null;
  } catch {
    return null;
  }
};

const resolveMetadataBase = async () => {
  const requestHeaders = await headers();
  const host = normalizeString(requestHeaders.get('x-forwarded-host') || requestHeaders.get('host'));
  if (!host) return undefined;
  const forwardedProtocol = normalizeString(requestHeaders.get('x-forwarded-proto'));
  const protocol = forwardedProtocol.split(',')[0] || (host.includes('localhost') ? 'http' : 'https');
  try {
    return new URL(`${protocol}://${host}`);
  } catch {
    return undefined;
  }
};

const buildShareImages = (settings?: StorefrontSettings) => {
  const shopLogo = normalizeString(settings?.logoUrl);
  const brandLogos = (settings?.selectedBrands || [])
    .map((brand) => resolveBrandLogo(brand))
    .filter((logo): logo is string => Boolean(logo))
    .map((logo) => logo.trim());

  const uniqueImages = Array.from(new Set([shopLogo, ...brandLogos]))
    .filter((value) => value.length > 0 && hasMetadataImageShape(value))
    .slice(0, MAX_SHARE_IMAGES);

  if (uniqueImages.length > 0) return uniqueImages;
  return ['/logo.png'];
};

export async function generateMetadata({
  params
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Metadata> {
  const { subdomain } = await params;
  const storefront = await fetchPublicStorefront(subdomain);
  const shopName = normalizeString(storefront?.settings?.shopName) || FALLBACK_STORE_NAME;
  const description = `Conheca os produtos da loja ${shopName} no Revendis.`;
  const metadataBase = await resolveMetadataBase();
  const shareImages = buildShareImages(storefront?.settings);

  return {
    metadataBase,
    title: `${shopName} | Revendis`,
    description,
    openGraph: {
      type: 'website',
      title: shopName,
      description,
      url: `/loja/${encodeURIComponent(subdomain)}`,
      images: shareImages
    },
    twitter: {
      card: 'summary_large_image',
      title: shopName,
      description,
      images: shareImages
    }
  };
}

export default async function PublicStorePage({
  params,
  searchParams
}: {
  params: Promise<{ subdomain: string }>;
  searchParams?: Promise<PublicStoreSearchParams>;
}) {
  const { subdomain } = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const initialProductId = readSearchParam(resolvedSearch.produto);
  const initialSegmentParam = readSearchParam(resolvedSearch.segmento) || readSearchParam(resolvedSearch.segment);
  const initialHeroParam = readSearchParam(resolvedSearch.hero) || readSearchParam(resolvedSearch.ab);
  const storefront = await fetchPublicStorefront(subdomain);

  return (
    <PublicStorefront
      subdomain={subdomain}
      initialProducts={storefront?.products || []}
      initialStoreSettings={storefront?.settings}
      initialStoreName={storefront?.settings?.shopName || FALLBACK_STORE_NAME}
      initialProductId={typeof initialProductId === 'string' ? initialProductId : ''}
      initialSegmentParam={initialSegmentParam}
      initialHeroParam={initialHeroParam}
      unavailable={!storefront}
    />
  );
}
