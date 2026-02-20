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
  useWindowDimensions,
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
  | 'storefront'
  | 'reports'
  | 'notifications'
  | 'settings';

type RangePreset = '7d' | '28d' | '90d' | 'all';
type InventoryAgeFilter = 'all' | 'new' | 'legacy';

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
  created_at?: string | null;
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
  sku?: string;
  name: string;
  brand?: string | null;
  quantity?: number | string;
  price?: number | string;
  active?: boolean;
  image_url?: string | null;
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

type StorefrontOrderItem = {
  id: string;
  storefront_order_id?: string;
  product_id?: string | null;
  sku?: string;
  quantity?: number | string;
  price?: number | string;
  product_name?: string | null;
  product_brand?: string | null;
};

type StorefrontOrder = {
  id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  status?: 'pending' | 'accepted' | 'cancelled' | string;
  total?: number | string;
  created_at?: string;
  items_count?: number | string;
  sale_id?: string | null;
  accepted_at?: string | null;
  cancelled_at?: string | null;
  items?: StorefrontOrderItem[];
};

type NotificationCategory = 'order' | 'sale' | 'inventory' | 'finance' | 'customer' | 'settings' | 'general';

type NotificationItem = {
  id: string;
  entity_type?: string;
  entity_id?: string | null;
  action?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
  message?: string;
  category?: NotificationCategory;
};

type BrandSource = 'existing' | 'catalog' | 'manual';
type SubscriptionStatus = 'active' | 'trial' | 'overdue' | 'canceled';
type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
type SettingsSectionId = 'account' | 'subscription' | 'brands' | 'pix' | 'alerts' | 'access' | 'storefront';

type ResellerBrand = {
  id: string;
  name: string;
  source?: BrandSource;
  source_brand?: string | null;
  profitability?: number | string;
  logo_url?: string | null;
  created_at?: string;
};

type AccountSettings = {
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  businessName?: string;
};

type SubscriptionSettings = {
  plan?: string;
  status?: SubscriptionStatus | string;
  renewalDate?: string;
  monthlyPrice?: number | string;
};

type PixSettings = {
  keyType?: PixKeyType | string;
  keyValue?: string;
  holderName?: string;
};

type AlertSettings = {
  enabled?: boolean;
  daysBeforeDue?: number | string;
};

type AccessMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  created_at?: string;
};

type StorefrontSettings = {
  shopName?: string;
  subdomain?: string;
  shopColor?: string;
  onlyStockProducts?: boolean;
  showOutOfStockProducts?: boolean;
  filterByCategory?: boolean;
  filterByBrand?: boolean;
  filterByPrice?: boolean;
  whatsapp?: string;
  showWhatsappButton?: boolean;
  selectedBrands?: string[];
  selectedCategories?: string[];
  priceFrom?: string;
  priceTo?: string;
  logoUrl?: string;
};

type StorefrontSectionId = 'overview' | 'orders' | 'products' | 'promotions';

type StorefrontPromotion = {
  id: string;
  name: string;
  productIds: string[];
  discount: number;
  mode?: 'global' | 'per_product';
  discountsByProduct?: Record<string, number>;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'scheduled' | 'ended';
  createdAt?: string;
};

type SalesPaymentFilter = 'all' | 'pending' | 'partial' | 'paid' | 'overdue';
type PurchaseStatusFilter = 'all' | 'draft' | 'pending' | 'received' | 'cancelled';
type StockFilter = 'all' | 'stock' | 'empty' | 'low' | 'expiring';

const MODULES: Array<{ id: ModuleId; label: string; title: string; subtitle: string; icon: string }> = [
  {
    id: 'dashboard',
    label: 'Painel',
    title: 'Dashboard',
    subtitle: 'Resumo geral da operacao',
    icon: '⌂'
  },
  {
    id: 'inventory',
    label: 'Estoque',
    title: 'Estoque',
    subtitle: 'Produtos, categorias e unidades',
    icon: '▦'
  },
  {
    id: 'sales',
    label: 'Vendas',
    title: 'Vendas',
    subtitle: 'Pedidos, lucro e recebimento',
    icon: '◇'
  },
  {
    id: 'purchases',
    label: 'Compras',
    title: 'Compras',
    subtitle: 'Entradas de fornecedores',
    icon: '◫'
  },
  {
    id: 'customers',
    label: 'Clientes',
    title: 'Clientes',
    subtitle: 'Relacionamento e contatos',
    icon: '◯'
  },
  {
    id: 'finance',
    label: 'Financeiro',
    title: 'Financeiro',
    subtitle: 'Recebiveis, pagamentos e despesas',
    icon: '¤'
  },
  {
    id: 'storefront',
    label: 'Loja',
    title: 'Loja online',
    subtitle: 'Pedidos do storefront e catalogo publicado',
    icon: '◎'
  },
  {
    id: 'reports',
    label: 'Relatorios',
    title: 'Relatorios',
    subtitle: 'Indicadores e rankings',
    icon: '◔'
  },
  {
    id: 'notifications',
    label: 'Notifs',
    title: 'Notificacoes',
    subtitle: 'Eventos operacionais em tempo real',
    icon: '◉'
  },
  {
    id: 'settings',
    label: 'Config',
    title: 'Configuracoes',
    subtitle: 'Conta, assinatura, pix, acessos e loja',
    icon: '⚙'
  }
];

const RANGE_PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: '7d', label: '7d' },
  { id: '28d', label: '28d' },
  { id: '90d', label: '90d' },
  { id: 'all', label: 'Tudo' }
];

const CATALOG_BRAND_SLUGS = [
  'avon',
  'mary-kay',
  'tupperware',
  'eudora',
  'boticario',
  'oui',
  'natura',
  'demillus',
  'farmasi',
  'hinode',
  'jequiti',
  'loccitane-au-bresil',
  'mahogany',
  'moments-paris',
  'odorata',
  'quem-disse-berenice',
  'racco',
  'skelt',
  'extase',
  'diamante'
] as const;

const LOW_STOCK_THRESHOLD = 2;
const EXPIRING_DAYS = 7;
const NEW_PRODUCT_DAYS = 120;

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

