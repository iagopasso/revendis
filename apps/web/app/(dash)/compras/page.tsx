import DateRangePicker from '../date-range';
import { FilterSelect } from '../filters';
import { formatCurrency, getDateRangeFromSearchParams, getStringParam, isInDateRange } from '../lib';

type Purchase = {
  id: string;
  supplier: string;
  status: 'pending' | 'received' | 'cancelled';
  total: number;
  items: number;
  brand: string;
  createdAt: string;
};

const purchasesSeed: Purchase[] = [
  {
    id: 'PO-1024',
    supplier: 'Distribuidora Aurora',
    status: 'pending',
    total: 1240.5,
    items: 18,
    brand: 'Aurora',
    createdAt: '2026-01-10'
  },
  {
    id: 'PO-1025',
    supplier: 'Beleza Brasil',
    status: 'received',
    total: 860.9,
    items: 10,
    brand: 'Beleza',
    createdAt: '2026-01-13'
  },
  {
    id: 'PO-1026',
    supplier: 'Casa & Cia',
    status: 'cancelled',
    total: 420.0,
    items: 6,
    brand: 'Casa',
    createdAt: '2026-01-16'
  },
  {
    id: 'PO-1027',
    supplier: 'Moda Sul',
    status: 'received',
    total: 1580.25,
    items: 24,
    brand: 'Moda',
    createdAt: '2026-01-19'
  }
];

const statusLabel = (status: Purchase['status']) => {
  if (status === 'received') return 'Recebido';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pendente';
};

const statusBadge = (status: Purchase['status']) => {
  if (status === 'received') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'warn';
};

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  brand?: string | string[];
  range?: string | string[];
  month?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

export default async function ComprasPage({
  searchParams
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolvedParams = (await Promise.resolve(searchParams)) ?? {};
  const query = getStringParam(resolvedParams.q).trim();
  const statusFilter = getStringParam(resolvedParams.status) || 'all';
  const brandFilter = getStringParam(resolvedParams.brand) || 'all';
  const rangeParam = getStringParam(resolvedParams.range);
  const monthParam = getStringParam(resolvedParams.month);
  const fromParam = getStringParam(resolvedParams.from);
  const toParam = getStringParam(resolvedParams.to);
  const dateRange = getDateRangeFromSearchParams(resolvedParams);

  const normalizedQuery = query.toLowerCase();

  const filteredPurchases = purchasesSeed.filter((purchase) => {
    const matchesQuery =
      !normalizedQuery ||
      purchase.id.toLowerCase().includes(normalizedQuery) ||
      purchase.supplier.toLowerCase().includes(normalizedQuery);
    const matchesStatus = statusFilter === 'all' || purchase.status === statusFilter;
    const matchesBrand = brandFilter === 'all' || purchase.brand.toLowerCase() === brandFilter;
    const matchesDate = isInDateRange(purchase.createdAt, dateRange);
    return matchesQuery && matchesStatus && matchesBrand && matchesDate;
  });

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Compras</span>
          <h1>Compras</h1>
          <p>Controle pedidos de fornecedores e entradas no estoque.</p>
        </section>
        <div className="actions">
          <button className="button primary" type="button">
            + Nova compra
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="toolbar">
          <form className="search" method="get">
            <span>🔍</span>
            <input name="q" placeholder="Buscar por numero do pedido" defaultValue={query} />
            {statusFilter !== 'all' ? <input type="hidden" name="status" value={statusFilter} /> : null}
            {brandFilter !== 'all' ? <input type="hidden" name="brand" value={brandFilter} /> : null}
            {rangeParam ? <input type="hidden" name="range" value={rangeParam} /> : null}
            {monthParam ? <input type="hidden" name="month" value={monthParam} /> : null}
            {fromParam ? <input type="hidden" name="from" value={fromParam} /> : null}
            {toParam ? <input type="hidden" name="to" value={toParam} /> : null}
          </form>
          <div className="toolbar-group">
            <FilterSelect
              name="status"
              value={statusFilter}
              options={[
                { label: 'Todos os status', value: 'all' },
                { label: 'Pendentes', value: 'pending' },
                { label: 'Recebidos', value: 'received' },
                { label: 'Cancelados', value: 'cancelled' }
              ]}
            />
            <FilterSelect
              name="brand"
              value={brandFilter}
              options={[
                { label: 'Todas as marcas', value: 'all' },
                { label: 'Aurora', value: 'aurora' },
                { label: 'Beleza', value: 'beleza' },
                { label: 'Casa', value: 'casa' },
                { label: 'Moda', value: 'moda' }
              ]}
            />
            <DateRangePicker />
          </div>
        </div>

        {filteredPurchases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🛒</div>
            <strong>Nenhuma compra encontrada</strong>
            <span>Adicione suas compras para acompanhar custos e abastecimento.</span>
            <button className="button primary" type="button">
              + Nova compra
            </button>
          </div>
        ) : (
          <div className="data-list">
            <div className="data-row cols-5 header">
              <span>Compra</span>
              <span>Fornecedor</span>
              <span>Status</span>
              <span>Total</span>
              <span>Data</span>
            </div>
            {filteredPurchases.map((purchase) => (
              <div key={purchase.id} className="data-row cols-5">
                <div>
                  <strong>{purchase.id}</strong>
                  <div className="meta">{purchase.items} itens</div>
                </div>
                <div>{purchase.supplier}</div>
                <span className={`badge ${statusBadge(purchase.status)}`}>
                  {statusLabel(purchase.status)}
                </span>
                <div className="data-cell mono">{formatCurrency(purchase.total)}</div>
                <div className="data-cell mono">
                  {new Date(purchase.createdAt).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
