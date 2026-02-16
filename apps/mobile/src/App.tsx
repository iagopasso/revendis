import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { backendList, backendRequest, getApiBaseUrl } from './lib/backend';

type ModuleId =
  | 'dashboard'
  | 'inventory'
  | 'sales'
  | 'purchases'
  | 'customers'
  | 'finance'
  | 'reports';

type RangePreset = '7d' | '28d' | '90d' | 'all';

type ConnectionState = 'checking' | 'online' | 'offline';

type Product = {
  id: string;
  sku?: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  price?: number | string | null;
  active?: boolean;
  quantity?: number | string | null;
  expires_at?: string | null;
  category_id?: string | null;
};

type Category = {
  id: string;
  name: string;
  color?: string | null;
};

type SaleOrder = {
  id: string;
  status?: string;
  total?: number | string;
  created_at?: string;
  customer_id?: string | null;
  customer_name?: string | null;
  items_count?: number | string;
  cost_total?: number | string;
  profit?: number | string;
};

type Purchase = {
  id: string;
  supplier?: string;
  brand?: string | null;
  status?: string;
  total?: number | string;
  items?: number | string;
  purchase_date?: string;
  created_at?: string;
};

type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  tags?: string[] | null;
};

type Receivable = {
  id: string;
  sale_id?: string;
  customer_name?: string | null;
  amount?: number | string;
  due_date?: string;
  status?: string;
  settled_at?: string | null;
  created_at?: string;
};

type Expense = {
  id: string;
  description?: string;
  amount?: number | string;
  due_date?: string;
  status?: string;
  paid_at?: string | null;
  method?: string | null;
  customer_name?: string | null;
  created_at?: string;
};

type Payment = {
  id: string;
  sale_id?: string;
  customer_name?: string | null;
  amount?: number | string;
  method?: string | null;
  created_at?: string;
};

type CatalogItem = {
  id: string;
  name: string;
  price?: number | string;
};

type ReportTopProduct = {
  product_name?: string;
  sku?: string;
  brand?: string | null;
  sold_qty?: number | string;
  sold_total?: number | string;
  last_sale_at?: string;
};

type ReportTopCustomer = {
  customer_name?: string;
  customer_phone?: string;
  orders_count?: number | string;
  total_spent?: number | string;
  total_paid?: number | string;
  last_sale_at?: string;
};

type ReportStub = {
  message?: string;
};

type SalesPaymentFilter = 'all' | 'pending' | 'partial' | 'paid' | 'overdue';
type PurchaseStatusFilter = 'all' | 'draft' | 'pending' | 'received' | 'cancelled';
type StockFilter = 'all' | 'stock' | 'empty' | 'low' | 'expiring';

const MODULES: Array<{ id: ModuleId; label: string; title: string; subtitle: string }> = [
  {
    id: 'dashboard',
    label: 'Painel',
    title: 'Dashboard',
    subtitle: 'Resumo geral da operacao'
  },
  {
    id: 'inventory',
    label: 'Estoque',
    title: 'Estoque',
    subtitle: 'Produtos, categorias e unidades'
  },
  {
    id: 'sales',
    label: 'Vendas',
    title: 'Vendas',
    subtitle: 'Pedidos, lucro e recebimento'
  },
  {
    id: 'purchases',
    label: 'Compras',
    title: 'Compras',
    subtitle: 'Entradas de fornecedores'
  },
  {
    id: 'customers',
    label: 'Clientes',
    title: 'Clientes',
    subtitle: 'Relacionamento e contatos'
  },
  {
    id: 'finance',
    label: 'Financeiro',
    title: 'Financeiro',
    subtitle: 'Recebiveis, pagamentos e despesas'
  },
  {
    id: 'reports',
    label: 'Relatorios',
    title: 'Relatorios',
    subtitle: 'Indicadores e rankings'
  }
];

const RANGE_PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: '7d', label: '7d' },
  { id: '28d', label: '28d' },
  { id: '90d', label: '90d' },
  { id: 'all', label: 'Tudo' }
];

const LOW_STOCK_THRESHOLD = 2;
const EXPIRING_DAYS = 7;

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(toNumber(value));

const formatDateTime = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDate = (value?: string | null) => {
  if (!value) return '--';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return formatDateTime(value);
  return parsed.toLocaleDateString('pt-BR');
};

const normalizeText = (value?: string | null) => (value || '').trim().toLowerCase();
const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');

const startOfToday = () => {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
};

const resolveRangeStart = (preset: RangePreset) => {
  if (preset === 'all') return null;
  const days = preset === '7d' ? 6 : preset === '28d' ? 27 : 89;
  const today = startOfToday();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
};

const parseDateCandidate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const isInsideRange = (value: string | undefined | null, from: Date | null) => {
  if (!from) return true;
  const parsed = parseDateCandidate(value);
  if (!parsed) return false;
  return parsed >= from;
};

