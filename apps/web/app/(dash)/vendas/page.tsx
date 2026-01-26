import DateRangePicker from '../date-range';
import { FilterSelect } from '../filters';
import {
  fetchList,
  getDateRangeFromSearchParams,
  getStringParam,
  isInDateRange,
  toNumber
} from '../lib';
import SalesPanel from './sales-panel';

type Sale = {
  id: string;
  status: string;
  total: number | string;
  created_at: string;
};

type Receivable = { sale_id?: string; amount: number | string; status: string; due_date?: string };

const statusLabel = (status: string) => {
  if (status === 'cancelled') return 'Cancelado';
  if (status === 'pending') return 'Pendente';
  return 'Confirmado';
};

const statusBadge = (status: string) => {
  if (status === 'cancelled') return 'danger';
  if (status === 'pending') return 'warn';
  return 'success';
};

const formatDate = (value: string) => {
  if (!value) return '--';
  const date = new Date(value);
  return date.toLocaleDateString('pt-BR');
};

type SearchParams = {
  payment?: string | string[];
  delivery?: string | string[];
  range?: string | string[];
  month?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

const getReceivableStatus = (status?: string) => {
  if (status === 'overdue') return 2;
  if (status === 'pending') return 1;
  if (status === 'paid') return 0;
  return 0;
};

export default async function VendasPage({
  searchParams
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolvedParams = (await Promise.resolve(searchParams)) ?? {};
  const [salesResponse, receivablesResponse] = await Promise.all([
    fetchList<Sale>('/sales/orders'),
    fetchList<Receivable>('/finance/receivables')
  ]);

  const sales = salesResponse?.data ?? [];
  const receivables = receivablesResponse?.data ?? [];
  const dateRange = getDateRangeFromSearchParams(resolvedParams);

  const paymentFilter = getStringParam(resolvedParams.payment) || 'all';
  const deliveryFilter = getStringParam(resolvedParams.delivery) || 'all';

  const receivableBySale = new Map<string, string>();
  receivables.forEach((receivable) => {
    const saleId = receivable.sale_id || '';
    const current = receivableBySale.get(saleId);
    const nextStatus = receivable.status;
    if (!current) {
      receivableBySale.set(saleId, nextStatus);
      return;
    }
    const currentScore = getReceivableStatus(current);
    const nextScore = getReceivableStatus(nextStatus);
    if (nextScore > currentScore) {
      receivableBySale.set(saleId, nextStatus);
    }
  });

  const salesInRange = sales.filter((sale) => isInDateRange(sale.created_at, dateRange));

  const filteredSales = salesInRange.filter((sale) => {
    const paymentStatus = receivableBySale.get(sale.id) || 'paid';
    const matchesPayment = paymentFilter === 'all' || paymentStatus === paymentFilter;
    const matchesDelivery = deliveryFilter === 'all' || sale.status === deliveryFilter;
    return matchesPayment && matchesDelivery;
  });

  const salesCount = filteredSales.length;
  const totalSales = filteredSales.reduce((sum, sale) => sum + toNumber(sale.total), 0);
  const profit = totalSales * 0.28;
  const filteredSaleIds = new Set(filteredSales.map((sale) => sale.id));
  const filteredReceivables = receivables.filter((r) =>
    r.sale_id ? filteredSaleIds.has(r.sale_id) : false
  );
  const totalReceivable = filteredReceivables.reduce((sum, r) => sum + toNumber(r.amount), 0);

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Vendas</span>
          <h1>Vendas</h1>
          <p>Acompanhe performance, lucros e recebimentos do periodo.</p>
        </section>
        <div className="actions">
          <button className="button primary" type="button">
            + Nova venda
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-group">
            <FilterSelect
              name="payment"
              value={paymentFilter}
              options={[
                { label: 'Situacao do pagamento: Todas', value: 'all' },
                { label: 'Pagamento pendente', value: 'pending' },
                { label: 'Pagamento atrasado', value: 'overdue' },
                { label: 'Pagamento recebido', value: 'paid' }
              ]}
            />
            <FilterSelect
              name="delivery"
              value={deliveryFilter}
              options={[
                { label: 'Situacao da entrega: Todas', value: 'all' },
                { label: 'Confirmado', value: 'confirmed' },
                { label: 'Cancelado', value: 'cancelled' }
              ]}
            />
          </div>
          <DateRangePicker />
        </div>
      </section>

      <SalesPanel
        sales={filteredSales}
        totalSales={totalSales}
        profit={profit}
        totalReceivable={totalReceivable}
        salesCount={salesCount}
      />
    </main>
  );
}
