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

type CatalogBrandOption = {
  slug: string;
  label: string;
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

export default async function ConfiguracoesPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = (await searchParams) ?? {};
  const initialSection = getStringParam(resolved.section) || 'marcas';

  const [
    brandsResponse,
    catalogBrandsResponse,
    accountResponse,
    subscriptionResponse,
    pixResponse,
    alertsResponse,
    accessResponse
  ] = await Promise.all([
    fetchList<ResellerBrand>('/settings/brands'),
    fetchList<CatalogBrandOption>('/catalog/brands'),
    fetchItem<AccountSettings>('/settings/account'),
    fetchItem<SubscriptionSettings>('/settings/subscription'),
    fetchItem<PixSettings>('/settings/pix'),
    fetchItem<AlertSettings>('/settings/alerts'),
    fetchList<AccessMember>('/settings/access')
  ]);

  const configuredBrands = brandsResponse?.data ?? [];
  const catalogBrandOptions = (catalogBrandsResponse?.data ?? []).map((item) => ({
    slug: item.slug,
    label: item.label
  }));
  return (
    <main className="page-content settings-page">
      <SettingsPanel
        initialSection={initialSection}
        initialBrands={configuredBrands}
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
