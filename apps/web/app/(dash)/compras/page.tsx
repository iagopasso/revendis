import Link from 'next/link';
import {
  fetchList,
  getDateRangeFromSearchParams,
  getStringParam,
  isInDateRange
} from '../lib';
import PurchasesPanel from './purchases-panel';

type Purchase = {
  id: string;
  supplier: string;
  status: 'pending' | 'received' | 'cancelled';
  total: number | string;
  items: number | string;
  brand?: string | null;
  purchase_date: string;
  created_at: string;
};

type ResellerBrand = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  price: number | string;
  active?: boolean;
};

type SearchParams = {
  range?: string | string[];
  month?: string | string[];
  from?: string | string[];
  to?: string | string[];
  newPurchase?: string | string[];
};

const uniqueBrands = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

export default async function ComprasPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const [purchasesResponse, resellerBrandsResponse, productsResponse] = await Promise.all([
    fetchList<Purchase>('/purchases'),
    fetchList<ResellerBrand>('/settings/brands'),
    fetchList<Product>('/inventory/products')
  ]);

  const purchases = purchasesResponse?.data ?? [];
  const products = productsResponse?.data ?? [];
  const dateRange = getDateRangeFromSearchParams(resolvedParams);
  const purchasesInRange = purchases.filter((purchase) =>
    isInDateRange(purchase.purchase_date || purchase.created_at, dateRange)
  );
  const initialCreateOpen = getStringParam(resolvedParams.newPurchase) === '1';
  const resellerBrands = resellerBrandsResponse?.data ?? [];

  const availableBrands = uniqueBrands([
    ...purchases.map((purchase) => purchase.brand),
    ...products.map((product) => product.brand),
    ...resellerBrands.map((brand) => brand.name)
  ]);
  const createPurchaseParams = new URLSearchParams();
  Object.entries(resolvedParams).forEach(([key, rawValue]) => {
    if (key === 'newPurchase') return;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (!value) return;
    createPurchaseParams.set(key, value);
  });
  createPurchaseParams.set('newPurchase', '1');
  const createPurchaseHref = `/compras?${createPurchaseParams.toString()}`;

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Compras</span>
          <h1>Compras</h1>
          <p>Controle pedidos de fornecedores e entradas no estoque.</p>
        </section>
        <div className="actions">
          <Link className="button primary" href={createPurchaseHref}>
            + Nova compra
          </Link>
        </div>
      </div>

      <PurchasesPanel
        initialPurchases={purchasesInRange}
        availableBrands={availableBrands}
        products={products}
        initialCreateOpen={initialCreateOpen}
      />
    </main>
  );
}
