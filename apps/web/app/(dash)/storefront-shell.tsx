'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconBox,
  IconDots,
  IconCopy,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShare,
  IconTag,
  IconTagPercent,
  IconTrash
} from './icons';
import { API_BASE, SALES_SYNC_STORAGE_KEY } from './lib';
import SalesDetailModal, { type SaleDetail, type SaleUpdate } from './sales-detail-modal';
import {
  buildPublicStoreUrl,
  DEFAULT_STOREFRONT_SETTINGS,
  STOREFRONT_SETTINGS_EVENT,
  loadStorefrontRuntimeState,
  loadStorefrontSettings,
  normalizeStorefrontSettings,
  saveStorefrontSettings,
  saveStorefrontRuntimeState,
  type StorefrontSettings
} from '../lib/storefront-settings';

type StoreProduct = {
  id: string;
  sku?: string | null;
  name: string;
  brand?: string | null;
  image_url?: string | null;
  quantity?: number | string;
  price?: number | string;
  active?: boolean;
};

type StorefrontOrderItem = {
  id: string;
  storefront_order_id: string;
  product_id?: string | null;
  sku: string;
  quantity: number;
  price: number;
  product_name?: string | null;
  product_brand?: string | null;
  product_image_url?: string | null;
};

type StorefrontOrder = {
  id: string;
  store_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  status: 'pending' | 'accepted' | 'cancelled';
  total: number;
  created_at: string;
  items_count: number;
  sale_id?: string | null;
  accepted_at?: string | null;
  cancelled_at?: string | null;
  items: StorefrontOrderItem[];
};

type Promotion = {
  id: string;
  name: string;
  discount: number;
  productIds: string[];
  mode?: 'global' | 'per_product';
  discountsByProduct?: Record<string, number>;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'scheduled' | 'ended';
  createdAt?: string;
};

type CustomerOption = {
  id: string;
  name: string;
  phone?: string | null;
};

type InventoryUnit = {
  id: string;
  product_id?: string | null;
  cost?: number | string;
  expires_at?: string | null;
  status?: string | null;
};

type AcceptSaleItemState = {
  orderItemId: string;
  fromOrder: boolean;
  requestedQuantity: number;
  productId: string;
  sku: string;
  name: string;
  imageUrl: string;
  quantity: number;
  priceInput: string;
  availableUnits: InventoryUnit[];
  selectedUnitIds: string[];
  unitsExpanded: boolean;
  loadingUnits: boolean;
  unitsError: string;
};

type Section = 'overview' | 'orders' | 'products' | 'promotions';
const PRODUCTS_PAGE_SIZE = 10;

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
};

const parseSection = (value: string | null): Section => {
  if (value === 'orders') return 'orders';
  if (value === 'products') return 'products';
  if (value === 'promotions') return 'promotions';
  return 'overview';
};

const formatPrice = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatCurrencyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const parseMoney = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, '');
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const fallbackCopyText = (text: string) => {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
};

const copyText = async (text: string) => {
  const canUseClipboardApi =
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    Boolean(navigator.clipboard?.writeText);

  if (canUseClipboardApi) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }

  return fallbackCopyText(text);
};

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const toIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const normalizeDateInput = (value: string) => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return toIsoDate(parsed);
};

const resolvePromotionStatus = (startDate?: string, endDate?: string) => {
  const today = normalizeDateInput(toIsoDate(new Date()));
  const start = normalizeDateInput(startDate || '');
  const end = normalizeDateInput(endDate || '');
  if (end && end < today) return 'ended' as const;
  if (start && start > today) return 'scheduled' as const;
  return 'active' as const;
};

const promotionStatusLabel = (status: 'active' | 'scheduled' | 'ended') => {
  if (status === 'ended') return 'Encerrada';
  if (status === 'scheduled') return 'Agendada';
  return 'Ativa';
};

const promotionStatusClass = (status: 'active' | 'scheduled' | 'ended') => {
  if (status === 'ended') return 'ended';
  if (status === 'scheduled') return 'scheduled';
  return 'active';
};

const formatOrderCode = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 14) return `#${digits.slice(0, 4)}-${digits.slice(4, 10)}-${digits.slice(10, 14)}`;
  if (digits.length >= 10) return `#${digits.slice(0, 4)}-${digits.slice(4, 10)}`;
  return `#${value.slice(0, 12)}`;
};

const orderStatusLabel = (status: StorefrontOrder['status']) => {
  if (status === 'accepted') return 'Aceito';
  if (status === 'cancelled') return 'Recusado';
  return 'Pendente';
};

const orderStatusClass = (status: StorefrontOrder['status']) => {
  if (status === 'accepted') return 'accepted';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
};

const normalizeOrderStatus = (value: unknown): StorefrontOrder['status'] => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'accepted') return 'accepted';
  if (normalized === 'cancelled') return 'cancelled';
  return 'pending';
};

const normalizeOrderItem = (value: unknown): StorefrontOrderItem | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StorefrontOrderItem>;
  if (typeof record.id !== 'string' || typeof record.storefront_order_id !== 'string' || typeof record.sku !== 'string') {
    return null;
  }
  return {
    id: record.id,
    storefront_order_id: record.storefront_order_id,
    product_id: typeof record.product_id === 'string' ? record.product_id : null,
    sku: record.sku,
    quantity: Math.max(0, Math.trunc(toNumber(record.quantity))),
    price: Math.max(0, toNumber(record.price)),
    product_name: typeof record.product_name === 'string' ? record.product_name : null,
    product_brand: typeof record.product_brand === 'string' ? record.product_brand : null,
    product_image_url: typeof record.product_image_url === 'string' ? record.product_image_url : null
  };
};

const normalizeOrder = (value: unknown): StorefrontOrder | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StorefrontOrder>;
  if (typeof record.id !== 'string') return null;
  if (typeof record.customer_name !== 'string') return null;
  const items = Array.isArray(record.items)
    ? record.items.map(normalizeOrderItem).filter((item): item is StorefrontOrderItem => Boolean(item))
    : [];
  return {
    id: record.id,
    store_id: typeof record.store_id === 'string' ? record.store_id : '',
    customer_name: record.customer_name,
    customer_phone: typeof record.customer_phone === 'string' ? record.customer_phone : '',
    customer_email: typeof record.customer_email === 'string' ? record.customer_email : '',
    status: normalizeOrderStatus(record.status),
    total: Math.max(0, toNumber(record.total)),
    created_at: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
    items_count: Math.max(0, Math.trunc(toNumber(record.items_count))),
    sale_id: typeof record.sale_id === 'string' ? record.sale_id : null,
    accepted_at: typeof record.accepted_at === 'string' ? record.accepted_at : null,
    cancelled_at: typeof record.cancelled_at === 'string' ? record.cancelled_at : null,
    items
  };
};

const normalizeStoreProduct = (value: unknown): StoreProduct | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoreProduct>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  return {
    id: record.id,
    sku: typeof record.sku === 'string' ? record.sku : '',
    name: record.name,
    brand: typeof record.brand === 'string' ? record.brand : '',
    image_url: typeof record.image_url === 'string' ? record.image_url : '',
    quantity: Math.max(0, Math.trunc(toNumber(record.quantity))),
    price: Math.max(0, toNumber(record.price)),
    active: record.active !== false
  };
};

const normalizeCustomerOption = (value: unknown): CustomerOption | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<CustomerOption>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null;
  return {
    id: record.id,
    name: record.name,
    phone: typeof record.phone === 'string' ? record.phone : ''
  };
};

const normalizeInventoryUnit = (value: unknown): InventoryUnit | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<InventoryUnit>;
  if (typeof record.id !== 'string') return null;
  return {
    id: record.id,
    product_id: typeof record.product_id === 'string' ? record.product_id : null,
    cost: Math.max(0, toNumber(record.cost)),
    expires_at: typeof record.expires_at === 'string' ? record.expires_at : null,
    status: typeof record.status === 'string' ? record.status : null
  };
};