const isRecentProduct = (value?: string | null) => {
  const parsed = parseDateCandidate(value);
  if (!parsed) return false;
  const cutoff = startOfToday();
  cutoff.setDate(cutoff.getDate() - NEW_PRODUCT_DAYS);
  return parsed >= cutoff;
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
  if (
    value === 'paid' ||
    value === 'completed' ||
    value === 'received' ||
    value === 'delivered' ||
    value === 'accepted' ||
    value === 'active'
  ) {
    return styles.badgeSuccess;
  }
  if (value === 'overdue' || value === 'cancelled' || value === 'canceled') {
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

const parseCommaList = (value: string) => {
  const seen = new Set<string>();
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => {
      if (!token) return false;
      const key = token.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const normalizeSubscriptionStatus = (value?: string): SubscriptionStatus => {
  if (value === 'trial' || value === 'overdue' || value === 'canceled') return value;
  return 'active';
};

const normalizePixKeyType = (value?: string): PixKeyType | '' => {
  if (value === 'cpf' || value === 'cnpj' || value === 'email' || value === 'phone' || value === 'random') {
    return value;
  }
  return '';
};

const normalizeBrandSource = (value?: string): BrandSource => {
  if (value === 'existing' || value === 'catalog') return value;
  return 'manual';
};

const notificationCategoryLabel = (value?: string) => {
  if (value === 'order') return 'Pedido';
  if (value === 'sale') return 'Venda';
  if (value === 'inventory') return 'Estoque';
  if (value === 'finance') return 'Financeiro';
  if (value === 'customer') return 'Cliente';
  if (value === 'settings') return 'Config';
  return 'Geral';
};

const storefrontOrderStatusLabel = (value?: string) => {
  if (value === 'accepted') return 'Aceito';
  if (value === 'cancelled') return 'Cancelado';
  return 'Pendente';
};

const normalizeDateInput = (value: string) => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const resolvePromotionStatus = (startDate?: string, endDate?: string): 'active' | 'scheduled' | 'ended' => {
  const today = normalizeDateInput(new Date().toISOString().slice(0, 10));
  const start = normalizeDateInput(startDate || '');
  const end = normalizeDateInput(endDate || '');
  if (end && end < today) return 'ended';
  if (start && start > today) return 'scheduled';
  return 'active';
};

const promotionStatusLabel = (status: 'active' | 'scheduled' | 'ended') => {
  if (status === 'ended') return 'Encerrada';
  if (status === 'scheduled') return 'Agendada';
  return 'Ativa';
};

export default function App() {
  const { width: screenWidth } = useWindowDimensions();
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
  const [storefrontOrders, setStorefrontOrders] = useState<StorefrontOrder[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [brands, setBrands] = useState<ResellerBrand[]>([]);
  const [accessMembers, setAccessMembers] = useState<AccessMember[]>([]);

  const [productQuery, setProductQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('all');
  const [inventoryBrandFilter, setInventoryBrandFilter] = useState<string>('all');
  const [inventoryAgeFilter, setInventoryAgeFilter] = useState<InventoryAgeFilter>('all');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState<SalesPaymentFilter>('all');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<PurchaseStatusFilter>('all');
  const [storefrontSection, setStorefrontSection] = useState<StorefrontSectionId>('overview');
  const [storefrontOrderFilter, setStorefrontOrderFilter] = useState<'all' | 'pending' | 'accepted' | 'cancelled'>(
    'all'
  );
  const [customerQuery, setCustomerQuery] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null
  );
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);

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

  const [storefrontCatalogSearch, setStorefrontCatalogSearch] = useState('');
  const [storefrontHiddenProductIds, setStorefrontHiddenProductIds] = useState<string[]>([]);
  const [storefrontPriceDraftByProductId, setStorefrontPriceDraftByProductId] = useState<Record<string, string>>({});
  const [storefrontPriceOverrides, setStorefrontPriceOverrides] = useState<Record<string, number>>({});
  const [storefrontDescriptionByProductId, setStorefrontDescriptionByProductId] = useState<Record<string, string>>({});

  const [promotionSearch, setPromotionSearch] = useState('');
  const [promotionNameInput, setPromotionNameInput] = useState('');
  const [promotionDiscountInput, setPromotionDiscountInput] = useState('10');
  const [promotionMode, setPromotionMode] = useState<'global' | 'per_product'>('global');
  const [promotionStartDate, setPromotionStartDate] = useState(toDateInput());
  const [promotionEndDate, setPromotionEndDate] = useState('');
  const [promotionSelectedProductIds, setPromotionSelectedProductIds] = useState<string[]>([]);
  const [promotionDiscountByProductInput, setPromotionDiscountByProductInput] = useState<Record<string, string>>({});
  const [storefrontPromotions, setStorefrontPromotions] = useState<StorefrontPromotion[]>([]);

  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('account');
  const [accountOwnerName, setAccountOwnerName] = useState('');
  const [accountOwnerEmail, setAccountOwnerEmail] = useState('');
  const [accountOwnerPhone, setAccountOwnerPhone] = useState('');
  const [accountBusinessName, setAccountBusinessName] = useState('');

  const [subscriptionPlan, setSubscriptionPlan] = useState('Essencial');
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('active');
  const [subscriptionRenewalDate, setSubscriptionRenewalDate] = useState('');
  const [subscriptionMonthlyPrice, setSubscriptionMonthlyPrice] = useState('0');

  const [pixKeyType, setPixKeyType] = useState<PixKeyType | ''>('');
  const [pixKeyValue, setPixKeyValue] = useState('');
  const [pixHolderName, setPixHolderName] = useState('');

  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [alertsDaysBeforeDue, setAlertsDaysBeforeDue] = useState('3');

  const [storefrontShopName, setStorefrontShopName] = useState('');
  const [storefrontSubdomain, setStorefrontSubdomain] = useState('');
  const [storefrontShopColor, setStorefrontShopColor] = useState('#7D58D4');
  const [storefrontOnlyStockProducts, setStorefrontOnlyStockProducts] = useState(false);
  const [storefrontShowOutOfStockProducts, setStorefrontShowOutOfStockProducts] = useState(true);
  const [storefrontFilterByCategory, setStorefrontFilterByCategory] = useState(true);
  const [storefrontFilterByBrand, setStorefrontFilterByBrand] = useState(true);
  const [storefrontFilterByPrice, setStorefrontFilterByPrice] = useState(true);
  const [storefrontWhatsapp, setStorefrontWhatsapp] = useState('');
  const [storefrontShowWhatsappButton, setStorefrontShowWhatsappButton] = useState(false);
  const [storefrontSelectedBrandsInput, setStorefrontSelectedBrandsInput] = useState('');
  const [storefrontSelectedCategoriesInput, setStorefrontSelectedCategoriesInput] = useState('');
  const [storefrontPriceFrom, setStorefrontPriceFrom] = useState('');
  const [storefrontPriceTo, setStorefrontPriceTo] = useState('');
  const [storefrontLogoUrl, setStorefrontLogoUrl] = useState('');

  const [brandNameInput, setBrandNameInput] = useState('');
  const [brandSourceInput, setBrandSourceInput] = useState<BrandSource>('manual');
  const [brandSourceBrandInput, setBrandSourceBrandInput] = useState('');
  const [brandProfitabilityInput, setBrandProfitabilityInput] = useState('30');
  const [brandLogoUrlInput, setBrandLogoUrlInput] = useState('');
  const [brandEditingId, setBrandEditingId] = useState('');

  const [memberNameInput, setMemberNameInput] = useState('');
  const [memberEmailInput, setMemberEmailInput] = useState('');
  const [memberRoleInput, setMemberRoleInput] = useState('seller');
  const [memberActiveInput, setMemberActiveInput] = useState(true);
  const [memberEditingId, setMemberEditingId] = useState('');

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
      nextAging,
      nextStorefrontOrders,
      nextNotifications,
      nextBrands,
      nextAccessMembers,
      nextAccountSettings,
      nextSubscriptionSettings,
      nextPixSettings,
      nextAlertSettings,
      nextStorefrontSettings
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
      safeItem<{ meta?: ReportStub }>('reports/receivables-aging', '/reports/receivables-aging'),
      safeList<StorefrontOrder>('storefront/orders', '/storefront/orders?status=all'),
      safeList<NotificationItem>('notifications', '/notifications?limit=120'),
      safeList<ResellerBrand>('settings/brands', '/settings/brands'),
      safeList<AccessMember>('settings/access', '/settings/access'),
      safeItem<{ data?: AccountSettings }>('settings/account', '/settings/account'),
      safeItem<{ data?: SubscriptionSettings }>('settings/subscription', '/settings/subscription'),
      safeItem<{ data?: PixSettings }>('settings/pix', '/settings/pix'),
      safeItem<{ data?: AlertSettings }>('settings/alerts', '/settings/alerts'),
      safeItem<{ data?: StorefrontSettings }>('settings/storefront', '/settings/storefront')
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
    setStorefrontOrders(nextStorefrontOrders);
    setNotifications(nextNotifications);
    setBrands(nextBrands);
    setAccessMembers(nextAccessMembers);

    const account = nextAccountSettings?.data;
    if (account) {
      setAccountOwnerName(account.ownerName || '');
      setAccountOwnerEmail(account.ownerEmail || '');
      setAccountOwnerPhone(account.ownerPhone || '');
      setAccountBusinessName(account.businessName || '');
    }

    const subscription = nextSubscriptionSettings?.data;
    if (subscription) {
      setSubscriptionPlan(subscription.plan || 'Essencial');
      setSubscriptionStatus(normalizeSubscriptionStatus(subscription.status));
      setSubscriptionRenewalDate(subscription.renewalDate || '');
      setSubscriptionMonthlyPrice(String(toNumber(subscription.monthlyPrice) || 0));
    }

    const pix = nextPixSettings?.data;
    if (pix) {
      setPixKeyType(normalizePixKeyType(pix.keyType));
      setPixKeyValue(pix.keyValue || '');
      setPixHolderName(pix.holderName || '');
    }

    const alerts = nextAlertSettings?.data;
    if (alerts) {
      setAlertsEnabled(alerts.enabled ?? true);
      setAlertsDaysBeforeDue(String(Math.max(0, Math.min(60, Math.trunc(toNumber(alerts.daysBeforeDue) || 3)))));
    }

    const storefront = nextStorefrontSettings?.data;
    if (storefront) {
      setStorefrontShopName(storefront.shopName || '');
      setStorefrontSubdomain(storefront.subdomain || '');
      setStorefrontShopColor(storefront.shopColor || '#7D58D4');
      setStorefrontOnlyStockProducts(storefront.onlyStockProducts ?? false);
      setStorefrontShowOutOfStockProducts(storefront.showOutOfStockProducts ?? true);
      setStorefrontFilterByCategory(storefront.filterByCategory ?? true);
      setStorefrontFilterByBrand(storefront.filterByBrand ?? true);
      setStorefrontFilterByPrice(storefront.filterByPrice ?? true);
      setStorefrontWhatsapp(storefront.whatsapp || '');
      setStorefrontShowWhatsappButton(storefront.showWhatsappButton ?? false);
      setStorefrontSelectedBrandsInput((storefront.selectedBrands || []).join(', '));
      setStorefrontSelectedCategoriesInput((storefront.selectedCategories || []).join(', '));
      setStorefrontPriceFrom(storefront.priceFrom || '');
      setStorefrontPriceTo(storefront.priceTo || '');
      setStorefrontLogoUrl(storefront.logoUrl || '');
    }
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

  useEffect(() => {
    if (inventoryCategoryFilter === 'all') return;
    if (!categories.some((category) => category.id === inventoryCategoryFilter)) {
      setInventoryCategoryFilter('all');
    }
  }, [categories, inventoryCategoryFilter]);

  useEffect(() => {
    if (inventoryBrandFilter === 'all') return;
    const exists = products.some(
      (product) => normalizeText(product.brand) === normalizeText(inventoryBrandFilter)
    );
    if (!exists) setInventoryBrandFilter('all');
  }, [products, inventoryBrandFilter]);

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

  const filteredProductsBase = useMemo(() => {
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

      const matchesCategory =
        inventoryCategoryFilter === 'all' ||
        (product.category_id || '').toLowerCase() === inventoryCategoryFilter.toLowerCase();

      const matchesBrand =
        inventoryBrandFilter === 'all' ||
        normalizeText(product.brand) === normalizeText(inventoryBrandFilter);

      return matchesQuery && matchesStock && matchesCategory && matchesBrand;
    });
  }, [products, productSearch, stockFilter, inventoryCategoryFilter, inventoryBrandFilter]);

  const filteredProducts = useMemo(() => {
    if (inventoryAgeFilter === 'all') return filteredProductsBase;
    return filteredProductsBase.filter((product) =>
      inventoryAgeFilter === 'new' ? isRecentProduct(product.created_at) : !isRecentProduct(product.created_at)
    );
  }, [filteredProductsBase, inventoryAgeFilter]);

  const inventoryBrandOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    products.forEach((product) => {
      const label = (product.brand || '').trim();
      if (!label) return;
      const key = normalizeText(label);
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, label);
    });
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category] as const)),
    [categories]
  );

  const inventoryCategoryCountById = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      const categoryId = (product.category_id || '').trim();
      if (!categoryId) return;
      counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
    });
    return counts;
  }, [products]);

  const inventoryTotalUnits = filteredProducts.reduce(
    (acc, product) => acc + Math.max(0, Math.trunc(toNumber(product.quantity))),
    0
  );
  const inventoryAvailableCount = filteredProducts.filter(
    (product) => product.active !== false && toNumber(product.quantity) > 0
  ).length;
  const inventoryLowCount = filteredProducts.filter((product) => {
    const quantity = Math.max(0, Math.trunc(toNumber(product.quantity)));
    return product.active !== false && quantity > 0 && quantity <= LOW_STOCK_THRESHOLD;
  }).length;
  const inventoryOutCount = filteredProducts.filter(
    (product) => product.active === false || Math.max(0, Math.trunc(toNumber(product.quantity))) <= 0
  ).length;
  const inventoryNewCount = filteredProductsBase.filter((product) => isRecentProduct(product.created_at)).length;
  const inventoryLegacyCount = Math.max(0, filteredProductsBase.length - inventoryNewCount);

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

  const filteredStorefrontOrders = useMemo(() => {
    return storefrontOrders.filter((order) => {
      if (storefrontOrderFilter === 'all') return true;
      return (order.status || 'pending') === storefrontOrderFilter;
    });
  }, [storefrontOrders, storefrontOrderFilter]);

  const storefrontPendingCount = storefrontOrders.filter((order) => (order.status || 'pending') === 'pending').length;
  const storefrontAcceptedCount = storefrontOrders.filter((order) => order.status === 'accepted').length;
  const storefrontCancelledCount = storefrontOrders.filter((order) => order.status === 'cancelled').length;

  const readNotificationSet = useMemo(() => new Set(readNotificationIds), [readNotificationIds]);
  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !readNotificationSet.has(item.id)),
    [notifications, readNotificationSet]
  );
  const readNotifications = useMemo(
    () => notifications.filter((item) => readNotificationSet.has(item.id)),
    [notifications, readNotificationSet]
  );

  const storefrontCatalogProducts = useMemo(
    () =>
      catalog
        .filter((item) => item.active !== false)
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')),
    [catalog]
  );

  const storefrontCatalogById = useMemo(
    () => new Map(storefrontCatalogProducts.map((item) => [item.id, item] as const)),
    [storefrontCatalogProducts]
  );

  const storefrontCatalogBySku = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    storefrontCatalogProducts.forEach((item) => {
      const sku = (item.sku || '').trim().toLowerCase();
      if (!sku) return;
      map.set(sku, item);
    });
    return map;
  }, [storefrontCatalogProducts]);

  const filteredStorefrontCatalogProducts = useMemo(() => {
    const term = normalizeText(storefrontCatalogSearch);
    if (!term) return storefrontCatalogProducts;
    return storefrontCatalogProducts.filter((item) =>
      normalizeText(`${item.name || ''} ${item.brand || ''} ${item.sku || ''}`).includes(term)
    );
  }, [storefrontCatalogProducts, storefrontCatalogSearch]);

  const storefrontPendingByProductId = useMemo(() => {
    const byProductId = new Map<string, number>();
    const bySku = new Map<string, number>();
    storefrontOrders.forEach((order) => {
      if ((order.status || 'pending') !== 'pending') return;
      (order.items || []).forEach((item) => {
        const qty = Math.max(0, Math.trunc(toNumber(item.quantity)));
        if (!qty) return;
        if (item.product_id) byProductId.set(item.product_id, (byProductId.get(item.product_id) || 0) + qty);
        const sku = (item.sku || '').trim().toLowerCase();
        if (sku) bySku.set(sku, (bySku.get(sku) || 0) + qty);
      });
    });

    const merged = new Map<string, number>();
    storefrontCatalogProducts.forEach((product) => {
      const byId = byProductId.get(product.id) || 0;
      const bySkuValue = bySku.get((product.sku || '').trim().toLowerCase()) || 0;
      merged.set(product.id, Math.max(byId, bySkuValue));
    });
    return merged;
  }, [storefrontOrders, storefrontCatalogProducts]);

  const promotionCandidates = useMemo(() => {
    const term = normalizeText(promotionSearch);
    const base = storefrontCatalogProducts.filter((item) => toNumber(item.quantity) > 0);
    if (!term) return base;
    return base.filter((item) => normalizeText(`${item.name || ''} ${item.brand || ''} ${item.sku || ''}`).includes(term));
  }, [storefrontCatalogProducts, promotionSearch]);

  const selectedPromotionProducts = useMemo(
    () => promotionSelectedProductIds.map((id) => storefrontCatalogById.get(id)).filter((item): item is CatalogItem => Boolean(item)),
    [promotionSelectedProductIds, storefrontCatalogById]
  );

  const promotionRows = useMemo(() => {
    const rows: Array<{
      rowId: string;
      promotionId: string;
      productId: string;
      productName: string;
      productBrand: string;
      oldPrice: number;
      discount: number;
      newPrice: number;
      startDate: string;
      endDate: string;
      status: 'active' | 'scheduled' | 'ended';
    }> = [];

    storefrontPromotions.forEach((promotion) => {
      const status = promotion.status || resolvePromotionStatus(promotion.startDate, promotion.endDate);
      promotion.productIds.forEach((productId) => {
        const product = storefrontCatalogById.get(productId);
        if (!product) return;
        const basePrice = (() => {
          if (typeof storefrontPriceOverrides[productId] === 'number') {
            return Math.max(0, storefrontPriceOverrides[productId]);
          }
          return Math.max(0, toNumber(product.price));
        })();
        const discount =
          promotion.mode === 'per_product'
            ? Math.max(1, Math.min(99, toNumber(promotion.discountsByProduct?.[productId] ?? promotion.discount)))
            : Math.max(1, Math.min(99, toNumber(promotion.discount)));
        const newPrice = basePrice * (1 - discount / 100);
        rows.push({
          rowId: `${promotion.id}:${productId}`,
          promotionId: promotion.id,
          productId,
          productName: product.name || 'Produto',
          productBrand: product.brand || '',
          oldPrice: basePrice,
          discount,
          newPrice: Math.max(0, newPrice),
          startDate: promotion.startDate || '',
          endDate: promotion.endDate || '',
          status
        });
      });
    });

    return rows;
  }, [storefrontPromotions, storefrontCatalogById, storefrontPriceOverrides]);

  const storefrontOrderTotalValue = storefrontOrders.reduce((acc, order) => acc + toNumber(order.total), 0);
  const storefrontPendingValue = storefrontOrders
    .filter((order) => (order.status || 'pending') === 'pending')
    .reduce((acc, order) => acc + toNumber(order.total), 0);
  const storefrontVisibleProductsCount = storefrontCatalogProducts.filter(
    (product) => !storefrontHiddenProductIds.includes(product.id)
  ).length;
  const storefrontPendingUnits = Array.from(storefrontPendingByProductId.values()).reduce(
    (acc, quantity) => acc + Math.max(0, quantity),
    0
  );
  const storefrontPromotionCounts = useMemo(() => {
    const counts = { active: 0, scheduled: 0, ended: 0 };
    storefrontPromotions.forEach((promotion) => {
      const status = promotion.status || resolvePromotionStatus(promotion.startDate, promotion.endDate);
      counts[status] += 1;
    });
    return counts;
  }, [storefrontPromotions]);

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
  const sidebarWidth = screenWidth >= 900 ? 80 : screenWidth >= 700 ? 74 : 68;
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

  const syncInventoryAllBrands = async () => {
    await runAction('Catalogo sincronizado com todas as marcas', async () => {
      await backendRequest('/catalog/brands/sync', {
        method: 'POST',
        body: JSON.stringify({
          brands: [...CATALOG_BRAND_SLUGS],
          limit: 120,
          inStockOnly: false,
          deactivateMissing: false,
          allowSampleFallback: true
        })
      });
    });
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

  const markNotificationAsRead = (notificationId: string) => {
    setReadNotificationIds((current) => (current.includes(notificationId) ? current : [...current, notificationId]));
  };

  const markAllNotificationsAsRead = () => {
    setReadNotificationIds(Array.from(new Set(notifications.map((item) => item.id))));
  };

  const acceptStorefrontOrder = async (orderId: string) => {
    await runAction('Pedido aceito', async () => {
      await backendRequest(`/storefront/orders/${orderId}/accept`, {
        method: 'POST',
        body: JSON.stringify({})
      });
    });
  };

  const cancelStorefrontOrder = async (orderId: string) => {
    await runAction('Pedido cancelado', async () => {
      await backendRequest(`/storefront/orders/${orderId}/cancel`, {
        method: 'POST'
      });
    });
  };

  const toggleStorefrontProductVisibility = (productId: string) => {
    setStorefrontHiddenProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );
  };

  const saveStorefrontProductPrice = (productId: string) => {
    const draft = storefrontPriceDraftByProductId[productId];
    const parsed = Math.max(0, toNumber(draft));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setActionMessage({ tone: 'error', text: 'Informe um preco valido.' });
      return;
    }
    setStorefrontPriceOverrides((current) => ({ ...current, [productId]: parsed }));
    setStorefrontPriceDraftByProductId((current) => ({ ...current, [productId]: '' }));
    setActionMessage({ tone: 'success', text: 'Preco da loja atualizado.' });
  };

  const clearStorefrontProductPrice = (productId: string) => {
    setStorefrontPriceOverrides((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setActionMessage({ tone: 'success', text: 'Preco customizado removido.' });
  };

  const setStorefrontProductDescription = (productId: string, value: string) => {
    setStorefrontDescriptionByProductId((current) => {
      const next = { ...current };
      const normalized = value.trim();
      if (normalized) {
        next[productId] = normalized;
      } else {
        delete next[productId];
      }
      return next;
    });
  };

  const togglePromotionProductSelection = (productId: string) => {
    setPromotionSelectedProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );
    setPromotionDiscountByProductInput((current) =>
      current[productId] ? current : { ...current, [productId]: promotionDiscountInput || '10' }
    );
  };

  const createStorefrontPromotion = () => {
    if (!promotionSelectedProductIds.length) {
      setActionMessage({ tone: 'error', text: 'Selecione ao menos um produto para promocao.' });
      return;
    }
    const discount = Math.max(1, Math.min(99, toNumber(promotionDiscountInput) || 0));
    if (!discount) {
      setActionMessage({ tone: 'error', text: 'Informe um desconto valido entre 1 e 99.' });
      return;
    }

    const startDate = normalizeDateInput(promotionStartDate) || toDateInput();
    const endDate = normalizeDateInput(promotionEndDate);
    if (endDate && endDate < startDate) {
      setActionMessage({ tone: 'error', text: 'Data final deve ser maior ou igual a data inicial.' });
      return;
    }

    let discountsByProduct: Record<string, number> | undefined = undefined;
    if (promotionMode === 'per_product') {
      discountsByProduct = {};
      promotionSelectedProductIds.forEach((productId) => {
        discountsByProduct![productId] = Math.max(
          1,
          Math.min(99, toNumber(promotionDiscountByProductInput[productId] || promotionDiscountInput) || 1)
        );
      });
    }

    const createdAt = new Date().toISOString();
    const status = resolvePromotionStatus(startDate, endDate);
    const name =
      promotionNameInput.trim() ||
      (promotionMode === 'global'
        ? `${discount}% OFF`
        : `Desconto por produto (${promotionSelectedProductIds.length})`);

    setStorefrontPromotions((current) => [
      {
        id: `promo-${Date.now()}`,
        name,
        productIds: [...promotionSelectedProductIds],
        discount,
        mode: promotionMode,
        discountsByProduct,
        startDate,
        endDate,
        createdAt,
        status
      },
      ...current
    ]);

    setPromotionNameInput('');
    setPromotionDiscountInput('10');
    setPromotionMode('global');
    setPromotionStartDate(toDateInput());
    setPromotionEndDate('');
    setPromotionSelectedProductIds([]);
    setPromotionDiscountByProductInput({});
    setActionMessage({ tone: 'success', text: 'Promocao criada.' });
  };

  const removeStorefrontPromotion = (promotionId: string) => {
    setStorefrontPromotions((current) => current.filter((promotion) => promotion.id !== promotionId));
    setActionMessage({ tone: 'success', text: 'Promocao removida.' });
  };

  const saveAccountSettings = async () => {
    const payload: Record<string, string> = {};
    if (accountOwnerName.trim()) payload.ownerName = accountOwnerName.trim();
    if (accountOwnerEmail.trim()) payload.ownerEmail = accountOwnerEmail.trim().toLowerCase();
    if (accountOwnerPhone.trim()) payload.ownerPhone = accountOwnerPhone.trim();
    if (accountBusinessName.trim()) payload.businessName = accountBusinessName.trim();
    if (!Object.keys(payload).length) {
      setActionMessage({ tone: 'error', text: 'Preencha ao menos um campo de conta.' });
      return;
    }
    await runAction('Conta atualizada', async () => {
      await backendRequest('/settings/account', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    });
  };

  const saveSubscriptionSettings = async () => {
    if (!subscriptionPlan.trim()) {
      setActionMessage({ tone: 'error', text: 'Informe o plano da assinatura.' });
      return;
    }
    await runAction('Assinatura atualizada', async () => {
      await backendRequest('/settings/subscription', {
        method: 'PATCH',
        body: JSON.stringify({
          plan: subscriptionPlan.trim(),
          status: subscriptionStatus,
          renewalDate: subscriptionRenewalDate.trim() || undefined,
          monthlyPrice: Math.max(0, toNumber(subscriptionMonthlyPrice))
        })
      });
    });
  };

  const savePixSettings = async () => {
    const payload: Record<string, string> = {};
    if (pixKeyType) payload.keyType = pixKeyType;
    if (pixKeyValue.trim()) payload.keyValue = pixKeyValue.trim();
    if (pixHolderName.trim()) payload.holderName = pixHolderName.trim();
    if (!Object.keys(payload).length) {
      setActionMessage({ tone: 'error', text: 'Preencha ao menos um campo Pix.' });
      return;
    }
    if (pixKeyType && !pixKeyValue.trim()) {
      setActionMessage({ tone: 'error', text: 'Informe a chave Pix para o tipo selecionado.' });
      return;
    }
    await runAction('Pix atualizado', async () => {
      await backendRequest('/settings/pix', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    });
  };

  const saveAlertSettings = async () => {
    await runAction('Alertas atualizados', async () => {
      await backendRequest('/settings/alerts', {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: alertsEnabled,
          daysBeforeDue: Math.max(0, Math.min(60, Math.trunc(toNumber(alertsDaysBeforeDue) || 0)))
        })
      });
    });
  };

  const saveStorefrontSettings = async () => {
    const subdomain = storefrontSubdomain.trim().toLowerCase();
    await runAction('Configuracoes da loja atualizadas', async () => {
      await backendRequest('/settings/storefront', {
        method: 'PATCH',
        body: JSON.stringify({
          shopName: storefrontShopName.trim() || undefined,
          subdomain: subdomain || undefined,
          shopColor: storefrontShopColor.trim().toUpperCase() || undefined,
          onlyStockProducts: storefrontOnlyStockProducts,
          showOutOfStockProducts: storefrontShowOutOfStockProducts,
          filterByCategory: storefrontFilterByCategory,
          filterByBrand: storefrontFilterByBrand,
          filterByPrice: storefrontFilterByPrice,
          whatsapp: storefrontWhatsapp.trim() || undefined,
          showWhatsappButton: storefrontShowWhatsappButton,
          selectedBrands: parseCommaList(storefrontSelectedBrandsInput),
          selectedCategories: parseCommaList(storefrontSelectedCategoriesInput),
          priceFrom: storefrontPriceFrom.trim() || undefined,
          priceTo: storefrontPriceTo.trim() || undefined,
          logoUrl: storefrontLogoUrl.trim() || undefined
        })
      });
    });
  };

  const resetBrandForm = () => {
    setBrandEditingId('');
    setBrandNameInput('');
    setBrandSourceInput('manual');
    setBrandSourceBrandInput('');
    setBrandProfitabilityInput('30');
    setBrandLogoUrlInput('');
  };

  const startEditBrand = (brand: ResellerBrand) => {
    setBrandEditingId(brand.id);
    setBrandNameInput(brand.name || '');
    setBrandSourceInput(normalizeBrandSource(brand.source));
    setBrandSourceBrandInput(brand.source_brand || '');
    setBrandProfitabilityInput(String(Math.max(0, Math.min(100, toNumber(brand.profitability) || 30))));
    setBrandLogoUrlInput(brand.logo_url || '');
  };

  const saveBrand = async () => {
    if (!brandNameInput.trim()) {
      setActionMessage({ tone: 'error', text: 'Informe o nome da marca.' });
      return;
    }

    const profitability = Math.max(0, Math.min(100, toNumber(brandProfitabilityInput) || 0));
    if (brandEditingId) {
      const success = await runAction('Marca atualizada', async () => {
        await backendRequest(`/settings/brands/${brandEditingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: brandNameInput.trim(),
            source: brandSourceInput,
            sourceBrand: brandSourceBrandInput.trim() || undefined,
            profitability,
            logoUrl: brandLogoUrlInput.trim() || undefined
          })
        });
      });
      if (success) resetBrandForm();
      return;
    }

    const success = await runAction('Marca criada', async () => {
      await backendRequest('/settings/brands', {
        method: 'POST',
        body: JSON.stringify({
          name: brandNameInput.trim(),
          source: brandSourceInput,
          sourceBrand: brandSourceBrandInput.trim() || undefined,
          profitability,
          logoUrl: brandLogoUrlInput.trim() || undefined
        })
      });
    });
    if (success) resetBrandForm();
  };

  const deleteBrand = async (brandId: string) => {
    await runAction('Marca removida', async () => {
      await backendRequest(`/settings/brands/${brandId}`, { method: 'DELETE' });
    });
  };

  const resetMemberForm = () => {
    setMemberEditingId('');
    setMemberNameInput('');
    setMemberEmailInput('');
    setMemberRoleInput('seller');
    setMemberActiveInput(true);
  };

  const startEditMember = (member: AccessMember) => {
    setMemberEditingId(member.id);
    setMemberNameInput(member.name || '');
    setMemberEmailInput(member.email || '');
    setMemberRoleInput(member.role || 'seller');
    setMemberActiveInput(member.active !== false);
  };

  const saveAccessMember = async () => {
    const name = memberNameInput.trim();
    const email = memberEmailInput.trim().toLowerCase();
    const role = memberRoleInput.trim().toLowerCase() || 'seller';

    if (!name) {
      setActionMessage({ tone: 'error', text: 'Informe o nome do membro.' });
      return;
    }
    if (!email) {
      setActionMessage({ tone: 'error', text: 'Informe o email do membro.' });
      return;
    }

    if (memberEditingId) {
      const success = await runAction('Acesso atualizado', async () => {
        await backendRequest(`/settings/access/${memberEditingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, email, role, active: memberActiveInput })
        });
      });
      if (success) resetMemberForm();
      return;
    }

    const success = await runAction('Acesso criado', async () => {
      await backendRequest('/settings/access', {
        method: 'POST',
        body: JSON.stringify({ name, email, role, active: memberActiveInput })
      });
    });
    if (success) resetMemberForm();
  };

  const toggleAccessMemberStatus = async (member: AccessMember) => {
    await runAction(member.active ? 'Acesso desativado' : 'Acesso ativado', async () => {
      await backendRequest(`/settings/access/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !member.active })
      });
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={styles.topBackdrop} />
      <View pointerEvents="none" style={styles.topGlow} />

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

      <View style={styles.appLayout}>
        <View style={[styles.sidebar, { width: sidebarWidth }]}>
          <View style={styles.sidebarBrand}>
            <Text style={styles.sidebarBrandText}>R</Text>
          </View>
          <View style={styles.sidebarDivider} />
          <ScrollView
            style={styles.sidebarScroll}
            contentContainerStyle={styles.sidebarTabs}
            showsVerticalScrollIndicator={false}
          >
            {MODULES.map((module) => (
              <Pressable
                key={module.id}
                onPress={() => setActiveModule(module.id)}
                accessibilityLabel={module.label}
                style={[styles.moduleTab, activeModule === module.id ? styles.moduleTabActive : null]}
              >
                <Text style={[styles.moduleTabIcon, activeModule === module.id ? styles.moduleTabIconActive : null]}>
                  {module.icon}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={styles.mainArea}>
          <View style={styles.mainSurface}>
            <ScrollView
              horizontal
              style={styles.rangeTabsScroll}
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
                <ActivityIndicator size="large" color="#6f22c1" />
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
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Filtros de estoque</Text>
                <Text style={styles.panelSubtitle}>Busca, status, categorias e marcas.</Text>
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

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
                  {[
                    ['all', 'Todos periodos'],
                    ['new', 'Novos'],
                    ['legacy', 'Antigos']
                  ].map(([id, label]) => (
                    <Pressable
                      key={id}
                      onPress={() => setInventoryAgeFilter(id as InventoryAgeFilter)}
                      style={[styles.filterTab, inventoryAgeFilter === id ? styles.filterTabActive : null]}
                    >
                      <Text style={[styles.filterTabText, inventoryAgeFilter === id ? styles.filterTabTextActive : null]}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable
                    style={[styles.chipButton, inventoryCategoryFilter === 'all' ? styles.chipButtonActive : null]}
                    onPress={() => setInventoryCategoryFilter('all')}
                  >
                    <Text
                      style={[styles.chipButtonText, inventoryCategoryFilter === 'all' ? styles.chipButtonTextActive : null]}
                    >
                      Todas categorias ({products.length})
                    </Text>
                  </Pressable>
                  {categories.map((category) => (
                    <Pressable
                      key={category.id}
                      style={[styles.chipButton, inventoryCategoryFilter === category.id ? styles.chipButtonActive : null]}
                      onPress={() => setInventoryCategoryFilter(category.id)}
                    >
                      <Text
                        style={[
                          styles.chipButtonText,
                          inventoryCategoryFilter === category.id ? styles.chipButtonTextActive : null
                        ]}
                      >
                        {category.name} ({inventoryCategoryCountById.get(category.id) || 0})
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable
                    style={[styles.chipButton, inventoryBrandFilter === 'all' ? styles.chipButtonActive : null]}
                    onPress={() => setInventoryBrandFilter('all')}
                  >
                    <Text
                      style={[styles.chipButtonText, inventoryBrandFilter === 'all' ? styles.chipButtonTextActive : null]}
                    >
                      Todas marcas
                    </Text>
                  </Pressable>
                  {inventoryBrandOptions.slice(0, 24).map((brand) => (
                    <Pressable
                      key={brand}
                      style={[styles.chipButton, inventoryBrandFilter === brand ? styles.chipButtonActive : null]}
                      onPress={() => setInventoryBrandFilter(brand)}
                    >
                      <Text style={[styles.chipButtonText, inventoryBrandFilter === brand ? styles.chipButtonTextActive : null]}>
                        {brand}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.helperText}>
                  Produtos: {filteredProducts.length} | Unidades: {inventoryTotalUnits} | Marcas: {inventoryBrandOptions.length}
                </Text>
                <ActionButton
                  label="Sincronizar todas as marcas (novos + antigos)"
                  onPress={syncInventoryAllBrands}
                  disabled={actionBusy}
                  variant="ghost"
                />
                <Text style={styles.helperText}>
                  Mantem historico local e adiciona catalogo multimarcas sem remover itens antigos.
                </Text>
              </View>

              <View style={styles.statsGrid}>
                <StatCard label="Produtos" value={String(filteredProducts.length)} />
                <StatCard label="Unidades" value={String(inventoryTotalUnits)} />
                <StatCard label="Novos" value={String(inventoryNewCount)} />
                <StatCard label="Antigos" value={String(inventoryLegacyCount)} />
                <StatCard label="Disponiveis" value={String(inventoryAvailableCount)} />
                <StatCard label="Sem estoque" value={String(inventoryOutCount)} />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Categorias</Text>
                <Text style={styles.panelSubtitle}>Mantenha os grupos alinhados ao catalogo web.</Text>
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
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Novo produto</Text>
                <Text style={styles.panelSubtitle}>Cadastro rapido no mesmo padrao do web.</Text>
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
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Ajuste rapido</Text>
                <Text style={styles.panelSubtitle}>Use o codigo/SKU para entrada ou saida de unidades.</Text>
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
                <Text style={styles.panelTitle}>Catalogo ({filteredProducts.length})</Text>
                <Text style={styles.panelSubtitle}>Lista de leitura rapida com preco, status e categoria.</Text>
                {filteredProducts.slice(0, 120).map((product) => {
                  const quantity = toNumber(product.quantity);
                  const safeQuantity = Math.max(0, Math.trunc(quantity));
                  const stockLabel =
                    product.active !== false && safeQuantity > 0
                      ? `${safeQuantity} un`
                      : 'Sem estoque';
                  const categoryName = product.category_id ? categoryById.get(product.category_id)?.name : '';
                  const expiresIn = daysUntil(product.expires_at);
                  const expirationText =
                    expiresIn === null
                      ? '--'
                      : expiresIn < 0
                        ? `Vencido ha ${Math.abs(expiresIn)}d`
                        : expiresIn === 0
                          ? 'Vence hoje'
                          : `Vence em ${expiresIn}d`;
                  return (
                    <View key={product.id} style={styles.listRow}>
                      <View style={styles.listMain}>
                        <Text style={styles.listTitle}>{product.name}</Text>
                        <Text style={styles.listMeta}>
                          {(product.brand || 'Sem marca') +
                            ' | ' +
                            (digitsOnly(product.sku) || digitsOnly(product.barcode) || '--')}
                        </Text>
                        <Text style={styles.listMeta}>
                          {stockLabel} | {categoryName || 'Sem categoria'}
                        </Text>
                        <Text style={styles.listMeta}>Validade: {expirationText}</Text>
                      </View>
                      <View style={styles.listRight}>
                        <Text style={styles.listAmount}>{formatCurrency(product.price)}</Text>
                        <Badge
                          label={product.active === false ? 'Inativo' : safeQuantity > 0 ? 'Ativo' : 'Sem saldo'}
                          style={toneStyle(
                            product.active === false ? 'cancelled' : safeQuantity > 0 ? 'paid' : 'overdue'
                          )}
                        />
                        {product.brand ? <Text style={styles.listMeta}>{product.brand}</Text> : null}
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
                {inventoryLowCount > 0 ? (
                  <Text style={styles.helperText}>Itens com estoque baixo: {inventoryLowCount}</Text>
                ) : null}
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
                <Text style={styles.panelTitle}>Nova compra</Text>
                <TextInput
                  style={styles.actionInput}
                  placeholder="Fornecedor"
                  value={purchaseSupplier}
                  onChangeText={setPurchaseSupplier}
                />
                <TextInput
                  style={styles.actionInput}
                  placeholder="Marca"
                  value={purchaseBrand}
                  onChangeText={setPurchaseBrand}
                />
                <View style={styles.inlineInputs}>
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Total"
                    value={purchaseTotal}
                    onChangeText={setPurchaseTotal}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Itens"
                    value={purchaseItemsCount}
                    onChangeText={setPurchaseItemsCount}
                    keyboardType="number-pad"
                  />
                </View>
                <TextInput
                  style={styles.actionInput}
                  placeholder="Data (YYYY-MM-DD)"
                  value={purchaseDate}
                  onChangeText={setPurchaseDate}
                />
                <ActionButton
                  label="Registrar compra"
                  onPress={createPurchase}
                  disabled={actionBusy}
                  variant="primary"
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
                      <View style={styles.rowActions}>
                        <ActionButton
                          label="Pendente"
                          onPress={() => changePurchaseStatus(purchase.id, 'pending')}
                          disabled={actionBusy}
                          variant="link"
                        />
                        <ActionButton
                          label="Recebida"
                          onPress={() => changePurchaseStatus(purchase.id, 'received')}
                          disabled={actionBusy}
                          variant="link"
                        />
                        <ActionButton
                          label="Cancelar"
                          onPress={() => changePurchaseStatus(purchase.id, 'cancelled')}
                          disabled={actionBusy}
                          variant="danger"
                        />
                        <ActionButton
                          label="Excluir"
                          onPress={() => removePurchase(purchase.id)}
                          disabled={actionBusy}
                          variant="danger"
                        />
                      </View>
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
                <Text style={styles.panelTitle}>Novo cliente</Text>
                <TextInput
                  style={styles.actionInput}
                  placeholder="Nome"
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                />
                <TextInput
                  style={styles.actionInput}
                  placeholder="Telefone"
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  keyboardType="phone-pad"
                />
                <View style={styles.inlineInputs}>
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Cidade"
                    value={newCustomerCity}
                    onChangeText={setNewCustomerCity}
                  />
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Email"
                    value={newCustomerEmail}
                    onChangeText={setNewCustomerEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <ActionButton
                  label="Cadastrar cliente"
                  onPress={createCustomer}
                  disabled={actionBusy}
                  variant="primary"
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
                      <ActionButton
                        label="Remover"
                        onPress={() => removeCustomer(customer.id)}
                        disabled={actionBusy}
                        variant="danger"
                      />
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
                <Text style={styles.panelTitle}>Novo recebivel</Text>
                <TextInput
                  style={styles.actionInput}
                  placeholder="ID da venda"
                  value={newReceivableSaleId}
                  onChangeText={setNewReceivableSaleId}
                />
                <View style={styles.inlineInputs}>
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Valor"
                    value={newReceivableAmount}
                    onChangeText={setNewReceivableAmount}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Vencimento (YYYY-MM-DD)"
                    value={newReceivableDueDate}
                    onChangeText={setNewReceivableDueDate}
                  />
                </View>
                <TextInput
                  style={styles.actionInput}
                  placeholder="Metodo (Pix, dinheiro, etc)"
                  value={newReceivableMethod}
                  onChangeText={setNewReceivableMethod}
                />
                <ActionButton
                  label="Criar recebivel"
                  onPress={createReceivable}
                  disabled={actionBusy}
                  variant="primary"
                />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Nova despesa</Text>
                <TextInput
                  style={styles.actionInput}
                  placeholder="Descricao"
                  value={newExpenseDescription}
                  onChangeText={setNewExpenseDescription}
                />
                <View style={styles.inlineInputs}>
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Valor"
                    value={newExpenseAmount}
                    onChangeText={setNewExpenseAmount}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Vencimento (YYYY-MM-DD)"
                    value={newExpenseDueDate}
                    onChangeText={setNewExpenseDueDate}
                  />
                </View>
                <View style={styles.inlineInputs}>
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="Metodo"
                    value={newExpenseMethod}
                    onChangeText={setNewExpenseMethod}
                  />
                  <TextInput
                    style={[styles.actionInput, styles.inlineInput]}
                    placeholder="ID cliente (opcional)"
                    value={newExpenseCustomerId}
                    onChangeText={setNewExpenseCustomerId}
                  />
                </View>
                <ActionButton
                  label="Criar despesa"
                  onPress={createExpense}
                  disabled={actionBusy}
                  variant="primary"
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
                      <View style={styles.rowActions}>
                        {entry.status === 'paid' ? (
                          <ActionButton
                            label="Reabrir"
                            onPress={() => unsettleReceivable(entry.id)}
                            disabled={actionBusy}
                            variant="link"
                          />
                        ) : (
                          <ActionButton
                            label="Baixar"
                            onPress={() => settleReceivable(entry)}
                            disabled={actionBusy}
                            variant="link"
                          />
                        )}
                        <ActionButton
                          label="Excluir"
                          onPress={() => removeReceivable(entry.id)}
                          disabled={actionBusy}
                          variant="danger"
                        />
                      </View>
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
                      <View style={styles.rowActions}>
                        {entry.status === 'paid' ? (
                          <ActionButton
                            label="Reabrir"
                            onPress={() => unpayExpense(entry.id)}
                            disabled={actionBusy}
                            variant="link"
                          />
                        ) : (
                          <ActionButton
                            label="Pagar"
                            onPress={() => payExpense(entry.id)}
                            disabled={actionBusy}
                            variant="link"
                          />
                        )}
                        <ActionButton
                          label="Excluir"
                          onPress={() => removeExpense(entry.id)}
                          disabled={actionBusy}
                          variant="danger"
                        />
                      </View>
                    </View>
                  </View>
                ))}
                {expensesInRange.length === 0 ? <Text style={styles.emptyText}>Sem despesas no periodo.</Text> : null}
              </View>
            </>
          ) : null}

          {activeModule === 'storefront' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
                {[
                  ['overview', 'Visao geral'],
                  ['orders', 'Pedidos'],
                  ['products', 'Produtos'],
                  ['promotions', 'Promocoes']
                ].map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => setStorefrontSection(id as StorefrontSectionId)}
                    style={[styles.filterTab, storefrontSection === id ? styles.filterTabActive : null]}
                  >
                    <Text style={[styles.filterTabText, storefrontSection === id ? styles.filterTabTextActive : null]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {storefrontSection === 'overview' ? (
                <>
                  <View style={styles.statsGrid}>
                    <StatCard label="Catalogo" value={String(storefrontCatalogProducts.length)} />
                    <StatCard label="Visiveis" value={String(storefrontVisibleProductsCount)} />
                    <StatCard label="Pedidos" value={String(storefrontOrders.length)} />
                    <StatCard label="Promocoes" value={String(storefrontPromotions.length)} />
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Resumo da operacao</Text>
                    <InfoRow label="Pedidos pendentes" value={String(storefrontPendingCount)} />
                    <InfoRow label="Pedidos aceitos" value={String(storefrontAcceptedCount)} />
                    <InfoRow label="Pedidos cancelados" value={String(storefrontCancelledCount)} />
                    <InfoRow label="Volume de pedidos" value={formatCurrency(storefrontOrderTotalValue)} />
                    <InfoRow label="Volume pendente" value={formatCurrency(storefrontPendingValue)} />
                    <InfoRow label="Itens pendentes" value={String(storefrontPendingUnits)} />
                    <InfoRow label="Promocoes ativas" value={String(storefrontPromotionCounts.active)} />
                    <InfoRow label="Promocoes agendadas" value={String(storefrontPromotionCounts.scheduled)} />
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Ultimos pedidos</Text>
                    {storefrontOrders.slice(0, 8).map((order) => (
                      <View key={order.id} style={styles.listRow}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle}>{order.customer_name || 'Cliente da loja'}</Text>
                          <Text style={styles.listMeta}>{formatDateTime(order.created_at)}</Text>
                        </View>
                        <View style={styles.listRight}>
                          <Text style={styles.listAmount}>{formatCurrency(order.total)}</Text>
                          <Badge label={storefrontOrderStatusLabel(order.status)} style={toneStyle(order.status)} />
                        </View>
                      </View>
                    ))}
                    {storefrontOrders.length === 0 ? <Text style={styles.emptyText}>Sem pedidos no momento.</Text> : null}
                  </View>
                </>
              ) : null}

              {storefrontSection === 'orders' ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
                    {[
                      ['all', 'Todos'],
                      ['pending', 'Pendentes'],
                      ['accepted', 'Aceitos'],
                      ['cancelled', 'Cancelados']
                    ].map(([id, label]) => (
                      <Pressable
                        key={id}
                        onPress={() => setStorefrontOrderFilter(id as 'all' | 'pending' | 'accepted' | 'cancelled')}
                        style={[styles.filterTab, storefrontOrderFilter === id ? styles.filterTabActive : null]}
                      >
                        <Text
                          style={[styles.filterTabText, storefrontOrderFilter === id ? styles.filterTabTextActive : null]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <View style={styles.statsGrid}>
                    <StatCard label="Pedidos" value={String(filteredStorefrontOrders.length)} />
                    <StatCard label="Pendentes" value={String(storefrontPendingCount)} />
                    <StatCard label="Aceitos" value={String(storefrontAcceptedCount)} />
                    <StatCard label="Cancelados" value={String(storefrontCancelledCount)} />
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Pedidos da loja online</Text>
                    {filteredStorefrontOrders.map((order) => (
                      <View key={order.id} style={styles.listRow}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle}>{order.customer_name || 'Cliente da loja'}</Text>
                          <Text style={styles.listMeta}>{formatDateTime(order.created_at)}</Text>
                          <Text style={styles.listMeta}>{toNumber(order.items_count)} itens</Text>
                          {(order.items || []).slice(0, 3).map((item) => (
                            <Text key={item.id} style={styles.listMeta}>
                              {(item.product_name || item.sku || 'Item') +
                                ` x${Math.max(0, Math.trunc(toNumber(item.quantity)))}`}
                            </Text>
                          ))}
                        </View>
                        <View style={styles.listRight}>
                          <Text style={styles.listAmount}>{formatCurrency(order.total)}</Text>
                          <Badge label={storefrontOrderStatusLabel(order.status)} style={toneStyle(order.status)} />
                          {order.sale_id ? <Text style={styles.listMeta}>Venda: {order.sale_id.slice(0, 8)}</Text> : null}
                          {(order.status || 'pending') === 'pending' ? (
                            <View style={styles.rowActions}>
                              <ActionButton
                                label="Aceitar"
                                onPress={() => acceptStorefrontOrder(order.id)}
                                disabled={actionBusy}
                                variant="link"
                              />
                              <ActionButton
                                label="Cancelar"
                                onPress={() => cancelStorefrontOrder(order.id)}
                                disabled={actionBusy}
                                variant="danger"
                              />
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ))}
                    {filteredStorefrontOrders.length === 0 ? (
                      <Text style={styles.emptyText}>Nenhum pedido encontrado para o filtro atual.</Text>
                    ) : null}
                  </View>
                </>
              ) : null}

              {storefrontSection === 'products' ? (
                <>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar produto por nome, marca ou SKU"
                    value={storefrontCatalogSearch}
                    onChangeText={setStorefrontCatalogSearch}
                  />

                  <View style={styles.statsGrid}>
                    <StatCard label="No catalogo" value={String(storefrontCatalogProducts.length)} />
                    <StatCard label="Filtrados" value={String(filteredStorefrontCatalogProducts.length)} />
                    <StatCard label="Ocultos" value={String(storefrontHiddenProductIds.length)} />
                    <StatCard label="Com pendencia" value={String(storefrontPendingUnits)} />
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Produtos publicados</Text>
                    {filteredStorefrontCatalogProducts.slice(0, 120).map((product) => {
                      const pending = storefrontPendingByProductId.get(product.id) || 0;
                      const basePrice = Math.max(0, toNumber(product.price));
                      const overridePrice = storefrontPriceOverrides[product.id];
                      const currentPrice =
                        typeof overridePrice === 'number' && Number.isFinite(overridePrice)
                          ? Math.max(0, overridePrice)
                          : basePrice;
                      const draftValue = storefrontPriceDraftByProductId[product.id] || '';
                      const hidden = storefrontHiddenProductIds.includes(product.id);
                      return (
                        <View key={product.id} style={styles.listRow}>
                          <View style={styles.listMain}>
                            <Text style={styles.listTitle}>{product.name || 'Produto'}</Text>
                            <Text style={styles.listMeta}>
                              {(product.brand || 'Sem marca') + ' | ' + (product.sku || '--')}
                            </Text>
                            <Text style={styles.listMeta}>
                              Estoque: {Math.max(0, Math.trunc(toNumber(product.quantity)))} | Pendentes: {pending}
                            </Text>
                            <TextInput
                              style={styles.actionInput}
                              placeholder="Descricao curta da vitrine"
                              value={storefrontDescriptionByProductId[product.id] || ''}
                              onChangeText={(value) => setStorefrontProductDescription(product.id, value)}
                            />
                          </View>
                          <View style={styles.listRight}>
                            <Text style={styles.listAmount}>{formatCurrency(currentPrice)}</Text>
                            {currentPrice !== basePrice ? (
                              <Text style={styles.listMeta}>Base: {formatCurrency(basePrice)}</Text>
                            ) : null}
                            <Badge label={hidden ? 'Oculto' : 'Visivel'} style={hidden ? styles.badgeWarn : styles.badgeSuccess} />
                            <TextInput
                              style={styles.actionInput}
                              placeholder="Preco loja"
                              value={draftValue}
                              onChangeText={(value) =>
                                setStorefrontPriceDraftByProductId((current) => ({ ...current, [product.id]: value }))
                              }
                              keyboardType="numeric"
                            />
                            <View style={styles.rowActions}>
                              <ActionButton
                                label="Salvar preco"
                                onPress={() => saveStorefrontProductPrice(product.id)}
                                disabled={actionBusy}
                                variant="link"
                              />
                              <ActionButton
                                label="Limpar preco"
                                onPress={() => clearStorefrontProductPrice(product.id)}
                                disabled={actionBusy}
                                variant="ghost"
                              />
                              <ActionButton
                                label={hidden ? 'Mostrar' : 'Ocultar'}
                                onPress={() => toggleStorefrontProductVisibility(product.id)}
                                disabled={actionBusy}
                                variant={hidden ? 'ghost' : 'muted'}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    {filteredStorefrontCatalogProducts.length === 0 ? (
                      <Text style={styles.emptyText}>Nenhum produto encontrado.</Text>
                    ) : null}
                  </View>
                </>
              ) : null}

              {storefrontSection === 'promotions' ? (
                <>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Buscar produto para promocao"
                    value={promotionSearch}
                    onChangeText={setPromotionSearch}
                  />

                  <View style={styles.statsGrid}>
                    <StatCard label="Promocoes" value={String(storefrontPromotions.length)} />
                    <StatCard label="Ativas" value={String(storefrontPromotionCounts.active)} />
                    <StatCard label="Agendadas" value={String(storefrontPromotionCounts.scheduled)} />
                    <StatCard label="Encerradas" value={String(storefrontPromotionCounts.ended)} />
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Criar promocao</Text>
                    <TextInput
                      style={styles.actionInput}
                      placeholder="Nome da promocao (opcional)"
                      value={promotionNameInput}
                      onChangeText={setPromotionNameInput}
                    />
                    <View style={styles.inlineInputs}>
                      <TextInput
                        style={[styles.actionInput, styles.inlineInput]}
                        placeholder="Desconto (%)"
                        value={promotionDiscountInput}
                        onChangeText={setPromotionDiscountInput}
                        keyboardType="numeric"
                      />
                      <TextInput
                        style={[styles.actionInput, styles.inlineInput]}
                        placeholder="Inicio (YYYY-MM-DD)"
                        value={promotionStartDate}
                        onChangeText={setPromotionStartDate}
                      />
                    </View>
                    <TextInput
                      style={styles.actionInput}
                      placeholder="Fim (YYYY-MM-DD opcional)"
                      value={promotionEndDate}
                      onChangeText={setPromotionEndDate}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {[
                        ['global', 'Desconto unico'],
                        ['per_product', 'Por produto']
                      ].map(([id, label]) => (
                        <Pressable
                          key={id}
                          style={[styles.chipButton, promotionMode === id ? styles.chipButtonActive : null]}
                          onPress={() => setPromotionMode(id as 'global' | 'per_product')}
                        >
                          <Text style={[styles.chipButtonText, promotionMode === id ? styles.chipButtonTextActive : null]}>
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Text style={styles.listMeta}>Selecionados: {promotionSelectedProductIds.length}</Text>
                    <ActionButton
                      label="Aplicar promocao"
                      onPress={createStorefrontPromotion}
                      disabled={actionBusy}
                      variant="primary"
                    />
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Selecionar produtos</Text>
                    {promotionCandidates.slice(0, 80).map((product) => {
                      const selected = promotionSelectedProductIds.includes(product.id);
                      const finalDiscount =
                        promotionMode === 'per_product'
                          ? Math.max(1, Math.min(99, toNumber(promotionDiscountByProductInput[product.id]) || 0))
                          : Math.max(1, Math.min(99, toNumber(promotionDiscountInput) || 0));
                      const resolvedPrice =
                        typeof storefrontPriceOverrides[product.id] === 'number'
                          ? storefrontPriceOverrides[product.id]
                          : Math.max(0, toNumber(product.price));
                      const discountedPrice = resolvedPrice * (1 - finalDiscount / 100);

                      return (
                        <View key={product.id} style={styles.listRow}>
                          <Pressable style={styles.listMain} onPress={() => togglePromotionProductSelection(product.id)}>
                            <Text style={styles.listTitle}>
                              {selected ? 'Selecionado - ' : ''}
                              {product.name}
                            </Text>
                            <Text style={styles.listMeta}>{(product.brand || 'Sem marca') + ' | ' + (product.sku || '--')}</Text>
                            <Text style={styles.listMeta}>
                              {formatCurrency(resolvedPrice)}
                              {' -> '}
                              {formatCurrency(discountedPrice)}
                            </Text>
                          </Pressable>
                          <View style={styles.listRight}>
                            <Badge label={selected ? 'ON' : 'OFF'} style={selected ? styles.badgeSuccess : styles.badgeNeutral} />
                            {promotionMode === 'per_product' && selected ? (
                              <TextInput
                                style={styles.actionInput}
                                placeholder="%"
                                value={promotionDiscountByProductInput[product.id] || ''}
                                onChangeText={(value) =>
                                  setPromotionDiscountByProductInput((current) => ({ ...current, [product.id]: value }))
                                }
                                keyboardType="numeric"
                              />
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                    {promotionCandidates.length === 0 ? (
                      <Text style={styles.emptyText}>Nenhum produto com estoque para promocao.</Text>
                    ) : null}
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Promocoes aplicadas</Text>
                    {storefrontPromotions.map((promotion) => {
                      const status = promotion.status || resolvePromotionStatus(promotion.startDate, promotion.endDate);
                      return (
                        <View key={promotion.id} style={styles.listRow}>
                          <View style={styles.listMain}>
                            <Text style={styles.listTitle}>{promotion.name}</Text>
                            <Text style={styles.listMeta}>{promotion.productIds.length} produto(s)</Text>
                            <Text style={styles.listMeta}>
                              {promotion.startDate || '--'} {promotion.endDate ? `a ${promotion.endDate}` : '(sem fim)'}
                            </Text>
                          </View>
                          <View style={styles.listRight}>
                            <Badge label={promotionStatusLabel(status)} style={toneStyle(status === 'ended' ? 'cancelled' : 'active')} />
                            <ActionButton
                              label="Remover"
                              onPress={() => removeStorefrontPromotion(promotion.id)}
                              disabled={actionBusy}
                              variant="danger"
                            />
                          </View>
                        </View>
                      );
                    })}
                    {storefrontPromotions.length === 0 ? <Text style={styles.emptyText}>Sem promocoes cadastradas.</Text> : null}
                  </View>

                  {promotionRows.length > 0 ? (
                    <View style={styles.panel}>
                      <Text style={styles.panelTitle}>Tabela de impacto</Text>
                      {promotionRows.slice(0, 80).map((row) => (
                        <View key={row.rowId} style={styles.listRow}>
                          <View style={styles.listMain}>
                            <Text style={styles.listTitle}>{row.productName}</Text>
                            <Text style={styles.listMeta}>{row.productBrand || 'Sem marca'}</Text>
                            <Text style={styles.listMeta}>
                              {formatCurrency(row.oldPrice)}
                              {' -> '}
                              {formatCurrency(row.newPrice)} ({row.discount}%)
                            </Text>
                          </View>
                          <View style={styles.listRight}>
                            <Badge
                              label={promotionStatusLabel(row.status)}
                              style={toneStyle(row.status === 'ended' ? 'cancelled' : 'active')}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {activeModule === 'notifications' ? (
            <>
              <View style={styles.statsGrid}>
                <StatCard label="Total" value={String(notifications.length)} />
                <StatCard label="Nao lidas" value={String(unreadNotifications.length)} />
                <StatCard label="Lidas" value={String(readNotifications.length)} />
                <StatCard label="Ultima sync" value={formatDateTime(lastSyncAt)} />
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Nao lidas</Text>
                <ActionButton
                  label="Marcar todas como lidas"
                  onPress={markAllNotificationsAsRead}
                  disabled={unreadNotifications.length === 0}
                  variant="ghost"
                />
                {unreadNotifications.map((item) => (
                  <View key={item.id} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{item.message || 'Notificacao'}</Text>
                      <Text style={styles.listMeta}>{formatDateTime(item.created_at)}</Text>
                    </View>
                    <View style={styles.listRight}>
                      <Badge label={notificationCategoryLabel(item.category)} style={styles.badgeWarn} />
                      <ActionButton
                        label="Marcar lida"
                        onPress={() => markNotificationAsRead(item.id)}
                        disabled={false}
                        variant="link"
                      />
                    </View>
                  </View>
                ))}
                {unreadNotifications.length === 0 ? <Text style={styles.emptyText}>Nenhuma notificacao pendente.</Text> : null}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Lidas</Text>
                {readNotifications.slice(0, 80).map((item) => (
                  <View key={item.id} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle}>{item.message || 'Notificacao'}</Text>
                      <Text style={styles.listMeta}>{formatDateTime(item.created_at)}</Text>
                    </View>
                    <View style={styles.listRight}>
                      <Badge label={notificationCategoryLabel(item.category)} style={styles.badgeNeutral} />
                    </View>
                  </View>
                ))}
                {readNotifications.length === 0 ? <Text style={styles.emptyText}>Sem notificacoes lidas.</Text> : null}
              </View>
            </>
          ) : null}

          {activeModule === 'settings' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
                {[
                  ['account', 'Conta'],
                  ['subscription', 'Assinatura'],
                  ['brands', 'Marcas'],
                  ['pix', 'Pix'],
                  ['alerts', 'Alertas'],
                  ['access', 'Acessos'],
                  ['storefront', 'Loja']
                ].map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => setSettingsSection(id as SettingsSectionId)}
                    style={[styles.filterTab, settingsSection === id ? styles.filterTabActive : null]}
                  >
                    <Text style={[styles.filterTabText, settingsSection === id ? styles.filterTabTextActive : null]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {settingsSection === 'account' ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Conta</Text>
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Nome do responsavel"
                    value={accountOwnerName}
                    onChangeText={setAccountOwnerName}
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Email"
                    value={accountOwnerEmail}
                    onChangeText={setAccountOwnerEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Telefone"
                    value={accountOwnerPhone}
                    onChangeText={setAccountOwnerPhone}
                    keyboardType="phone-pad"
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Nome da empresa"
                    value={accountBusinessName}
                    onChangeText={setAccountBusinessName}
                  />
                  <ActionButton
                    label="Salvar conta"
                    onPress={saveAccountSettings}
                    disabled={actionBusy}
                    variant="primary"
                  />
                </View>
              ) : null}

              {settingsSection === 'subscription' ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Assinatura</Text>
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Plano"
                    value={subscriptionPlan}
                    onChangeText={setSubscriptionPlan}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {[
                      ['active', 'Ativa'],
                      ['trial', 'Teste'],
                      ['overdue', 'Atrasada'],
                      ['canceled', 'Cancelada']
                    ].map(([id, label]) => (
                      <Pressable
                        key={id}
                        style={[styles.chipButton, subscriptionStatus === id ? styles.chipButtonActive : null]}
                        onPress={() => setSubscriptionStatus(id as SubscriptionStatus)}
                      >
                        <Text
                          style={[styles.chipButtonText, subscriptionStatus === id ? styles.chipButtonTextActive : null]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.inlineInputs}>
                    <TextInput
                      style={[styles.actionInput, styles.inlineInput]}
                      placeholder="Renovacao (YYYY-MM-DD)"
                      value={subscriptionRenewalDate}
                      onChangeText={setSubscriptionRenewalDate}
                    />
                    <TextInput
                      style={[styles.actionInput, styles.inlineInput]}
                      placeholder="Mensalidade"
                      value={subscriptionMonthlyPrice}
                      onChangeText={setSubscriptionMonthlyPrice}
                      keyboardType="numeric"
                    />
                  </View>
                  <ActionButton
                    label="Salvar assinatura"
                    onPress={saveSubscriptionSettings}
                    disabled={actionBusy}
                    variant="primary"
                  />
                </View>
              ) : null}

              {settingsSection === 'brands' ? (
                <>
                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>{brandEditingId ? 'Editar marca' : 'Nova marca'}</Text>
                    <TextInput
                      style={styles.actionInput}
                      placeholder="Nome"
                      value={brandNameInput}
                      onChangeText={setBrandNameInput}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {[
                        ['manual', 'Manual'],
                        ['existing', 'Existente'],
                        ['catalog', 'Catalogo']
                      ].map(([id, label]) => (
                        <Pressable
                          key={id}
                          style={[styles.chipButton, brandSourceInput === id ? styles.chipButtonActive : null]}
                          onPress={() => setBrandSourceInput(id as BrandSource)}
                        >
                          <Text style={[styles.chipButtonText, brandSourceInput === id ? styles.chipButtonTextActive : null]}>
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <TextInput
                      style={styles.actionInput}
                      placeholder="Slug/origem (opcional)"
                      value={brandSourceBrandInput}
                      onChangeText={setBrandSourceBrandInput}
                    />
                    <View style={styles.inlineInputs}>
                      <TextInput
                        style={[styles.actionInput, styles.inlineInput]}
                        placeholder="Lucratividade (%)"
                        value={brandProfitabilityInput}
                        onChangeText={setBrandProfitabilityInput}
                        keyboardType="numeric"
                      />
                      <TextInput
                        style={[styles.actionInput, styles.inlineInput]}
                        placeholder="Logo URL"
                        value={brandLogoUrlInput}
                        onChangeText={setBrandLogoUrlInput}
                        autoCapitalize="none"
                      />
                    </View>
                    <ActionButton
                      label={brandEditingId ? 'Salvar edicao' : 'Adicionar marca'}
                      onPress={saveBrand}
                      disabled={actionBusy}
                      variant="primary"
                    />
                    {brandEditingId ? (
                      <ActionButton
                        label="Cancelar edicao"
                        onPress={resetBrandForm}
                        disabled={actionBusy}
                        variant="muted"
                      />
                    ) : null}
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Marcas ({brands.length})</Text>
                    {brands.map((brand) => (
                      <View key={brand.id} style={styles.listRow}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle}>{brand.name}</Text>
                          <Text style={styles.listMeta}>{(brand.source || 'manual').toUpperCase()}</Text>
                          <Text style={styles.listMeta}>{toNumber(brand.profitability)}% lucratividade</Text>
                        </View>
                        <View style={styles.listRight}>
                          <ActionButton
                            label="Editar"
                            onPress={() => startEditBrand(brand)}
                            disabled={actionBusy}
                            variant="link"
                          />
                          <ActionButton
                            label="Excluir"
                            onPress={() => deleteBrand(brand.id)}
                            disabled={actionBusy}
                            variant="danger"
                          />
                        </View>
                      </View>
                    ))}
                    {brands.length === 0 ? <Text style={styles.emptyText}>Nenhuma marca cadastrada.</Text> : null}
                  </View>
                </>
              ) : null}

              {settingsSection === 'pix' ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Chave Pix</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {[
                      ['', 'Sem tipo'],
                      ['cpf', 'CPF'],
                      ['cnpj', 'CNPJ'],
                      ['email', 'Email'],
                      ['phone', 'Telefone'],
                      ['random', 'Aleatoria']
                    ].map(([id, label]) => (
                      <Pressable
                        key={id || 'none'}
                        style={[styles.chipButton, pixKeyType === id ? styles.chipButtonActive : null]}
                        onPress={() => setPixKeyType(id as PixKeyType | '')}
                      >
                        <Text style={[styles.chipButtonText, pixKeyType === id ? styles.chipButtonTextActive : null]}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Chave Pix"
                    value={pixKeyValue}
                    onChangeText={setPixKeyValue}
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Nome do titular"
                    value={pixHolderName}
                    onChangeText={setPixHolderName}
                  />
                  <ActionButton
                    label="Salvar Pix"
                    onPress={savePixSettings}
                    disabled={actionBusy}
                    variant="primary"
                  />
                </View>
              ) : null}

              {settingsSection === 'alerts' ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Alertas de vencimento</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Pressable
                      style={[styles.chipButton, alertsEnabled ? styles.chipButtonActive : null]}
                      onPress={() => setAlertsEnabled(true)}
                    >
                      <Text style={[styles.chipButtonText, alertsEnabled ? styles.chipButtonTextActive : null]}>
                        Ativo
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chipButton, !alertsEnabled ? styles.chipButtonActive : null]}
                      onPress={() => setAlertsEnabled(false)}
                    >
                      <Text style={[styles.chipButtonText, !alertsEnabled ? styles.chipButtonTextActive : null]}>
                        Inativo
                      </Text>
                    </Pressable>
                  </ScrollView>
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Dias antes do vencimento"
                    value={alertsDaysBeforeDue}
                    onChangeText={setAlertsDaysBeforeDue}
                    keyboardType="number-pad"
                  />
                  <ActionButton
                    label="Salvar alertas"
                    onPress={saveAlertSettings}
                    disabled={actionBusy}
                    variant="primary"
                  />
                </View>
              ) : null}

              {settingsSection === 'access' ? (
                <>
                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>{memberEditingId ? 'Editar acesso' : 'Novo acesso'}</Text>
                    <TextInput
                      style={styles.actionInput}
                      placeholder="Nome"
                      value={memberNameInput}
                      onChangeText={setMemberNameInput}
                    />
                    <TextInput
                      style={styles.actionInput}
                      placeholder="Email"
                      value={memberEmailInput}
                      onChangeText={setMemberEmailInput}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <TextInput
                      style={styles.actionInput}
                      placeholder="Perfil (owner, manager, seller...)"
                      value={memberRoleInput}
                      onChangeText={setMemberRoleInput}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      <Pressable
                        style={[styles.chipButton, memberActiveInput ? styles.chipButtonActive : null]}
                        onPress={() => setMemberActiveInput(true)}
                      >
                        <Text style={[styles.chipButtonText, memberActiveInput ? styles.chipButtonTextActive : null]}>
                          Ativo
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.chipButton, !memberActiveInput ? styles.chipButtonActive : null]}
                        onPress={() => setMemberActiveInput(false)}
                      >
                        <Text style={[styles.chipButtonText, !memberActiveInput ? styles.chipButtonTextActive : null]}>
                          Inativo
                        </Text>
                      </Pressable>
                    </ScrollView>
                    <ActionButton
                      label={memberEditingId ? 'Salvar acesso' : 'Adicionar acesso'}
                      onPress={saveAccessMember}
                      disabled={actionBusy}
                      variant="primary"
                    />
                    {memberEditingId ? (
                      <ActionButton
                        label="Cancelar edicao"
                        onPress={resetMemberForm}
                        disabled={actionBusy}
                        variant="muted"
                      />
                    ) : null}
                  </View>

                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Equipe ({accessMembers.length})</Text>
                    {accessMembers.map((member) => (
                      <View key={member.id} style={styles.listRow}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle}>{member.name}</Text>
                          <Text style={styles.listMeta}>{member.email}</Text>
                          <Text style={styles.listMeta}>{member.role}</Text>
                        </View>
                        <View style={styles.listRight}>
                          <Badge label={member.active ? 'Ativo' : 'Inativo'} style={toneStyle(member.active ? 'active' : 'cancelled')} />
                          <ActionButton
                            label="Editar"
                            onPress={() => startEditMember(member)}
                            disabled={actionBusy}
                            variant="link"
                          />
                          <ActionButton
                            label={member.active ? 'Desativar' : 'Ativar'}
                            onPress={() => toggleAccessMemberStatus(member)}
                            disabled={actionBusy}
                            variant={member.active ? 'danger' : 'ghost'}
                          />
                        </View>
                      </View>
                    ))}
                    {accessMembers.length === 0 ? <Text style={styles.emptyText}>Nenhum membro encontrado.</Text> : null}
                  </View>
                </>
              ) : null}

              {settingsSection === 'storefront' ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Loja publica</Text>
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Nome da loja"
                    value={storefrontShopName}
                    onChangeText={setStorefrontShopName}
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Subdominio"
                    value={storefrontSubdomain}
                    onChangeText={setStorefrontSubdomain}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Cor principal (#RRGGBB)"
                    value={storefrontShopColor}
                    onChangeText={setStorefrontShopColor}
                    autoCapitalize="characters"
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="WhatsApp"
                    value={storefrontWhatsapp}
                    onChangeText={setStorefrontWhatsapp}
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Marcas permitidas (separadas por virgula)"
                    value={storefrontSelectedBrandsInput}
                    onChangeText={setStorefrontSelectedBrandsInput}
                  />
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Categorias permitidas (separadas por virgula)"
                    value={storefrontSelectedCategoriesInput}
                    onChangeText={setStorefrontSelectedCategoriesInput}
                  />
                  <View style={styles.inlineInputs}>
                    <TextInput
                      style={[styles.actionInput, styles.inlineInput]}
                      placeholder="Preco minimo"
                      value={storefrontPriceFrom}
                      onChangeText={setStorefrontPriceFrom}
                    />
                    <TextInput
                      style={[styles.actionInput, styles.inlineInput]}
                      placeholder="Preco maximo"
                      value={storefrontPriceTo}
                      onChangeText={setStorefrontPriceTo}
                    />
                  </View>
                  <TextInput
                    style={styles.actionInput}
                    placeholder="Logo URL"
                    value={storefrontLogoUrl}
                    onChangeText={setStorefrontLogoUrl}
                    autoCapitalize="none"
                  />

                  <Text style={styles.panelTitle}>Flags de exibicao</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Pressable
                      style={[styles.chipButton, storefrontOnlyStockProducts ? styles.chipButtonActive : null]}
                      onPress={() => setStorefrontOnlyStockProducts((current) => !current)}
                    >
                      <Text
                        style={[
                          styles.chipButtonText,
                          storefrontOnlyStockProducts ? styles.chipButtonTextActive : null
                        ]}
                      >
                        Somente c/ estoque
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chipButton, storefrontShowOutOfStockProducts ? styles.chipButtonActive : null]}
                      onPress={() => setStorefrontShowOutOfStockProducts((current) => !current)}
                    >
                      <Text
                        style={[
                          styles.chipButtonText,
                          storefrontShowOutOfStockProducts ? styles.chipButtonTextActive : null
                        ]}
                      >
                        Mostrar sem estoque
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chipButton, storefrontFilterByCategory ? styles.chipButtonActive : null]}
                      onPress={() => setStorefrontFilterByCategory((current) => !current)}
                    >
                      <Text
                        style={[
                          styles.chipButtonText,
                          storefrontFilterByCategory ? styles.chipButtonTextActive : null
                        ]}
                      >
                        Filtro categoria
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chipButton, storefrontFilterByBrand ? styles.chipButtonActive : null]}
                      onPress={() => setStorefrontFilterByBrand((current) => !current)}
                    >
                      <Text
                        style={[
                          styles.chipButtonText,
                          storefrontFilterByBrand ? styles.chipButtonTextActive : null
                        ]}
                      >
                        Filtro marca
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chipButton, storefrontFilterByPrice ? styles.chipButtonActive : null]}
                      onPress={() => setStorefrontFilterByPrice((current) => !current)}
                    >
                      <Text
                        style={[
                          styles.chipButtonText,
                          storefrontFilterByPrice ? styles.chipButtonTextActive : null
                        ]}
                      >
                        Filtro preco
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.chipButton, storefrontShowWhatsappButton ? styles.chipButtonActive : null]}
                      onPress={() => setStorefrontShowWhatsappButton((current) => !current)}
                    >
                      <Text
                        style={[
                          styles.chipButtonText,
                          storefrontShowWhatsappButton ? styles.chipButtonTextActive : null
                        ]}
                      >
                        Botao WhatsApp
                      </Text>
                    </Pressable>
                  </ScrollView>

                  <ActionButton
                    label="Salvar configuracoes da loja"
                    onPress={saveStorefrontSettings}
                    disabled={actionBusy}
                    variant="primary"
                  />
                </View>
              ) : null}
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
        </View>
        </View>
      </View>
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

function ActionButton({
  label,
  onPress,
  disabled,
  variant = 'primary'
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'muted' | 'link' | 'danger';
}) {
  const styleByVariant = {
    primary: styles.actionButtonPrimary,
    ghost: styles.actionButtonGhost,
    muted: styles.actionButtonMuted,
    link: styles.actionButtonLink,
    danger: styles.actionButtonDanger
  } as const;

  const textStyleByVariant = {
    primary: styles.actionButtonPrimaryText,
    ghost: styles.actionButtonGhostText,
    muted: styles.actionButtonMutedText,
    link: styles.actionButtonLinkText,
    danger: styles.actionButtonDangerText
  } as const;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionButton,
        styleByVariant[variant],
        disabled ? styles.actionButtonDisabled : null
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          textStyleByVariant[variant],
          disabled ? styles.actionButtonTextDisabled : null
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fb'
  },
  topBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 186,
    backgroundColor: '#edf3ff',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28
  },
  topGlow: {
    position: 'absolute',
    top: -38,
    right: -34,
    width: 182,
    height: 182,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    opacity: 0.55
  },
  appLayout: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10
  },
  sidebar: {
    borderWidth: 1,
    borderColor: '#d6dce7',
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  sidebarBrand: {
    height: 58,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sidebarBrandText: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6dce7',
    backgroundColor: '#ffffff',
    textAlign: 'center',
    lineHeight: 32,
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2633'
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: '#d6dce7'
  },
  sidebarScroll: {
    flex: 1
  },
  sidebarTabs: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingBottom: 16,
    gap: 10
  },
  mainArea: {
    flex: 1,
    minWidth: 0
  },
  mainSurface: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d6dce7',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#f8fafd',
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3
  },
  header: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d6dce7',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  headerMain: {
    flex: 1,
    minWidth: 0
  },
  appName: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2
  },
  moduleTitle: {
    marginTop: 3,
    fontSize: 24,
    color: '#0f172a',
    fontWeight: '700'
  },
  moduleSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: '#64748b'
  },
  connectionBadge: {
    minWidth: 106,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center'
  },
  connectionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a'
  },
  connectionOnline: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0'
  },
  connectionOffline: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca'
  },
  connectionChecking: {
    backgroundColor: '#e2e8f0',
    borderColor: '#cbd5e1'
  },
  moduleTab: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center'
  },
  moduleTabActive: {
    backgroundColor: '#efd9fc',
    borderColor: '#d9b6f3',
    shadowColor: '#6f22c1',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }
  },
  moduleTabIcon: {
    fontSize: 17,
    color: '#1f2633',
    fontWeight: '700'
  },
  moduleTabIconActive: {
    color: '#47246a'
  },
  rangeTabs: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafd'
  },
  rangeTabsScroll: {
    flexGrow: 0,
    flexShrink: 0
  },
  rangeTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cdd7e5',
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start'
  },
  rangeTabActive: {
    borderColor: '#6f22c1',
    backgroundColor: '#f4e8ff'
  },
  rangeTabText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600'
  },
  rangeTabTextActive: {
    color: '#5b21b6'
  },
  content: {
    flex: 1
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 22,
    gap: 12
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20
  },
  loadingText: {
    color: '#64748b',
    fontSize: 12
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 12,
    gap: 5
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991b1b'
  },
  errorText: {
    fontSize: 12,
    color: '#7f1d1d'
  },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    padding: 12,
    gap: 5
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e'
  },
  warningText: {
    fontSize: 12,
    color: '#92400e'
  },
  actionMessageCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 12
  },
  actionMessageSuccess: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4'
  },
  actionMessageError: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2'
  },
  actionMessageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a'
  },
  actionInput: {
    borderWidth: 1,
    borderColor: '#d6deeb',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    shadowColor: '#0f172a',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: 8
  },
  inlineInput: {
    flex: 1
  },
  chipRow: {
    gap: 8,
    paddingRight: 2,
    alignItems: 'flex-start'
  },
  chipButton: {
    borderWidth: 1,
    borderColor: '#ccd5e4',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start'
  },
  chipButtonActive: {
    borderColor: '#6f22c1',
    backgroundColor: '#f4e8ff'
  },
  chipButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  chipButtonTextActive: {
    color: '#5b21b6'
  },
  actionButton: {
    borderRadius: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 13,
    paddingVertical: 9
  },
  actionButtonPrimary: {
    backgroundColor: '#6f22c1',
    borderColor: '#6f22c1'
  },
  actionButtonGhost: {
    backgroundColor: '#f4e8ff',
    borderColor: '#e8cffb'
  },
  actionButtonMuted: {
    backgroundColor: '#eef2f7',
    borderColor: '#d6deeb'
  },
  actionButtonLink: {
    backgroundColor: '#ecf5ff',
    borderColor: '#c7dcff'
  },
  actionButtonDanger: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca'
  },
  actionButtonDisabled: {
    opacity: 0.55
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '700'
  },
  actionButtonPrimaryText: {
    color: '#ffffff'
  },
  actionButtonGhostText: {
    color: '#5b21b6'
  },
  actionButtonMutedText: {
    color: '#334155'
  },
  actionButtonLinkText: {
    color: '#1d4ed8'
  },
  actionButtonDangerText: {
    color: '#b91c1c'
  },
  actionButtonTextDisabled: {
    color: '#475569'
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d6deeb',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 13,
    shadowColor: '#0f172a',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }
  },
  filterTabs: {
    gap: 8,
    alignItems: 'flex-start'
  },
  filterTab: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ccd5e4',
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start'
  },
  filterTabActive: {
    borderColor: '#6f22c1',
    backgroundColor: '#f4e8ff'
  },
  filterTabText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600'
  },
  filterTabTextActive: {
    color: '#5b21b6'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2
  },
  statCard: {
    width: '48.6%',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d6deeb',
    paddingVertical: 12,
    paddingHorizontal: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  statValue: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0f172a'
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b'
  },
  panel: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d6deeb',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  panelSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: -2
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  infoLabel: {
    flex: 1,
    fontSize: 13,
    color: '#334155'
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'right'
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e6edf7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fbfdff'
  },
  listMain: {
    flex: 1,
    gap: 3
  },
  listRight: {
    alignItems: 'flex-end',
    gap: 5,
    maxWidth: 170
  },
  rowActions: {
    marginTop: 2,
    width: '100%',
    alignItems: 'stretch',
    gap: 4
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  listMeta: {
    fontSize: 12,
    color: '#64748b'
  },
  listAmount: {
    fontSize: 13,
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
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 4
  },
  footer: {
    marginTop: 4,
    gap: 2,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e6edf7'
  },
  footerText: {
    fontSize: 11,
    color: '#94a3b8'
  }
});
