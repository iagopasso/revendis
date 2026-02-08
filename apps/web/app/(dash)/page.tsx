import DateRangePicker from './date-range';
import Reminders from './reminders';
import {
  fetchList,
  formatCurrency,
  getDateRangeFromSearchParams,
  isInDateRange,
  toNumber
} from './lib';
import { IconClipboard, IconCoins, IconPercent, IconTag } from './icons';

type Product = {
  id: string;
  sku: string;
  name: string;
  expires_at?: string | null;
  quantity?: number | string;
  active?: boolean;
};

type Sale = { id: string; total: number; status: string; created_at?: string };

type Receivable = { id: string; amount: number; status: string; due_date?: string; created_at?: string };

type Customer = { id: string; name: string; phone: string };

type CatalogItem = { id: string; name: string; price: number };

const LOW_STOCK_THRESHOLD = 2;

type SearchParams = {
  range?: string | string[];
  month?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const [products, sales, receivables, customers, catalog] = await Promise.all([
    fetchList<Product>('/inventory/products'),
    fetchList<Sale>('/sales/orders'),
    fetchList<Receivable>('/finance/receivables'),
    fetchList<Customer>('/customers'),
    fetchList<CatalogItem>('/storefront/catalog')
  ]);

  const range = getDateRangeFromSearchParams(resolvedParams);
  const salesInRange = (sales?.data || []).filter((item) => isInDateRange(item.created_at, range));
  const receivablesInRange = (receivables?.data || []).filter((item) =>
    isInDateRange(item.due_date, range)
  );

  const totalSales = salesInRange.reduce((sum, item) => sum + toNumber(item.total), 0);
  const totalReceivables = receivablesInRange.reduce(
    (sum, item) => sum + toNumber(item.amount),
    0
  );
  const profit = totalSales * 0.28;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueReceivables = receivablesInRange.filter((r) => {
    if (r.status === 'paid') return false;
    if (r.status === 'overdue') return true;
    if (!r.due_date) return false;
    const dueDate = new Date(`${r.due_date}T00:00:00`);
    return dueDate < today;
  });
  const overdueCount = overdueReceivables.length;
  const cobrancasCount = receivablesInRange.filter((r) => r.status !== 'paid').length;
  const expiringCount = (products?.data || []).filter((p) => {
    const quantity = toNumber(p.quantity ?? 0);
    return quantity <= 0 || p.active === false;
  }).length;
  const lowStockCount = (products?.data || []).filter((p) => {
    const quantity = toNumber(p.quantity ?? 0);
    return quantity > 0 && quantity <= LOW_STOCK_THRESHOLD;
  }).length;

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Dashboard</span>
          <h1>Ola, Iago</h1>
          <p>Resumo operacional dos ultimos dias com base nos dados locais.</p>
        </section>
        <DateRangePicker />
      </div>

      <section className="grid">
        <div className="card">
          <div className="card-row">
            <h3>Total em compras</h3>
            <div className="icon">
              <IconClipboard />
            </div>
          </div>
          <div className="value">R$ 0,00</div>
        </div>
        <div className="card">
          <div className="card-row">
            <h3>Total em vendas</h3>
            <div className="icon warm">
              <IconTag />
            </div>
          </div>
          <div className="value">{formatCurrency(totalSales)}</div>
        </div>
        <div className="card">
          <div className="card-row">
            <h3>Lucro nas vendas</h3>
            <div className="icon">
              <IconPercent />
            </div>
          </div>
          <div className="value">{formatCurrency(profit)}</div>
        </div>
        <div className="card">
          <div className="card-row">
            <h3>Total a receber</h3>
            <div className="icon warm">
              <IconCoins />
            </div>
          </div>
          <div className="value">{formatCurrency(totalReceivables)}</div>
        </div>
      </section>

      <section className="panel reminders-panel">
        <div className="panel-header">
          <h2>Lembretes</h2>
        </div>
        <Reminders
          expiringCount={expiringCount}
          lowStockCount={lowStockCount}
          overdueCount={overdueCount}
          cobrancasCount={cobrancasCount}
          overdueReceivables={overdueReceivables.slice(0, 5).map((item) => ({
            id: item.id,
            sale_id: (item as { sale_id?: string | null }).sale_id,
            amount: toNumber(item.amount),
            due_date: item.due_date,
            status: item.status
          }))}
        />
      </section>

      <section className="footer">
        Produtos: {products?.data.length ?? 0} • Clientes: {customers?.data.length ?? 0} • Catalogo:{' '}
        {catalog?.data.length ?? 0}
      </section>
    </main>
  );
}
