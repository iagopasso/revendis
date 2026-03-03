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
  const initialSection = getStringParam(resolved.section) || 'conta';

  const [
    brandsResponse,
    catalogBrandsResponse,
    accountResponse,
    accessResponse
  ] = await Promise.all([
    fetchList<ResellerBrand>('/settings/brands'),
    fetchList<CatalogBrandOption>('/catalog/brands'),
    fetchItem<AccountSettings>('/settings/account'),
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
        initialAccessMembers={accessResponse?.data ?? []}
      />
    </main>
  );
}
