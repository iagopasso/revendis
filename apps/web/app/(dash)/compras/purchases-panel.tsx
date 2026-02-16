'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { IconBox, IconDots, IconEdit, IconPlus, IconTrash } from '../icons';
import { API_BASE, formatCurrency, toNumber, digitsOnly } from '../lib';
import { resolveBrandLogo } from '../brand-logos';
import DateRangePicker from '../date-range';

type PurchaseStatus = 'draft' | 'pending' | 'received' | 'cancelled';

type Purchase = {
  id: string;
  supplier: string;
  status: PurchaseStatus;
  total: number | string;
  items: number | string;
  brand?: string | null;
  order_number?: string | null;
  purchase_date: string;
  created_at: string;
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
};

type PurchasesPanelProps = {
  initialPurchases: Purchase[];
  availableBrands: string[];
  products: Product[];
  initialCreateOpen?: boolean;
};

type PurchaseForm = {
  orderNumber: string;
  supplier: string;
  brand: string;
  items: string;
  total: string;
  purchaseDate: string;
};

type PurchaseDraftItem = {
  id: string;
  productId: string;
  price: string;
  expiryDate: string;
  quantity: string;
};

type PurchasePayloadItem = {
  productId: string;
  quantity: number;
  unitCost: number;
  expiresAt?: string;
};

type DraftSnapshot = {
  form: PurchaseForm;
  items: PurchaseDraftItem[];
};

type CreateStep = 'basic' | 'products' | 'details';

type PersistedDraftEntry = {
  purchase: Purchase;
  snapshot: DraftSnapshot;
};

type PersistedDraftPayload = {
  version: 1;
  drafts: PersistedDraftEntry[];
};

const PURCHASE_DRAFTS_STORAGE_KEY = 'revendis:purchases:drafts:v1';

const statusLabel = (status: PurchaseStatus) => {
  if (status === 'draft') return 'Rascunho';
  if (status === 'received') return 'Recebido';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pendente';
};

const statusBadge = (status: PurchaseStatus) => {
  if (status === 'draft') return 'draft';
  if (status === 'received') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'warn';
};

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseCurrencyInput = (value: string) => {
  const sanitized = value.replace(/[^\d,.-]/g, '');
  if (!sanitized) return NaN;

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const separatorIndex = Math.max(lastComma, lastDot);

  if (separatorIndex >= 0) {
    const integerRaw = sanitized.slice(0, separatorIndex).replace(/\D/g, '');
    const fractionRaw = sanitized.slice(separatorIndex + 1).replace(/\D/g, '');
    if (fractionRaw.length > 0 && fractionRaw.length <= 2) {
      const integerPart = integerRaw || '0';
      const fractionPart = fractionRaw.padEnd(2, '0');
      return Number(`${integerPart}.${fractionPart}`);
    }
  }

  const integerOnly = sanitized.replace(/\D/g, '');
  return integerOnly ? Number(integerOnly) : NaN;
};

const formatCurrencyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 100;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDateMask = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const parseMaskedDateToIso = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = match[1];
  const month = match[2];
  const year = match[3];
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== Number(year)) return null;
  if (date.getUTCMonth() + 1 !== Number(month)) return null;
  if (date.getUTCDate() !== Number(day)) return null;
  return iso;
};

const createDefaultForm = (): PurchaseForm => ({
  orderNumber: '',
  supplier: 'Fornecedor nao informado',
  brand: '',
  items: '',
  total: '',
  purchaseDate: toInputDate(new Date())
});

const cloneForm = (form: PurchaseForm): PurchaseForm => ({ ...form });
const cloneItems = (items: PurchaseDraftItem[]): PurchaseDraftItem[] =>
  items.map((item) => ({ ...item }));

const normalizeText = (value?: string | null) => value?.trim().toLowerCase() || '';

const getProductImage = (product?: Product | null) => {
  const value = product?.image_url?.trim();
  return value || '';
};

const getProductDigits = (product?: Product | null) => {
  const skuDigits = digitsOnly(product?.sku);
  if (skuDigits) return skuDigits;
  return digitsOnly(product?.barcode);
};

const getProductHeadline = (product?: Product | null) => {
  if (!product) return 'Produto nao encontrado';
  const code = getProductDigits(product);
  if (!code) return product.name;
  return `${code} - ${product.name}`;
};

const getProductMeta = (product?: Product | null) => {
  if (!product) return '';
  const code = getProductDigits(product);
  return `${product.brand || 'Sem marca'}${code ? ` • ${code}` : ''}`;
};

const createPurchaseDraftItem = (product: Product): PurchaseDraftItem => ({
  id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  productId: product.id,
  price: formatCurrency(Math.max(0, toNumber(product.price))),
  expiryDate: '',
  quantity: '1'
});

