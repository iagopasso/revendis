import { fetchList, getStringParam, toNumber } from '../lib';
import InventoryPanel from './inventory-panel';

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

export default async function CategoriasPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const [productsResponse, categoriesResponse] = await Promise.all([
    fetchList<Product>('/inventory/products'),
    fetchList<Category>('/inventory/categories')
  ]);
  const products = productsResponse?.data ?? [];
  const categories = categoriesResponse?.data ?? [];
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

  const brands = Array.from(
    new Set(products.map((product) => product.brand).filter((brand): brand is string => Boolean(brand)))
  );

  const productCount = filteredProducts.length;
  const totalUnits = filteredProducts.reduce((sum, product) => sum + toNumber(product.quantity ?? 0), 0);
  const stockOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Sem estoque', value: 'empty' },
    { label: 'Com estoque', value: 'stock' },
    { label: 'Produtos acabando', value: 'low' },
    { label: 'Proximos de vencer', value: 'expiring' }
  ];

  const basePath = '/categorias';
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
