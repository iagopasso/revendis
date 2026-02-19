import Link from 'next/link';
import DateRangePicker from '../date-range';
import {
  IconBag,
  IconCoins,
  IconPercent,
  IconTag
} from '../icons';
import DashboardRemindersActions from './reminders-actions';
import {
  fetchItem,
  fetchList,
  formatCurrency,
  getDateRangeFromSearchParams,
  isInDateRange,
  toNumber
} from '../lib';

type SearchParams = {
  range?: string | string[];
  month?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

type Account = {
  ownerName?: string;
  businessName?: string;
};

type Purchase = {
  total?: number | string;
  status?: string | null;
  purchase_date?: string;
  created_at?: string;
};

type Sale = {
  id: string;
  total?: number | string;
  created_at?: string;
  status?: string | null;
  profit?: number | string;
  cost_total?: number | string;
};

type Receivable = {
  sale_id?: string | null;
  amount?: number | string;
  status?: string | null;
};

type Product = {
  active?: boolean;
  quantity?: number | string;
  expires_at?: string | null;
};

type Customer = {
  birth_date?: string | null;
};

type StorefrontOrder = {
  status?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const normalizeStatus = (value?: string | null) => (value || '').trim().toLowerCase();

const isWithinNextDays = (value?: string | null, days = 7) => {
  const date = toDate(value);
  if (!date) return false;
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diff = Math.floor((target.getTime() - today.getTime()) / DAY_MS);
  return diff >= 0 && diff <= days;
};

const isBirthdayInNextDays = (value?: string | null, days = 7) => {
  const date = toDate(value);
  if (!date) return false;
  const today = startOfDay(new Date());

  let next = new Date(today.getFullYear(), date.getMonth(), date.getDate());
  if (next < today) {
    next = new Date(today.getFullYear() + 1, date.getMonth(), date.getDate());
  }

  const diff = Math.floor((startOfDay(next).getTime() - today.getTime()) / DAY_MS);
  return diff >= 0 && diff <= days;
};

const isReceivablePending = (status?: string | null) => normalizeStatus(status) === 'pending';

const getFirstName = (value?: string) => {
  const raw = (value || '').trim();
  if (!raw) return 'empreendedor';
  const first = raw.split(/\s+/)[0] || raw;
  return first.charAt(0).toUpperCase() + first.slice(1);
};

const getParamValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value) || '';

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const dateRange = getDateRangeFromSearchParams(resolvedParams, '7d');
  const rangeParams = new URLSearchParams();
  const range = getParamValue(resolvedParams.range);
  const month = getParamValue(resolvedParams.month);
  const from = getParamValue(resolvedParams.from);
  const to = getParamValue(resolvedParams.to);
  if (range) rangeParams.set('range', range);
  if (month) rangeParams.set('month', month);
  if (from) rangeParams.set('from', from);
  if (to) rangeParams.set('to', to);

  const withRange = (path: string, extra?: Record<string, string>) => {
    const params = new URLSearchParams(rangeParams.toString());
    if (extra) {
      Object.entries(extra).forEach(([key, value]) => {
        if (!value) return;
        params.set(key, value);
      });
    }
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };

  const [
    accountResponse,
    purchasesResponse,
    salesResponse,
    receivablesResponse,
    productsResponse,
    customersResponse,
    storefrontOrdersResponse
  ] = await Promise.all([
    fetchItem<Account>('/settings/account'),
    fetchList<Purchase>('/purchases'),
    fetchList<Sale>('/sales/orders'),
    fetchList<Receivable>('/finance/receivables'),
    fetchList<Product>('/inventory/products'),
    fetchList<Customer>('/customers'),
    fetchList<StorefrontOrder>('/storefront/orders?status=pending')
  ]);

  const account = accountResponse?.data;
  const purchases = purchasesResponse?.data || [];
  const sales = salesResponse?.data || [];
  const receivables = receivablesResponse?.data || [];
  const products = productsResponse?.data || [];
  const customers = customersResponse?.data || [];
  const storefrontOrders = storefrontOrdersResponse?.data || [];

  const salesInRange = sales.filter((sale) => isInDateRange(sale.created_at, dateRange));
  const salesInRangeIds = new Set(salesInRange.map((sale) => sale.id));
  const purchasesInRange = purchases.filter((purchase) =>
    isInDateRange(purchase.purchase_date || purchase.created_at, dateRange)
  );

  const totalPurchases = purchasesInRange
    .filter((purchase) => normalizeStatus(purchase.status) !== 'cancelled')
    .reduce((sum, purchase) => sum + Math.max(0, toNumber(purchase.total)), 0);

  const totalSales = salesInRange.reduce((sum, sale) => sum + Math.max(0, toNumber(sale.total)), 0);

  const salesProfit = salesInRange.reduce((sum, sale) => {
    const fallbackProfit = toNumber(sale.total) - toNumber(sale.cost_total);
    return sum + Math.max(0, toNumber(sale.profit ?? fallbackProfit));
  }, 0);

  const totalReceivable = receivables.reduce((sum, receivable) => {
    const saleId = receivable.sale_id || '';
    if (!salesInRangeIds.has(saleId)) return sum;
    if (normalizeStatus(receivable.status) === 'paid') return sum;
    return sum + Math.max(0, toNumber(receivable.amount));
  }, 0);

  const expiringProductsCount = products.filter(
    (product) =>
      product.active !== false &&
      Math.max(0, toNumber(product.quantity)) > 0 &&
      isWithinNextDays(product.expires_at, 7)
  ).length;

  const birthdaysWeekCount = customers.filter((customer) => isBirthdayInNextDays(customer.birth_date, 7)).length;

  const pendingPaymentsCount = receivables.filter((receivable) => isReceivablePending(receivable.status)).length;

  const pendingStorefrontOrdersCount = storefrontOrders.filter((order) => {
    const status = normalizeStatus(order.status);
    return !status || status === 'pending';
  }).length;
  const pendingSalesCount = salesInRange.filter((sale) => {
    const status = normalizeStatus(sale.status);
    return !status || status === 'pending';
  }).length;
  const pendingDeliveriesCount = pendingStorefrontOrdersCount + pendingSalesCount;

  const ownerName = getFirstName(account?.ownerName || account?.businessName);

  return (
    <main className="page-content dashboard-home">
      <div className="dashboard-home-top">
        <h1>Olá, {ownerName}</h1>
        <div className="dashboard-home-top-actions">
          <DateRangePicker defaultPreset="7d" />
        </div>
      </div>

      <section className="dashboard-overview-grid">
        <Link className="dashboard-overview-card" href={withRange('/compras')}>
          <div>
            <p className="dashboard-overview-label">Total em compras</p>
            <strong className="dashboard-overview-value">{formatCurrency(totalPurchases)}</strong>
          </div>
          <span className="dashboard-overview-icon">
            <IconBag />
          </span>
        </Link>

        <Link className="dashboard-overview-card" href={withRange('/vendas')}>
          <div>
            <p className="dashboard-overview-label">Total em vendas</p>
            <strong className="dashboard-overview-value">{formatCurrency(totalSales)}</strong>
          </div>
          <span className="dashboard-overview-icon">
            <IconTag />
          </span>
        </Link>

        <Link className="dashboard-overview-card" href={withRange('/vendas')}>
          <div>
            <p className="dashboard-overview-label">Lucro nas vendas</p>
            <strong className="dashboard-overview-value">{formatCurrency(salesProfit)}</strong>
          </div>
          <span className="dashboard-overview-icon">
            <IconPercent />
          </span>
        </Link>

        <Link className="dashboard-overview-card" href={withRange('/financeiro', { status: 'pending' })}>
          <div>
            <p className="dashboard-overview-label">Total a receber</p>
            <strong className="dashboard-overview-value">{formatCurrency(totalReceivable)}</strong>
          </div>
          <span className="dashboard-overview-icon">
            <IconCoins />
          </span>
        </Link>
      </section>

      <section className="dashboard-reminders-section">
        <h2>Lembretes</h2>
        <DashboardRemindersActions
          expiringCount={expiringProductsCount}
          birthdaysCount={birthdaysWeekCount}
          pendingCount={pendingPaymentsCount}
          notDeliveredCount={pendingDeliveriesCount}
          expiringHref={withRange('/estoque', { stock: 'expiring' })}
          birthdaysHref={withRange('/clientes', { birthday: 'week' })}
          pendingHref={withRange('/vendas', { payment: 'pending' })}
          notDeliveredHref={withRange('/vendas', { delivery: 'pending' })}
        />
      </section>
    </main>
  );
}