const formatDateLabel = (value: string) => {
  if (!value) return '--';
  const raw = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const createDraftPurchase = ({
  id,
  form,
  items,
  total,
  createdAt
}: {
  id: string;
  form: PurchaseForm;
  items: number;
  total: number;
  createdAt?: string;
}): Purchase => ({
  id,
  supplier: form.supplier.trim() || 'Fornecedor nao informado',
  status: 'draft',
  total: Math.max(0, total),
  items: Math.max(0, items),
  brand: form.brand.trim() || null,
  order_number: form.orderNumber.trim() || null,
  purchase_date: form.purchaseDate || toInputDate(new Date()),
  created_at: createdAt || new Date().toISOString()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sortPurchases = (purchases: Purchase[]) => {
  return [...purchases].sort((a, b) => {
    const purchaseDateA = a.purchase_date || '';
    const purchaseDateB = b.purchase_date || '';
    if (purchaseDateA !== purchaseDateB) {
      return purchaseDateA < purchaseDateB ? 1 : -1;
    }

    const createdAtA = a.created_at || '';
    const createdAtB = b.created_at || '';
    if (createdAtA === createdAtB) return 0;
    return createdAtA < createdAtB ? 1 : -1;
  });
};

const mergePurchasesKeepingDrafts = (basePurchases: Purchase[], draftPurchases: Purchase[]) => {
  const draftById = new Map(draftPurchases.map((purchase) => [purchase.id, purchase]));
  const merged = [
    ...basePurchases.filter((purchase) => !draftById.has(purchase.id)),
    ...draftPurchases
  ];
  return sortPurchases(merged);
};

const snapshotFromPurchase = (purchase: Purchase): DraftSnapshot => ({
  form: {
    orderNumber: purchase.order_number?.trim() || '',
    supplier: purchase.supplier?.trim() || 'Fornecedor nao informado',
    brand: purchase.brand?.trim() || '',
    items: toNumber(purchase.items) > 0 ? String(toNumber(purchase.items)) : '',
    total: toNumber(purchase.total) > 0 ? formatCurrency(toNumber(purchase.total)) : '',
    purchaseDate: purchase.purchase_date || toInputDate(new Date())
  },
  items: []
});

const parseDraftSnapshot = (value: unknown): DraftSnapshot | null => {
  if (!isRecord(value)) return null;
  if (!isRecord(value.form) || !Array.isArray(value.items)) return null;

  const form = value.form;
  if (
    typeof form.orderNumber !== 'string' ||
    typeof form.supplier !== 'string' ||
    typeof form.brand !== 'string' ||
    typeof form.items !== 'string' ||
    typeof form.total !== 'string' ||
    typeof form.purchaseDate !== 'string'
  ) {
    return null;
  }

  const items: PurchaseDraftItem[] = [];
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.productId !== 'string' ||
      typeof item.price !== 'string' ||
      typeof item.expiryDate !== 'string' ||
      typeof item.quantity !== 'string'
    ) {
      return null;
    }

    items.push({
      id: item.id,
      productId: item.productId,
      price: item.price,
      expiryDate: item.expiryDate,
      quantity: item.quantity
    });
  }

  return {
    form: {
      orderNumber: form.orderNumber,
      supplier: form.supplier,
      brand: form.brand,
      items: form.items,
      total: form.total,
      purchaseDate: form.purchaseDate
    },
    items
  };
};

const parseDraftPurchase = (value: unknown): Purchase | null => {
  if (!isRecord(value)) return null;
  if (value.status !== 'draft') return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;

  const supplier =
    typeof value.supplier === 'string' && value.supplier.trim()
      ? value.supplier
      : 'Fornecedor nao informado';

  const total = typeof value.total === 'number' || typeof value.total === 'string' ? value.total : 0;
  const items = typeof value.items === 'number' || typeof value.items === 'string' ? value.items : 0;
  const brand = typeof value.brand === 'string' ? value.brand : null;
  const orderNumber = typeof value.order_number === 'string' ? value.order_number : null;
  const purchaseDate =
    typeof value.purchase_date === 'string' && value.purchase_date.trim()
      ? value.purchase_date
      : toInputDate(new Date());
  const createdAt =
    typeof value.created_at === 'string' && value.created_at.trim()
      ? value.created_at
      : new Date().toISOString();

  return {
    id: value.id,
    supplier,
    status: 'draft',
    total,
    items,
    brand,
    order_number: orderNumber,
    purchase_date: purchaseDate,
    created_at: createdAt
  };
};

const readPersistedDrafts = () => {
  if (typeof window === 'undefined') {
    return {
      draftPurchases: [] as Purchase[],
      snapshots: {} as Record<string, DraftSnapshot>
    };
  }

  const raw = window.localStorage.getItem(PURCHASE_DRAFTS_STORAGE_KEY);
  if (!raw) {
    return {
      draftPurchases: [] as Purchase[],
      snapshots: {} as Record<string, DraftSnapshot>
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.drafts)) {
      window.localStorage.removeItem(PURCHASE_DRAFTS_STORAGE_KEY);
      return {
        draftPurchases: [] as Purchase[],
        snapshots: {} as Record<string, DraftSnapshot>
      };
    }

    const draftPurchases: Purchase[] = [];
    const snapshots: Record<string, DraftSnapshot> = {};

    for (const entry of parsed.drafts) {
      if (!isRecord(entry)) continue;

      const purchase = parseDraftPurchase(entry.purchase);
      if (!purchase) continue;

      const snapshot = parseDraftSnapshot(entry.snapshot) || snapshotFromPurchase(purchase);
      draftPurchases.push(purchase);
      snapshots[purchase.id] = snapshot;
    }

    return { draftPurchases, snapshots };
  } catch {
    window.localStorage.removeItem(PURCHASE_DRAFTS_STORAGE_KEY);
    return {
      draftPurchases: [] as Purchase[],
      snapshots: {} as Record<string, DraftSnapshot>
    };
  }
};

const persistDrafts = (purchases: Purchase[], draftSnapshots: Record<string, DraftSnapshot>) => {
  if (typeof window === 'undefined') return;

  const draftEntries: PersistedDraftEntry[] = purchases
    .filter((purchase) => purchase.status === 'draft')
    .map((purchase) => ({
      purchase,
      snapshot: draftSnapshots[purchase.id] || snapshotFromPurchase(purchase)
    }));

  if (!draftEntries.length) {
    window.localStorage.removeItem(PURCHASE_DRAFTS_STORAGE_KEY);
    return;
  }

  const payload: PersistedDraftPayload = {
    version: 1,
    drafts: draftEntries
  };
  window.localStorage.setItem(PURCHASE_DRAFTS_STORAGE_KEY, JSON.stringify(payload));
};

