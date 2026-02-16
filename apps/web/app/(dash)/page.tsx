import { Suspense } from 'react';
import { fetchItem, fetchList } from './lib';
import StorefrontShell from './storefront-shell';
import type { StorefrontSettings } from '../lib/storefront-settings';

type StoreProduct = {
  id: string;
  name: string;
  price?: number | string;
  active?: boolean;
};

type StoreAccount = {
  businessName?: string;
};

export default async function Home() {
  const [catalog, account, storefront] = await Promise.all([
    fetchList<StoreProduct>('/storefront/catalog'),
    fetchItem<StoreAccount>('/settings/account'),
    fetchItem<StorefrontSettings>('/settings/storefront')
  ]);

  return (
    <Suspense fallback={null}>
      <StorefrontShell
        initialCatalog={catalog?.data || []}
        initialStoreName={account?.data?.businessName || ''}
        initialStoreSettings={storefront?.data || undefined}
      />
    </Suspense>
  );
}
