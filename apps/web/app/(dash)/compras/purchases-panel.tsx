'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { IconBox, IconDots, IconEdit, IconPlus, IconTrash } from '../icons';
import { API_BASE, formatCurrency, toNumber } from '../lib';
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

type DraftSnapshot = {
  form: PurchaseForm;
  items: PurchaseDraftItem[];
};

type CreateStep = 'basic' | 'products' | 'details';

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

const getProductHeadline = (product?: Product | null) => {
  if (!product) return 'Produto nao encontrado';
  if (!product.sku) return product.name;
  return `${product.sku} - ${product.name}`;
};

const getProductMeta = (product?: Product | null) => {
  if (!product) return '';
  const code = product.barcode || product.sku || '';
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

  useEffect(() => {
    setPurchases(initialPurchases);
  }, [initialPurchases]);

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
    if (!normalizedQuery) return base.slice(0, 12);

    return base
      .filter((product) => {
        return (
          product.name.toLowerCase().includes(normalizedQuery) ||
          product.sku.toLowerCase().includes(normalizedQuery) ||
          (product.brand || '').toLowerCase().includes(normalizedQuery) ||
          (product.barcode || '').toLowerCase().includes(normalizedQuery)
        );
      })
      .slice(0, 12);
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
    const items = Number(form.items);
    const total = parseCurrencyInput(form.total);

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
          status: 'pending'
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
            return (
              <div key={purchase.id} className="data-row purchase-data-row">
                <div>
                  <strong>N.° {purchaseNumber}</strong>
                </div>
                <div>{purchase.brand || '--'}</div>
                <div className="data-cell mono">{formatDateLabel(purchase.purchase_date || purchase.created_at)}</div>
                <div className="data-cell mono">{formatCurrency(toNumber(purchase.total))}</div>
                <span className={`badge ${statusBadge(purchase.status)}`}>{statusLabel(purchase.status)}</span>
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
                            <button type="button" onClick={() => updateStatus(purchase, 'pending')}>
                              Marcar pendente
                            </button>
                            <button type="button" onClick={() => updateStatus(purchase, 'received')}>
                              Marcar recebido
                            </button>
                            <button type="button" onClick={() => updateStatus(purchase, 'cancelled')}>
                              Marcar cancelado
                            </button>
                            <button type="button" className="danger" onClick={() => removePurchase(purchase)}>
                              <IconTrash /> Excluir
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
          <div className="modal modal-purchase-create" onClick={(event) => event.stopPropagation()}>
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
              <div className="purchase-create-step">
                <div className="purchase-create-summary">
                  <strong>Pedido {form.orderNumber}</strong>
                  <span>{form.brand}</span>
                </div>
                <label className="modal-field">
                  <span>Itens</span>
                  <input
                    value={form.items}
                    onChange={(event) => setForm((prev) => ({ ...prev, items: event.target.value }))}
                    placeholder="Quantidade"
                  />
                </label>

                <label className="modal-field">
                  <span>Total da compra</span>
                  <input
                    value={form.total}
                    onChange={(event) => setForm((prev) => ({ ...prev, total: event.target.value }))}
                    placeholder="0,00"
                  />
                </label>
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
  );
}
