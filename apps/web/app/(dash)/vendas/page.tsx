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
  customer_name?: string | null;
  items_count?: number | string;
  cost_total?: number | string;
  profit?: number | string;
};

type Receivable = { sale_id?: string; amount: number | string; status: string; due_date?: string };

type PaymentStatus = 'paid' | 'pending' | 'overdue' | 'partial';

type ReceivableSummary = {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  hasPaid: boolean;
  hasPending: boolean;
  hasOverdue: boolean;
};

type SearchParams = {
  payment?: string | string[];
  delivery?: string | string[];
  range?: string | string[];
  month?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

const getPaymentStatus = (summary?: ReceivableSummary): PaymentStatus => {
  if (!summary) return 'paid';
  if (summary.hasOverdue) return 'overdue';
  if (summary.hasPending && summary.hasPaid) return 'partial';
  if (summary.hasPending) return 'pending';
  return 'paid';
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

  const receivableSummary = new Map<string, ReceivableSummary>();
  receivables.forEach((receivable) => {
    const saleId = receivable.sale_id || '';
    if (!saleId) return;
    const current = receivableSummary.get(saleId) ?? {
      total: 0,
      paid: 0,
      pending: 0,
      overdue: 0,
      hasPaid: false,
      hasPending: false,
      hasOverdue: false
    };
    const amount = toNumber(receivable.amount);
    current.total += amount;
    if (receivable.status === 'paid') {
      current.paid += amount;
      current.hasPaid = true;
    } else if (receivable.status === 'overdue') {
      current.overdue += amount;
      current.hasOverdue = true;
    } else {
      current.pending += amount;
      current.hasPending = true;
    }
    receivableSummary.set(saleId, current);
  });

  const salesInRange = sales.filter((sale) => isInDateRange(sale.created_at, dateRange));

  const filteredSales = salesInRange.filter((sale) => {
    const paymentStatus = getPaymentStatus(receivableSummary.get(sale.id));
    const matchesPayment =
      paymentFilter === 'all'
        ? true
        : paymentFilter === 'pending'
          ? paymentStatus === 'pending' || paymentStatus === 'partial'
          : paymentFilter === 'partial'
            ? paymentStatus === 'partial'
            : paymentStatus === paymentFilter;
    const matchesDelivery = deliveryFilter === 'all' || sale.status === deliveryFilter;
    return matchesPayment && matchesDelivery;
  });

  const enrichedSales = filteredSales.map((sale) => {
    const summary = receivableSummary.get(sale.id);
    const paymentStatus = getPaymentStatus(summary);
    const profitValue = toNumber(sale.profit ?? toNumber(sale.total) - toNumber(sale.cost_total));
    return {
      ...sale,
      items_count: toNumber(sale.items_count ?? 0),
      profit: profitValue,
      payment_status: paymentStatus
    };
  });

  const salesCount = enrichedSales.length;
  const totalSales = enrichedSales.reduce((sum, sale) => sum + toNumber(sale.total), 0);
  const profit = enrichedSales.reduce((sum, sale) => sum + toNumber(sale.profit ?? 0), 0);
  const totalReceivable = enrichedSales.reduce((sum, sale) => {
    const summary = receivableSummary.get(sale.id);
    if (!summary) return sum;
    return sum + summary.pending + summary.overdue;
  }, 0);
  const hasSalesInRange = salesInRange.length > 0;

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
                { label: 'Pagamento parcial', value: 'partial' },
                { label: 'Pagamento recebido', value: 'paid' }
              ]}
            />
            <FilterSelect
              name="delivery"
              value={deliveryFilter}
              options={[
                { label: 'Situacao da entrega: Todas', value: 'all' },
                { label: 'A entregar', value: 'pending' },
                { label: 'Entregue', value: 'delivered' },
                { label: 'Confirmado', value: 'confirmed' },
                { label: 'Cancelado', value: 'cancelled' }
              ]}
            />
          </div>
          <DateRangePicker />
        </div>
      </section>

      <SalesPanel
        sales={enrichedSales}
        totalSales={totalSales}
        profit={profit}
        totalReceivable={totalReceivable}
        salesCount={salesCount}
        hasSalesInRange={hasSalesInRange}
      />
    </main>
  );
}
