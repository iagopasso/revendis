import { fetchList } from '../lib';
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

const uniqueBrands = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

export default async function ComprasPage() {
  const [purchasesResponse, resellerBrandsResponse] = await Promise.all([
    fetchList<Purchase>('/purchases'),
    fetchList<ResellerBrand>('/settings/brands')
  ]);

  const purchases = purchasesResponse?.data ?? [];
  const resellerBrands = resellerBrandsResponse?.data ?? [];

  const availableBrands = uniqueBrands([
    ...purchases.map((purchase) => purchase.brand),
    ...resellerBrands.map((brand) => brand.name)
  ]);

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Compras</span>
          <h1>Compras</h1>
          <p>Controle pedidos de fornecedores e entradas no estoque.</p>
        </section>
      </div>

      <PurchasesPanel initialPurchases={purchases} availableBrands={availableBrands} />
    </main>
  );
}