const SecondaryNavItem = ({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={active ? 'store-secondary-item active' : 'store-secondary-item'}
    aria-current={active ? 'page' : undefined}
    onClick={onClick}
  >
    <span>{icon}</span>
    <strong>{label}</strong>
  </button>
);

export default function StorefrontShell({
  initialCatalog,
  initialStoreName,
  initialStoreSettings
}: {
  initialCatalog: StoreProduct[];
  initialStoreName?: string;
  initialStoreSettings?: Partial<StorefrontSettings>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionFromQuery = parseSection(searchParams.get('section'));
  const [section, setCurrentSection] = useState<Section>(sectionFromQuery);

  const [storeSettings, setStoreSettings] = useState<StorefrontSettings>(() =>
    normalizeStorefrontSettings({
      ...DEFAULT_STOREFRONT_SETTINGS,
      ...(initialStoreSettings || {}),
      shopName:
        initialStoreSettings?.shopName?.trim() ||
        initialStoreName?.trim() ||
        DEFAULT_STOREFRONT_SETTINGS.shopName
      })
  );
  const [catalogProducts, setCatalogProducts] = useState<StoreProduct[]>(() =>
    initialCatalog.filter((item) => item.active !== false)
  );
  const [activeProducts, setActiveProducts] = useState<StoreProduct[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [panelSearch, setPanelSearch] = useState('');
  const [selectingProducts, setSelectingProducts] = useState<string[]>([]);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [openProductMenuId, setOpenProductMenuId] = useState<string | null>(null);
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>([]);
  const [productDescriptions, setProductDescriptions] = useState<Record<string, string>>({});
  const [storePriceOverrides, setStorePriceOverrides] = useState<Record<string, number>>({});
  const [storePriceDrafts, setStorePriceDrafts] = useState<Record<string, string>>({});
  const [hoveredStorePriceId, setHoveredStorePriceId] = useState<string | null>(null);
  const [editingStorePriceId, setEditingStorePriceId] = useState<string | null>(null);
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [descriptionProductId, setDescriptionProductId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);
  const [storeLinkFeedback, setStoreLinkFeedback] = useState('');
  const [storeLinkFeedbackError, setStoreLinkFeedbackError] = useState(false);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [openPromotionMenuRowId, setOpenPromotionMenuRowId] = useState<string | null>(null);
  const [promotionModalOpen, setPromotionModalOpen] = useState(false);
  const [promotionStep, setPromotionStep] = useState<'select' | 'create'>('select');
  const [promotionSearch, setPromotionSearch] = useState('');
  const [promotionSelectedProducts, setPromotionSelectedProducts] = useState<string[]>([]);
  const [promotionDiscount, setPromotionDiscount] = useState('10');
  const [promotionDiscountMode, setPromotionDiscountMode] = useState<'global' | 'per_product'>('global');
  const [promotionDiscountByProduct, setPromotionDiscountByProduct] = useState<Record<string, string>>({});
  const [promotionStartDate, setPromotionStartDate] = useState(() => toIsoDate(new Date()));
  const [promotionEndDate, setPromotionEndDate] = useState('');
  const [promotionError, setPromotionError] = useState('');
  const [productsPage, setProductsPage] = useState(1);
  const [promotionsPage, setPromotionsPage] = useState(1);
  const pendingSectionRef = useRef<Section | null>(null);
  const runtimeHydratedRef = useRef(false);
  const [publicStoreOrigin, setPublicStoreOrigin] = useState('');
  const [orders, setOrders] = useState<StorefrontOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersMessage, setOrdersMessage] = useState('');
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [orderActionLoading, setOrderActionLoading] = useState<'' | 'accept' | 'cancel'>('');
  const [acceptSaleOpen, setAcceptSaleOpen] = useState(false);
  const [acceptSaleLoading, setAcceptSaleLoading] = useState(false);
  const [acceptSaleError, setAcceptSaleError] = useState('');
  const [acceptCustomerId, setAcceptCustomerId] = useState('');
  const [acceptCustomerName, setAcceptCustomerName] = useState('');
  const [acceptSaleDate, setAcceptSaleDate] = useState('');
  const [acceptProductSearch, setAcceptProductSearch] = useState('');
  const [acceptExtraProductId, setAcceptExtraProductId] = useState('');
  const [acceptCustomers, setAcceptCustomers] = useState<CustomerOption[]>([]);
  const [acceptCustomersLoading, setAcceptCustomersLoading] = useState(false);
  const [acceptItems, setAcceptItems] = useState<AcceptSaleItemState[]>([]);
  const [selectedOrderSale, setSelectedOrderSale] = useState<SaleDetail | null>(null);

  useEffect(() => {
    setPublicStoreOrigin(window.location.origin);
    const savedSettings = loadStorefrontSettings();
    const mergedSettings = normalizeStorefrontSettings({
      ...DEFAULT_STOREFRONT_SETTINGS,
      ...(initialStoreSettings || {}),
      ...(savedSettings || {}),
      shopName:
        savedSettings?.shopName ||
        initialStoreSettings?.shopName ||
        initialStoreName?.trim() ||
        DEFAULT_STOREFRONT_SETTINGS.shopName
    });
    setStoreSettings(mergedSettings);
    saveStorefrontSettings(mergedSettings);

    const savedRuntime = loadStorefrontRuntimeState();
    if (savedRuntime) {
      setActiveProducts(savedRuntime.activeProducts);
      setPromotions(savedRuntime.promotions);
      setHiddenProductIds(savedRuntime.hiddenProductIds || []);
      setProductDescriptions(savedRuntime.productDescriptions || {});
      setStorePriceOverrides(savedRuntime.storePriceOverrides || {});
    }
    runtimeHydratedRef.current = true;
  }, [initialStoreName, initialStoreSettings]);

  useEffect(() => {
    setCatalogProducts(initialCatalog.filter((item) => item.active !== false));
  }, [initialCatalog]);

  useEffect(() => {
    if (!runtimeHydratedRef.current) return;
    saveStorefrontRuntimeState({
      activeProducts,
      promotions,
      hiddenProductIds,
      productDescriptions,
      storePriceOverrides
    });
  }, [activeProducts, promotions, hiddenProductIds, productDescriptions, storePriceOverrides]);

  useEffect(() => {
    if (!storeLinkFeedback) return;
    const timer = window.setTimeout(() => {
      setStoreLinkFeedback('');
      setStoreLinkFeedbackError(false);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [storeLinkFeedback]);

  useEffect(() => {
    const handleSettingsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<StorefrontSettings>;
      if (!customEvent.detail) return;
      const next = normalizeStorefrontSettings(customEvent.detail);
      setStoreSettings(next);
    };

    window.addEventListener(STOREFRONT_SETTINGS_EVENT, handleSettingsUpdated as EventListener);
    return () =>
      window.removeEventListener(STOREFRONT_SETTINGS_EVENT, handleSettingsUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!shareOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!shareRef.current?.contains(target)) {
        setShareOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [shareOpen]);

  useEffect(() => {
    if (!openProductMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-store-product-menu-root="true"]')) return;
      setOpenProductMenuId(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [openProductMenuId]);

  useEffect(() => {
    if (!openPromotionMenuRowId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-store-promotion-menu-root="true"]')) return;
      setOpenPromotionMenuRowId(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [openPromotionMenuRowId]);

  useEffect(() => {
    if (pendingSectionRef.current) {
      if (sectionFromQuery === pendingSectionRef.current) {
        pendingSectionRef.current = null;
      }
      return;
    }
    setCurrentSection(sectionFromQuery);
  }, [sectionFromQuery]);

  useEffect(() => {
    setPanelSearch('');
    setOpenProductMenuId(null);
    setOpenPromotionMenuRowId(null);
    setHoveredStorePriceId(null);
    setEditingStorePriceId(null);
  }, [section]);

  const refreshOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const response = await fetch(`${API_BASE}/storefront/orders?status=all`, { cache: 'no-store' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || 'Nao foi possivel carregar os pedidos.');
      }
      const payload = (await response.json()) as { data?: unknown };
      const parsed = Array.isArray(payload.data)
        ? payload.data.map(normalizeOrder).filter((item): item is StorefrontOrder => Boolean(item))
        : [];
      setOrders(parsed);
      setOrdersMessage('');
    } catch (error) {
      setOrders([]);
      setOrdersMessage(error instanceof Error ? error.message : 'Nao foi possivel carregar os pedidos.');
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/storefront/catalog`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json()) as { data?: unknown };
      const parsed = Array.isArray(payload.data)
        ? payload.data
            .map(normalizeStoreProduct)
            .filter((item): item is StoreProduct => Boolean(item))
            .filter((item) => item.active !== false)
        : [];
      setCatalogProducts(parsed);
    } catch {
      // keep current products when refresh fails
    }
  }, []);

  useEffect(() => {
    if (section !== 'orders' && section !== 'products' && section !== 'promotions') return;
    void Promise.all([section === 'orders' ? refreshOrders() : Promise.resolve(), refreshCatalog()]);
  }, [section, refreshCatalog, refreshOrders]);

  useEffect(() => {
    if (section !== 'orders' && section !== 'products' && section !== 'promotions') return;
    const sync = () => {
      void Promise.all([section === 'orders' ? refreshOrders() : Promise.resolve(), refreshCatalog()]);
    };
    const intervalId = window.setInterval(sync, 10000);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', sync);
    };
  }, [section, refreshCatalog, refreshOrders]);

  const catalogPool = useMemo(() => catalogProducts.filter((item) => item.active !== false), [catalogProducts]);

  const catalogById = useMemo(() => {
    const map = new Map<string, StoreProduct>();
    for (const product of catalogPool) {
      map.set(product.id, product);
    }
    return map;
  }, [catalogPool]);

  const catalogBySku = useMemo(() => {
    const map = new Map<string, StoreProduct>();
    for (const product of catalogPool) {
      const sku = (product.sku || '').trim();
      if (!sku) continue;
      map.set(sku.toLowerCase(), product);
    }
    return map;
  }, [catalogPool]);

  const availableProducts = useMemo(() => {
    const activeIds = new Set(activeProducts.map((item) => item.id));
    return catalogPool.filter((item) => !activeIds.has(item.id));
  }, [activeProducts, catalogPool]);

  const filteredAvailableProducts = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    if (!term) return availableProducts;
    return availableProducts.filter((item) => item.name.toLowerCase().includes(term));
  }, [availableProducts, catalogSearch]);

  const storeProducts = useMemo(
    () =>
      catalogPool
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [catalogPool]
  );

  const storePricesByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of catalogPool) {
      const fallback = Math.max(0, toNumber(product.price));
      const override = storePriceOverrides[product.id];
      const resolved =
        typeof override === 'number' && Number.isFinite(override) ? Math.max(0, override) : fallback;
      map.set(product.id, resolved);
    }
    return map;
  }, [catalogPool, storePriceOverrides]);

  const filteredStoreProducts = useMemo(() => {
    const term = normalizeSearchText(panelSearch);
    if (!term) return storeProducts;
    return storeProducts.filter((item) =>
      normalizeSearchText(`${item.name} ${item.brand || ''} ${item.sku || ''}`).includes(term)
    );
  }, [panelSearch, storeProducts]);

  const productsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredStoreProducts.length / PRODUCTS_PAGE_SIZE)),
    [filteredStoreProducts.length]
  );

  useEffect(() => {
    if (section !== 'products') return;
    setProductsPage(1);
  }, [panelSearch, section]);

  useEffect(() => {
    setProductsPage((prev) => Math.min(prev, productsTotalPages));
  }, [productsTotalPages]);

  const paginatedStoreProducts = useMemo(() => {
    const start = (productsPage - 1) * PRODUCTS_PAGE_SIZE;
    return filteredStoreProducts.slice(start, start + PRODUCTS_PAGE_SIZE);
  }, [filteredStoreProducts, productsPage]);

  const productsRangeStart = filteredStoreProducts.length === 0 ? 0 : (productsPage - 1) * PRODUCTS_PAGE_SIZE + 1;
  const productsRangeEnd =
    filteredStoreProducts.length === 0 ? 0 : (productsPage - 1) * PRODUCTS_PAGE_SIZE + paginatedStoreProducts.length;

  const pendingByProductId = useMemo(() => {
    const totals = new Map<string, number>();
    for (const order of orders) {
      if (order.status !== 'pending') continue;
      for (const item of order.items) {
        const fromCatalog = catalogBySku.get(item.sku.toLowerCase());
        const productId = item.product_id || fromCatalog?.id || null;
        if (!productId) continue;
        const current = totals.get(productId) || 0;
        totals.set(productId, current + Math.max(0, Math.trunc(toNumber(item.quantity))));
      }
    }
    return totals;
  }, [orders, catalogBySku]);

  const filteredOrders = useMemo(() => {
    const term = panelSearch.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) => {
      const orderCode = formatOrderCode(order.id).toLowerCase();
      return (
        orderCode.includes(term) ||
        order.customer_name.toLowerCase().includes(term) ||
        order.items.some((item) => (item.product_name || '').toLowerCase().includes(term))
      );
    });
  }, [orders, panelSearch]);

  const selectedOrder = useMemo(
    () => (selectedOrderId ? orders.find((order) => order.id === selectedOrderId) || null : null),
    [orders, selectedOrderId]
  );

  const filteredAcceptItems = useMemo(() => {
    const term = normalizeSearchText(acceptProductSearch);
    if (!term) return acceptItems;
    return acceptItems.filter((item) => {
      const label = normalizeSearchText(`${item.name} ${item.sku}`);
      return label.includes(term);
    });
  }, [acceptItems, acceptProductSearch]);

  const extraAcceptProducts = useMemo(
    () =>
      catalogPool
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((product) => ({
          id: product.id,
          label: `${product.name}${product.brand ? ` • ${product.brand}` : ''}${product.sku ? ` • ${product.sku}` : ''}`
        })),
    [catalogPool]
  );

  useEffect(() => {
    if (!orderModalOpen) return;
    if (!selectedOrderId || !selectedOrder) {
      setOrderModalOpen(false);
      setCancelConfirmOpen(false);
      setAcceptSaleOpen(false);
    }
  }, [orderModalOpen, selectedOrderId, selectedOrder]);

  const promotionCandidates = useMemo(() => {
    const term = normalizeSearchText(promotionSearch);
    if (!term) return storeProducts;
    return storeProducts.filter((item) =>
      normalizeSearchText(`${item.name} ${item.brand || ''} ${item.sku || ''}`).includes(term)
    );
  }, [promotionSearch, storeProducts]);

  const promotionRows = useMemo(() => {
    const rows: Array<{
      rowId: string;
      promotionId: string;
      productId: string;
      productName: string;
      productBrand: string;
      productCode: string;
      imageUrl: string;
      startDate: string;
      endDate: string;
      oldPrice: number;
      newPrice: number;
      status: 'active' | 'scheduled' | 'ended';
      createdAt: string;
    }> = [];

    for (const promotion of promotions) {
      const promoStatus = resolvePromotionStatus(promotion.startDate, promotion.endDate);
      for (const productId of promotion.productIds) {
        const product = catalogById.get(productId);
        if (!product) continue;
        const oldPrice = storePricesByProductId.get(productId) ?? Math.max(0, toNumber(product.price));
        const discount =
          promotion.mode === 'per_product'
            ? Math.max(
                0,
                Math.min(99, toNumber(promotion.discountsByProduct?.[productId] ?? promotion.discount))
              )
            : Math.max(0, Math.min(99, toNumber(promotion.discount)));
        const newPrice = Math.max(0, oldPrice - oldPrice * (discount / 100));

        rows.push({
          rowId: `${promotion.id}:${productId}`,
          promotionId: promotion.id,
          productId,
          productName: product.name,
          productBrand: (product.brand || '').trim(),
          productCode: (product.sku || '').trim(),
          imageUrl: (product.image_url || '').trim(),
          startDate: promotion.startDate || '',
          endDate: promotion.endDate || '',
          oldPrice,
          newPrice,
          status: promotion.status || promoStatus,
          createdAt: promotion.createdAt || ''
        });
      }
    }

    rows.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return rows;
  }, [catalogById, promotions, storePricesByProductId]);

  const promotionsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(promotionRows.length / PRODUCTS_PAGE_SIZE)),
    [promotionRows.length]
  );

  useEffect(() => {
    setPromotionsPage((prev) => Math.min(prev, promotionsTotalPages));
  }, [promotionsTotalPages]);

  const paginatedPromotionRows = useMemo(() => {
    const start = (promotionsPage - 1) * PRODUCTS_PAGE_SIZE;
    return promotionRows.slice(start, start + PRODUCTS_PAGE_SIZE);
  }, [promotionRows, promotionsPage]);

  const promotionsRangeStart = promotionRows.length === 0 ? 0 : (promotionsPage - 1) * PRODUCTS_PAGE_SIZE + 1;
  const promotionsRangeEnd =
    promotionRows.length === 0 ? 0 : (promotionsPage - 1) * PRODUCTS_PAGE_SIZE + paginatedPromotionRows.length;

  const storeUrl = buildPublicStoreUrl(storeSettings.subdomain, publicStoreOrigin);

  const handleSectionChange = (next: Section) => {
    if (next === section) {
      pendingSectionRef.current = null;
      return;
    }
    pendingSectionRef.current = next;
    setCurrentSection(next);
    setShareOpen(false);
    setProductModalOpen(false);
    setDescriptionModalOpen(false);
    setPromotionModalOpen(false);
    setOrderModalOpen(false);
    setCancelConfirmOpen(false);
    setAcceptSaleOpen(false);
    setOpenProductMenuId(null);
    setOpenPromotionMenuRowId(null);
    setSelectedOrderId(null);
    setSelectedOrderSale(null);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'overview') {
      params.delete('section');
    } else {
      params.set('section', next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const openProductModal = () => {
    setCatalogSearch('');
    setSelectingProducts([]);
    setProductModalOpen(true);
  };

  const openDescriptionModal = (productId: string) => {
    setDescriptionProductId(productId);
    setDescriptionDraft(productDescriptions[productId] || '');
    setDescriptionModalOpen(true);
    setOpenProductMenuId(null);
  };

  const closeDescriptionModal = () => {
    setDescriptionModalOpen(false);
    setDescriptionProductId(null);
    setDescriptionDraft('');
  };

  const saveDescription = () => {
    if (!descriptionProductId) return;
    const nextValue = descriptionDraft.trim();
    setProductDescriptions((prev) => {
      const next = { ...prev };
      if (!nextValue) {
        delete next[descriptionProductId];
      } else {
        next[descriptionProductId] = nextValue;
      }
      return next;
    });
    closeDescriptionModal();
  };

  const toggleProductVisibility = (productId: string) => {
    setHiddenProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
    setOpenProductMenuId(null);
  };

  const openProductInStore = (productId: string) => {
    const separator = storeUrl.includes('?') ? '&' : '?';
    const targetUrl = `${storeUrl}${separator}produto=${encodeURIComponent(productId)}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    setOpenProductMenuId(null);
  };

  const handleCopyStoreLink = async () => {
    const copied = await copyText(storeUrl);
    if (copied) {
      setStoreLinkFeedback('Link copiado.');
      setStoreLinkFeedbackError(false);
      return;
    }

    setStoreLinkFeedback('Nao foi possivel copiar automaticamente.');
    setStoreLinkFeedbackError(true);
    if (typeof window !== 'undefined') {
      window.prompt('Copie o link da loja:', storeUrl);
    }
  };

  const removePromotion = (promotionId: string) => {
    setPromotions((prev) => prev.filter((promotion) => promotion.id !== promotionId));
    setOpenPromotionMenuRowId(null);
  };

  const startStorePriceEdit = (product: StoreProduct) => {
    const currentResolvedPrice = storePricesByProductId.get(product.id) ?? Math.max(0, toNumber(product.price));
    setHoveredStorePriceId(product.id);
    setEditingStorePriceId(product.id);
    setStorePriceDrafts((prev) => ({
      ...prev,
      [product.id]: formatPrice(currentResolvedPrice)
    }));
  };

  const cancelStorePriceEdit = (productId: string) => {
    setStorePriceDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setEditingStorePriceId((prev) => (prev === productId ? null : prev));
    setHoveredStorePriceId((prev) => (prev === productId ? null : prev));
  };

  const updateStorePriceDraft = (productId: string, value: string) => {
    const formatted = formatCurrencyInput(value);
    setStorePriceDrafts((prev) => ({
      ...prev,
      [productId]: formatted
    }));
  };

  const saveStorePrice = (product: StoreProduct) => {
    const rawDraft = storePriceDrafts[product.id];
    const currentResolvedPrice = storePricesByProductId.get(product.id) ?? Math.max(0, toNumber(product.price));
    const nextPrice = Math.max(0, parseMoney(rawDraft ?? formatPrice(currentResolvedPrice)));
    const defaultPrice = Math.max(0, toNumber(product.price));
    setStorePriceOverrides((prev) => {
      const next = { ...prev };
      if (Math.abs(nextPrice - defaultPrice) < 0.0001) {
        delete next[product.id];
      } else {
        next[product.id] = nextPrice;
      }
      return next;
    });
    setStorePriceDrafts((prev) => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    setEditingStorePriceId((prev) => (prev === product.id ? null : prev));
    setHoveredStorePriceId((prev) => (prev === product.id ? null : prev));
  };

  const applySelectedProducts = () => {
    const selected = availableProducts.filter((item) => selectingProducts.includes(item.id));
    if (selected.length > 0) {
      setActiveProducts((prev) => [...prev, ...selected]);
    }
    setProductModalOpen(false);
  };

  const openPromotionModal = () => {
    setPromotionSearch('');
    setPromotionSelectedProducts([]);
    setPromotionDiscount('10');
    setPromotionDiscountMode('global');
    setPromotionDiscountByProduct({});
    setPromotionStartDate(toIsoDate(new Date()));
    setPromotionEndDate('');
    setPromotionError('');
    setPromotionStep('select');
    setPromotionModalOpen(true);
  };

  const proceedPromotionToCreate = () => {
    if (promotionSelectedProducts.length === 0) return;
    setPromotionDiscountByProduct((prev) => {
      const next: Record<string, string> = {};
      for (const productId of promotionSelectedProducts) {
        next[productId] = prev[productId] || promotionDiscount || '10';
      }
      return next;
    });
    setPromotionError('');
    setPromotionStep('create');
  };

  const updatePromotionProductDiscount = (productId: string, value: string) => {
    const digits = value.replace(/\D/g, '');
    const numeric = digits ? String(Math.min(99, Math.max(0, Number(digits)))) : '';
    setPromotionDiscountByProduct((prev) => ({
      ...prev,
      [productId]: numeric
    }));
  };

  const savePromotion = () => {
    if (promotionSelectedProducts.length === 0) {
      setPromotionError('Selecione pelo menos um produto.');
      return;
    }

    const startDate = normalizeDateInput(promotionStartDate) || toIsoDate(new Date());
    const endDate = normalizeDateInput(promotionEndDate);
    if (endDate && endDate < startDate) {
      setPromotionError('A data final deve ser maior ou igual à data de início.');
      return;
    }

    let discount = Math.max(1, Math.min(99, Number(promotionDiscount) || 0));
    let discountsByProduct: Record<string, number> | undefined;

    if (promotionDiscountMode === 'per_product') {
      discountsByProduct = {};
      for (const productId of promotionSelectedProducts) {
        const value = Math.max(1, Math.min(99, Number(promotionDiscountByProduct[productId]) || 0));
        if (value <= 0) {
          setPromotionError('Informe o desconto de todos os produtos selecionados.');
          return;
        }
        discountsByProduct[productId] = value;
      }
      discount = discountsByProduct[promotionSelectedProducts[0]] || discount;
    } else if (discount <= 0) {
      setPromotionError('Informe um desconto válido.');
      return;
    }

    const resolvedStatus = resolvePromotionStatus(startDate, endDate || '');

    setPromotions((prev) => [
      {
        id: `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: promotionDiscountMode === 'global' ? `${discount}% OFF` : 'Desconto por produto',
        discount,
        productIds: promotionSelectedProducts,
        mode: promotionDiscountMode,
        discountsByProduct,
        startDate,
        endDate: endDate || '',
        status: resolvedStatus,
        createdAt: new Date().toISOString()
      },
      ...prev
    ]);
    setPromotionError('');
    setPromotionsPage(1);
    setPromotionModalOpen(false);
  };

  const buildSaleDetailFromOrder = (order: StorefrontOrder): SaleDetail | null => {
    if (!order.sale_id) return null;
    const firstItem = order.items[0];
    const fallbackQty = order.items.reduce((sum, item) => sum + Math.max(0, Math.trunc(toNumber(item.quantity))), 0);
    return {
      id: order.sale_id,
      customer: order.customer_name || 'Cliente nao informado',
      date: order.accepted_at || order.created_at,
      status: order.status === 'cancelled' ? 'cancelled' : 'pending',
      total: Math.max(0, toNumber(order.total)),
      paid: 0,
      itemName: firstItem?.product_name || firstItem?.sku || '',
      itemQty: Math.max(1, Math.trunc(toNumber(order.items_count)) || fallbackQty || 1),
      dueDate: order.accepted_at || order.created_at
    };
  };

  const openAssociatedSaleFromOrder = (order: StorefrontOrder) => {
    const detail = buildSaleDetailFromOrder(order);
    if (!detail) return;
    setSelectedOrderSale(detail);
    setOrderModalOpen(false);
    setCancelConfirmOpen(false);
    setAcceptSaleOpen(false);
  };

  const openOrderModal = (orderId: string) => {
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return;
    setSelectedOrderId(order.id);
    setCancelConfirmOpen(false);
    setOrderModalOpen(true);
  };

  const closeOrderModal = () => {
    setOrderModalOpen(false);
    setSelectedOrderId(null);
    setCancelConfirmOpen(false);
    setAcceptSaleOpen(false);
    setAcceptSaleLoading(false);
    setAcceptSaleError('');
    setAcceptProductSearch('');
    setAcceptExtraProductId('');
    setAcceptItems([]);
    setAcceptCustomerId('');
    setAcceptCustomerName('');
  };

  const closeAcceptSaleModal = () => {
    setAcceptSaleOpen(false);
    setAcceptSaleError('');
    setAcceptSaleLoading(false);
    setAcceptProductSearch('');
    setAcceptExtraProductId('');
  };

  const handleAssociatedSaleUpdated = useCallback(
    (_update: SaleUpdate) => {
      void Promise.all([refreshOrders(), refreshCatalog()]);
    },
    [refreshCatalog, refreshOrders]
  );

  const loadAcceptCustomers = useCallback(async () => {
    setAcceptCustomersLoading(true);
    try {
      const response = await fetch(`${API_BASE}/customers`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json()) as { data?: unknown };
      const parsed = Array.isArray(payload.data)
        ? payload.data.map(normalizeCustomerOption).filter((item): item is CustomerOption => Boolean(item))
        : [];
      parsed.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      setAcceptCustomers(parsed);
    } catch {
      setAcceptCustomers([]);
    } finally {
      setAcceptCustomersLoading(false);
    }
  }, []);

  const loadUnitsForAcceptItem = useCallback(async (item: AcceptSaleItemState) => {
    if (!item.productId) {
      setAcceptItems((prev) =>
        prev.map((entry) =>
          entry.orderItemId === item.orderItemId
            ? {
                ...entry,
                loadingUnits: false,
                availableUnits: [],
                selectedUnitIds: [],
                unitsError: 'Produto nao vinculado ao estoque.'
              }
            : entry
        )
      );
      return;
    }

    setAcceptItems((prev) =>
      prev.map((entry) =>
        entry.orderItemId === item.orderItemId
          ? { ...entry, loadingUnits: true, unitsError: '' }
          : entry
      )
    );

    try {
      const response = await fetch(`${API_BASE}/inventory/products/${item.productId}/units`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Nao foi possivel carregar as unidades deste produto.');
      }
      const payload = (await response.json()) as { data?: unknown };
      const allUnits = Array.isArray(payload.data)
        ? payload.data.map(normalizeInventoryUnit).filter((unit): unit is InventoryUnit => Boolean(unit))
        : [];
      const available = allUnits.filter((unit) => (unit.status || '').toLowerCase() === 'available');

      setAcceptItems((prev) =>
        prev.map((entry) => {
          if (entry.orderItemId !== item.orderItemId) return entry;
          const validSelected = entry.selectedUnitIds.filter((id) => available.some((unit) => unit.id === id));
          const autoSelected =
            validSelected.length > 0
              ? validSelected.slice(0, entry.quantity)
              : available.slice(0, entry.quantity).map((unit) => unit.id);
          const unitsError =
            available.length < entry.quantity
              ? `Estoque insuficiente: ${available.length} disponivel(is) de ${entry.quantity}.`
              : '';
          return {
            ...entry,
            loadingUnits: false,
            availableUnits: available,
            selectedUnitIds: autoSelected,
            unitsError
          };
        })
      );
    } catch (error) {
      setAcceptItems((prev) =>
        prev.map((entry) =>
          entry.orderItemId === item.orderItemId
            ? {
                ...entry,
                loadingUnits: false,
                availableUnits: [],
                selectedUnitIds: [],
                unitsError: error instanceof Error ? error.message : 'Erro ao carregar unidades.'
              }
            : entry
        )
      );
    }
  }, []);

  const openAcceptSaleModal = () => {
    if (!selectedOrder || selectedOrder.status !== 'pending') return;
    setCancelConfirmOpen(false);
    const orderDate = new Date(selectedOrder.created_at);
    const defaultSaleDate = Number.isNaN(orderDate.getTime()) ? toIsoDate(new Date()) : toIsoDate(orderDate);

    const initialItems: AcceptSaleItemState[] = selectedOrder.items.map((item) => {
      const normalizedSku = item.sku.trim().toLowerCase();
      const catalogProduct =
        (item.product_id ? catalogById.get(item.product_id) : null) || catalogBySku.get(normalizedSku) || null;
      const productId = item.product_id || catalogProduct?.id || '';
      const displayName = item.product_name || catalogProduct?.name || item.sku;
      const imageUrl = item.product_image_url || catalogProduct?.image_url || '';

      return {
        orderItemId: item.id,
        fromOrder: true,
        requestedQuantity: Math.max(1, Math.trunc(toNumber(item.quantity))),
        productId,
        sku: item.sku,
        name: displayName,
        imageUrl,
        quantity: Math.max(1, Math.trunc(toNumber(item.quantity))),
        priceInput: formatPrice(Math.max(0, toNumber(item.price))),
        availableUnits: [],
        selectedUnitIds: [],
        unitsExpanded: true,
        loadingUnits: Boolean(productId),
        unitsError: productId ? '' : 'Produto nao vinculado ao estoque.'
      };
    });

    setAcceptSaleError('');
    setAcceptProductSearch('');
    setAcceptExtraProductId('');
    setAcceptSaleDate(defaultSaleDate);
    setAcceptCustomerId('');
    setAcceptCustomerName(selectedOrder.customer_name || '');
    setAcceptItems(initialItems);
    setAcceptSaleOpen(true);
    void loadAcceptCustomers();
    initialItems.forEach((item) => {
      if (!item.productId) return;
      void loadUnitsForAcceptItem(item);
    });
  };

  const updateAcceptItemPrice = (orderItemId: string, value: string) => {
    setAcceptItems((prev) =>
      prev.map((item) =>
        item.orderItemId === orderItemId
          ? {
              ...item,
              priceInput: formatCurrencyInput(value)
            }
          : item
      )
    );
  };

  const toggleAcceptItemUnitsExpanded = (orderItemId: string) => {
    setAcceptItems((prev) =>
      prev.map((item) =>
        item.orderItemId === orderItemId ? { ...item, unitsExpanded: !item.unitsExpanded } : item
      )
    );
  };

  const addAcceptExtraProduct = () => {
    if (!acceptExtraProductId) return;
    const product = catalogById.get(acceptExtraProductId);
    if (!product) return;
    const sku = (product.sku || '').trim();
    const productName = (product.name || '').trim();
    if (!sku || !productName) return;

    setAcceptSaleError('');
    let createdItem: AcceptSaleItemState | null = null;
    setAcceptItems((prev) => {
      const existingIndex = prev.findIndex((item) => !item.fromOrder && item.productId === product.id);
      if (existingIndex >= 0) {
        return prev.map((item, index) => {
          if (index !== existingIndex) return item;
          const nextQuantity = item.quantity + 1;
          const selected = item.selectedUnitIds.slice(0, nextQuantity);
          for (const unit of item.availableUnits) {
            if (selected.length >= nextQuantity) break;
            if (!selected.includes(unit.id)) selected.push(unit.id);
          }
          const unitsError =
            item.availableUnits.length < nextQuantity
              ? `Estoque insuficiente: ${item.availableUnits.length} disponivel(is) de ${nextQuantity}.`
              : '';
          return {
            ...item,
            quantity: nextQuantity,
            requestedQuantity: item.fromOrder ? item.requestedQuantity : nextQuantity,
            selectedUnitIds: selected,
            unitsError
          };
        });
      }

      createdItem = {
        orderItemId: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromOrder: false,
        requestedQuantity: 1,
        productId: product.id,
        sku,
        name: productName,
        imageUrl: (product.image_url || '').trim(),
        quantity: 1,
        priceInput: formatPrice(Math.max(0, toNumber(product.price))),
        availableUnits: [],
        selectedUnitIds: [],
        unitsExpanded: true,
        loadingUnits: true,
        unitsError: ''
      };
      return [...prev, createdItem];
    });

    if (createdItem) {
      void loadUnitsForAcceptItem(createdItem);
    }
    setAcceptExtraProductId('');
  };

  const removeAcceptExtraProduct = (orderItemId: string) => {
    setAcceptSaleError('');
    setAcceptItems((prev) =>
      prev.filter((item) => !(item.orderItemId === orderItemId && !item.fromOrder))
    );
  };

  const stepAcceptItemQuantity = (orderItemId: string, delta: number) => {
    if (delta === 0) return;
    setAcceptSaleError('');
    setAcceptItems((prev) =>
      prev.map((item) => {
        if (item.orderItemId !== orderItemId) return item;
        const nextQuantity = Math.max(0, item.quantity + delta);
        const selected = item.selectedUnitIds.slice(0, nextQuantity);
        if (delta > 0) {
          for (const unit of item.availableUnits) {
            if (selected.length >= nextQuantity) break;
            if (!selected.includes(unit.id)) selected.push(unit.id);
          }
        }

        const unitsError =
          nextQuantity > item.availableUnits.length
            ? `Estoque insuficiente: ${item.availableUnits.length} disponivel(is) de ${nextQuantity}.`
            : '';

        return {
          ...item,
          quantity: nextQuantity,
          requestedQuantity: item.fromOrder ? item.requestedQuantity : Math.max(1, nextQuantity),
          selectedUnitIds: selected,
          unitsError
        };
      })
    );
  };

  const acceptOrder = async () => {
    if (!selectedOrderId || !selectedOrder) return;

    const customerName = acceptCustomerName.trim() || selectedOrder.customer_name.trim();
    if (!acceptCustomerId && !customerName) {
      setAcceptSaleError('Selecione um cliente ou informe um nome.');
      return;
    }

    const itemsPayload: Array<{
      id?: string;
      productId?: string;
      sku?: string;
      quantity: number;
      price: number;
      unitIds: string[];
    }> = [];

    for (const item of acceptItems) {
      if (item.quantity > 0 && !item.productId) {
        setAcceptSaleError(`Produto sem estoque vinculado: ${item.name}.`);
        return;
      }
      if (item.selectedUnitIds.length !== item.quantity) {
        setAcceptSaleError(`Selecione ${item.quantity} unidade(s) para ${item.name}.`);
        return;
      }
      itemsPayload.push({
        id: item.fromOrder ? item.orderItemId : undefined,
        productId: item.fromOrder ? undefined : item.productId,
        sku: item.sku || undefined,
        quantity: item.quantity,
        price: Math.max(0, parseMoney(item.priceInput)),
        unitIds: item.selectedUnitIds
      });
    }

    setOrderActionLoading('accept');
    setAcceptSaleLoading(true);
    setAcceptSaleError('');
    try {
      const response = await fetch(`${API_BASE}/storefront/orders/${selectedOrderId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: acceptCustomerId || undefined,
          customerName: acceptCustomerId ? undefined : customerName,
          saleDate: acceptSaleDate || toIsoDate(new Date()),
          items: itemsPayload
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: { sale_id?: string | null }; message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message || 'Nao foi possivel aceitar este pedido.');
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SALES_SYNC_STORAGE_KEY, `${Date.now()}:${payload?.data?.sale_id || ''}`);
      }
      await Promise.all([refreshOrders(), refreshCatalog()]);
      closeAcceptSaleModal();
      closeOrderModal();
    } catch (error) {
      setAcceptSaleError(error instanceof Error ? error.message : 'Nao foi possivel aceitar este pedido.');
    } finally {
      setAcceptSaleLoading(false);
      setOrderActionLoading('');
    }
  };

  const cancelOrder = async () => {
    if (!selectedOrderId) return;
    setOrderActionLoading('cancel');
    try {
      const response = await fetch(`${API_BASE}/storefront/orders/${selectedOrderId}/cancel`, { method: 'POST' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || 'Nao foi possivel cancelar este pedido.');
      }
      await Promise.all([refreshOrders(), refreshCatalog()]);
      closeOrderModal();
    } catch (error) {
      setOrdersMessage(error instanceof Error ? error.message : 'Nao foi possivel cancelar este pedido.');
    } finally {
      setOrderActionLoading('');
    }
  };

  const sectionTitle =
    section === 'products'
      ? 'Produtos'
      : section === 'promotions'
        ? 'Promoções'
        : section === 'orders'
          ? 'Pedidos'
          : 'Loja online';

  return (
    <main className="store-screen" style={{ ['--store-accent' as string]: storeSettings.shopColor }}>
      <aside className="store-secondary">
        <h2>Loja</h2>
        <nav className="store-secondary-nav" aria-label="Navegação da loja">
          <SecondaryNavItem
            active={section === 'overview'}
            icon={<IconSettings />}
            label="Visão geral"
            onClick={() => handleSectionChange('overview')}
          />
          <SecondaryNavItem
            active={section === 'orders'}
            icon={<IconTag />}
            label="Pedidos"
            onClick={() => handleSectionChange('orders')}
          />
          <SecondaryNavItem
            active={section === 'products'}
            icon={<IconBox />}
            label="Produtos"
            onClick={() => handleSectionChange('products')}
          />
          <SecondaryNavItem
            active={section === 'promotions'}
            icon={<IconTagPercent />}
            label="Promoções"
            onClick={() => handleSectionChange('promotions')}
          />
        </nav>
      </aside>

      <section className="store-main">
        <header className="store-header">
          <h1>{sectionTitle}</h1>

          {section === 'overview' ? (
            <div className="store-overview-actions" ref={shareRef}>
              <Link href="/loja-configuracoes" className="store-btn primary">
                <IconSettings />
                <span>Configurar loja</span>
              </Link>
              <button
                type="button"
                className="store-btn"
                onClick={() => setShareOpen((prev) => !prev)}
              >
                <IconShare />
                <span>Compartilhar</span>
              </button>

              {shareOpen ? (
                <div className="store-share-popover">
                  <div className="store-share-title">Compartilhar minha loja</div>
                  <div className="store-share-icons">
                    <button type="button" aria-label="Compartilhar no Facebook" className="fb">
                      f
                    </button>
                    <button type="button" aria-label="Compartilhar no WhatsApp" className="wa">
                      w
                    </button>
                    <button type="button" aria-label="Compartilhar no X" className="x">
                      x
                    </button>
                    <button type="button" aria-label="Compartilhar no LinkedIn" className="in">
                      in
                    </button>
                    <button type="button" aria-label="Compartilhar por e-mail" className="mail">
                      @
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {section === 'products' ? (
            <button type="button" className="store-btn primary" onClick={openProductModal}>
              <IconPlus />
              <span>Adicionar produto</span>
            </button>
          ) : null}

          {section === 'promotions' ? (
            <button type="button" className="store-btn primary" onClick={openPromotionModal}>
              <IconPlus />
              <span>Criar promoção</span>
            </button>
          ) : null}
        </header>

        {section === 'overview' ? (
          <article className="store-overview-card">
            <div className="store-overview-brand">
              <div className="store-overview-mark">
                <div className="store-overview-logo">
                  {storeSettings.shopName.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <div>
                <strong>{storeSettings.shopName}</strong>
                <p>Sua vitrine digital para vender todos os dias</p>
                <div className="store-link-row">
                  <a href={storeUrl} target="_blank" rel="noreferrer">
                    {storeUrl}
                  </a>
                  <button
                    type="button"
                    className="store-link-copy"
                    aria-label="Copiar link"
                    onClick={() => void handleCopyStoreLink()}
                  >
                    <IconCopy />
                  </button>
                </div>
                {storeLinkFeedback ? (
                  <span className={`store-link-feedback${storeLinkFeedbackError ? ' error' : ''}`}>
                    {storeLinkFeedback}
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        ) : null}

        {section === 'orders' ? (
          <>
            <label className="store-search" aria-label="Buscar pedido">
              <IconSearch />
              <input
                type="search"
                placeholder="Buscar pedido"
                value={panelSearch}
                onChange={(event) => setPanelSearch(event.target.value)}
              />
            </label>

            {ordersMessage ? <p className="store-orders-feedback">{ordersMessage}</p> : null}

            {ordersLoading ? (
              <article className="store-empty-panel">
                <div className="store-empty-icon">
                  <IconTag />
                </div>
                <h3>Carregando pedidos...</h3>
              </article>
            ) : filteredOrders.length === 0 ? (
              <article className="store-empty-panel">
                <div className="store-empty-icon">
                  <IconTag />
                </div>
                <h3>Nenhum pedido</h3>
                <p>Quando houver compras na loja, os pedidos aparecerão aqui.</p>
              </article>
            ) : (
              <article className="store-orders-table">
                <header className="store-orders-head">
                  <span>ID</span>
                  <span>Cliente</span>
                  <span>Qntd. de produtos</span>
                  <span>Valor total</span>
                  <span>Situação</span>
                  <span>Data</span>
                </header>
                <div className="store-orders-body">
                  {filteredOrders.map((order) => (
                    <button type="button" className="store-orders-row" key={order.id} onClick={() => openOrderModal(order.id)}>
                      <strong>{formatOrderCode(order.id)}</strong>
                      <span>{order.customer_name}</span>
                      <span>{order.items_count} produto(s)</span>
                      <span>{formatPrice(order.total)}</span>
                      <span className={`store-order-status ${orderStatusClass(order.status)}`}>
                        {orderStatusLabel(order.status)}
                      </span>
                      <span>{formatDate(order.created_at)}</span>
                    </button>
                  ))}
                </div>
              </article>
            )}
          </>
        ) : null}

        {section === 'products' ? (
          <>
            <label className="store-search" aria-label="Buscar produto da loja">
              <IconSearch />
              <input
                type="search"
                placeholder="Buscar produto"
                value={panelSearch}
                onChange={(event) => setPanelSearch(event.target.value)}
              />
            </label>

            {filteredStoreProducts.length === 0 ? (
              <article className="store-empty-panel tall">
                <div className="store-empty-icon">
                  <IconBox />
                </div>
                <h3>Nenhum produto cadastrado</h3>
                <p>Assim que produtos forem cadastrados no estoque, eles aparecerão aqui.</p>
              </article>
            ) : (
              <article className="store-products-table">
                <header className="store-products-head">
                  <span>Produto</span>
                  <span>Estoque</span>
                  <span>Valor na loja</span>
                  <span aria-hidden="true"></span>
                </header>
                <div className="store-products-body">
                  {paginatedStoreProducts.map((product) => {
                    const quantity = Math.max(0, Math.trunc(toNumber(product.quantity)));
                    const pending = pendingByProductId.get(product.id) || 0;
                    const brand = (product.brand || '').trim();
                    const code = (product.sku || '').trim();
                    const imageUrl = (product.image_url || '').trim();
                    const price = storePricesByProductId.get(product.id) ?? Math.max(0, toNumber(product.price));
                    const priceDraft = storePriceDrafts[product.id];
                    const priceInputValue = priceDraft ?? formatPrice(price);
                    const parsedDraftPrice = priceDraft === undefined ? price : Math.max(0, parseMoney(priceDraft));
                    const priceChanged = Math.abs(parsedDraftPrice - price) >= 0.0001;
                    const isPriceHovered = hoveredStorePriceId === product.id;
                    const isPriceEditing = editingStorePriceId === product.id;
                    const showPriceEditor = isPriceHovered || isPriceEditing;
                    const isHidden = hiddenProductIds.includes(product.id);

                    return (
                      <div className={isHidden ? 'store-products-row hidden' : 'store-products-row'} key={product.id}>
                        <div className="store-products-main">
                          <div className="store-products-thumb">
                            {imageUrl ? <img src={imageUrl} alt={product.name} loading="lazy" /> : null}
                          </div>
                          <div className="store-products-copy">
                            <strong>{product.name}</strong>
                            <span>
                              {[brand, code].filter(Boolean).join(' • ') || 'Sem código'}
                            </span>
                          </div>
                        </div>
                        <div className="store-products-stock">
                          <span>Em estoque: {quantity}</span>
                          <span>Pendentes: {pending}</span>
                          {isHidden ? <span className="store-products-hidden-label">Oculto na loja</span> : null}
                        </div>
                        <div
                          className="store-products-price-cell"
                          onMouseEnter={() => {
                            if (editingStorePriceId && editingStorePriceId !== product.id) return;
                            setHoveredStorePriceId(product.id);
                          }}
                          onMouseLeave={() => {
                            if (editingStorePriceId === product.id) return;
                            setHoveredStorePriceId((prev) => (prev === product.id ? null : prev));
                          }}
                        >
                          {showPriceEditor ? (
                            <div className="store-products-price-editor">
                              <input
                                type="text"
                                inputMode="decimal"
                                aria-label={`Valor na loja de ${product.name}`}
                                value={priceInputValue}
                                onFocus={() => setEditingStorePriceId(product.id)}
                                onChange={(event) => updateStorePriceDraft(product.id, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    saveStorePrice(product);
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelStorePriceEdit(product.id);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="store-products-price-save"
                                aria-label={`Salvar valor na loja de ${product.name}`}
                                onClick={() => saveStorePrice(product)}
                                disabled={!priceChanged}
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="store-products-price-display"
                              aria-label={`Editar valor na loja de ${product.name}`}
                              onClick={() => startStorePriceEdit(product)}
                            >
                              {formatPrice(price)}
                            </button>
                          )}
                        </div>
                        <div className="store-product-actions" data-store-product-menu-root="true">
                          <button
                            type="button"
                            className="store-row-menu"
                            aria-label="Ações do produto"
                            onClick={() =>
                              setOpenProductMenuId((prev) => (prev === product.id ? null : product.id))
                            }
                          >
                            <IconDots />
                          </button>
                          {openProductMenuId === product.id ? (
                            <div className="store-product-menu">
                              <button type="button" onClick={() => openDescriptionModal(product.id)}>
                                Alterar descrição
                              </button>
                              <button type="button" onClick={() => openProductInStore(product.id)}>
                                Ver na loja
                              </button>
                              <button type="button" onClick={() => toggleProductVisibility(product.id)}>
                                {isHidden ? 'Mostrar na loja' : 'Ocultar da loja'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <footer className="store-table-footer">
                  <strong>
                    {productsRangeStart} - {productsRangeEnd} de {filteredStoreProducts.length}
                  </strong>
                  <div className="store-table-pagination-actions">
                    <button
                      type="button"
                      className="store-table-pagination-btn"
                      onClick={() => setProductsPage((prev) => Math.max(1, prev - 1))}
                      disabled={productsPage <= 1}
                      aria-label="Página anterior"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="store-table-pagination-btn"
                      onClick={() => setProductsPage((prev) => Math.min(productsTotalPages, prev + 1))}
                      disabled={productsPage >= productsTotalPages}
                      aria-label="Próxima página"
                    >
                      ›
                    </button>
                  </div>
                </footer>
              </article>
            )}
          </>
        ) : null}

        {section === 'promotions' ? (
          promotionRows.length === 0 ? (
            <article className="store-empty-panel tall">
              <div className="store-empty-icon">
                <IconBox />
              </div>
              <h3>Nenhuma promoção ativa na loja</h3>
              <p>Aqui você pode criar promoções para seus produtos</p>
            </article>
          ) : (
            <article className="store-promotions-table">
              <header className="store-promotions-head">
                <span>Produto</span>
                <span>Início</span>
                <span>Término</span>
                <span>Preço</span>
                <span>Situação</span>
                <span aria-hidden="true"></span>
              </header>
              <div className="store-promotions-body">
                {paginatedPromotionRows.map((row) => (
                  <div className="store-promotions-row" key={row.rowId}>
                    <div className="store-promotions-main">
                      <span className="store-promotions-thumb">
                        {row.imageUrl ? <img src={row.imageUrl} alt={row.productName} loading="lazy" /> : null}
                      </span>
                      <div className="store-promotions-copy">
                        <strong>{row.productName}</strong>
                        <span>{[row.productBrand, row.productCode].filter(Boolean).join(' • ') || 'Sem código'}</span>
                      </div>
                    </div>
                    <span>{row.startDate ? formatDate(row.startDate) : '-'}</span>
                    <span>{row.endDate ? formatDate(row.endDate) : '-'}</span>
                    <div className="store-promo-price">
                      {row.newPrice < row.oldPrice ? <s>{formatPrice(row.oldPrice)}</s> : null}
                      <strong>{formatPrice(row.newPrice)}</strong>
                    </div>
                    <span className={`store-promo-status ${promotionStatusClass(row.status)}`}>
                      {promotionStatusLabel(row.status)}
                    </span>
                    <div className="store-promotion-actions" data-store-promotion-menu-root="true">
                      <button
                        type="button"
                        className="store-row-menu"
                        aria-label="Ações da promoção"
                        onClick={() =>
                          setOpenPromotionMenuRowId((prev) => (prev === row.rowId ? null : row.rowId))
                        }
                      >
                        <IconDots />
                      </button>
                      {openPromotionMenuRowId === row.rowId ? (
                        <div className="store-promotion-menu">
                          <button type="button" onClick={() => removePromotion(row.promotionId)}>
                            Remover promoção
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              <footer className="store-table-footer">
                <strong>
                  {promotionsRangeStart} - {promotionsRangeEnd} de {promotionRows.length}
                </strong>
                <div className="store-table-pagination-actions">
                  <button
                    type="button"
                    className="store-table-pagination-btn"
                    onClick={() => setPromotionsPage((prev) => Math.max(1, prev - 1))}
                    disabled={promotionsPage <= 1}
                    aria-label="Página anterior"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="store-table-pagination-btn"
                    onClick={() => setPromotionsPage((prev) => Math.min(promotionsTotalPages, prev + 1))}
                    disabled={promotionsPage >= promotionsTotalPages}
                    aria-label="Próxima página"
                  >
                    ›
                  </button>
                </div>
              </footer>
            </article>
          )
        ) : null}
      </section>

      {productModalOpen ? (
        <div className="store-modal-overlay" role="presentation" onClick={() => setProductModalOpen(false)}>
          <section className="store-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="store-modal-header">
              <h3>Incluir produtos na loja</h3>
              <button type="button" onClick={() => setProductModalOpen(false)}>
                x
              </button>
            </header>

            <label className="store-search large" aria-label="Pesquisar produto para incluir">
              <IconSearch />
              <input
                type="search"
                placeholder="Pesquisar"
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
              />
            </label>

            {filteredAvailableProducts.length === 0 ? (
              <div className="store-empty-modal-state">
                <div className="store-empty-icon">
                  <IconBox />
                </div>
                <h3>Nenhum produto disponível</h3>
                <p>Não há produtos cadastrados</p>
              </div>
            ) : (
              <div className="store-modal-list">
                {filteredAvailableProducts.map((item) => {
                  const checked = selectingProducts.includes(item.id);
                  return (
                    <label key={item.id} className="store-checkbox-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectingProducts((prev) =>
                            event.target.checked
                              ? [...prev, item.id]
                              : prev.filter((id) => id !== item.id)
                          );
                        }}
                      />
                      <div>
                        <strong>{item.name}</strong>
                        <span>{formatPrice(toNumber(item.price))}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <footer className="store-modal-footer">
              <span>{selectingProducts.length} selecionado(s)</span>
              <button
                type="button"
                className="store-btn primary"
                disabled={selectingProducts.length === 0}
                onClick={applySelectedProducts}
              >
                Adicionar
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {descriptionModalOpen ? (
        <div className="store-modal-overlay" role="presentation" onClick={closeDescriptionModal}>
          <section
            className="store-modal description"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="store-modal-header">
              <h3>Alterar descrição</h3>
              <button type="button" onClick={closeDescriptionModal}>
                x
              </button>
            </header>

            <div className="store-description-editor">
              <div className="store-description-toolbar">
                <button type="button">Normal</button>
                <button type="button">B</button>
                <button type="button">I</button>
                <button type="button">U</button>
                <button type="button">S</button>
                <button type="button">UL</button>
                <button type="button">OL</button>
                <button type="button">ALN</button>
                <button type="button">LINK</button>
              </div>
              <textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder="Digite uma descrição detalhada do produto..."
              />
            </div>

            <footer className="store-modal-footer">
              <button type="button" className="store-btn" onClick={closeDescriptionModal}>
                Cancelar
              </button>
              <button type="button" className="store-btn primary" onClick={saveDescription}>
                Salvar
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {promotionModalOpen ? (
        <div
          className="store-modal-overlay"
          role="presentation"
          onClick={() => setPromotionModalOpen(false)}
        >
          <section
            className="store-modal promotion"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="store-modal-header">
              <h3>Adicionar promoção</h3>
              <button type="button" onClick={() => setPromotionModalOpen(false)}>
                x
              </button>
            </header>

            {promotionStep === 'select' ? (
              <>
                <label className="store-search large" aria-label="Pesquisar produtos da promoção">
                  <IconSearch />
                  <input
                    type="search"
                    placeholder="Digite e pressione ENTER para buscar"
                    value={promotionSearch}
                    onChange={(event) => setPromotionSearch(event.target.value)}
                  />
                </label>

                <strong className="store-modal-subtitle">Selecione os produtos</strong>

                {promotionCandidates.length === 0 ? (
                  <div className="store-promotion-empty">Nenhum produto com estoque para selecionar.</div>
                ) : (
                  <div className="store-modal-list promotion-products">
                    {promotionCandidates.map((item) => {
                      const checked = promotionSelectedProducts.includes(item.id);
                      const subtitle = [item.brand || '', item.sku || ''].map((value) => value.trim()).filter(Boolean).join(' • ');
                      const imageUrl = (item.image_url || '').trim();
                      return (
                        <label key={item.id} className="store-checkbox-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setPromotionSelectedProducts((prev) =>
                                event.target.checked
                                  ? [...prev, item.id]
                                  : prev.filter((id) => id !== item.id)
                              );
                            }}
                          />
                          <div className="store-checkbox-main">
                            <span className="store-checkbox-thumb">
                              {imageUrl ? <img src={imageUrl} alt={item.name} loading="lazy" /> : null}
                            </span>
                            <div className="store-checkbox-copy">
                              <strong>{item.name}</strong>
                              <span>{subtitle || 'Sem código'}</span>
                            </div>
                          </div>
                          <strong className="store-checkbox-price">{formatPrice(Math.max(0, toNumber(item.price)))}</strong>
                        </label>
                      );
                    })}
                  </div>
                )}

                <footer className="store-modal-footer">
                  <span>{promotionSelectedProducts.length} selecionado(s)</span>
                  <button
                    type="button"
                    className="store-btn primary"
                    disabled={promotionSelectedProducts.length === 0}
                    onClick={proceedPromotionToCreate}
                  >
                    Prosseguir
                  </button>
                </footer>
              </>
            ) : (
              <>
                <div className="store-promotion-create">
                  <div className="store-promotion-mode-switch">
                    <label>
                      <input
                        type="radio"
                        name="promotion-mode"
                        checked={promotionDiscountMode === 'global'}
                        onChange={() => setPromotionDiscountMode('global')}
                      />
                      <span>Aplicar mesma porcentagem para todos</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="promotion-mode"
                        checked={promotionDiscountMode === 'per_product'}
                        onChange={() => setPromotionDiscountMode('per_product')}
                      />
                      <span>Definir descontos para cada produto</span>
                    </label>
                  </div>

                  {promotionDiscountMode === 'global' ? (
                    <div className="store-promotion-mode-card active">
                      <div className="store-promotion-discount-field">
                        <strong>Desconto</strong>
                        <label>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={promotionDiscount}
                            onChange={(event) => {
                              const value = event.target.value.replace(/\D/g, '');
                              setPromotionDiscount(value ? String(Math.min(99, Number(value))) : '');
                            }}
                            placeholder="0"
                          />
                          <span>%</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="store-promotion-product-table">
                      <header className="store-promotion-product-table-head">
                        <span>Produto</span>
                        <span>Desconto</span>
                        <span>Valor</span>
                      </header>
                      <div className="store-promotion-product-table-body">
                        {promotionSelectedProducts.map((productId) => {
                          const product = catalogById.get(productId);
                          if (!product) return null;
                          const basePrice =
                            storePricesByProductId.get(product.id) ?? Math.max(0, toNumber(product.price));
                          const discountValue = Math.max(
                            0,
                            Math.min(99, toNumber(promotionDiscountByProduct[product.id] || 0))
                          );
                          const finalPrice = Math.max(0, basePrice - basePrice * (discountValue / 100));
                          const subtitle = [product.brand || '', product.sku || '']
                            .map((value) => value.trim())
                            .filter(Boolean)
                            .join(' • ');
                          const imageUrl = (product.image_url || '').trim();

                          return (
                            <div key={product.id} className="store-promotion-product-table-row">
                              <div className="store-promotion-product-main">
                                <span className="store-promotion-product-thumb">
                                  {imageUrl ? <img src={imageUrl} alt={product.name} loading="lazy" /> : null}
                                </span>
                                <div className="store-promotion-product-copy">
                                  <strong>{product.name}</strong>
                                  <span>{subtitle || 'Sem código'}</span>
                                </div>
                              </div>
                              <label className="store-promotion-product-discount">
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={promotionDiscountByProduct[product.id] || ''}
                                  onChange={(event) =>
                                    updatePromotionProductDiscount(product.id, event.target.value)
                                  }
                                  placeholder="0"
                                />
                                <span>%</span>
                              </label>
                              <strong className="store-promotion-product-value">{formatPrice(finalPrice)}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {promotionDiscountMode === 'global' ? (
                    <div className="store-promotion-date-grid">
                      <label>
                        <span>Data de início</span>
                        <input
                          type="date"
                          value={promotionStartDate}
                          onChange={(event) => setPromotionStartDate(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Data final (opcional)</span>
                        <input
                          type="date"
                          value={promotionEndDate}
                          onChange={(event) => setPromotionEndDate(event.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
                {promotionError ? <p className="store-order-accept-error">{promotionError}</p> : null}

                <footer className="store-modal-footer">
                  <button type="button" className="store-btn" onClick={() => setPromotionStep('select')}>
                    Voltar
                  </button>
                  <button type="button" className="store-btn primary" onClick={savePromotion}>
                    {promotionDiscountMode === 'per_product' ? 'Definir descontos' : 'Aplicar'}
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      ) : null}

      {orderModalOpen && selectedOrder ? (
        <div className="store-modal-overlay" role="presentation" onClick={closeOrderModal}>
          <section className="store-order-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header className="store-order-modal-header">
              <h3>Pedido {formatOrderCode(selectedOrder.id)}</h3>
              <button type="button" aria-label="Fechar pedido" onClick={closeOrderModal}>
                x
              </button>
            </header>

            <div className="store-order-modal-block">
              <strong>Cliente</strong>
              <div className="store-order-customer">
                <b>{selectedOrder.customer_name}</b>
                {selectedOrder.customer_phone ? <span>{selectedOrder.customer_phone}</span> : null}
                {selectedOrder.customer_email ? <span>{selectedOrder.customer_email}</span> : null}
              </div>
            </div>

            <div className="store-order-modal-block">
              <strong>Itens do pedido</strong>
              <div className="store-order-items">
                {selectedOrder.items.map((item) => {
                  const fromCatalog =
                    (item.product_id ? catalogById.get(item.product_id) : null) ||
                    catalogBySku.get(item.sku.trim().toLowerCase()) ||
                    null;
                  const imageUrl = item.product_image_url || fromCatalog?.image_url || '';

                  return (
                    <div className="store-order-item" key={item.id}>
                      <div className="store-order-item-main">
                        <span className="store-order-item-thumb">
                          {imageUrl ? <img src={imageUrl} alt={item.product_name || item.sku} loading="lazy" /> : null}
                        </span>
                        <div className="store-order-item-copy">
                          <b>{item.product_name || item.sku}</b>
                          <span>{item.quantity} un.</span>
                        </div>
                      </div>
                      <div>
                        <b>{formatPrice(item.price * item.quantity)}</b>
                        <span>{formatPrice(item.price)} cada</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="store-order-modal-footer">
              <span className={`store-order-status ${orderStatusClass(selectedOrder.status)}`}>
                {orderStatusLabel(selectedOrder.status)}
              </span>
              <div className="store-order-modal-actions">
                {selectedOrder.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      className="store-btn"
                      onClick={() => setCancelConfirmOpen(true)}
                      disabled={orderActionLoading !== ''}
                    >
                      Recusar
                    </button>
                    <button
                      type="button"
                      className="store-btn primary"
                      onClick={openAcceptSaleModal}
                      disabled={orderActionLoading !== ''}
                    >
                      {orderActionLoading === 'accept' ? 'Aceitando...' : 'Aceitar'}
                    </button>
                  </>
                ) : selectedOrder.status === 'accepted' ? (
                  <>
                    <button type="button" className="store-btn" onClick={closeOrderModal}>
                      Fechar
                    </button>
                    <button
                      type="button"
                      className="store-btn primary"
                      onClick={() => openAssociatedSaleFromOrder(selectedOrder)}
                      disabled={!selectedOrder.sale_id}
                    >
                      Ver venda associada
                    </button>
                  </>
                ) : (
                  <button type="button" className="store-btn" onClick={closeOrderModal}>
                    Fechar
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      ) : null}

      <SalesDetailModal
        open={Boolean(selectedOrderSale)}
        onClose={() => setSelectedOrderSale(null)}
        sale={selectedOrderSale}
        onUpdated={handleAssociatedSaleUpdated}
      />

      {acceptSaleOpen && selectedOrder ? (
        <div className="store-modal-overlay" role="presentation" onClick={closeAcceptSaleModal}>
          <section
            className="store-order-accept-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="store-order-accept-header">
              <h3>Nova venda</h3>
              <button type="button" aria-label="Fechar nova venda" onClick={closeAcceptSaleModal}>
                x
              </button>
            </header>

            <div className="store-order-accept-grid">
              <label className="store-order-accept-field">
                <span>Cliente</span>
                <select
                  value={acceptCustomerId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setAcceptCustomerId(nextId);
                    const selected = acceptCustomers.find((item) => item.id === nextId);
                    if (selected) {
                      setAcceptCustomerName(selected.name);
                      return;
                    }
                    setAcceptCustomerName(selectedOrder.customer_name || '');
                  }}
                  disabled={acceptSaleLoading}
                >
                  <option value="">
                    {acceptCustomersLoading ? 'Carregando clientes...' : 'Selecione o cliente'}
                  </option>
                  {acceptCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="store-order-accept-field">
                <span>Data da venda</span>
                <input
                  type="date"
                  value={acceptSaleDate}
                  onChange={(event) => setAcceptSaleDate(event.target.value)}
                  disabled={acceptSaleLoading}
                />
              </label>
            </div>

            <label className="store-order-accept-field">
              <span>Nome do cliente</span>
              <input
                type="text"
                value={acceptCustomerName}
                onChange={(event) => setAcceptCustomerName(event.target.value)}
                placeholder="Informe o nome do cliente"
                disabled={acceptSaleLoading || Boolean(acceptCustomerId)}
              />
            </label>

            <section className="store-order-accept-products">
              <strong>Produtos</strong>
              <label className="store-order-accept-search" aria-label="Pesquisar produtos do pedido">
                <IconSearch />
                <input
                  type="search"
                  placeholder="Pesquisar produtos"
                  value={acceptProductSearch}
                  onChange={(event) => setAcceptProductSearch(event.target.value)}
                />
              </label>

              <div className="store-order-accept-add-product">
                <select
                  value={acceptExtraProductId}
                  onChange={(event) => setAcceptExtraProductId(event.target.value)}
                  disabled={acceptSaleLoading || extraAcceptProducts.length === 0}
                >
                  <option value="">Selecionar produto extra</option>
                  {extraAcceptProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="store-btn"
                  onClick={addAcceptExtraProduct}
                  disabled={acceptSaleLoading || !acceptExtraProductId}
                >
                  <IconPlus />
                  <span>Adicionar produto</span>
                </button>
              </div>

              <div className="store-order-accept-items">
                {filteredAcceptItems.length === 0 ? (
                  <div className="store-order-accept-empty">Nenhum produto encontrado neste pedido.</div>
                ) : (
                  filteredAcceptItems.map((item) => {
                    const quantityReference = item.fromOrder ? item.requestedQuantity : Math.max(1, item.requestedQuantity);
                    const selectedUnits = item.selectedUnitIds
                      .map((unitId) => item.availableUnits.find((unit) => unit.id === unitId) || null)
                      .filter((unit): unit is InventoryUnit => Boolean(unit))
                      .slice(0, item.quantity);

                    return (
                      <article className="store-order-accept-item" key={item.orderItemId}>
                        <div className="store-order-accept-item-head">
                          <div className="store-order-accept-item-main">
                            <span className="store-order-accept-thumb">
                              {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : null}
                            </span>
                            <div className="store-order-accept-item-copy">
                              <strong>{item.name}</strong>
                              <span>
                                {item.sku} · {item.quantity} un.
                                {!item.fromOrder ? ' (extra)' : ''}
                              </span>
                            </div>
                          </div>
                          <div className="store-order-accept-actions">
                            <label className="store-order-accept-price">
                              <span>Preço unitário</span>
                              <input
                                type="text"
                                value={item.priceInput}
                                onChange={(event) => updateAcceptItemPrice(item.orderItemId, event.target.value)}
                                placeholder="R$ 0,00"
                                disabled={acceptSaleLoading}
                              />
                            </label>
                            {!item.fromOrder ? (
                              <button
                                type="button"
                                className="store-order-accept-remove"
                                onClick={() => removeAcceptExtraProduct(item.orderItemId)}
                                disabled={acceptSaleLoading}
                                aria-label="Remover produto extra"
                              >
                                <IconTrash />
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="store-order-accept-units">
                          <div className="store-order-accept-units-toggle">
                            <button
                              type="button"
                              className="store-order-accept-units-open"
                              onClick={() => toggleAcceptItemUnitsExpanded(item.orderItemId)}
                            >
                              <span>{item.unitsExpanded ? '⌃' : '⌄'}</span>
                              <strong>Unidades a serem vendidas</strong>
                            </button>
                            <div className="store-order-accept-units-meta">
                              <em>{item.selectedUnitIds.length}/{quantityReference} selecionado</em>
                              <div className="store-order-accept-qty-stepper">
                                <button
                                  type="button"
                                  onClick={() => stepAcceptItemQuantity(item.orderItemId, -1)}
                                  disabled={acceptSaleLoading || item.loadingUnits}
                                  aria-label="Diminuir unidades"
                                >
                                  −
                                </button>
                                <span>{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => stepAcceptItemQuantity(item.orderItemId, 1)}
                                  disabled={acceptSaleLoading || item.loadingUnits}
                                  aria-label="Aumentar unidades"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          {item.unitsExpanded ? (
                            <div className="store-order-accept-units-panel">
                              <header>
                                <span></span>
                                <span>Preço de compra</span>
                                <span>Vencimento</span>
                              </header>
                              <div className="store-order-accept-units-list">
                                {item.loadingUnits ? (
                                  <div className="store-order-accept-units-empty">Carregando unidades...</div>
                                ) : selectedUnits.length === 0 ? (
                                  <div className="store-order-accept-units-empty">Sem unidades disponíveis.</div>
                                ) : (
                                  selectedUnits.map((unit) => (
                                    <div key={unit.id} className="store-order-accept-unit-row">
                                      <span className="store-order-accept-unit-check">✓</span>
                                      <span>{formatPrice(Math.max(0, toNumber(unit.cost)))}</span>
                                      <span>{unit.expires_at ? formatDate(unit.expires_at) : '-'}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                              {item.unitsError ? <p className="store-order-accept-error">{item.unitsError}</p> : null}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            {acceptSaleError ? <p className="store-order-accept-error">{acceptSaleError}</p> : null}

            <footer className="store-order-accept-footer">
              <button type="button" className="store-btn" onClick={closeAcceptSaleModal} disabled={acceptSaleLoading}>
                Cancelar
              </button>
              <button type="button" className="store-btn primary" onClick={acceptOrder} disabled={acceptSaleLoading}>
                {acceptSaleLoading ? 'Vendendo...' : 'Vender'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {cancelConfirmOpen ? (
        <div className="store-modal-overlay" role="presentation" onClick={() => setCancelConfirmOpen(false)}>
          <section
            className="store-order-confirm"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Recusar pedido</h3>
            <p>Ao recusar o pedido, não será possível recuperá-lo. Deseja continuar?</p>
            <div className="store-order-confirm-actions">
              <button type="button" className="store-btn" onClick={() => setCancelConfirmOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="store-btn danger"
                onClick={cancelOrder}
                disabled={orderActionLoading !== ''}
              >
                {orderActionLoading === 'cancel' ? 'Recusando...' : 'Recusar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
