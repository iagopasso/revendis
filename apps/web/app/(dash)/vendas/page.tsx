import Link from 'next/link';
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

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
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
  quantity?: number | string;
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
  newSale?: string | string[];
  newCustomer?: string | string[];
  range?: string | string[];
  month?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

const getPaymentStatus = (saleTotal: number | string, summary?: ReceivableSummary): PaymentStatus => {
  if (!summary) return 'paid';
  const total = Math.max(0, toNumber(saleTotal));
  const outstanding = Math.max(0, summary.pending + summary.overdue);
  if (summary.hasOverdue) return 'overdue';
  if (outstanding <= 0.01) return 'paid';
  if (outstanding >= Math.max(0, total - 0.01)) return 'pending';
  return 'partial';
};

export default async function VendasPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const [salesResponse, receivablesResponse, customersResponse, productsResponse] = await Promise.all([
    fetchList<Sale>('/sales/orders'),
    fetchList<Receivable>('/finance/receivables'),
    fetchList<Customer>('/customers'),
    fetchList<Product>('/inventory/products')
  ]);

  const sales = salesResponse?.data ?? [];
  const receivables = receivablesResponse?.data ?? [];
  const customers = customersResponse?.data ?? [];
  const products = productsResponse?.data ?? [];
  const dateRange = getDateRangeFromSearchParams(resolvedParams);
  const initialCreateOpen = getStringParam(resolvedParams.newSale) === '1';

  const paymentFilterParam = getStringParam(resolvedParams.payment);
  const deliveryFilterParam = getStringParam(resolvedParams.delivery);
  const paymentFilter = paymentFilterParam === 'all' ? '' : paymentFilterParam;
  const deliveryFilter = deliveryFilterParam === 'all' ? '' : deliveryFilterParam;

  const paymentOptions = [
    { label: 'Pendente', value: 'pending' },
    { label: 'Pago parcialmente', value: 'partial' },
    { label: 'Pago', value: 'paid' }
  ];
  if (paymentFilter === 'overdue') {
    paymentOptions.unshift({ label: 'Atrasado', value: 'overdue' });
  }

  const deliveryOptions = [
    { label: 'A entregar', value: 'pending' },
    { label: 'Ja entregue', value: 'delivered' }
  ];
  if (deliveryFilter === 'confirmed') {
    deliveryOptions.unshift({ label: 'Confirmado', value: 'confirmed' });
  } else if (deliveryFilter === 'cancelled') {
    deliveryOptions.unshift({ label: 'Cancelado', value: 'cancelled' });
  }

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
    const paymentStatus = getPaymentStatus(sale.total, receivableSummary.get(sale.id));
    const matchesPayment =
      !paymentFilter
        ? true
        : paymentFilter === 'pending'
          ? paymentStatus === 'pending' || paymentStatus === 'overdue'
          : paymentFilter === 'partial'
            ? paymentStatus === 'partial'
            : paymentStatus === paymentFilter;
    const matchesDelivery =
      !deliveryFilter
        ? true
        : deliveryFilter === 'delivered'
          ? sale.status === 'delivered' || sale.status === 'confirmed'
          : sale.status === deliveryFilter;
    return matchesPayment && matchesDelivery;
  });

  const enrichedSales = filteredSales.map((sale) => {
    const summary = receivableSummary.get(sale.id);
    const paymentStatus = getPaymentStatus(sale.total, summary);
    const profitValue = toNumber(sale.profit ?? toNumber(sale.total) - toNumber(sale.cost_total));
    return {
      ...sale,
      items_count: toNumber(sale.items_count ?? 0),
      profit: profitValue,
      payment_status: paymentStatus
    };
  });

  const totalSales = enrichedSales.reduce((sum, sale) => sum + toNumber(sale.total), 0);
  const profit = enrichedSales.reduce((sum, sale) => sum + toNumber(sale.profit ?? 0), 0);
  const totalReceivable = enrichedSales.reduce((sum, sale) => {
    const summary = receivableSummary.get(sale.id);
    if (!summary) return sum;
    return sum + summary.pending + summary.overdue;
  }, 0);
  const hasSalesInRange = salesInRange.length > 0;
  const createSaleParams = new URLSearchParams();
  Object.entries(resolvedParams).forEach(([key, rawValue]) => {
    if (key === 'newSale' || key === 'newCustomer') return;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (!value) return;
    createSaleParams.set(key, value);
  });
  createSaleParams.set('newSale', '1');
  const createSaleHref = `/vendas?${createSaleParams.toString()}`;

  return (
    <main className="page-content">
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Vendas</span>
          <h1>Vendas</h1>
          <p>Acompanhe performance, lucros e recebimentos do periodo.</p>
        </section>
        <div className="actions">
          <Link className="button primary" href={createSaleHref}>
            + Nova venda
          </Link>
        </div>
      </div>

      <section className="panel">
        <div className="toolbar">
          <div className="toolbar-group">
            <FilterSelect
              name="payment"
              value={paymentFilter}
              variant="menu"
              className="sales-filter"
              placeholder="Situacao do pagamento"
              options={paymentOptions}
            />
            <FilterSelect
              name="delivery"
              value={deliveryFilter}
              variant="menu"
              className="sales-filter"
              placeholder="Situacao da entrega"
              options={deliveryOptions}
            />
          </div>
          <DateRangePicker />
        </div>
      </section>

      <SalesPanel
        sales={enrichedSales}
        customers={customers}
        products={products}
        totalSales={totalSales}
        profit={profit}
        totalReceivable={totalReceivable}
        hasSalesInRange={hasSalesInRange}
        initialCreateOpen={initialCreateOpen}
      />
    </main>
  );
}