const daysUntil = (value?: string | null) => {
  const target = parseDateCandidate(value);
  if (!target) return null;
  const today = startOfToday();
  const diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const isExpiring = (value?: string | null) => {
  const remaining = daysUntil(value);
  return remaining !== null && remaining >= 0 && remaining <= EXPIRING_DAYS;
};

const salePaymentStatus = (
  sale: SaleOrder,
  summaryBySaleId: Map<string, { paid: number; pending: number; overdue: number }>
): SalesPaymentFilter => {
  const summary = summaryBySaleId.get(sale.id);
  if (!summary) return 'paid';
  const total = Math.max(0, toNumber(sale.total));
  const outstanding = Math.max(0, summary.pending + summary.overdue);
  if (summary.overdue > 0) return 'overdue';
  if (outstanding <= 0.01) return 'paid';
  if (outstanding >= Math.max(0, total - 0.01)) return 'pending';
  return 'partial';
};

const saleStatusLabel = (value?: string) => {
  if (!value) return 'Sem status';
  if (value === 'pending') return 'Pendente';
  if (value === 'confirmed') return 'Confirmada';
  if (value === 'delivered') return 'Entregue';
  if (value === 'cancelled') return 'Cancelada';
  return value;
};

const purchaseStatusLabel = (value?: string) => {
  if (!value) return 'Sem status';
  if (value === 'draft') return 'Rascunho';
  if (value === 'pending') return 'Pendente';
  if (value === 'received') return 'Recebida';
  if (value === 'cancelled') return 'Cancelada';
  return value;
};

const receivableStatusLabel = (value?: string) => {
  if (!value) return 'Sem status';
  if (value === 'paid') return 'Pago';
  if (value === 'pending') return 'Pendente';
  if (value === 'overdue') return 'Atrasado';
  return value;
};

const toneStyle = (value?: string) => {
  if (value === 'paid' || value === 'completed' || value === 'received' || value === 'delivered') {
    return styles.badgeSuccess;
  }
  if (value === 'overdue' || value === 'cancelled') {
    return styles.badgeDanger;
  }
  if (value === 'pending' || value === 'draft' || value === 'partial') {
    return styles.badgeWarn;
  }
  return styles.badgeNeutral;
};

const toDateInput = (value = new Date()) => {
  return value.toISOString().slice(0, 10);
};

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const buildMobileSku = (name: string) => {
  const token = digitsOnly(name).slice(0, 18);
  if (token) return token;
  return Date.now().toString();
};

const isActionSuccess = (value?: string) =>
  value === 'paid' ||
  value === 'received' ||
  value === 'delivered' ||
  value === 'active' ||
  value === 'success';

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [rangePreset, setRangePreset] = useState<RangePreset>('28d');
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [reportTopProducts, setReportTopProducts] = useState<ReportTopProduct[]>([]);
  const [reportTopCustomers, setReportTopCustomers] = useState<ReportTopCustomer[]>([]);
  const [dailySalesStub, setDailySalesStub] = useState<ReportStub | null>(null);
  const [stockOutsStub, setStockOutsStub] = useState<ReportStub | null>(null);
  const [agingStub, setAgingStub] = useState<ReportStub | null>(null);

  const [productQuery, setProductQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState<SalesPaymentFilter>('all');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<PurchaseStatusFilter>('all');
  const [customerQuery, setCustomerQuery] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null
  );

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#7c3aed');
  const [newProductName, setNewProductName] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductStock, setNewProductStock] = useState('1');
  const [newProductCategoryId, setNewProductCategoryId] = useState('');
  const [stockAdjustSku, setStockAdjustSku] = useState('');
  const [stockAdjustQty, setStockAdjustQty] = useState('1');

  const [saleSku, setSaleSku] = useState('');
  const [saleQty, setSaleQty] = useState('1');
  const [salePrice, setSalePrice] = useState('');
  const [saleCustomerName, setSaleCustomerName] = useState('');
  const [salePaymentMethod, setSalePaymentMethod] = useState('Pix');
  const [salePaymentAmount, setSalePaymentAmount] = useState('');

  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [purchaseBrand, setPurchaseBrand] = useState('');
  const [purchaseTotal, setPurchaseTotal] = useState('');
  const [purchaseItemsCount, setPurchaseItemsCount] = useState('1');
  const [purchaseDate, setPurchaseDate] = useState(toDateInput());

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerCity, setNewCustomerCity] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');

  const [newReceivableSaleId, setNewReceivableSaleId] = useState('');
  const [newReceivableAmount, setNewReceivableAmount] = useState('');
  const [newReceivableDueDate, setNewReceivableDueDate] = useState(toDateInput());
  const [newReceivableMethod, setNewReceivableMethod] = useState('Pix');

  const [newExpenseDescription, setNewExpenseDescription] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseDueDate, setNewExpenseDueDate] = useState(toDateInput());
  const [newExpenseMethod, setNewExpenseMethod] = useState('Pix');
  const [newExpenseCustomerId, setNewExpenseCustomerId] = useState('');

  const rangeStart = useMemo(() => resolveRangeStart(rangePreset), [rangePreset]);

  const loadData = useCallback(async (source: 'initial' | 'refresh') => {
    if (source === 'initial') setLoading(true);
    if (source === 'refresh') setRefreshing(true);
    setError(null);
    setConnection('checking');

    const endpointWarnings: string[] = [];

    const safeList = async <T,>(label: string, path: string) => {
      try {
        return await backendList<T>(path);
      } catch {
        endpointWarnings.push(label);
        return [] as T[];
      }
    };

    const safeItem = async <T,>(label: string, path: string) => {
      try {
        return await backendRequest<T>(path);
      } catch {
        endpointWarnings.push(label);
        return null;
      }
    };

    let healthOk = false;
    try {
      await backendRequest('/health');
      healthOk = true;
    } catch {
      endpointWarnings.push('health');
    }

    const [
      nextProducts,
      nextCategories,
      nextSales,
      nextPurchases,
      nextCustomers,
      nextReceivables,
      nextExpenses,
      nextPayments,
      nextCatalog,
      nextTopProducts,
      nextTopCustomers,
      nextDailySales,
      nextStockOuts,
      nextAging
    ] = await Promise.all([
      safeList<Product>('inventory/products', '/inventory/products'),
      safeList<Category>('inventory/categories', '/inventory/categories'),
      safeList<SaleOrder>('sales/orders', '/sales/orders'),
      safeList<Purchase>('purchases', '/purchases'),
      safeList<Customer>('customers', '/customers'),
      safeList<Receivable>('finance/receivables', '/finance/receivables'),
      safeList<Expense>('finance/expenses', '/finance/expenses'),
      safeList<Payment>('finance/payments', '/finance/payments'),
      safeList<CatalogItem>('storefront/catalog', '/storefront/catalog'),
      safeList<ReportTopProduct>('reports/top-products', '/reports/top-products'),
      safeList<ReportTopCustomer>('reports/top-customers', '/reports/top-customers'),
      safeItem<{ meta?: ReportStub }>('reports/daily-sales', '/reports/daily-sales'),
      safeItem<{ meta?: ReportStub }>('reports/stock-outs', '/reports/stock-outs'),
      safeItem<{ meta?: ReportStub }>('reports/receivables-aging', '/reports/receivables-aging')
    ]);

    setProducts(nextProducts);
    setCategories(nextCategories);
    setSales(nextSales);
    setPurchases(nextPurchases);
    setCustomers(nextCustomers);
    setReceivables(nextReceivables);
    setExpenses(nextExpenses);
    setPayments(nextPayments);
    setCatalog(nextCatalog);
    setReportTopProducts(nextTopProducts);
    setReportTopCustomers(nextTopCustomers);
    setDailySalesStub(nextDailySales?.meta || null);
    setStockOutsStub(nextStockOuts?.meta || null);
    setAgingStub(nextAging?.meta || null);
    setWarnings(Array.from(new Set(endpointWarnings)));

    if (!healthOk) {
      setConnection('offline');
      setError('Nao foi possivel conectar com a API. Verifique backend e rede local.');
    } else {
      setConnection('online');
    }

    setLastSyncAt(new Date().toISOString());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadData('initial');
  }, [loadData]);

  const salesInRange = useMemo(
    () => sales.filter((sale) => isInsideRange(sale.created_at, rangeStart)),
    [sales, rangeStart]
  );

  const purchasesInRange = useMemo(
    () =>
      purchases.filter((purchase) =>
        isInsideRange(purchase.purchase_date || purchase.created_at, rangeStart)
      ),
    [purchases, rangeStart]
  );

  const receivablesInRange = useMemo(
    () =>
      receivables.filter((receivable) =>
        isInsideRange(receivable.due_date || receivable.created_at, rangeStart)
      ),
    [receivables, rangeStart]
  );

  const expensesInRange = useMemo(
    () =>
      expenses.filter((expense) => isInsideRange(expense.due_date || expense.created_at, rangeStart)),
    [expenses, rangeStart]
  );

  const paymentsInRange = useMemo(
    () => payments.filter((payment) => isInsideRange(payment.created_at, rangeStart)),
    [payments, rangeStart]
  );

  const productSearch = normalizeText(productQuery);
  const customerSearch = normalizeText(customerQuery);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const quantity = toNumber(product.quantity);
      const active = product.active !== false;
      const numericCode = digitsOnly(product.sku) || digitsOnly(product.barcode);
      const matchesQuery =
        !productSearch ||
        normalizeText(product.name).includes(productSearch) ||
        normalizeText(product.brand).includes(productSearch) ||
        normalizeText(product.barcode).includes(productSearch) ||
        normalizeText(product.sku).includes(productSearch) ||
        normalizeText(numericCode).includes(productSearch);

      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'stock' && active && quantity > 0) ||
        (stockFilter === 'empty' && (!active || quantity <= 0)) ||
        (stockFilter === 'low' && active && quantity > 0 && quantity <= LOW_STOCK_THRESHOLD) ||
        (stockFilter === 'expiring' && active && isExpiring(product.expires_at));

      return matchesQuery && matchesStock;
    });
  }, [products, productSearch, stockFilter]);

  const receivableSummaryBySaleId = useMemo(() => {
    const map = new Map<string, { paid: number; pending: number; overdue: number }>();
    receivablesInRange.forEach((item) => {
      if (!item.sale_id) return;
      const current = map.get(item.sale_id) || { paid: 0, pending: 0, overdue: 0 };
      const amount = toNumber(item.amount);
      if (item.status === 'paid') current.paid += amount;
      else if (item.status === 'overdue') current.overdue += amount;
      else current.pending += amount;
      map.set(item.sale_id, current);
    });
    return map;
  }, [receivablesInRange]);

  const filteredSales = useMemo(() => {
    return salesInRange.filter((sale) => {
      if (salesPaymentFilter === 'all') return true;
      return salePaymentStatus(sale, receivableSummaryBySaleId) === salesPaymentFilter;
    });
  }, [salesInRange, salesPaymentFilter, receivableSummaryBySaleId]);

  const filteredPurchases = useMemo(() => {
    return purchasesInRange.filter((purchase) => {
      if (purchaseStatusFilter === 'all') return true;
      return purchase.status === purchaseStatusFilter;
    });
  }, [purchasesInRange, purchaseStatusFilter]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      if (!customerSearch) return true;
      const searchable = [
        customer.name,
        customer.phone,
        customer.email || '',
        customer.city || '',
        customer.state || '',
        ...(customer.tags || [])
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(customerSearch);
    });
  }, [customers, customerSearch]);

  const totalSales = filteredSales.reduce((acc, sale) => acc + toNumber(sale.total), 0);
  const totalProfit = filteredSales.reduce((acc, sale) => {
    const explicitProfit = toNumber(sale.profit);
    if (explicitProfit > 0) return acc + explicitProfit;
    return acc + (toNumber(sale.total) - toNumber(sale.cost_total));
  }, 0);
  const totalPurchases = filteredPurchases.reduce((acc, purchase) => acc + toNumber(purchase.total), 0);
  const totalReceivables = receivablesInRange.reduce((acc, item) => acc + toNumber(item.amount), 0);
  const totalExpenses = expensesInRange.reduce((acc, item) => acc + toNumber(item.amount), 0);
  const totalPayments = paymentsInRange.reduce((acc, item) => acc + toNumber(item.amount), 0);

  const outOfStockCount = products.filter((product) => {
    const quantity = toNumber(product.quantity);
    return product.active === false || quantity <= 0;
  }).length;
  const lowStockCount = products.filter((product) => {
    const quantity = toNumber(product.quantity);
    return product.active !== false && quantity > 0 && quantity <= LOW_STOCK_THRESHOLD;
  }).length;
  const overdueCount = receivablesInRange.filter((item) => {
    if (item.status === 'overdue') return true;
    if (item.status === 'paid') return false;
    const due = parseDateCandidate(item.due_date);
    if (!due) return false;
    return due < startOfToday();
  }).length;

  const activeModuleMeta = MODULES.find((item) => item.id === activeModule) || MODULES[0];
  const filteredProductSuggestions = filteredProducts.slice(0, 12);
  const filteredCustomerSuggestions = filteredCustomers.slice(0, 12);

  const runAction = useCallback(
    async (label: string, operation: () => Promise<void>) => {
      if (actionBusy) return false;
      setActionBusy(true);
      setActionMessage(null);
      try {
        await operation();
        setActionMessage({ tone: 'success', text: `${label} concluido.` });
        await loadData('refresh');
        return true;
      } catch (actionError) {
        const message =
          actionError instanceof Error ? actionError.message : `Erro ao executar: ${label}`;
        setActionMessage({ tone: 'error', text: message });
        return false;
      } finally {
        setActionBusy(false);
      }
    },
    [actionBusy, loadData]
  );

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      setActionMessage({ tone: 'error', text: 'Informe o nome da categoria.' });
      return;
    }
    const success = await runAction('Categoria criada', async () => {
      await backendRequest('/inventory/categories', {
        method: 'POST',
        body: JSON.stringify({
          name,
          color: newCategoryColor.trim() || undefined
        })
      });
    });
    if (success) {
      setNewCategoryName('');
    }
  };

  const findProductByCode = useCallback(
    (code: string) => {
      const normalizedCode = code.trim();
      const normalizedDigits = digitsOnly(normalizedCode);
      if (!normalizedCode && !normalizedDigits) return null;
      return (
        products.find((product) => {
          const productSku = product.sku || '';
          if (!productSku) return false;
          if (normalizeText(productSku) === normalizeText(normalizedCode)) return true;
          const productDigits = digitsOnly(productSku) || digitsOnly(product.barcode);
          return Boolean(normalizedDigits) && productDigits === normalizedDigits;
        }) || null
      );
    },
    [products]
  );

  const createProduct = async () => {
    const name = newProductName.trim();
    if (!name) {
      setActionMessage({ tone: 'error', text: 'Informe o nome do produto.' });
      return;
    }
    const sku = digitsOnly(newProductSku) || buildMobileSku(name);
    const price = Math.max(0, toNumber(newProductPrice));
    const stock = Math.max(0, Math.trunc(toNumber(newProductStock)));
    const success = await runAction('Produto criado', async () => {
      await backendRequest('/inventory/products', {
        method: 'POST',
        body: JSON.stringify({
          name,
          sku,
          brand: newProductBrand.trim() || undefined,
          price,
          stock: stock > 0 ? stock : undefined,
          categoryId: isUuid(newProductCategoryId.trim()) ? newProductCategoryId.trim() : undefined,
          active: true
        })
      });
    });
    if (success) {
      setNewProductName('');
      setNewProductSku('');
      setNewProductBrand('');
      setNewProductPrice('');
      setNewProductStock('1');
      setNewProductCategoryId('');
      setStockAdjustSku(sku);
      setSaleSku(sku);
    }
  };

  const adjustStock = async () => {
    const code = stockAdjustSku.trim();
    const productByCode = findProductByCode(code);
    const sku = productByCode?.sku?.trim() || code;
    const quantity = Math.trunc(toNumber(stockAdjustQty));
    if (!sku) {
      setActionMessage({ tone: 'error', text: 'Informe o codigo para ajuste.' });
      return;
    }
    if (!quantity) {
      setActionMessage({ tone: 'error', text: 'Quantidade de ajuste nao pode ser zero.' });
      return;
    }
    const success = await runAction('Estoque ajustado', async () => {
      await backendRequest('/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          sku,
          quantity,
          reason: quantity > 0 ? 'mobile_adjust_in' : 'mobile_adjust_out'
        })
      });
    });
    if (success) {
      setStockAdjustQty('1');
    }
  };

  const createSale = async () => {
    const code = saleSku.trim();
    const productByCode = findProductByCode(code);
    const sku = productByCode?.sku?.trim() || code;
    const quantity = Math.max(1, Math.trunc(toNumber(saleQty)));
    const suggestedProduct = productByCode;
    const unitPrice =
      salePrice.trim().length > 0 ? Math.max(0, toNumber(salePrice)) : Math.max(0, toNumber(suggestedProduct?.price));
    if (!sku) {
      setActionMessage({ tone: 'error', text: 'Informe o codigo do item da venda.' });
      return;
    }
    if (unitPrice < 0) {
      setActionMessage({ tone: 'error', text: 'Preco invalido para venda.' });
      return;
    }
    const paymentAmount = Math.max(0, toNumber(salePaymentAmount));
    const success = await runAction('Venda registrada', async () => {
      await backendRequest('/sales/checkout', {
        method: 'POST',
        body: JSON.stringify({
          items: [
            {
              sku,
              quantity,
              price: unitPrice
            }
          ],
          customerName: saleCustomerName.trim() || undefined,
          payments:
            paymentAmount > 0
              ? [
                  {
                    method: salePaymentMethod.trim() || 'Pix',
                    amount: paymentAmount
                  }
                ]
              : undefined
        })
      });
    });
    if (success) {
      setSaleQty('1');
      setSalePrice('');
      setSalePaymentAmount('');
      setSaleCustomerName('');
    }
  };

  const updateSaleStatus = async (saleId: string, status: 'pending' | 'delivered') => {
    await runAction('Status da venda atualizado', async () => {
      await backendRequest(`/sales/orders/${saleId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    });
  };

  const registerSalePayment = async (sale: SaleOrder) => {
    const amount = Math.max(0, toNumber(sale.total));
    if (!amount) {
      setActionMessage({ tone: 'error', text: 'Venda sem valor para registrar pagamento.' });
      return;
    }
    await runAction('Pagamento registrado', async () => {
      await backendRequest(`/sales/orders/${sale.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          method: salePaymentMethod.trim() || 'Pix',
          amount
        })
      });
    });
  };

  const cancelSale = async (saleId: string) => {
    await runAction('Venda cancelada', async () => {
      await backendRequest(`/sales/orders/${saleId}/cancel`, {
        method: 'POST'
      });
    });
  };

  const createPurchase = async () => {
    const supplier = purchaseSupplier.trim();
    const total = Math.max(0, toNumber(purchaseTotal));
    const items = Math.max(1, Math.trunc(toNumber(purchaseItemsCount)));
    if (!supplier) {
      setActionMessage({ tone: 'error', text: 'Informe o fornecedor da compra.' });
      return;
    }
    if (!total) {
      setActionMessage({ tone: 'error', text: 'Informe um total de compra valido.' });
      return;
    }
    const success = await runAction('Compra criada', async () => {
      await backendRequest('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplier,
          total,
          items,
          brand: purchaseBrand.trim() || undefined,
          purchaseDate: purchaseDate.trim() || undefined,
          status: 'pending'
        })
      });
    });
    if (success) {
      setPurchaseSupplier('');
      setPurchaseBrand('');
      setPurchaseTotal('');
      setPurchaseItemsCount('1');
      setPurchaseDate(toDateInput());
    }
  };

  const changePurchaseStatus = async (
    purchaseId: string,
    status: 'pending' | 'received' | 'cancelled'
  ) => {
    await runAction('Status da compra atualizado', async () => {
      await backendRequest(`/purchases/${purchaseId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    });
  };

  const removePurchase = async (purchaseId: string) => {
    await runAction('Compra removida', async () => {
      await backendRequest(`/purchases/${purchaseId}`, { method: 'DELETE' });
    });
  };

  const createCustomer = async () => {
    const name = newCustomerName.trim();
    const phone = newCustomerPhone.trim();
    if (!name) {
      setActionMessage({ tone: 'error', text: 'Informe o nome do cliente.' });
      return;
    }
    if (phone.length < 5) {
      setActionMessage({ tone: 'error', text: 'Informe um telefone valido.' });
      return;
    }
    const success = await runAction('Cliente criado', async () => {
      await backendRequest('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          phone,
          city: newCustomerCity.trim() || undefined,
          email: newCustomerEmail.trim() || undefined
        })
      });
    });
    if (success) {
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerCity('');
      setNewCustomerEmail('');
    }
  };

  const removeCustomer = async (customerId: string) => {
    await runAction('Cliente removido', async () => {
      await backendRequest(`/customers/${customerId}`, { method: 'DELETE' });
    });
  };

  const createReceivable = async () => {
    const saleId = newReceivableSaleId.trim();
    const amount = Math.max(0, toNumber(newReceivableAmount));
    const dueDate = newReceivableDueDate.trim();
    if (!saleId) {
      setActionMessage({ tone: 'error', text: 'Informe o ID da venda para criar recebivel.' });
      return;
    }
    if (!amount) {
      setActionMessage({ tone: 'error', text: 'Valor do recebivel deve ser maior que zero.' });
      return;
    }
    if (!dueDate) {
      setActionMessage({ tone: 'error', text: 'Informe a data de vencimento do recebivel.' });
      return;
    }
    const success = await runAction('Recebivel criado', async () => {
      await backendRequest('/finance/receivables', {
        method: 'POST',
        body: JSON.stringify({
          saleId,
          amount,
          dueDate,
          method: newReceivableMethod.trim() || undefined
        })
      });
    });
    if (success) {
      setNewReceivableAmount('');
      setNewReceivableSaleId('');
      setNewReceivableDueDate(toDateInput());
      setNewReceivableMethod('Pix');
    }
  };

  const settleReceivable = async (receivable: Receivable) => {
    const amount = Math.max(0, toNumber(receivable.amount));
    if (!amount) {
      setActionMessage({ tone: 'error', text: 'Recebivel sem valor para liquidar.' });
      return;
    }
    await runAction('Recebivel liquidado', async () => {
      await backendRequest(`/finance/receivables/${receivable.id}/settle`, {
        method: 'POST',
        body: JSON.stringify({
          amount,
          settledAt: new Date().toISOString()
        })
      });
    });
  };

  const unsettleReceivable = async (receivableId: string) => {
    await runAction('Recebivel reaberto', async () => {
      await backendRequest(`/finance/receivables/${receivableId}/unsettle`, {
        method: 'POST'
      });
    });
  };

  const removeReceivable = async (receivableId: string) => {
    await runAction('Recebivel removido', async () => {
      await backendRequest(`/finance/receivables/${receivableId}`, {
        method: 'DELETE'
      });
    });
  };

  const createExpense = async () => {
    const description = newExpenseDescription.trim();
    const amount = Math.max(0, toNumber(newExpenseAmount));
    const dueDate = newExpenseDueDate.trim();
    if (!description) {
      setActionMessage({ tone: 'error', text: 'Informe a descricao da despesa.' });
      return;
    }
    if (!amount) {
      setActionMessage({ tone: 'error', text: 'Informe o valor da despesa.' });
      return;
    }
    if (!dueDate) {
      setActionMessage({ tone: 'error', text: 'Informe a data da despesa.' });
      return;
    }
    const success = await runAction('Despesa criada', async () => {
      await backendRequest('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          description,
          amount,
          dueDate,
          method: newExpenseMethod.trim() || undefined,
          customerId: isUuid(newExpenseCustomerId.trim()) ? newExpenseCustomerId.trim() : undefined,
          paid: false
        })
      });
    });
    if (success) {
      setNewExpenseDescription('');
      setNewExpenseAmount('');
      setNewExpenseDueDate(toDateInput());
      setNewExpenseMethod('Pix');
      setNewExpenseCustomerId('');
    }
  };

  const payExpense = async (expenseId: string) => {
    await runAction('Despesa marcada como paga', async () => {
      await backendRequest(`/finance/expenses/${expenseId}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paidAt: new Date().toISOString()
        })
      });
    });
  };

  const unpayExpense = async (expenseId: string) => {
    await runAction('Despesa reaberta', async () => {
      await backendRequest(`/finance/expenses/${expenseId}/unpay`, {
        method: 'POST'
      });
    });
  };

  const removeExpense = async (expenseId: string) => {
    await runAction('Despesa removida', async () => {
      await backendRequest(`/finance/expenses/${expenseId}`, {
        method: 'DELETE'
      });
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.appName}>Revendis Mobile</Text>
          <Text style={styles.moduleTitle}>{activeModuleMeta.title}</Text>
          <Text style={styles.moduleSubtitle}>{activeModuleMeta.subtitle}</Text>
        </View>
        <View
          style={[
            styles.connectionBadge,
            connection === 'online'
              ? styles.connectionOnline
              : connection === 'offline'
                ? styles.connectionOffline
                : styles.connectionChecking
          ]}
        >
          <Text style={styles.connectionBadgeText}>
            {connection === 'online'
              ? 'Online'
              : connection === 'offline'
                ? 'Offline'
                : 'Conectando'}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moduleTabs}
      >
        {MODULES.map((module) => (
          <Pressable
            key={module.id}
            onPress={() => setActiveModule(module.id)}
            style={[styles.moduleTab, activeModule === module.id ? styles.moduleTabActive : null]}
          >
            <Text style={[styles.moduleTabText, activeModule === module.id ? styles.moduleTabTextActive : null]}>
              {module.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rangeTabs}
      >
        {RANGE_PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            onPress={() => setRangePreset(preset.id)}
            style={[styles.rangeTab, rangePreset === preset.id ? styles.rangeTabActive : null]}
          >
            <Text style={[styles.rangeTabText, rangePreset === preset.id ? styles.rangeTabTextActive : null]}>
              {preset.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Carregando modulos...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData('refresh')} />}
        >
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Sem conexao com API</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {warnings.length > 0 ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Endpoints com falha parcial</Text>
              <Text style={styles.warningText}>{warnings.join(' | ')}</Text>
            </View>
          ) : null}

          {actionMessage ? (
            <View
              style={[
                styles.actionMessageCard,
                actionMessage.tone === 'success' ? styles.actionMessageSuccess : styles.actionMessageError
              ]}
            >
              <Text style={styles.actionMessageText}>{actionMessage.text}</Text>
            </View>
          ) : null}

          {activeModule === 'dashboard' ? (
            <>
              <View style={styles.statsGrid}>
                <StatCard label="Compras" value={formatCurrency(totalPurchases)} />
                <StatCard label="Vendas" value={formatCurrency(totalSales)} />
                <StatCard label="Lucro" value={formatCurrency(totalProfit)} />
                <StatCard label="A receber" value={formatCurrency(totalReceivables)} />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Lembretes</Text>
                <ReminderRow label="Sem estoque" value={String(outOfStockCount)} />
                <ReminderRow label="Estoque baixo" value={String(lowStockCount)} />
                <ReminderRow label="Recebiveis atrasados" value={String(overdueCount)} />
                <ReminderRow label="Catalogo" value={String(catalog.length)} />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Resumo base</Text>
                <InfoRow label="Produtos" value={String(products.length)} />
                <InfoRow label="Categorias" value={String(categories.length)} />
                <InfoRow label="Clientes" value={String(customers.length)} />
                <InfoRow label="Compras no periodo" value={String(filteredPurchases.length)} />
                <InfoRow label="Vendas no periodo" value={String(filteredSales.length)} />
              </View>
            </>
          ) : null}

          {activeModule === 'inventory' ? (
            <>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar produto por nome, marca ou codigo"
                  value={productQuery}
                  onChangeText={setProductQuery}
                />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
                {[
                  ['all', 'Todos'],
                  ['stock', 'Com estoque'],
                  ['empty', 'Sem estoque'],
                  ['low', 'Estoque baixo'],
                  ['expiring', 'Prox. vencer']
                ].map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => setStockFilter(id as StockFilter)}
                    style={[styles.filterTab, stockFilter === id ? styles.filterTabActive : null]}
                  >
                    <Text style={[styles.filterTabText, stockFilter === id ? styles.filterTabTextActive : null]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Acoes de estoque</Text>
                <TextInput
                  style={styles.actionInput}
                  placeholder="Nome da categoria"
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                />
                <TextInput
                  style={styles.actionInput}
                  placeholder="Cor da categoria (#7c3aed)"
                  value={newCategoryColor}
                  onChangeText={setNewCategoryColor}
                  autoCapitalize="none"
                />
                <ActionButton
                  label="Criar categoria"
                  onPress={createCategory}
                  disabled={actionBusy}
                  variant="ghost"
                />

                <TextInput
                  style={styles.actionInput}
                  placeholder="Nome do produto"
                  value={newProductName}
                  onChangeText={setNewProductName}
                />
                <TextInput
                  style={styles.actionInput}
                  placeholder="Codigo (vazio para auto)"
                  value={newProductSku}
                  onChangeText={(value) => setNewProductSku(digitsOnly(value))}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={styles.actionInput}
                  placeholder="Marca"
                  value={newProductBrand}
                  onChangeText={setNewProductBrand}
                />
                <View style={styles.inlineInputs}>
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Preco"
                    value={newProductPrice}
                    onChangeText={setNewProductPrice}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Estoque"
                    value={newProductStock}
                    onChangeText={setNewProductStock}
                    keyboardType="number-pad"
                  />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {categories.slice(0, 20).map((category) => (
                    <Pressable
                      key={category.id}
                      style={[
                        styles.chipButton,
                        newProductCategoryId === category.id ? styles.chipButtonActive : null
                      ]}
                      onPress={() =>
                        setNewProductCategoryId((current) => (current === category.id ? '' : category.id))
                      }
                    >
                      <Text
                        style={[
                          styles.chipButtonText,
                          newProductCategoryId === category.id ? styles.chipButtonTextActive : null
                        ]}
                      >
                        {category.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <ActionButton
                  label="Cadastrar produto"
                  onPress={createProduct}
                  disabled={actionBusy}
                  variant="primary"
                />

                <TextInput
                  style={styles.actionInput}
                  placeholder="Codigo para ajuste"
                  value={stockAdjustSku}
                  onChangeText={(value) => setStockAdjustSku(digitsOnly(value))}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={styles.actionInput}
                  placeholder="Quantidade (use negativo para saida)"
                  value={stockAdjustQty}
                  onChangeText={setStockAdjustQty}
                  keyboardType="numbers-and-punctuation"
                />
                <ActionButton
                  label="Ajustar estoque"
                  onPress={adjustStock}
                  disabled={actionBusy}
                  variant="muted"
                />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Produtos ({filteredProducts.length})</Text>
                {filteredProducts.slice(0, 120).map((product) => {
                  const quantity = toNumber(product.quantity);
                  const stockLabel =
                    product.active !== false && quantity > 0
                      ? `${quantity} un`
                      : 'Sem estoque';
                  return (
                    <View key={product.id} style={styles.listRow}>
                      <View style={styles.listMain}>
                        <Text style={styles.listTitle}>{product.name}</Text>
                        <Text style={styles.listMeta}>
                          {(product.brand || 'Sem marca') +
                            ' | ' +
                            (digitsOnly(product.sku) || digitsOnly(product.barcode) || '--')}
                        </Text>
                        <Text style={styles.listMeta}>{stockLabel}</Text>
                      </View>
                      <View style={styles.listRight}>
                        <Text style={styles.listAmount}>{formatCurrency(product.price)}</Text>
                        <Badge
                          label={product.active === false ? 'Inativo' : quantity > 0 ? 'Ativo' : 'Sem saldo'}
                          style={toneStyle(
                            product.active === false ? 'cancelled' : quantity > 0 ? 'paid' : 'overdue'
                          )}
                        />
                        <ActionButton
                          label="Usar no ajuste"
                          onPress={() =>
                            setStockAdjustSku(digitsOnly(product.sku) || digitsOnly(product.barcode) || '')
                          }
                          disabled={actionBusy}
                          variant="link"
                        />
                      </View>
                    </View>
                  );
                })}
                {filteredProducts.length === 0 ? <Text style={styles.emptyText}>Nenhum produto encontrado.</Text> : null}
              </View>
            </>
          ) : null}

          {activeModule === 'sales' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
                {[
                  ['all', 'Todos'],
                  ['pending', 'Pendente'],
                  ['partial', 'Parcial'],
                  ['paid', 'Pago'],
                  ['overdue', 'Atrasado']
                ].map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => setSalesPaymentFilter(id as SalesPaymentFilter)}
                    style={[styles.filterTab, salesPaymentFilter === id ? styles.filterTabActive : null]}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        salesPaymentFilter === id ? styles.filterTabTextActive : null
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.statsGrid}>
                <StatCard label="Total vendas" value={formatCurrency(totalSales)} />
                <StatCard label="Lucro" value={formatCurrency(totalProfit)} />
                <StatCard label="Pedidos" value={String(filteredSales.length)} />
                <StatCard label="Recebiveis" value={formatCurrency(totalReceivables)} />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Nova venda (fluxo rapido)</Text>
                <TextInput
                  style={styles.actionInput}
                  placeholder="Codigo do produto"
                  value={saleSku}
                  onChangeText={(value) => setSaleSku(digitsOnly(value))}
                  keyboardType="number-pad"
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {filteredProductSuggestions.map((product) => (
                    <Pressable
                      key={product.id}
                      style={styles.chipButton}
                      onPress={() => {
                        setSaleSku(digitsOnly(product.sku) || digitsOnly(product.barcode) || '');
                        setSalePrice(toNumber(product.price) > 0 ? String(toNumber(product.price)) : '');
                      }}
                    >
                      <Text style={styles.chipButtonText}>{product.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.inlineInputs}>
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Quantidade"
                    value={saleQty}
                    onChangeText={setSaleQty}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Preco unitario"
                    value={salePrice}
                    onChangeText={setSalePrice}
                    keyboardType="numeric"
                  />
                </View>
                <TextInput
                  style={styles.actionInput}
                  placeholder="Cliente (nome livre)"
                  value={saleCustomerName}
                  onChangeText={setSaleCustomerName}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {filteredCustomerSuggestions.map((customer) => (
                    <Pressable
                      key={customer.id}
                      style={styles.chipButton}
                      onPress={() => setSaleCustomerName(customer.name)}
                    >
                      <Text style={styles.chipButtonText}>{customer.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.inlineInputs}>
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Metodo pagamento"
                    value={salePaymentMethod}
                    onChangeText={setSalePaymentMethod}
                  />
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Valor pago (opcional)"
                    value={salePaymentAmount}
                    onChangeText={setSalePaymentAmount}
                    keyboardType="numeric"
                  />
                </View>
                <ActionButton
                  label="Registrar venda"
                  onPress={createSale}
                  disabled={actionBusy}
                  variant="primary"
                />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Pedidos recentes</Text>
                {filteredSales.map((sale) => {
                  const paymentStatus = salePaymentStatus(sale, receivableSummaryBySaleId);
                  return (
                    <View key={sale.id} style={styles.listRow}>
                      <View style={styles.listMain}>
                        <Text style={styles.listTitle}>{sale.customer_name || 'Cliente nao informado'}</Text>
                        <Text style={styles.listMeta}>{formatDateTime(sale.created_at)}</Text>
                        <Text style={styles.listMeta}>{saleStatusLabel(sale.status)}</Text>
                      </View>
                      <View style={styles.listRight}>
                        <Text style={styles.listAmount}>{formatCurrency(sale.total)}</Text>
                        <Badge label={paymentStatus.toUpperCase()} style={toneStyle(paymentStatus)} />
                        <View style={styles.rowActions}>
                          <ActionButton
                            label="Entregar"
                            onPress={() => updateSaleStatus(sale.id, 'delivered')}
                            disabled={actionBusy}
                            variant="link"
                          />
                          <ActionButton
                            label="Pendente"
                            onPress={() => updateSaleStatus(sale.id, 'pending')}
                            disabled={actionBusy}
                            variant="link"
                          />
                          <ActionButton
                            label="Pagar"
                            onPress={() => registerSalePayment(sale)}
                            disabled={actionBusy}
                            variant="link"
                          />
                          <ActionButton
                            label="Cancelar"
                            onPress={() => cancelSale(sale.id)}
                            disabled={actionBusy}
                            variant="danger"
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
                {filteredSales.length === 0 ? <Text style={styles.emptyText}>Nenhuma venda no periodo.</Text> : null}
              </View>
            </>
          ) : null}

          {activeModule === 'purchases' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
                {[
                  ['all', 'Todos'],
                  ['draft', 'Rascunho'],
                  ['pending', 'Pendente'],
                  ['received', 'Recebida'],
                  ['cancelled', 'Cancelada']
                ].map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => setPurchaseStatusFilter(id as PurchaseStatusFilter)}
                    style={[styles.filterTab, purchaseStatusFilter === id ? styles.filterTabActive : null]}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        purchaseStatusFilter === id ? styles.filterTabTextActive : null
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.statsGrid}>
                <StatCard label="Total compras" value={formatCurrency(totalPurchases)} />
                <StatCard label="Pedidos" value={String(filteredPurchases.length)} />
                <StatCard
                  label="Pendentes"
                  value={String(filteredPurchases.filter((item) => item.status === 'pending').length)}
                />
                <StatCard
                  label="Recebidas"
                  value={String(filteredPurchases.filter((item) => item.status === 'received').length)}
                />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Compras recentes</Text>
                {filteredPurchases.map((purchase) => (
                  <View key={purchase.id} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{purchase.supplier || 'Fornecedor nao informado'}</Text>
                      <Text style={styles.listMeta}>{purchase.brand || 'Sem marca'}</Text>
                      <Text style={styles.listMeta}>{formatDate(purchase.purchase_date || purchase.created_at)}</Text>
                    </View>
                    <View style={styles.listRight}>
                      <Text style={styles.listAmount}>{formatCurrency(purchase.total)}</Text>
                      <Badge label={purchaseStatusLabel(purchase.status)} style={toneStyle(purchase.status)} />
                    </View>
                  </View>
                ))}
                {filteredPurchases.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhuma compra encontrada no periodo.</Text>
                ) : null}
              </View>
            </>
          ) : null}

          {activeModule === 'customers' ? (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar cliente por nome, telefone, cidade ou tag"
                value={customerQuery}
                onChangeText={setCustomerQuery}
              />

              <View style={styles.statsGrid}>
                <StatCard label="Clientes" value={String(filteredCustomers.length)} />
                <StatCard
                  label="Com telefone"
                  value={String(filteredCustomers.filter((item) => Boolean(item.phone)).length)}
                />
                <StatCard
                  label="Com email"
                  value={String(filteredCustomers.filter((item) => Boolean(item.email)).length)}
                />
                <StatCard
                  label="Com cidade"
                  value={String(filteredCustomers.filter((item) => Boolean(item.city)).length)}
                />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Lista de clientes</Text>
                {filteredCustomers.map((customer) => (
                  <View key={customer.id} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{customer.name}</Text>
                      <Text style={styles.listMeta}>{customer.phone || 'Sem telefone'}</Text>
                      <Text style={styles.listMeta}>
                        {customer.city || '--'} {customer.state ? `| ${customer.state}` : ''}
                      </Text>
                    </View>
                    <View style={styles.listRight}>
                      <Text style={styles.listMeta}>{customer.email || 'Sem email'}</Text>
                      {(customer.tags || []).slice(0, 1).map((tag) => (
                        <Badge key={tag} label={tag} style={styles.badgeNeutral} />
                      ))}
                    </View>
                  </View>
                ))}
                {filteredCustomers.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhum cliente encontrado.</Text>
                ) : null}
              </View>
            </>
          ) : null}

          {activeModule === 'finance' ? (
            <>
              <View style={styles.statsGrid}>
                <StatCard label="A receber" value={formatCurrency(totalReceivables)} />
                <StatCard label="Despesas" value={formatCurrency(totalExpenses)} />
                <StatCard label="Pagamentos" value={formatCurrency(totalPayments)} />
                <StatCard
                  label="Atrasados"
                  value={String(
                    receivablesInRange.filter((item) => receivableStatusLabel(item.status) === 'Atrasado').length
                  )}
                />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Recebiveis</Text>
                {receivablesInRange.slice(0, 30).map((entry) => (
                  <View key={entry.id} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{entry.customer_name || 'Cliente nao informado'}</Text>
                      <Text style={styles.listMeta}>Venc.: {formatDate(entry.due_date)}</Text>
                    </View>
                    <View style={styles.listRight}>
                      <Text style={styles.listAmount}>{formatCurrency(entry.amount)}</Text>
                      <Badge label={receivableStatusLabel(entry.status)} style={toneStyle(entry.status)} />
                    </View>
                  </View>
                ))}
                {receivablesInRange.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhum recebivel encontrado no periodo.</Text>
                ) : null}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Despesas</Text>
                {expensesInRange.slice(0, 20).map((entry) => (
                  <View key={entry.id} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{entry.description || 'Sem descricao'}</Text>
                      <Text style={styles.listMeta}>Venc.: {formatDate(entry.due_date)}</Text>
                    </View>
                    <View style={styles.listRight}>
                      <Text style={styles.listAmount}>{formatCurrency(entry.amount)}</Text>
                      <Badge label={entry.status === 'paid' ? 'Pago' : 'Pendente'} style={toneStyle(entry.status)} />
                    </View>
                  </View>
                ))}
                {expensesInRange.length === 0 ? <Text style={styles.emptyText}>Sem despesas no periodo.</Text> : null}
              </View>
            </>
          ) : null}

          {activeModule === 'reports' ? (
            <>
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Top produtos</Text>
                {reportTopProducts.slice(0, 20).map((item, index) => (
                  <View key={`${item.sku || item.product_name || index}`} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>
                        {item.product_name || digitsOnly(item.sku) || 'Produto'}
                      </Text>
                      <Text style={styles.listMeta}>{item.brand || 'Sem marca'}</Text>
                    </View>
                    <View style={styles.listRight}>
                      <Text style={styles.listAmount}>{toNumber(item.sold_qty)} un</Text>
                      <Text style={styles.listMeta}>{formatCurrency(item.sold_total)}</Text>
                    </View>
                  </View>
                ))}
                {reportTopProducts.length === 0 ? (
                  <Text style={styles.emptyText}>Sem dados para top produtos.</Text>
                ) : null}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Top clientes</Text>
                {reportTopCustomers.slice(0, 20).map((item, index) => (
                  <View key={`${item.customer_name || index}`} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{item.customer_name || 'Cliente'}</Text>
                      <Text style={styles.listMeta}>{item.customer_phone || '--'}</Text>
                    </View>
                    <View style={styles.listRight}>
                      <Text style={styles.listAmount}>{formatCurrency(item.total_spent)}</Text>
                      <Text style={styles.listMeta}>{toNumber(item.orders_count)} pedidos</Text>
                    </View>
                  </View>
                ))}
                {reportTopCustomers.length === 0 ? (
                  <Text style={styles.emptyText}>Sem dados para top clientes.</Text>
                ) : null}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Relatorios base</Text>
                <InfoRow
                  label="Daily sales"
                  value={dailySalesStub?.message || 'Endpoint ativo'}
                />
                <InfoRow
                  label="Stock outs"
                  value={stockOutsStub?.message || 'Endpoint ativo'}
                />
                <InfoRow
                  label="Receivables aging"
                  value={agingStub?.message || 'Endpoint ativo'}
                />
              </View>
            </>
          ) : null}

          <View style={styles.footer}>
            <Text style={styles.footerText}>API: {getApiBaseUrl()}</Text>
            <Text style={styles.footerText}>Ultima sync: {formatDateTime(lastSyncAt)}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Badge({ label, style }: { label: string; style: object }) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ReminderRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb'
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  headerMain: {
    flex: 1
  },
  appName: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  moduleTitle: {
    marginTop: 2,
    fontSize: 22,
    color: '#0f172a',
    fontWeight: '700'
  },
  moduleSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b'
  },
  connectionBadge: {
    minWidth: 92,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center'
  },
  connectionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a'
  },
  connectionOnline: {
    backgroundColor: '#dcfce7'
  },
  connectionOffline: {
    backgroundColor: '#fee2e2'
  },
  connectionChecking: {
    backgroundColor: '#e2e8f0'
  },
  moduleTabs: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8
  },
  moduleTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#e2e8f0'
  },
  moduleTabActive: {
    backgroundColor: '#312e81'
  },
  moduleTabText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600'
  },
  moduleTabTextActive: {
    color: '#ffffff'
  },
  rangeTabs: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8
  },
  rangeTab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff'
  },
  rangeTabActive: {
    borderColor: '#4338ca',
    backgroundColor: '#e0e7ff'
  },
  rangeTabText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600'
  },
  rangeTabTextActive: {
    color: '#312e81'
  },
  content: {
    flex: 1
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 10
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  loadingText: {
    color: '#64748b'
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 10,
    gap: 4
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991b1b'
  },
  errorText: {
    fontSize: 12,
    color: '#7f1d1d'
  },
  warningCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    padding: 10,
    gap: 4
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e'
  },
  warningText: {
    fontSize: 11,
    color: '#92400e'
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13
  },
  filterTabs: {
    gap: 8
  },
  filterTab: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff'
  },
  filterTabActive: {
    borderColor: '#4338ca',
    backgroundColor: '#e0e7ff'
  },
  filterTabText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600'
  },
  filterTabTextActive: {
    color: '#312e81'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  statCard: {
    width: '48.5%',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4f0',
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  statLabel: {
    marginTop: 3,
    fontSize: 11,
    color: '#64748b'
  },
  panel: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4f0',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  infoLabel: {
    flex: 1,
    fontSize: 12,
    color: '#334155'
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'right'
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    paddingTop: 8
  },
  listMain: {
    flex: 1,
    gap: 2
  },
  listRight: {
    alignItems: 'flex-end',
    gap: 4,
    maxWidth: 160
  },
  listTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a'
  },
  listMeta: {
    fontSize: 11,
    color: '#64748b'
  },
  listAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1d4ed8'
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0f172a'
  },
  badgeNeutral: {
    backgroundColor: '#e2e8f0'
  },
  badgeWarn: {
    backgroundColor: '#fef3c7'
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7'
  },
  badgeDanger: {
    backgroundColor: '#fee2e2'
  },
  emptyText: {
    fontSize: 12,
    color: '#64748b'
  },
  footer: {
    marginTop: 2,
    gap: 2
  },
  footerText: {
    fontSize: 10,
    color: '#94a3b8'
  }
});
