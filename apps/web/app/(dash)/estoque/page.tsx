import { fetchList, getStringParam, toNumber } from '../lib';
import InventoryPanel from '../categorias/inventory-panel';

type Product = {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  price: number | string;
  active: boolean;
  quantity?: number | string;
  expires_at?: string | null;
  category_id?: string | null;
};

type Category = {
  id: string;
  name: string;
  color?: string | null;
};

type ResellerBrand = {
  id: string;
  name: string;
};

type SearchParams = {
  q?: string | string[];
  stock?: string | string[];
  view?: string | string[];
  category?: string | string[];
  brand?: string | string[];
};

const EXPIRING_DAYS = 7;
const LOW_STOCK_THRESHOLD = 2;

const getDaysUntil = (value?: string | null) => {
  if (!value) return null;
  const expiresAt = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = expiresAt.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const isExpiring = (value?: string | null) => {
  const days = getDaysUntil(value);
  return days !== null && days >= 0 && days <= EXPIRING_DAYS;
};

const uniqueBrands = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

export default async function EstoquePage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const [productsResponse, categoriesResponse, resellerBrandsResponse] = await Promise.all([
    fetchList<Product>('/inventory/products'),
    fetchList<Category>('/inventory/categories'),
    fetchList<ResellerBrand>('/settings/brands')
  ]);
  const products = productsResponse?.data ?? [];
  const categories = categoriesResponse?.data ?? [];
  const resellerBrands = resellerBrandsResponse?.data ?? [];
  const query = getStringParam(resolvedParams.q).trim();
  const stockFilter = getStringParam(resolvedParams.stock) || 'all';
  const categoryFilter = getStringParam(resolvedParams.category) || 'all';
  const brandFilter = getStringParam(resolvedParams.brand) || 'all';

  const normalizedQuery = query.toLowerCase();

  const filteredProducts = products.filter((product) => {
    const quantity = toNumber(product.quantity ?? 0);
    const expiring = isExpiring(product.expires_at);
    const matchesQuery =
      !normalizedQuery ||
      product.name.toLowerCase().includes(normalizedQuery) ||
      product.sku.toLowerCase().includes(normalizedQuery) ||
      (product.barcode || '').toLowerCase().includes(normalizedQuery);
    const isActive = product.active !== false;
    const matchesStock =
      stockFilter === 'all' ||
      (stockFilter === 'empty' && (!isActive || quantity <= 0)) ||
      (stockFilter === 'stock' && isActive && quantity > 0) ||
      (stockFilter === 'low' && isActive && quantity > 0 && quantity <= LOW_STOCK_THRESHOLD) ||
      (stockFilter === 'expiring' && isActive && expiring);
    const matchesCategory =
      categoryFilter === 'all' ||
      (product.category_id && product.category_id === categoryFilter);
    const matchesBrand =
      brandFilter === 'all' ||
      (product.brand && product.brand.toLowerCase() === brandFilter.toLowerCase());
    return matchesQuery && matchesStock && matchesCategory && matchesBrand;
  });

  const brands = uniqueBrands([
    ...products.map((product) => product.brand),
    ...resellerBrands.map((brand) => brand.name)
  ]);

  const productCount = filteredProducts.length;
  const totalUnits = filteredProducts.reduce((sum, product) => sum + toNumber(product.quantity ?? 0), 0);
  const stockOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Sem estoque', value: 'empty' },
    { label: 'Com estoque', value: 'stock' },
    { label: 'Produtos acabando', value: 'low' },
    { label: 'Proximos de vencer', value: 'expiring' }
  ];

  const basePath = '/estoque';
  const baseParams = {
    q: query,
    category: categoryFilter === 'all' ? '' : categoryFilter,
    brand: brandFilter === 'all' ? '' : brandFilter
  };
  const viewParam = getStringParam(resolvedParams.view);

  return (
    <main className="page-content inventory-scope">
      <InventoryPanel
        products={filteredProducts}
        productCount={productCount}
        totalUnits={totalUnits}
        productsLength={products.length}
        categories={categories}
        categoryFilter={categoryFilter}
        brands={brands}
        brandFilter={brandFilter}
        query={query}
        stockFilter={stockFilter}
        stockOptions={stockOptions}
        basePath={basePath}
        baseParams={baseParams}
        viewParam={viewParam}
      />
    </main>
  );
}
