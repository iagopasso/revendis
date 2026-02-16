import { API_BASE } from '../../(dash)/lib';
import PublicStorefront from './public-storefront';

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
};

type StorefrontPayload = {
  settings?: StorefrontSettings;
  products?: StoreProduct[];
};

export default async function PublicStorePage({ params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const fallbackName = 'Revendis Prime';

  let storefront: StorefrontPayload | null = null;
  try {
    const response = await fetch(`${API_BASE}/storefront/public/${encodeURIComponent(subdomain)}`, {
      cache: 'no-store'
    });
    if (response.ok) {
      const payload = (await response.json()) as { data?: StorefrontPayload };
      storefront = payload?.data || null;
    }
  } catch {
    storefront = null;
  }

  return (
    <PublicStorefront
      subdomain={subdomain}
      initialProducts={storefront?.products || []}
      initialStoreSettings={storefront?.settings}
      initialStoreName={storefront?.settings?.shopName || fallbackName}
      unavailable={!storefront}
    />
  );
}
