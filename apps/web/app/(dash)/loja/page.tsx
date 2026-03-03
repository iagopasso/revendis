import StorefrontShell from '../storefront-shell';
import { fetchItem, fetchList } from '../lib';
import {
  storefrontRuntimeStateFromPayload,
  storefrontSettingsFromPayload,
  type StorefrontRuntimeState,
  type StorefrontSettingsPayload
} from '../../lib/storefront-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type StoreCatalogProduct = {
  id: string;
  sku?: string | null;
  name: string;
  brand?: string | null;
  image_url?: string | null;
  quantity?: number | string;
  price?: number | string;
  active?: boolean;
};

export default async function LojaPage() {
  const [catalogResponse, settingsResponse] = await Promise.all([
    fetchList<StoreCatalogProduct>('/storefront/catalog'),
    fetchItem<Partial<StorefrontSettingsPayload> & { runtimeState?: Partial<StorefrontRuntimeState> }>(
      '/settings/storefront'
    )
  ]);

  const catalog = (catalogResponse?.data || []).filter(
    (item) => typeof item.id === 'string' && typeof item.name === 'string'
  );

  const initialSettings = storefrontSettingsFromPayload(settingsResponse?.data);
  const initialRuntimeState = storefrontRuntimeStateFromPayload(settingsResponse?.data?.runtimeState || null);

  return (
    <StorefrontShell
      initialCatalog={catalog}
      initialStoreName={initialSettings.shopName}
      initialStoreSettings={initialSettings}
      initialRuntimeState={initialRuntimeState}
    />
  );
}