export default function PurchasesPanel({
  initialPurchases,
  availableBrands,
  products,
  initialCreateOpen = false
}: PurchasesPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [purchases, setPurchases] = useState<Purchase[]>(initialPurchases);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseStatus>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  const [createStep, setCreateStep] = useState<CreateStep>('basic');
  const [form, setForm] = useState<PurchaseForm>(createDefaultForm());
  const [freight, setFreight] = useState('');
  const [addition, setAddition] = useState('');
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cartao de Credito');
  const [installments, setInstallments] = useState<
    { id: string; dueDate: string; amount: string }[]
  >([{ id: `${Date.now()}`, dueDate: toInputDate(new Date()), amount: '' }]);
  const [basicErrors, setBasicErrors] = useState<{
    brand?: string;
    orderNumber?: string;
    purchaseDate?: string;
  }>({});
  const [purchaseProductQuery, setPurchaseProductQuery] = useState('');
  const [purchaseDraftItems, setPurchaseDraftItems] = useState<PurchaseDraftItem[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftSnapshots, setDraftSnapshots] = useState<Record<string, DraftSnapshot>>({});
  const productSearchRef = useRef<HTMLDivElement>(null);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const viewBrandLogo = resolveBrandLogo(viewPurchase?.brand || null);

  useEffect(() => {
    setPurchases((prev) => {
      const localDrafts = prev.filter((purchase) => purchase.status === 'draft');
      return mergePurchasesKeepingDrafts(initialPurchases, localDrafts);
    });
  }, [initialPurchases]);

  useEffect(() => {
    const { draftPurchases, snapshots } = readPersistedDrafts();
    if (!draftPurchases.length) return;

    setDraftSnapshots((prev) => ({
      ...snapshots,
      ...prev
    }));

    setPurchases((prev) => mergePurchasesKeepingDrafts(prev, draftPurchases));
  }, []);

  useEffect(() => {
    persistDrafts(purchases, draftSnapshots);
  }, [purchases, draftSnapshots]);

  useEffect(() => {
    if (!initialCreateOpen) return;
    setCreateOpen(true);
    setCreateStep('basic');
    setBasicErrors({});
    setPurchaseProductQuery('');
    setPurchaseDraftItems([]);
    setProductSearchOpen(false);
    setFormError(null);
    setActiveDraftId(null);
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('newPurchase')) return;
    params.delete('newPurchase');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [initialCreateOpen, pathname, router, searchParams]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (!(target instanceof Element) || !target.closest('.purchase-actions')) {
        setMenuOpenId(null);
      }

      if (productSearchOpen && !productSearchRef.current?.contains(target)) {
        setProductSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [productSearchOpen]);

  const brands = useMemo(() => {
    const dynamic = purchases
      .map((purchase) => purchase.brand?.trim())
      .filter((brand): brand is string => Boolean(brand));

    return Array.from(new Set([...availableBrands, ...dynamic])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [availableBrands, purchases]);

  const subtotalProducts = useMemo(() => {
    return purchaseDraftItems.reduce((sum, item) => {
      const price = parseCurrencyInput(item.price);
      const qty = Number.parseInt(item.quantity, 10);
      if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return sum;
      return sum + price * qty;
    }, 0);
  }, [purchaseDraftItems]);

  const totalItemsCount = useMemo(
    () =>
      purchaseDraftItems.reduce((sum, item) => {
        const qty = Number.parseInt(item.quantity, 10);
        return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
      }, 0),
    [purchaseDraftItems]
  );

  const freightValue = Number.isFinite(parseCurrencyInput(freight)) ? parseCurrencyInput(freight) : 0;
  const additionValue = Number.isFinite(parseCurrencyInput(addition)) ? parseCurrencyInput(addition) : 0;
  const discountValue = Number.isFinite(parseCurrencyInput(discount)) ? parseCurrencyInput(discount) : 0;
  const purchaseTotal = Math.max(0, subtotalProducts + freightValue + additionValue - discountValue);

  const distributeInstallments = (count: number, total: number, baseDate: string) => {
    if (count <= 0) return [];
    const totalCents = Math.round(total * 100);
    const base = Math.floor(totalCents / count);
    let remainder = totalCents - base * count;
    return Array.from({ length: count }).map((_, index) => {
      const cents = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      return {
        id: `${Date.now()}-${index}`,
        dueDate: baseDate,
        amount: formatCurrency(cents / 100)
      };
    });
  };

  useEffect(() => {
    const baseDate = form.purchaseDate || toInputDate(new Date());
    const count = Math.max(1, installments.length);
    setInstallments(distributeInstallments(count, purchaseTotal, baseDate));
    setForm((prev) => ({
      ...prev,
      items: totalItemsCount > 0 ? String(totalItemsCount) : '',
      total: purchaseTotal > 0 ? formatCurrency(purchaseTotal) : ''
    }));
  }, [purchaseTotal, totalItemsCount, form.purchaseDate]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return purchases.filter((purchase) => {
      const matchesQuery =
        !normalizedQuery ||
        purchase.id.toLowerCase().includes(normalizedQuery) ||
        (purchase.order_number || '').toLowerCase().includes(normalizedQuery) ||
        purchase.supplier.toLowerCase().includes(normalizedQuery) ||
        (purchase.brand || '').toLowerCase().includes(normalizedQuery);

      const matchesStatus = statusFilter === 'all' || purchase.status === statusFilter;
      const matchesBrand =
        brandFilter === 'all' ||
        (purchase.brand || '').trim().toLowerCase() === brandFilter.trim().toLowerCase();

      return matchesQuery && matchesStatus && matchesBrand;
    });
  }, [brandFilter, purchases, query, statusFilter]);

  const availableProducts = useMemo(
    () => products.filter((product) => product.active !== false),
    [products]
  );

  const brandScopedProducts = useMemo(() => {
    const normalizedBrand = normalizeText(form.brand);
    if (!normalizedBrand) return availableProducts;
    return availableProducts.filter(
      (product) => normalizeText(product.brand) === normalizedBrand
    );
  }, [availableProducts, form.brand]);

  const productById = useMemo(
    () => new Map(availableProducts.map((product) => [product.id, product])),
    [availableProducts]
  );

  const selectedProductIds = useMemo(
    () => new Set(purchaseDraftItems.map((item) => item.productId)),
    [purchaseDraftItems]
  );

  const purchaseProductResults = useMemo(() => {
    const normalizedQuery = purchaseProductQuery.trim().toLowerCase();
    const base = brandScopedProducts.filter((product) => !selectedProductIds.has(product.id));
    if (!normalizedQuery) return base;

    return base
      .filter((product) => {
        return (
          product.name.toLowerCase().includes(normalizedQuery) ||
          product.sku.toLowerCase().includes(normalizedQuery) ||
          (product.brand || '').toLowerCase().includes(normalizedQuery) ||
          (product.barcode || '').toLowerCase().includes(normalizedQuery)
        );
      });
  }, [brandScopedProducts, purchaseProductQuery, selectedProductIds]);

  const purchaseItemsCount = useMemo(
    () =>
      purchaseDraftItems.reduce((sum, item) => {
        const quantity = Number.parseInt(item.quantity, 10);
        return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
      }, 0),
    [purchaseDraftItems]
  );

  const purchaseItemsTotal = useMemo(
    () =>
      purchaseDraftItems.reduce((sum, item) => {
        const quantity = Number.parseInt(item.quantity, 10);
        const unitPrice = parseCurrencyInput(item.price);
        if (!Number.isFinite(quantity) || quantity <= 0) return sum;
        if (!Number.isFinite(unitPrice) || unitPrice < 0) return sum;
        return sum + quantity * unitPrice;
      }, 0),
    [purchaseDraftItems]
  );

  useEffect(() => {
    if (!createOpen) return;
    setForm((prev) => {
      const nextItems = purchaseItemsCount > 0 ? String(purchaseItemsCount) : '';
      const nextTotal = purchaseItemsTotal > 0 ? formatCurrency(purchaseItemsTotal) : '';
      if (prev.items === nextItems && prev.total === nextTotal) return prev;
      return {
        ...prev,
        items: nextItems,
        total: nextTotal
      };
    });
  }, [createOpen, purchaseItemsCount, purchaseItemsTotal]);

  useEffect(() => {
    if (!activeDraftId) return;

    const snapshot: DraftSnapshot = {
      form: cloneForm(form),
      items: cloneItems(purchaseDraftItems)
    };

    setDraftSnapshots((prev) => ({
      ...prev,
      [activeDraftId]: snapshot
    }));

    setPurchases((prev) =>
      prev.map((purchase) =>
        purchase.id === activeDraftId
          ? createDraftPurchase({
              id: activeDraftId,
              form,
              items: purchaseItemsCount,
              total: purchaseItemsTotal,
              createdAt: purchase.created_at
            })
          : purchase
      )
    );
  }, [activeDraftId, form, purchaseDraftItems, purchaseItemsCount, purchaseItemsTotal]);

  const closeCreate = (preserveDraft = true) => {
    if (preserveDraft && activeDraftId) {
      const snapshot: DraftSnapshot = {
        form: cloneForm(form),
        items: cloneItems(purchaseDraftItems)
      };
      setDraftSnapshots((prev) => ({
        ...prev,
        [activeDraftId]: snapshot
      }));
      setPurchases((prev) =>
        prev.map((purchase) =>
          purchase.id === activeDraftId
            ? createDraftPurchase({
                id: activeDraftId,
                form,
                items: purchaseItemsCount,
                total: purchaseItemsTotal,
                createdAt: purchase.created_at
              })
            : purchase
        )
      );
    }

    setCreateOpen(false);
    setCreateStep('basic');
    setBasicErrors({});
    setPurchaseProductQuery('');
    setPurchaseDraftItems([]);
    setProductSearchOpen(false);
    setFormError(null);
    setSaving(false);
    setActiveDraftId(null);
    setForm(createDefaultForm());
  };

  const openCreate = () => {
    setForm(createDefaultForm());
    setBasicErrors({});
    setPurchaseProductQuery('');
    setPurchaseDraftItems([]);
    setProductSearchOpen(false);
    setFormError(null);
    setCreateStep('basic');
    setCreateOpen(true);
    setActiveDraftId(null);
  };

  const handleCreateNextStep = () => {
    const nextErrors: { brand?: string; orderNumber?: string; purchaseDate?: string } = {};
    if (!form.brand.trim()) nextErrors.brand = 'Campo obrigatorio';
    if (!form.orderNumber.trim()) nextErrors.orderNumber = 'Campo obrigatorio';
    if (!form.purchaseDate) nextErrors.purchaseDate = 'Campo obrigatorio';
    setBasicErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const draftId =
      activeDraftId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot: DraftSnapshot = {
      form: cloneForm(form),
      items: cloneItems(purchaseDraftItems)
    };

    setDraftSnapshots((prev) => ({
      ...prev,
      [draftId]: snapshot
    }));

    setPurchases((prev) => {
      const existing = prev.find((purchase) => purchase.id === draftId);
      const nextDraft = createDraftPurchase({
        id: draftId,
        form,
        items: purchaseItemsCount,
        total: purchaseItemsTotal,
        createdAt: existing?.created_at
      });
      if (!existing) return [nextDraft, ...prev];
      return prev.map((purchase) => (purchase.id === draftId ? nextDraft : purchase));
    });

    setActiveDraftId(draftId);
    setCreateStep('products');
    setCreateOpen(true);
    setProductSearchOpen(false);
    setPurchaseProductQuery('');
    setFormError(null);
    setMenuOpenId(null);
  };

  const continueDraft = (purchase: Purchase) => {
    const snapshot = draftSnapshots[purchase.id];
    const fallbackForm: PurchaseForm = {
      orderNumber: purchase.order_number?.trim() || '',
      supplier: purchase.supplier?.trim() || 'Fornecedor nao informado',
      brand: purchase.brand?.trim() || '',
      items: toNumber(purchase.items) > 0 ? String(toNumber(purchase.items)) : '',
      total: toNumber(purchase.total) > 0 ? formatCurrency(toNumber(purchase.total)) : '',
      purchaseDate: purchase.purchase_date || toInputDate(new Date())
    };

    setForm(snapshot ? cloneForm(snapshot.form) : fallbackForm);
    setPurchaseDraftItems(snapshot ? cloneItems(snapshot.items) : []);
    setPurchaseProductQuery('');
    setProductSearchOpen(false);
    setBasicErrors({});
    setFormError(null);
    setCreateStep('products');
    setCreateOpen(true);
    setActiveDraftId(purchase.id);
    setMenuOpenId(null);
  };

  const discardDraft = (draftId: string) => {
    setPurchases((prev) => prev.filter((purchase) => purchase.id !== draftId));
    setDraftSnapshots((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
    if (activeDraftId === draftId) {
      setActiveDraftId(null);
      setCreateOpen(false);
      setCreateStep('basic');
      setPurchaseDraftItems([]);
      setPurchaseProductQuery('');
      setForm(createDefaultForm());
      setFormError(null);
    }
    setMenuOpenId(null);
  };

  const handleProductSearchSelect = (product: Product) => {
    setPurchaseDraftItems((prev) => [...prev, createPurchaseDraftItem(product)]);
    setPurchaseProductQuery('');
    setProductSearchOpen(true);
    setFormError(null);
  };

  const handleProductsNextStep = () => {
    if (purchaseDraftItems.length <= 0) {
      setFormError('Inclua ao menos um produto.');
      return;
    }
    setFormError(null);
    setCreateStep('details');
  };

  const updateDraftItem = (itemId: string, updater: (item: PurchaseDraftItem) => PurchaseDraftItem) => {
    setPurchaseDraftItems((prev) =>
      prev.map((item) => (item.id === itemId ? updater(item) : item))
    );
  };

  const handleDraftQuantityChange = (itemId: string, value: string) => {
    const normalized = value.replace(/[^\d]/g, '');
    updateDraftItem(itemId, (item) => ({
      ...item,
      quantity: normalized
    }));
  };

  const adjustDraftQuantity = (itemId: string, delta: number) => {
    updateDraftItem(itemId, (item) => {
      const base = Number.parseInt(item.quantity, 10);
      const next = Math.max(1, (Number.isFinite(base) && base > 0 ? base : 1) + delta);
      return {
        ...item,
        quantity: String(next)
      };
    });
  };

  const removeDraftItem = (itemId: string) => {
    setPurchaseDraftItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleCreatePurchase = async () => {
    const supplier = form.supplier.trim() || 'Fornecedor nao informado';
    const items = totalItemsCount;
    const total = purchaseTotal;
    const purchaseItems: PurchasePayloadItem[] = [];

    if (purchaseDraftItems.length <= 0) {
      setFormError('Inclua ao menos um produto.');
      return;
    }

    for (const draftItem of purchaseDraftItems) {
      const quantity = Number.parseInt(draftItem.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setFormError('Informe uma quantidade valida para todos os produtos.');
        return;
      }

      const unitCost = parseCurrencyInput(draftItem.price);
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        setFormError('Informe um preco valido para todos os produtos.');
        return;
      }

      let expiresAt: string | undefined;
      if (draftItem.expiryDate.trim()) {
        const parsedDate = parseMaskedDateToIso(draftItem.expiryDate);
        if (!parsedDate) {
          setFormError('Informe uma validade no formato dd/mm/aaaa.');
          return;
        }
        expiresAt = parsedDate;
      }

      purchaseItems.push({
        productId: draftItem.productId,
        quantity,
        unitCost,
        expiresAt
      });
    }

    if (!Number.isInteger(items) || items <= 0) {
      setFormError('Informe uma quantidade de itens valida.');
      return;
    }

    if (!Number.isFinite(total) || total <= 0) {
      setFormError('Informe um valor total valido.');
      return;
    }

    if (!form.purchaseDate) {
      setFormError('Informe a data da compra.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch(`${API_BASE}/purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier,
          items,
          total,
          brand: form.brand.trim() || undefined,
          purchaseDate: form.purchaseDate,
          status: 'pending',
          purchaseItems
        })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setFormError(payload?.message || 'Erro ao criar compra.');
        return;
      }

      const payload = (await res.json()) as { data?: Purchase };
      if (!payload.data) {
        setFormError('Erro ao criar compra.');
        return;
      }

      const createdPurchase = payload.data;
      if (createdPurchase && purchaseDraftItems.length > 0) {
        setDraftSnapshots((prev) => ({
          ...prev,
          [createdPurchase.id]: {
            form: cloneForm(form),
            items: cloneItems(purchaseDraftItems)
          }
        }));
      }

      if (activeDraftId) {
        setPurchases((prev) => [payload.data as Purchase, ...prev.filter((purchase) => purchase.id !== activeDraftId)]);
        setDraftSnapshots((prev) => {
          const next = { ...prev };
          delete next[activeDraftId];
          return next;
        });
      } else {
        setPurchases((prev) => [payload.data as Purchase, ...prev]);
      }

      setForm(createDefaultForm());
      closeCreate(false);
    } catch {
      setFormError('Erro ao criar compra.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateModalKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') return;
    if (event.defaultPrevented) return;
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (saving) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName.toLowerCase() === 'textarea') return;

    event.preventDefault();

    if (createStep === 'basic') {
      handleCreateNextStep();
      return;
    }

    if (createStep === 'products') {
      if (target.closest('.purchase-create-search-field') && purchaseProductResults.length > 0) {
        handleProductSearchSelect(purchaseProductResults[0]);
        return;
      }
      handleProductsNextStep();
      return;
    }

    if (createStep === 'details') {
      void handleCreatePurchase();
    }
  };

  const updateStatus = async (purchase: Purchase, status: Exclude<PurchaseStatus, 'draft'>) => {
    setActionError(null);
    setProcessingId(purchase.id);
    setMenuOpenId(null);

    try {
      const res = await fetch(`${API_BASE}/purchases/${purchase.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(payload?.message || 'Erro ao atualizar status da compra.');
        return;
      }

      setPurchases((prev) =>
        prev.map((item) => (item.id === purchase.id ? { ...item, status } : item))
      );
    } catch {
      setActionError('Erro ao atualizar status da compra.');
    } finally {
      setProcessingId(null);
    }
  };

  const removePurchase = async (purchase: Purchase) => {
    setActionError(null);
    setProcessingId(purchase.id);
    setMenuOpenId(null);

    try {
      const res = await fetch(`${API_BASE}/purchases/${purchase.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setActionError(payload?.message || 'Erro ao excluir compra.');
        return;
      }

      setPurchases((prev) => prev.filter((item) => item.id !== purchase.id));
    } catch {
      setActionError('Erro ao excluir compra.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      <section className="panel filters-panel-static purchases-filters-panel">
      <div className="toolbar">
        <div className="search">
          <span>🔍</span>
          <input
            placeholder="Buscar por numero do pedido..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="toolbar-group purchases-toolbar-group">
          <label className="select">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | PurchaseStatus)}
            >
              <option value="all">Todos os status</option>
              <option value="draft">Rascunhos</option>
              <option value="pending">Pendentes</option>
              <option value="received">Recebidos</option>
              <option value="cancelled">Cancelados</option>
            </select>
            <strong>▾</strong>
          </label>

          <label className="select">
            <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value="all">Todas as marcas</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <strong>▾</strong>
          </label>

          <DateRangePicker defaultPreset="28d" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🛒</div>
          <strong>Nenhuma compra encontrada</strong>
          <span>Adicione compras para acompanhar custos e abastecimento.</span>
          <button type="button" className="button primary" onClick={openCreate}>
            <IconPlus /> Nova compra
          </button>
        </div>
      ) : (
        <div className="data-list">
          <div className="data-row header purchases-data-head">
            <span>Numero</span>
            <span>Marcas</span>
            <span>Data</span>
            <span>Total</span>
            <span>Status</span>
            <span />
          </div>

          {filtered.map((purchase) => {
            const purchaseNumber =
              purchase.order_number?.trim() || purchase.id.slice(0, 4).toUpperCase();
            const brandLogo = resolveBrandLogo(purchase.brand || null);
            return (
              <div key={purchase.id} className="data-row purchase-data-row">
                <div className="purchase-cell purchase-cell-main">
                  <span className="purchase-cell-label">Numero</span>
                  <strong className="purchase-cell-value">N.° {purchaseNumber}</strong>
                </div>
                <div className="purchase-cell">
                  <span className="purchase-cell-label">Marca</span>
                  <span className="purchase-cell-value">
                    <span className="purchase-brand">
                      {brandLogo ? (
                        <img className="purchase-brand-logo" src={brandLogo} alt={purchase.brand || 'Marca'} />
                      ) : (
                        <span className="purchase-brand-initials">
                          {(purchase.brand || '–').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="purchase-brand-name">{purchase.brand || '--'}</span>
                    </span>
                  </span>
                </div>
                <div className="purchase-cell">
                  <span className="purchase-cell-label">Data</span>
                  <span className="purchase-cell-value data-cell mono">
                    {formatDateLabel(purchase.purchase_date || purchase.created_at)}
                  </span>
                </div>
                <div className="purchase-cell">
                  <span className="purchase-cell-label">Total</span>
                  <span className="purchase-cell-value data-cell mono">
                    {formatCurrency(toNumber(purchase.total))}
                  </span>
                </div>
                <div className="purchase-cell purchase-cell-status">
                  <span className="purchase-cell-label">Status</span>
                  <span className={`badge ${statusBadge(purchase.status)}`}>{statusLabel(purchase.status)}</span>
                </div>
                <div className="purchase-actions-cell">
                  <div className="purchase-actions">
                    <button
                      type="button"
                      className={`button icon small${menuOpenId === purchase.id ? ' active' : ''}`}
                      aria-label="Acoes"
                      onClick={() => setMenuOpenId((current) => (current === purchase.id ? null : purchase.id))}
                      disabled={processingId === purchase.id}
                    >
                      <IconDots />
                    </button>

                    {menuOpenId === purchase.id ? (
                      <div className="purchase-menu">
                        {purchase.status === 'draft' ? (
                          <>
                            <button type="button" onClick={() => continueDraft(purchase)}>
                              <IconEdit /> Continuar criando
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => discardDraft(purchase.id)}
                            >
                              <IconTrash /> Descartar rascunho
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => setViewPurchase(purchase)}>
                              Visualizar compra
                            </button>
                            <button type="button" className="danger" onClick={() => removePurchase(purchase)}>
                              <IconTrash /> Excluir pedido
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actionError ? <div className="field-error purchase-action-error">{actionError}</div> : null}

      {createOpen ? (
        <div className="modal-backdrop" onClick={() => closeCreate()}>
          <div
            className="modal modal-purchase-create"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleCreateModalKeyDown}
          >
            <div className="modal-header">
              <h3>Nova compra</h3>
              <button className="modal-close" type="button" onClick={() => closeCreate()}>
                ✕
              </button>
            </div>

            {createStep === 'basic' ? (
              <div className="purchase-create-step">
                <label className="modal-field">
                  <span>Marca(s)</span>
                  <select
                    className={basicErrors.brand ? 'input-error' : ''}
                    value={form.brand}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((prev) => ({ ...prev, brand: value }));
                      setBasicErrors((prev) => ({ ...prev, brand: undefined }));
                    }}
                  >
                    <option value="">Selecione</option>
                    {brands.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                  {basicErrors.brand ? <span className="field-error">{basicErrors.brand}</span> : null}
                </label>

                <label className="modal-field">
                  <span>Numero do pedido</span>
                  <input
                    className={basicErrors.orderNumber ? 'input-error' : ''}
                    value={form.orderNumber}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((prev) => ({ ...prev, orderNumber: value }));
                      setBasicErrors((prev) => ({ ...prev, orderNumber: undefined }));
                    }}
                  />
                  {basicErrors.orderNumber ? (
                    <span className="field-error">{basicErrors.orderNumber}</span>
                  ) : null}
                </label>

                <label className="modal-field">
                  <span>Data do pedido</span>
                  <input
                    className={basicErrors.purchaseDate ? 'input-error' : ''}
                    type="date"
                    value={form.purchaseDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((prev) => ({ ...prev, purchaseDate: value }));
                      setBasicErrors((prev) => ({ ...prev, purchaseDate: undefined }));
                    }}
                  />
                  {basicErrors.purchaseDate ? (
                    <span className="field-error">{basicErrors.purchaseDate}</span>
                  ) : null}
                </label>
              </div>
            ) : null}

            {createStep === 'products' ? (
              <div className="purchase-create-step purchase-create-products">
                <div ref={productSearchRef} className="purchase-create-search">
                  <label className="purchase-create-search-field">
                    <input
                      placeholder="Busque usando o nome, codigo da marca ou codigo de barras"
                      value={purchaseProductQuery}
                      onFocus={() => setProductSearchOpen(true)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPurchaseProductQuery(value);
                        setProductSearchOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        if (purchaseProductResults.length <= 0) return;
                        event.preventDefault();
                        handleProductSearchSelect(purchaseProductResults[0]);
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Buscar produtos"
                      onClick={() => setProductSearchOpen(true)}
                    >
                      ⌕
                    </button>
                  </label>

                  {productSearchOpen ? (
                    <div className="purchase-create-search-results">
                      {purchaseProductResults.length === 0 ? (
                        <span className="meta">Nenhum produto encontrado para a marca selecionada.</span>
                      ) : (
                        purchaseProductResults.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            className="purchase-search-result"
                            onClick={() => handleProductSearchSelect(product)}
                          >
                            <strong>{getProductHeadline(product)}</strong>
                            <span>{getProductMeta(product)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>

                {purchaseDraftItems.length <= 0 ? (
                  <div className="purchase-create-products-empty">
                    <span className="purchase-create-products-empty-icon" aria-hidden="true">
                      <IconBox />
                    </span>
                    <strong>Nenhum produto incluido</strong>
                    <span>Busque por um produto usando o nome, codigo da marca ou codigo de barras.</span>
                  </div>
                ) : (
                  <div className="purchase-create-products-table">
                    <div className="purchase-create-products-head">
                      <span>Produto</span>
                      <span>Preco</span>
                      <span>Validade</span>
                      <span>Quantidade</span>
                      <span />
                    </div>

                    <div className="purchase-create-products-list">
                      {purchaseDraftItems.map((item) => {
                        const product = productById.get(item.productId) || null;
                        return (
                          <article key={item.id} className="purchase-create-product-row">
                            <div className="purchase-create-product-main">
                              <div className="purchase-create-product-thumb">
                                {getProductImage(product) ? (
                                  <img
                                    className="product-thumb-image"
                                    src={getProductImage(product)}
                                    alt={product?.name || 'Produto'}
                                  />
                                ) : (
                                  <span className="product-thumb-placeholder" aria-hidden="true">
                                    <IconBox />
                                  </span>
                                )}
                              </div>
                              <div className="purchase-create-product-meta">
                                <strong>{getProductHeadline(product)}</strong>
                                <span>{getProductMeta(product)}</span>
                              </div>
                            </div>

                            <label className="purchase-create-product-input">
                              <input
                                value={item.price}
                                inputMode="decimal"
                                placeholder="R$ 0,00"
                                onChange={(event) =>
                                  updateDraftItem(item.id, (current) => ({
                                    ...current,
                                    price: formatCurrencyInput(event.target.value)
                                  }))
                                }
                              />
                            </label>

                            <label className="purchase-create-product-input">
                              <input
                                value={item.expiryDate}
                                inputMode="numeric"
                                maxLength={10}
                                placeholder="dd/mm/aaaa"
                                onChange={(event) =>
                                  updateDraftItem(item.id, (current) => ({
                                    ...current,
                                    expiryDate: formatDateMask(event.target.value)
                                  }))
                                }
                              />
                            </label>

                            <div className="purchase-create-product-qty">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(event) => handleDraftQuantityChange(item.id, event.target.value)}
                              />
                              <div className="purchase-create-product-qty-actions">
                                <button
                                  type="button"
                                  aria-label="Aumentar quantidade"
                                  onClick={() => adjustDraftQuantity(item.id, 1)}
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  aria-label="Diminuir quantidade"
                                  onClick={() => adjustDraftQuantity(item.id, -1)}
                                >
                                  ▼
                                </button>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="purchase-create-product-remove"
                              aria-label="Remover produto"
                              onClick={() => removeDraftItem(item.id)}
                            >
                              <IconTrash />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {createStep === 'details' ? (
              <div className="purchase-create-step purchase-create-details">
                <div className="purchase-details-grid">
                  <div className="purchase-details-left">
                    <label className="modal-field">
                      <span>Valor de frete</span>
                      <input
                        value={freight}
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        onChange={(event) => setFreight(formatCurrencyInput(event.target.value))}
                      />
                    </label>
                    <label className="modal-field">
                      <span>(+) Acrescimos</span>
                      <input
                        value={addition}
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        onChange={(event) => setAddition(formatCurrencyInput(event.target.value))}
                      />
                    </label>
                    <label className="modal-field">
                      <span>(-) Descontos</span>
                      <input
                        value={discount}
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        onChange={(event) => setDiscount(formatCurrencyInput(event.target.value))}
                      />
                    </label>
                    <div className="purchase-financial-summary">
                      <div className="purchase-summary-row">
                        <span>Total em produtos:</span>
                        <strong>{formatCurrency(subtotalProducts)}</strong>
                      </div>
                      <div className="purchase-summary-row total">
                        <span>Valor final:</span>
                        <strong>{formatCurrency(purchaseTotal)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="purchase-details-right">
                    <label className="modal-field">
                      <span>Forma do pagamento</span>
                      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                        <option value="Cartao de Credito">Cartao de Credito</option>
                        <option value="Cartao de Debito">Cartao de Debito</option>
                        <option value="Pix">Pix</option>
                        <option value="Boleto">Boleto</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="TED/DOC">TED/DOC</option>
                      </select>
                    </label>

                    <div className="purchase-installments">
                      <div className="purchase-installments-header">
                        <strong>Parcelas</strong>
                        <div className="purchase-installments-actions">
                          <button
                            type="button"
                            aria-label="Diminuir parcelas"
                            onClick={() =>
                              setInstallments((prev) => {
                                const next = Math.max(1, prev.length - 1);
                                return distributeInstallments(next, purchaseTotal, form.purchaseDate || toInputDate(new Date()));
                              })
                            }
                          >
                            −
                          </button>
                          <span>{installments.length}</span>
                          <button
                            type="button"
                            aria-label="Aumentar parcelas"
                            onClick={() =>
                              setInstallments((prev) => {
                                const next = Math.min(12, prev.length + 1);
                                return distributeInstallments(next, purchaseTotal, form.purchaseDate || toInputDate(new Date()));
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="purchase-installments-list">
                        {installments.map((item, index) => (
                          <div key={item.id} className="purchase-installment-row">
                            <div className="purchase-installment-index">{index + 1}</div>
                            <label>
                              <span>Vencimento</span>
                              <input
                                type="date"
                                value={item.dueDate}
                                onChange={(event) =>
                                  setInstallments((prev) =>
                                    prev.map((inst) =>
                                      inst.id === item.id ? { ...inst, dueDate: event.target.value } : inst
                                    )
                                  )
                                }
                              />
                            </label>
                            <label>
                              <span>Valor</span>
                              <input
                                value={item.amount}
                                inputMode="decimal"
                                placeholder="R$ 0,00"
                                onChange={(event) =>
                                  setInstallments((prev) =>
                                    prev.map((inst) =>
                                      inst.id === item.id
                                        ? { ...inst, amount: formatCurrencyInput(event.target.value) }
                                        : inst
                                    )
                                  )
                                }
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {formError ? <div className="field-error">{formError}</div> : null}

            <div className="modal-footer purchase-create-actions">
              {createStep === 'basic' ? (
                <>
                  <button className="button ghost" type="button" onClick={() => closeCreate()}>
                    Cancelar
                  </button>
                  <button className="button primary purchase-create-next" type="button" onClick={handleCreateNextStep}>
                    Proximo
                  </button>
                </>
              ) : null}

              {createStep === 'products' ? (
                <>
                  <button className="button ghost" type="button" onClick={() => closeCreate()}>
                    Voltar
                  </button>
                  <button className="button primary purchase-create-next" type="button" onClick={handleProductsNextStep}>
                    Proximo
                  </button>
                </>
              ) : null}

              {createStep === 'details' ? (
                <>
                  <button className="button ghost" type="button" onClick={() => setCreateStep('products')}>
                    Voltar
                  </button>
                  <button className="button primary" type="button" onClick={handleCreatePurchase} disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar compra'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </section>

      {viewPurchase ? (
        <div className="modal-backdrop" onClick={() => setViewPurchase(null)}>
          <div className="modal modal-purchase-view" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header purchase-view-header">
              <h3>Compra N.º {viewPurchase.order_number || viewPurchase.id.slice(0, 6)}</h3>
              <button className="modal-close" type="button" onClick={() => setViewPurchase(null)}>
                ✕
              </button>
            </div>

            <div className="purchase-view-grid">
              <section className="purchase-view-section">
                <h4>Informacoes gerais</h4>
                <div className="divider" />
                <div className="purchase-view-field">
                  <span>Marcas</span>
                  <div className="brand-chip">
                    {viewBrandLogo ? (
                      <img className="brand-logo-img" src={viewBrandLogo} alt={viewPurchase.brand || 'Marca'} />
                    ) : (
                      <span className="brand-initials">
                        {(viewPurchase.brand || '–').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <strong>{viewPurchase.brand || '—'}</strong>
                  </div>
                </div>
                <div className="purchase-view-field">
                  <span>N.º do pedido</span>
                  <strong>{viewPurchase.order_number || viewPurchase.id.slice(0, 6)}</strong>
                </div>
                <div className="purchase-view-field">
                  <span>Data</span>
                  <strong>{formatDateLabel(viewPurchase.purchase_date || viewPurchase.created_at)}</strong>
                </div>

                <h4>Produtos</h4>
                <div className="divider" />
                <div className="purchase-view-products">
                  {draftSnapshots[viewPurchase.id]?.items.length ? (
                    draftSnapshots[viewPurchase.id].items.map((item) => {
                      const product = productById.get(item.productId) || null;
                      return (
                        <div key={item.id} className="purchase-view-product">
                          <div className="purchase-view-product-thumb">
                            {getProductImage(product) ? (
                              <img className="product-thumb-image" src={getProductImage(product)} alt={product?.name || 'Produto'} />
                            ) : (
                              <span className="product-thumb-placeholder" aria-hidden="true">
                                <IconBox />
                              </span>
                            )}
                          </div>
                          <div className="purchase-view-product-info">
                            <strong>{getProductHeadline(product)}</strong>
                            <span className="muted">
                              {item.quantity || '1'} un. - {item.price || 'R$ 0,00'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <span className="muted">Produtos não disponiveis.</span>
                  )}
                </div>
              </section>

              <section className="purchase-view-section purchase-view-summary">
                <h4>Resumo Financeiro</h4>
                <div className="divider" />
                <div className="purchase-view-field">
                  <span>Subtotal dos produtos</span>
                  <strong>{formatCurrency(toNumber(viewPurchase.total))}</strong>
                </div>
                <div className="purchase-view-field">
                  <span>Frete</span>
                  <strong>R$ 0,00</strong>
                </div>
                <div className="purchase-view-field">
                  <span>Desconto</span>
                  <strong>R$ 0,00</strong>
                </div>
                <div className="purchase-view-field">
                  <span>Adicional</span>
                  <strong>R$ 0,00</strong>
                </div>
                <div className="divider" />
                <div className="purchase-view-field total">
                  <span>Total</span>
                  <strong className="accent">{formatCurrency(toNumber(viewPurchase.total))}</strong>
                </div>

                <h4>Pagamento</h4>
                <div className="divider" />
                <div className="purchase-payment-card">
                  <div>
                    <strong>Cartao de Credito</strong>
                    <span className="muted">Parcela 1 de 1</span>
                    <div className="purchase-payment-date">
                      {formatDateLabel(viewPurchase.purchase_date || viewPurchase.created_at)}
                    </div>
                  </div>
                  <div className="purchase-payment-right">
                    <strong>{formatCurrency(toNumber(viewPurchase.total))}</strong>
                    <span className={`badge ${viewPurchase.status === 'pending' ? 'pending' : 'success'}`}>
                      {viewPurchase.status === 'pending' ? 'PENDENTE' : 'RECEBIDO'}
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <div className="modal-footer purchase-view-actions">
              <button className="button ghost" type="button" onClick={() => setViewPurchase(null)}>
                Fechar
              </button>
              <button
                className="button danger"
                type="button"
                onClick={() => {
                  setViewPurchase(null);
                  removePurchase(viewPurchase);
                }}
                disabled={processingId === viewPurchase.id}
              >
                {processingId === viewPurchase.id ? 'Excluindo...' : 'Excluir pedido'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
