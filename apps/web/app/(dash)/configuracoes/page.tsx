import { fetchItem, fetchList, getStringParam } from '../lib';
import SettingsPanel from './settings-panel';

type SearchParams = {
  section?: string | string[];
};

type ResellerBrand = {
  id: string;
  name: string;
  source: 'existing' | 'catalog' | 'manual';
  source_brand?: string | null;
  profitability?: number | string;
  logo_url?: string | null;
  created_at?: string;
};

type Product = {
  id: string;
  brand?: string | null;
};

type CatalogItem = {
  id: string;
  brand?: string | null;
};

type AccountSettings = {
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  businessName?: string;
};

type SubscriptionSettings = {
  plan?: string;
  status?: string;
  renewalDate?: string;
  monthlyPrice?: number | string;
};

type PixSettings = {
  keyType?: string;
  keyValue?: string;
  holderName?: string;
};

type AlertSettings = {
  enabled?: boolean;
  daysBeforeDue?: number | string;
};

type AccessMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at?: string;
};

const DEFAULT_BEAUTY_BRANDS = [
  'Avon',
  'Natura',
  'O Boticario',
  'Eudora',
  'Jequiti',
  'Mary Kay',
  'Hinode',
  'Quem Disse, Berenice?',
  'Vult',
  'Ruby Rose',
  'Dailus',
  'Boca Rosa',
  'Bruna Tavares',
  'Payot',
  'Simple Organic',
  'Lola Cosmetics',
  'Salon Line',
  'Skala',
  'Nivea',
  'L Oreal Paris'
];

const uniqueBrands = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

export default async function ConfiguracoesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = (await searchParams) ?? {};
  const initialSection = getStringParam(resolved.section) || 'marcas';

  const [
    brandsResponse,
    productsResponse,
    catalogResponse,
    accountResponse,
    subscriptionResponse,
    pixResponse,
    alertsResponse,
    accessResponse
  ] = await Promise.all([
    fetchList<ResellerBrand>('/settings/brands'),
    fetchList<Product>('/inventory/products'),
    fetchList<CatalogItem>('/storefront/catalog'),
    fetchItem<AccountSettings>('/settings/account'),
    fetchItem<SubscriptionSettings>('/settings/subscription'),
    fetchItem<PixSettings>('/settings/pix'),
    fetchItem<AlertSettings>('/settings/alerts'),
    fetchList<AccessMember>('/settings/access')
  ]);

  const configuredBrands = brandsResponse?.data ?? [];
  const inventoryBrands = uniqueBrands((productsResponse?.data ?? []).map((item) => item.brand));
  const catalogBrands = uniqueBrands((catalogResponse?.data ?? []).map((item) => item.brand));
  const catalogBrandOptions = uniqueBrands([...catalogBrands, ...inventoryBrands]);
  const existingBrandOptions = uniqueBrands([
    ...DEFAULT_BEAUTY_BRANDS,
    ...catalogBrands,
    ...inventoryBrands
  ]);

  return (
    <main className="page-content settings-page">
      <SettingsPanel
        initialSection={initialSection}
        initialBrands={configuredBrands}
        existingBrandOptions={existingBrandOptions}
        catalogBrandOptions={catalogBrandOptions}
        initialAccount={accountResponse?.data ?? {}}
        initialSubscription={subscriptionResponse?.data ?? {}}
        initialPix={pixResponse?.data ?? {}}
        initialAlerts={alertsResponse?.data ?? {}}
        initialAccessMembers={accessResponse?.data ?? []}
      />
    </main>
  );
}
