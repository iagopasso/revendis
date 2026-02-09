'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  IconDots,
  IconEdit,
  IconGrid,
  IconList,
  IconPlus,
  IconTrash,
  IconUpload
} from '../icons';
import SalesDetailModal, { type SaleDetail, type SaleUpdate } from '../sales-detail-modal';
import { API_BASE, formatCurrency, toNumber } from '../lib';

type Product = {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  price: number | string;
  active: boolean;
  quantity?: number | string;
  expires_at?: string | null;
  category_id?: string | null;
};

type StockOption = { label: string; value: string };

type Category = { id: string; name: string; color?: string | null };

type InventoryUnit = {
  id: string;
  product_id: string;
  cost: number | string;
  expires_at?: string | null;
  status: 'available' | 'sold' | 'inactive';
  sale_id?: string | null;
  sale_item_id?: string | null;
  created_at?: string;
  sold_at?: string | null;
};

type ProductSale = {
  sale_id: string;
  status: string;
  total: number | string;
  created_at: string;
  customer_name?: string | null;
  quantity: number | string;
  price: number | string;
  sku: string;
  payment_status?: 'paid' | 'pending';
};

type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string | null;
  birth_date?: string | null;
  description?: string | null;
  photo_url?: string | null;
  cpf_cnpj?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  tags?: string[] | null;
};

type CustomerDraft = {
  photoUrl: string;
  name: string;
  birthDate: string;
  whatsapp: string;
  description: string;
  tagsInput: string;
  tags: string[];
  cpfCnpj: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ProductDraft = {
  name: string;
  brand: string;
  brandCode: string;
  category: string;
  price: string;
  barcode: string;
  imageUrl: string;
  available: boolean;
};

type InstallmentInput = {
  id: string;
  dueDate: string;
  amount: string;
};

type InventoryPanelProps = {
  products: Product[];
  productCount: number;
  totalUnits: number;
  productsLength: number;
  categories: Category[];
  categoryFilter: string;
  brands: string[];
  brandFilter: string;
  query: string;
  stockFilter: string;
  stockOptions: StockOption[];
  basePath: string;
  baseParams: Record<string, string>;
  viewParam: string;
};

const suggestions = [
  {
    id: '1',
    name: '174929 - Footworks Creme Hidratante para os Pes Noturno',
    brand: 'Avon',
    brandCode: '174929'
  },
  {
    id: '2',
    name: '1 Garrafa Aquavibe Motivacional 2 L + 3 Garrafas Eco Tupper Plus 500 ml',
    brand: 'Tupper',
    brandCode: 'TP-200'
  },
  { id: '3', name: '1 TOUCH FRESH QUAD 1,2L BORDEA', brand: 'Tupper', brandCode: 'TF-120' },
  { id: '4', name: '1 TOUCH FRESH QUAD 370ML BORD', brand: 'Tupper', brandCode: 'TF-037' },
  { id: '5', name: '1 TOUCH FRESH QUAD 810ML BORD', brand: 'Tupper', brandCode: 'TF-081' },
  { id: '6', name: '1 TOUCH FRESH RET 2,85L BORDEA', brand: 'Tupper', brandCode: 'TF-285' },
  {
    id: '7',
    name: '2 de 250 ml (1 Ouro e 1 Morango) + 1 de 740 ml + 1 de 3,5 L',
    brand: 'Natura',
    brandCode: 'NT-250'
  }
];

const paymentMethods = [
  'Dinheiro',
  'Cartao de Credito',
  'Cartao de Debito',
  'Cheque',
  'Pix',
  'Boleto',
  'TED/DOC',
  'App de Pagamento'
];

const buildSampleImage = (label: string, primary: string, secondary: string) => {
  const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 200 200\">\n  <rect width=\"200\" height=\"200\" rx=\"24\" fill=\"#0f172a\"/>\n  <rect x=\"50\" y=\"26\" width=\"100\" height=\"148\" rx=\"18\" fill=\"${primary}\"/>\n  <rect x=\"68\" y=\"48\" width=\"64\" height=\"84\" rx=\"10\" fill=\"${secondary}\"/>\n  <rect x=\"78\" y=\"140\" width=\"44\" height=\"10\" rx=\"5\" fill=\"#0f172a\" opacity=\"0.2\"/>\n  <text x=\"100\" y=\"168\" font-size=\"16\" text-anchor=\"middle\" fill=\"#e2e8f0\" font-family=\"Arial, sans-serif\">${label}</text>\n</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const sampleImages = [
  { id: 'sample-1', label: 'LO', url: buildSampleImage('LO', '#8b5cf6', '#e2e8f0') },
  { id: 'sample-2', label: 'CX', url: buildSampleImage('CX', '#38bdf8', '#e2e8f0') },
  { id: 'sample-3', label: 'PF', url: buildSampleImage('PF', '#f472b6', '#e2e8f0') },
  { id: 'sample-4', label: 'SN', url: buildSampleImage('SN', '#fbbf24', '#111827') }
];

const emptyDraft: ProductDraft = {
  name: '',
  brand: '',
  brandCode: '',
  category: '',
  price: '',
  barcode: '',
  imageUrl: '',
  available: true
};

const customerTagSuggestions = ['VIP', 'Frequente', 'Atacado', 'Recompra', 'Indicacao'];

const emptyCustomerDraft: CustomerDraft = {
  photoUrl: '',
  name: '',
  birthDate: '',
  whatsapp: '',
  description: '',
  tagsInput: '',
  tags: [],
  cpfCnpj: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: ''
};

const EXPIRING_DAYS = 7;
const LOW_STOCK_THRESHOLD = 2;

const getDaysUntil = (value?: string | null) => {
  if (!value) return null;
  const expiresAt = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = expiresAt.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const getStockBadge = (quantity: number, active: boolean) => {
  if (!active || quantity <= 0) return 'Sem estoque';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'Acabando';
  return 'Com estoque';
};

const getStockTone = (quantity: number, active: boolean) => {
  if (!active || quantity <= 0) return 'danger';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'warn';
  return 'success';
};

const uniqueBrands = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const formatShortDate = (value?: string | null) => {
  if (!value) return '-';
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .toUpperCase();
};

const formatPhoneInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCpfCnpjInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const formatCepInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const toIsoDate = (value: Date) => value.toISOString().split('T')[0];

const addMonths = (dateValue: string, months: number) => {
  const base = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(base.getTime())) return dateValue;
  base.setMonth(base.getMonth() + months);
  return base.toISOString().split('T')[0];
};

const buildInstallments = (count: number, total: number, startDate: string): InstallmentInput[] => {
  if (count <= 0 || total <= 0) return [];
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }).map((_, index) => {
    const cents = base + (index < remainder ? 1 : 0);
    return {
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      dueDate: addMonths(startDate, index),
      amount: (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    };
  });
};

const getProductImage = (product?: Product | null) => {
  if (!product) return '';
  return product.image_url || '';
};

const getProductCode = (product?: Product | null) => {
  if (!product) return '';
  return product.barcode || product.sku || '';
};

const getProductHeadline = (product?: Product | null) => {
  if (!product) return '';
  return `${getProductCode(product)} - ${product.name}`;
};

const getProductMetaLine = (product?: Product | null) => {
  if (!product) return '';
  return `${product.brand || 'Sem marca'} • ${getProductCode(product)}`;
};

const getProductInitials = (product?: Product | null) => {
  if (!product) return 'P';
  const parts = product.name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || product.name.slice(0, 2).toUpperCase();
};

export default function InventoryPanel({
  products,
  productCount,
  totalUnits,
  productsLength,
  categories,
  categoryFilter,
  brands,
  brandFilter,
  query,
  stockFilter,
  stockOptions,
  basePath,
  baseParams,
  viewParam
}: InventoryPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openCreate, setOpenCreate] = useState(false);
  const [createStep, setCreateStep] = useState<'search' | 'form'>('search');
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formDraft, setFormDraft] = useState<ProductDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openImport, setOpenImport] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productTab, setProductTab] = useState<'estoque' | 'vendas'>('estoque');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [unitQuantity, setUnitQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [unitExpiry, setUnitExpiry] = useState('');
  const [productUnits, setProductUnits] = useState<InventoryUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [productSales, setProductSales] = useState<ProductSale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [unitMenuOpenId, setUnitMenuOpenId] = useState<string | null>(null);
  const [sellUnit, setSellUnit] = useState<InventoryUnit | null>(null);
  const [sellCustomerName, setSellCustomerName] = useState('');
  const [sellCustomerQuery, setSellCustomerQuery] = useState('');
  const [sellCustomerId, setSellCustomerId] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellDate, setSellDate] = useState(toIsoDate(new Date()));
  const [sellPaid, setSellPaid] = useState(false);
  const [sellPaymentOpen, setSellPaymentOpen] = useState(false);
  const [sellRegisterAmount, setSellRegisterAmount] = useState('');
  const [sellRegisterMethod, setSellRegisterMethod] = useState('');
  const [sellInstallments, setSellInstallments] = useState<InstallmentInput[]>([]);
  const [sellRegisterError, setSellRegisterError] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(emptyCustomerDraft);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const [customerAdditionalOpen, setCustomerAdditionalOpen] = useState(false);
  const [customerTagsOpen, setCustomerTagsOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<InventoryUnit | null>(null);
  const [editUnitCost, setEditUnitCost] = useState('');
  const [editUnitExpiry, setEditUnitExpiry] = useState('');
  const [deleteUnit, setDeleteUnit] = useState<InventoryUnit | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryMode, setCategoryMode] = useState<'list' | 'create' | 'edit'>('list');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#000000');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [saleModal, setSaleModal] = useState<SaleDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localProducts, setLocalProducts] = useState<Product[]>(products);

  const view = viewParam === 'grid' ? 'grid' : 'list';
  const filterBrandOptions = uniqueBrands(brands);
  const productBrandOptions = uniqueBrands([...filterBrandOptions, formDraft.brand]);
  const fallbackBrand = productBrandOptions[0] || '';
  const normalizedCustomerQuery = sellCustomerQuery.trim().toLowerCase();
  const customerSearchResults = normalizedCustomerQuery
    ? customers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(normalizedCustomerQuery) ||
          (customer.phone || '').toLowerCase().includes(normalizedCustomerQuery)
      )
    : customers.slice(0, 8);
  const customerTagOptions = Array.from(
    new Set([
      ...customerTagSuggestions,
      ...customerDraft.tags,
      ...(customerDraft.tagsInput.trim() ? [customerDraft.tagsInput.trim()] : [])
    ])
  );

  const updateView = (nextView: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextView) {
      params.set('view', nextView);
    } else {
      params.delete('view');
    }
    router.replace(params.toString() ? `${pathname}?${params}` : pathname);
  };

  const buildCategoryHref = (categoryId?: string) => {
    const params = new URLSearchParams({
      ...baseParams,
      stock: stockFilter === 'all' ? '' : stockFilter,
      category: categoryId || '',
      brand: brandFilter === 'all' ? '' : brandFilter,
      view
    });
    return `${basePath}?${params.toString()}`;
  };

  const buildBrandHref = (brand?: string) => {
    const params = new URLSearchParams({
      ...baseParams,
      stock: stockFilter === 'all' ? '' : stockFilter,
      category: categoryFilter === 'all' ? '' : categoryFilter,
      brand: brand || '',
      view
    });
    return `${basePath}?${params.toString()}`;
  };

  useEffect(() => {
    setLocalProducts(products);
  }, [products]);

  const displayProducts = localProducts;

  const adjustLocalQuantity = (productId: string, delta: number) => {
    setLocalProducts((prev) =>
      prev.map((item) =>
        item.id === productId
          ? { ...item, quantity: Math.max(0, toNumber(item.quantity ?? 0) + delta) }
          : item
      )
    );
    setSelectedProduct((prev) =>
      prev && prev.id === productId
        ? { ...prev, quantity: Math.max(0, toNumber(prev.quantity ?? 0) + delta) }
        : prev
    );
  };

  const loadProductUnits = async (productId: string) => {
    setUnitsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/inventory/products/${productId}/units`, {
        cache: 'no-store'
      });
      if (!res.ok) {
        setProductUnits([]);
        return;
      }
      const data = (await res.json()) as { data: InventoryUnit[] };
      setProductUnits(data.data || []);
    } catch {
      setProductUnits([]);
    } finally {
      setUnitsLoading(false);
    }
  };

  const loadProductSales = async (productId: string) => {
    setSalesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/inventory/products/${productId}/sales`, {
        cache: 'no-store'
      });
      if (!res.ok) {
        setProductSales([]);
        return;
      }
      const data = (await res.json()) as { data: ProductSale[] };
      setProductSales(data.data || []);
    } catch {
      setProductSales([]);
    } finally {
      setSalesLoading(false);
    }
  };

  const refreshProductDetails = (productId: string) => {
    loadProductUnits(productId);
    loadProductSales(productId);
  };

  const handleSaleUpdated = (update: SaleUpdate) => {
    setProductSales((prev) => {
      if (update.removed) {
        return prev.filter((sale) => sale.sale_id !== update.id);
      }
      return prev.map((sale) =>
        sale.sale_id === update.id
          ? {
              ...sale,
              status: update.status ?? sale.status,
              payment_status: update.paymentStatus ?? sale.payment_status
            }
          : sale
      );
    });
  };

  const loadCustomers = async () => {
    setCustomersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/customers`, { cache: 'no-store' });
      if (!res.ok) {
        setCustomers([]);
        return;
      }
      const data = (await res.json()) as { data: Customer[] };
      setCustomers(data.data || []);
    } catch {
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  };

  const updateCustomerPhoto = (nextUrl: string) => {
    setCustomerDraft((prev) => {
      if (prev.photoUrl && prev.photoUrl.startsWith('blob:') && prev.photoUrl !== nextUrl) {
        URL.revokeObjectURL(prev.photoUrl);
      }
      return { ...prev, photoUrl: nextUrl };
    });
  };

  const resetCustomerDraft = () => {
    setCustomerDraft((prev) => {
      if (prev.photoUrl && prev.photoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prev.photoUrl);
      }
      return emptyCustomerDraft;
    });
    setCustomerFormError(null);
    setCustomerAdditionalOpen(false);
    setCustomerTagsOpen(false);
  };

  const closeCreateCustomerModal = () => {
    setCreateCustomerOpen(false);
    resetCustomerDraft();
  };

  const openCreateCustomerModal = () => {
    setCreateCustomerOpen(true);
    setCustomerFormError(null);
    setCustomerAdditionalOpen(false);
    setCustomerTagsOpen(false);
  };

  const selectSellCustomer = (customer: Customer) => {
    setSellCustomerName(customer.name);
    setSellCustomerQuery(customer.name);
    setSellCustomerId(customer.id);
  };

  const addCustomerTag = (rawTag: string) => {
    const nextTag = rawTag.trim();
    if (!nextTag) return;
    setCustomerDraft((prev) => {
      if (prev.tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
        return { ...prev, tagsInput: '' };
      }
      return { ...prev, tagsInput: '', tags: [...prev.tags, nextTag] };
    });
  };

  const removeCustomerTag = (rawTag: string) => {
    const normalized = rawTag.toLowerCase();
    setCustomerDraft((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag.toLowerCase() !== normalized)
    }));
  };

  const handleCreateCustomer = async () => {
    const name = customerDraft.name.trim();
    const phone = customerDraft.whatsapp.trim();
    const tags = Array.from(
      new Set(
        [...customerDraft.tags, customerDraft.tagsInput.trim()]
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    );
    const phoneDigits = phone.replace(/\D/g, '');
    if (!name) {
      setCustomerFormError('Informe o nome do cliente');
      return;
    }
    if (phoneDigits.length < 10) {
      setCustomerFormError('Informe um WhatsApp valido');
      return;
    }

    setCustomerSaving(true);
    setCustomerFormError(null);
    try {
      const res = await fetch(`${API_BASE}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          birthDate: customerDraft.birthDate || undefined,
          description: customerDraft.description.trim() || undefined,
          photoUrl: customerDraft.photoUrl || undefined,
          cpfCnpj: customerDraft.cpfCnpj.trim() || undefined,
          cep: customerDraft.cep.trim() || undefined,
          street: customerDraft.street.trim() || undefined,
          number: customerDraft.number.trim() || undefined,
          complement: customerDraft.complement.trim() || undefined,
          neighborhood: customerDraft.neighborhood.trim() || undefined,
          city: customerDraft.city.trim() || undefined,
          state: customerDraft.state.trim().toUpperCase() || undefined,
          tags: tags.length ? tags : undefined
        })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setCustomerFormError(payload?.message || 'Erro ao cadastrar cliente');
        return;
      }
      const payload = (await res.json()) as { data: Customer };
      const createdCustomer = payload.data;
      setCustomers((prev) => [createdCustomer, ...prev.filter((item) => item.id !== createdCustomer.id)]);
      selectSellCustomer(createdCustomer);
      closeCreateCustomerModal();
      setToast('Cliente cadastrado');
    } catch {
      setCustomerFormError('Erro ao cadastrar cliente');
    } finally {
      setCustomerSaving(false);
    }
  };

  const closeCreateModal = () => {
    setOpenCreate(false);
    setCreateStep('search');
    setFormMode('create');
    setFormDraft(emptyDraft);
    setEditingId(null);
  };

  const openCreateSearch = () => {
    setOpenCreate(true);
    setFormMode('create');
    setCreateStep('search');
    setFormDraft(emptyDraft);
    setEditingId(null);
  };

  const openForm = (draft: ProductDraft, mode: 'create' | 'edit', id?: string | null) => {
    setOpenCreate(true);
    setFormMode(mode);
    setCreateStep('form');
    setFormDraft(draft);
    setEditingId(id ?? null);
  };

  const openEditForm = (product: Product) => {
    setSelectedProduct(null);
    openForm(
      {
        name: product.name,
        brand: product.brand || '',
        brandCode: product.sku || '',
        category: product.category_id || '',
        price: product.price ? formatCurrency(toNumber(product.price)) : '',
        barcode: product.barcode || '',
        imageUrl: product.image_url || '',
        available: product.active
      },
      'edit',
      product.id
    );
  };

  const parseMoney = (value: string) => {
    const cleaned = value.replace(/[^\d,.-]/g, '');
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const sellRegisterTotal = parseMoney(sellRegisterAmount);

  const formatCurrencyInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const amount = Number(digits) / 100;
    return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const resetSellForm = () => {
    setSellCustomerName('');
    setSellCustomerQuery('');
    setSellCustomerId('');
    setSellPrice('');
    setSellDate(toIsoDate(new Date()));
    setSellPaid(false);
    setSellPaymentOpen(false);
    setSellRegisterAmount('');
    setSellRegisterMethod('');
    setSellInstallments([]);
    setSellRegisterError(null);
    setCreateCustomerOpen(false);
    resetCustomerDraft();
  };

  const openSellUnit = (unit: InventoryUnit) => {
    if (!selectedProduct) return;
    setSellUnit(unit);
    setSellCustomerName('');
    setSellCustomerQuery('');
    setSellCustomerId('');
    setSellPrice(
      selectedProduct.price !== null && selectedProduct.price !== undefined && `${selectedProduct.price}` !== ''
        ? formatCurrency(toNumber(selectedProduct.price))
        : ''
    );
    setSellDate(toIsoDate(new Date()));
    setSellPaid(false);
    setSellPaymentOpen(false);
    setSellRegisterAmount('');
    setSellRegisterMethod('');
    setSellInstallments([]);
    setSellRegisterError(null);
  };

  const updateSellInstallment = (id: string, field: 'dueDate' | 'amount', value: string) => {
    setSellInstallments((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleIncreaseSellInstallments = () => {
    const total = parseMoney(sellRegisterAmount);
    if (total <= 0) return;
    const nextCount = Math.max(sellInstallments.length + 1, 1);
    setSellInstallments(buildInstallments(nextCount, total, sellDate || toIsoDate(new Date())));
  };

  const handleDecreaseSellInstallments = () => {
    if (sellInstallments.length <= 1) return;
    const total = parseMoney(sellRegisterAmount);
    const nextCount = sellInstallments.length - 1;
    setSellInstallments(buildInstallments(nextCount, total, sellDate || toIsoDate(new Date())));
  };

  const handleConfirmSellPayment = () => {
    const priceValue = parseMoney(sellPrice);
    if (sellRegisterTotal <= 0) {
      setSellRegisterError('Informe o valor do pagamento');
      return;
    }
    if (priceValue > 0 && Math.abs(sellRegisterTotal - priceValue) > 0.01) {
      setSellRegisterError('O valor do pagamento precisa ser igual ao valor da venda');
      return;
    }
    const installmentsTotal = sellInstallments.reduce((sum, item) => sum + parseMoney(item.amount), 0);
    if (Math.abs(installmentsTotal - sellRegisterTotal) > 0.01) {
      setSellRegisterError('A soma das parcelas precisa ser igual ao valor informado');
      return;
    }
    setSellRegisterError(null);
    setSellPaymentOpen(false);
  };

  useEffect(() => {
    if (!sellPaymentOpen) return;
    const priceValue = parseMoney(sellPrice);
    const baseDate = sellDate || toIsoDate(new Date());
    const amountValue = priceValue > 0 ? priceValue : 0;
    setSellRegisterAmount(amountValue > 0 ? formatCurrency(amountValue) : formatCurrency(0));
    setSellRegisterMethod('');
    setSellInstallments(amountValue > 0 ? buildInstallments(1, amountValue, baseDate) : []);
    setSellRegisterError(null);
  }, [sellPaymentOpen]);

  useEffect(() => {
    if (!sellPaymentOpen) return;
    const total = parseMoney(sellRegisterAmount);
    if (total <= 0) {
      setSellInstallments([]);
      return;
    }
    const baseDate = sellDate || toIsoDate(new Date());
    const count = sellInstallments.length || 1;
    setSellInstallments(buildInstallments(count, total, baseDate));
  }, [sellRegisterAmount, sellPaymentOpen, sellInstallments.length, sellDate]);

  useEffect(() => {
    if (!sellPaymentOpen) return;
    const total = parseMoney(sellRegisterAmount);
    const max = parseMoney(sellPrice);
    if (max > 0 && total > max) {
      setSellRegisterError('Valor maior que o valor da venda');
    } else if (sellRegisterError === 'Valor maior que o valor da venda') {
      setSellRegisterError(null);
    }
  }, [sellRegisterAmount, sellPrice, sellPaymentOpen, sellRegisterError]);

  const handleConfirmSell = async () => {
    if (!sellUnit || !selectedProduct) return;
    const priceValue = parseMoney(sellPrice);
    if (!priceValue) {
      setToast('Informe o preco de venda');
      return;
    }
    const customerNameValue = sellCustomerName.trim();
    if (!customerNameValue) {
      setToast('Selecione ou cadastre um cliente');
      return;
    }
    const registerTotal = parseMoney(sellRegisterAmount);
    if (!sellPaid && sellInstallments.length > 0) {
      if (registerTotal <= 0) {
        setToast('Informe o valor do pagamento');
        return;
      }
      if (Math.abs(registerTotal - priceValue) > 0.01) {
        setToast('O valor do pagamento precisa ser igual ao valor da venda');
        return;
      }
      const installmentsTotal = sellInstallments.reduce((sum, item) => sum + parseMoney(item.amount), 0);
      if (Math.abs(installmentsTotal - registerTotal) > 0.01) {
        setToast('A soma das parcelas precisa ser igual ao valor informado');
        return;
      }
    }
    setSelling(true);
    try {
      const saleRes = await fetch(`${API_BASE}/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: sellCustomerId || undefined,
          customerName: sellCustomerId ? undefined : customerNameValue,
          createdAt: sellDate ? `${sellDate}T00:00:00` : undefined,
          items: [
            {
              sku: selectedProduct.sku,
              quantity: 1,
              price: priceValue,
              unitId: sellUnit.id
            }
          ],
          payments: sellPaid
            ? [
                {
                  method: 'Dinheiro',
                  amount: priceValue
                }
              ]
            : []
        })
      });

      if (!saleRes.ok) {
        const payload = (await saleRes.json().catch(() => null)) as { message?: string } | null;
        setToast(payload?.message || 'Erro ao registrar a venda');
        return;
      }

      const payload = (await saleRes.json()) as { data: { id: string; created_at?: string; customer_name?: string | null } };
      const saleId = payload.data?.id;

      if (!sellPaid && saleId) {
        if (sellInstallments.length > 0 && registerTotal > 0) {
          for (const installment of sellInstallments) {
            const amount = parseMoney(installment.amount);
            if (!amount || !installment.dueDate) continue;
            await fetch(`${API_BASE}/finance/receivables`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                saleId,
                amount,
                dueDate: installment.dueDate,
                method: sellRegisterMethod || undefined
              })
            });
          }
        }
      }

      const saleDateValue = payload.data?.created_at || `${sellDate}T00:00:00`;
      if (!sellPaid && saleId) {
        setSaleModal({
          id: saleId,
          customer: customerNameValue || payload.data?.customer_name || 'Cliente nao informado',
          date: saleDateValue,
          status: 'pending',
          total: priceValue,
          paid: 0,
          itemName: selectedProduct ? getProductHeadline(selectedProduct) : 'Produto',
          itemQty: 1,
          dueDate: saleDateValue
        });
      }

      setSellUnit(null);
      resetSellForm();
      router.refresh();
      if (selectedProduct) {
        refreshProductDetails(selectedProduct.id);
      }
      adjustLocalQuantity(selectedProduct.id, -1);
      setToast('Venda registrada');
    } catch {
      setToast('Erro ao registrar a venda');
    } finally {
      setSelling(false);
    }
  };

  const openEditUnit = (unit: InventoryUnit) => {
    setEditUnit(unit);
    setEditUnitCost(
      unit.cost !== null && unit.cost !== undefined && `${unit.cost}` !== ''
        ? formatCurrency(toNumber(unit.cost))
        : ''
    );
    setEditUnitExpiry(unit.expires_at || '');
  };

  const handleUpdateUnit = async () => {
    if (!editUnit) return;
    const payload: { cost?: number; expiresAt?: string } = {};
    if (editUnitCost) {
      payload.cost = parseMoney(editUnitCost);
    }
    if (editUnitExpiry) {
      payload.expiresAt = editUnitExpiry;
    }
    if (payload.cost === undefined && !payload.expiresAt) {
      setToast('Informe o preco ou a validade');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/inventory/units/${editUnit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        setToast('Erro ao atualizar unidade');
        return;
      }
      setEditUnit(null);
      setEditUnitCost('');
      setEditUnitExpiry('');
      if (selectedProduct) {
        refreshProductDetails(selectedProduct.id);
      }
      setToast('Unidade atualizada');
    } catch {
      setToast('Erro ao atualizar unidade');
    }
  };

  const handleDeleteUnit = async () => {
    if (!deleteUnit) return;
    try {
      const res = await fetch(`${API_BASE}/inventory/units/${deleteUnit.id}`, {
        method: 'DELETE'
      });
      if (res.status === 409) {
        setToast('Unidade ja vendida');
        return;
      }
      if (!res.ok) {
        setToast('Erro ao excluir unidade');
        return;
      }
      setDeleteUnit(null);
      if (selectedProduct) {
        refreshProductDetails(selectedProduct.id);
      }
      if (deleteUnit?.product_id) {
        adjustLocalQuantity(deleteUnit.product_id, -1);
      }
      router.refresh();
      setToast('Unidade removida');
    } catch {
      setToast('Erro ao excluir unidade');
    }
  };

  const openSaleDetail = (sale: ProductSale) => {
    const mappedStatus: SaleDetail['status'] =
      sale.status === 'cancelled' ? 'cancelled' : sale.status === 'pending' ? 'pending' : 'delivered';
    setSaleModal({
      id: sale.sale_id,
      customer: sale.customer_name || 'Cliente nao informado',
      date: sale.created_at,
      status: mappedStatus,
      total: toNumber(sale.total),
      paid: 0,
      itemName: selectedProduct ? getProductHeadline(selectedProduct) : sale.sku,
      itemQty: toNumber(sale.quantity || 1),
      dueDate: sale.created_at
    });
  };

  const buildSku = () => {
    const brandCode = formDraft.brandCode.trim();
    if (brandCode) return brandCode;
    const barcode = formDraft.barcode.trim();
    if (barcode) return barcode;
    return `SKU-${Date.now()}`;
  };

  const handleSaveForm = async () => {
    const payload = {
      name: formDraft.name.trim(),
      sku: buildSku(),
      brand: formDraft.brand.trim() || undefined,
      barcode: formDraft.barcode.trim() || undefined,
      imageUrl: formDraft.imageUrl.trim() || undefined,
      price: parseMoney(formDraft.price),
      cost: 0,
      categoryId: formDraft.category || undefined,
      active: formDraft.available
    };

    if (!payload.name) {
      setToast('Informe o nome do produto');
      return;
    }
    if (formMode === 'edit' && !editingId) {
      setToast('Produto invalido');
      return;
    }

    try {
      const existingProduct =
        formMode === 'create'
          ? products.find((product) => product.sku.toLowerCase() === payload.sku.toLowerCase())
          : null;
      const targetId = formMode === 'edit' ? editingId : existingProduct?.id;
      const method = formMode === 'edit' || existingProduct ? 'PATCH' : 'POST';
      const url =
        method === 'PATCH' && targetId
          ? `${API_BASE}/inventory/products/${targetId}`
          : `${API_BASE}/inventory/products`;
      const body = payload;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        setToast('Erro ao salvar o produto');
        return;
      }

      closeCreateModal();
      router.refresh();
      if (formMode === 'edit' || existingProduct) {
        setToast('Produto atualizado');
      } else {
        setToast('Produto cadastrado');
      }
    } catch {
      setToast('Erro ao salvar o produto');
    }
  };

  const resetCategoryForm = () => {
    setNewCategoryName('');
    setNewCategoryColor('#000000');
    setEditingCategory(null);
    setCategoryMode('list');
  };

  const openCategories = () => {
    setCategoriesOpen(true);
    resetCategoryForm();
  };

  const closeCategories = () => {
    setCategoriesOpen(false);
    resetCategoryForm();
  };

  const startCreateCategory = () => {
    setCategoryMode('create');
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryColor('#000000');
  };

  const startEditCategory = (category: Category) => {
    setCategoryMode('edit');
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color || '#000000');
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      setToast('Informe o nome da categoria');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/inventory/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor })
      });
      if (!res.ok) {
        setToast('Erro ao criar categoria');
        return;
      }
      resetCategoryForm();
      router.refresh();
      setToast('Categoria criada');
    } catch {
      setToast('Erro ao criar categoria');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory) return;
    if (!newCategoryName.trim()) {
      setToast('Informe o nome da categoria');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/inventory/categories/${editingCategory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim(), color: newCategoryColor })
      });
      if (!res.ok) {
        setToast('Erro ao atualizar categoria');
        return;
      }
      resetCategoryForm();
      router.refresh();
      setToast('Categoria atualizada');
    } catch {
      setToast('Erro ao atualizar categoria');
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    try {
      const res = await fetch(`${API_BASE}/inventory/categories/${category.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        setToast('Erro ao excluir categoria');
        return;
      }
      setDeleteCategory(null);
      router.refresh();
      setToast('Categoria removida');
    } catch {
      setToast('Erro ao excluir categoria');
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    try {
      const res = await fetch(`${API_BASE}/inventory/products/${product.id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        setToast('Erro ao excluir produto');
        return;
      }
      setDeleteProduct(null);
      router.refresh();
      setToast('Produto removido');
    } catch {
      setToast('Erro ao excluir produto');
    }
  };

  const handleAddUnits = async () => {
    if (!adjustProduct) return;
    const quantity = Math.max(1, Number(unitQuantity) || 0);
    try {
      const res = await fetch(`${API_BASE}/inventory/adjustments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: adjustProduct.sku,
          quantity,
          reason: 'manual_add',
          cost: parseMoney(unitCost),
          expiresAt: unitExpiry || undefined
        })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setToast(payload?.message || 'Erro ao adicionar unidades');
        return;
      }
      setAdjustProduct(null);
      setUnitQuantity('1');
      setUnitCost('');
      setUnitExpiry('');
      if (selectedProduct) {
        refreshProductDetails(selectedProduct.id);
      }
      adjustLocalQuantity(adjustProduct.id, quantity);
      router.refresh();
      setToast('Unidades adicionadas');
    } catch {
      setToast('Erro ao adicionar unidades');
    }
  };

  useEffect(() => {
    if (!selectedProduct) {
      setProductUnits([]);
      setProductSales([]);
      setUnitMenuOpenId(null);
      setSellUnit(null);
      setEditUnit(null);
      setDeleteUnit(null);
      return;
    }
    refreshProductDetails(selectedProduct.id);
    setUnitMenuOpenId(null);
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (!sellUnit) return;
    loadCustomers();
  }, [sellUnit]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const availableUnits = productUnits.filter((unit) => unit.status === 'available');

  return (
    <>
      <div className="topbar">
        <section className="hero">
          <span className="section-title">Estoque</span>
          <h1>Estoque</h1>
          <p>Organize o catalogo e acompanhe a saude do inventario.</p>
        </section>
        <div className="actions">
          <button
            className="button icon view-toggle"
            type="button"
            onClick={() => updateView(view === 'grid' ? 'list' : 'grid')}
            title={view === 'grid' ? 'Layout de lista' : 'Layout de grade'}
            aria-label={view === 'grid' ? 'Layout de lista' : 'Layout de grade'}
          >
            {view === 'grid' ? <IconList /> : <IconGrid />}
          </button>
          <button className="button ghost" type="button" onClick={() => setOpenImport(true)}>
            <IconUpload /> Importar
          </button>
          <button className="button primary" type="button" onClick={openCreateSearch}>
            <IconPlus /> Novo produto
          </button>
        </div>
      </div>

      <div className="split">
        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Categorias</h2>
              <p className="panel-subtitle">Segmentos mais usados</p>
            </div>
            <span className="badge">{productCount}</span>
          </div>
          <div className="category-list">
            <Link
              href={buildCategoryHref()}
              className={`category-item${categoryFilter === 'all' ? ' active' : ''}`}
            >
              <span>Todas as categorias</span>
              <span className="badge">{productsLength}</span>
            </Link>
            {categories.map((category) => {
              const count = products.filter((p) => p.category_id === category.id).length;
              return (
                <Link
                  key={category.id}
                  href={buildCategoryHref(category.id)}
                  className={`category-item${categoryFilter === category.id ? ' active' : ''}`}
                >
                  <span className="category-label">
                    <span
                      className="category-dot"
                      style={{ background: category.color || 'rgba(255,255,255,0.45)' }}
                    />
                    {category.name}
                  </span>
                  <span className="badge">{count}</span>
                </Link>
              );
            })}
            <button className="category-item button-item" type="button" onClick={openCategories}>
              <span>Gerenciar categorias</span>
              <span className="badge">+</span>
            </button>
          </div>
        </aside>

        <section className="panel">
          <div className="toolbar">
            <form className="search" method="get">
              <span>🔍</span>
              <input name="q" placeholder="Buscar produto" defaultValue={query} />
              {stockFilter !== 'all' ? <input type="hidden" name="stock" value={stockFilter} /> : null}
              {categoryFilter !== 'all' ? <input type="hidden" name="category" value={categoryFilter} /> : null}
              {brandFilter !== 'all' ? <input type="hidden" name="brand" value={brandFilter} /> : null}
              <input type="hidden" name="view" value={view} />
            </form>
            <div className="toolbar-group">
              {stockOptions.map((option) => (
                <Link
                  key={option.value}
                  className={`pill${stockFilter === option.value ? ' active' : ''}`}
                  href={`${basePath}?${new URLSearchParams({
                    ...baseParams,
                    stock: option.value === 'all' ? '' : option.value,
                    category: categoryFilter === 'all' ? '' : categoryFilter,
                    brand: brandFilter === 'all' ? '' : brandFilter,
                    view
                  }).toString()}`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
            <div className="toolbar-group">
              <div className="select-wrapper">
                <button
                  className="select-trigger"
                  type="button"
                  onClick={() => setBrandOpen((prev) => !prev)}
                >
                  <span>{brandFilter === 'all' ? 'Todas marcas' : brandFilter}</span>
                  <strong>▾</strong>
                </button>
                {brandOpen ? (
                  <div className="select-menu">
                    <Link
                      href={buildBrandHref()}
                      className={brandFilter === 'all' ? 'active' : ''}
                      onClick={() => setBrandOpen(false)}
                    >
                      Todas marcas
                    </Link>
                    {filterBrandOptions.map((brand) => (
                      <Link
                        key={brand}
                        href={buildBrandHref(brand)}
                        className={brandFilter === brand ? 'active' : ''}
                        onClick={() => setBrandOpen(false)}
                      >
                        {brand}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="meta">
                Produtos: {productCount} · Unidades: {totalUnits}
              </span>
            </div>
          </div>

          {productsLength === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📦</div>
              <strong>Nenhum produto cadastrado</strong>
              <span>Comece adicionando um produto para controlar o estoque.</span>
              <button className="button primary" type="button" onClick={openCreateSearch}>
                + Cadastrar produto
              </button>
            </div>
          ) : productCount === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔎</div>
              <strong>Nenhum produto encontrado</strong>
              <span>Ajuste os filtros ou busque por outro termo.</span>
              <Link className="button ghost" href={basePath}>
                Limpar filtros
              </Link>
            </div>
          ) : view === 'grid' ? (
            <div className="inventory-grid">
              {displayProducts.map((product) => {
                const quantity = toNumber(product.quantity ?? 0);
                const stockLabel = product.active && quantity > 0 ? `${quantity} un.` : 'Sem estoque';
                const hasPrice = product.price !== null && product.price !== undefined && `${product.price}` !== '';
                const priceLabel = hasPrice ? formatCurrency(toNumber(product.price)) : 'Sem preco';
                return (
                  <div key={product.id} className="inventory-card">
                    <button
                      className="inventory-thumb"
                      type="button"
                      title="Ver produto"
                      onClick={() => {
                        setSelectedProduct(product);
                        setProductTab('estoque');
                      }}
                    >
                      <span className="inventory-thumb-badge">{stockLabel}</span>
                      {getProductImage(product) ? (
                        <img
                          className="inventory-thumb-img"
                          src={getProductImage(product)}
                          alt={product.name}
                        />
                      ) : (
                        <span className="inventory-thumb-img product-initial">
                          {getProductInitials(product)}
                        </span>
                      )}
                    </button>
                    <div className="inventory-meta">
                      <strong>{getProductHeadline(product)}</strong>
                      <span>{getProductMetaLine(product)}</span>
                    </div>
                    <div className="inventory-price">{priceLabel}</div>
                    <button
                      className="inventory-menu"
                      type="button"
                      title="Acoes"
                      onClick={() => setMenuOpenId((prev) => (prev === product.id ? null : product.id))}
                    >
                      <IconDots />
                    </button>
                    {menuOpenId === product.id ? (
                      <div className="inventory-dropdown">
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            openEditForm(product);
                          }}
                        >
                          <IconEdit /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            setAdjustProduct(product);
                            setUnitQuantity('1');
                            setUnitCost('');
                            setUnitExpiry('');
                          }}
                        >
                          <IconPlus /> Adicionar unidades
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setMenuOpenId(null);
                            setDeleteProduct(product);
                          }}
                        >
                          <IconTrash /> Excluir
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="inventory-list">
              <div className="data-row cols-4 header">
                <span>Produto</span>
                <span>Preco de venda</span>
                <span>Estoque</span>
                <span>Acoes</span>
              </div>
              {displayProducts.map((product) => {
                const quantity = toNumber(product.quantity ?? 0);
                const stockLabel =
                  product.active && quantity > 0
                    ? `${quantity} ${quantity === 1 ? 'unidade' : 'unidades'}`
                    : 'Sem estoque';
                const hasPrice = product.price !== null && product.price !== undefined && `${product.price}` !== '';
                const priceLabel = hasPrice ? formatCurrency(toNumber(product.price)) : 'Sem preco';
                return (
                  <div key={product.id} className="data-row cols-4 inventory-row">
                    <button
                      className="inventory-row-main"
                      type="button"
                      onClick={() => {
                        setSelectedProduct(product);
                        setProductTab('estoque');
                      }}
                    >
                      <span className="inventory-row-thumb">
                        {getProductImage(product) ? (
                          <img src={getProductImage(product)} alt={product.name} />
                        ) : (
                          <span className="product-initial">{getProductInitials(product)}</span>
                        )}
                      </span>
                      <div>
                        <strong>{getProductHeadline(product)}</strong>
                        <div className="meta">
                          {getProductMetaLine(product)}
                        </div>
                      </div>
                    </button>
                    <div className="data-cell mono">{priceLabel}</div>
                    <span className={`badge ${getStockTone(quantity, product.active)}`}>{stockLabel}</span>
                    <div className="inventory-row-actions">
                      <button
                        className={`button icon small${menuOpenId === product.id ? ' active' : ''}`}
                        type="button"
                        title="Acoes"
                        onClick={() => setMenuOpenId((prev) => (prev === product.id ? null : product.id))}
                      >
                        <IconDots />
                      </button>
                      {menuOpenId === product.id ? (
                        <div className="inventory-dropdown">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              openEditForm(product);
                            }}
                          >
                            <IconEdit /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              setAdjustProduct(product);
                              setUnitQuantity('1');
                              setUnitCost('');
                              setUnitExpiry('');
                            }}
                          >
                            <IconPlus /> Adicionar unidades
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              setMenuOpenId(null);
                              setDeleteProduct(product);
                            }}
                          >
                            <IconTrash /> Excluir
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {openCreate ? (
        <div className="modal-backdrop" onClick={closeCreateModal}>
          <div className="modal modal-create" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{formMode === 'edit' ? 'Editar produto' : 'Cadastrar produto'}</h3>
              <button className="modal-close" type="button" onClick={closeCreateModal}>
                ✕
              </button>
            </div>

                    {createStep === 'search' && formMode === 'create' ? (
              <>
                <label className="modal-field">
                  <span>Nome ou codigo</span>
                  <input placeholder="Busque pelo nome ou codigo do produto" />
                </label>
                <div className="modal-suggestions">
                  <div className="modal-suggestions-title">Sugestoes</div>
                  <div className="modal-suggestions-list">
                    {(products.length
                      ? products.map((product) => ({
                          id: product.id,
                          name: product.name,
                          brand: product.brand || fallbackBrand || 'Sem marca',
                          brandCode: product.sku
                        }))
                      : suggestions
                    ).map((item) => (
                      <button
                        key={item.id}
                        className="modal-suggestion"
                        type="button"
                        onClick={() =>
                          openForm(
                            {
                              ...emptyDraft,
                              name: item.name,
                              brand: item.brand,
                              brandCode: item.brandCode
                            },
                            'create'
                          )
                        }
                      >
                        <span className="modal-suggestion-thumb">🧴</span>
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="button ghost" type="button" onClick={closeCreateModal}>
                    Cancelar
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => openForm(emptyDraft, 'create')}
                  >
                    Cadastrar manualmente
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="product-form">
                  <div className="product-image">
                    {formDraft.imageUrl ? (
                      <div className="product-image-preview">
                        <img src={formDraft.imageUrl} alt={formDraft.name || 'Produto'} />
                      </div>
                    ) : (
                      <div className="product-upload">
                        <span>⬆</span>
                        <p>Arraste a imagem ou clique para enviar</p>
                      </div>
                    )}
                    <div className="sample-images">
                      {sampleImages.map((image) => (
                        <button
                          key={image.id}
                          className={`sample-image${formDraft.imageUrl === image.url ? ' active' : ''}`}
                          type="button"
                          onClick={() => setFormDraft((prev) => ({ ...prev, imageUrl: image.url }))}
                          title="Selecionar imagem"
                        >
                          <img src={image.url} alt={image.label} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="product-fields">
                    <label className="modal-field">
                      <span>Nome do produto</span>
                      <input
                        value={formDraft.name}
                        onChange={(event) =>
                          setFormDraft((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </label>
                    <div className="form-row">
                      <label className="modal-field">
                        <span>Marca</span>
                        <select
                          value={formDraft.brand}
                          onChange={(event) =>
                            setFormDraft((prev) => ({ ...prev, brand: event.target.value }))
                          }
                        >
                          <option value="">Selecione a marca</option>
                          {productBrandOptions.map((brand) => (
                            <option key={brand} value={brand}>
                              {brand}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="modal-field">
                        <span>Codigo da marca</span>
                        <input
                          value={formDraft.brandCode}
                          onChange={(event) =>
                            setFormDraft((prev) => ({ ...prev, brandCode: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <label className="modal-field">
                      <span>Categoria</span>
                      <select
                        value={formDraft.category}
                        onChange={(event) =>
                          setFormDraft((prev) => ({ ...prev, category: event.target.value }))
                        }
                      >
                        <option value="">Selecione a categoria</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="form-row">
                      <label className="modal-field">
                        <span>Preco de venda</span>
                        <input
                          value={formDraft.price}
                          inputMode="decimal"
                          placeholder="R$ 0,00"
                          onChange={(event) =>
                            setFormDraft((prev) => ({
                              ...prev,
                              price: formatCurrencyInput(event.target.value)
                            }))
                          }
                        />
                      </label>
                      <label className="modal-field">
                        <span>Codigo de barras</span>
                        <input
                          value={formDraft.barcode}
                          onChange={(event) =>
                            setFormDraft((prev) => ({ ...prev, barcode: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <div className="toggle-row">
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={formDraft.available}
                          onChange={(event) =>
                            setFormDraft((prev) => ({ ...prev, available: event.target.checked }))
                          }
                        />
                        <span className="slider" />
                      </label>
                      <span>Disponivel na loja</span>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  {formMode === 'create' ? (
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => setCreateStep('search')}
                    >
                      Voltar
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="footer-actions">
                    <button className="button ghost" type="button" onClick={closeCreateModal}>
                      Cancelar
                    </button>
                    <button className="button primary" type="button" onClick={handleSaveForm}>
                      {formMode === 'edit' ? 'Salvar' : 'Cadastrar'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {openImport ? (
        <div className="modal-backdrop" onClick={() => setOpenImport(false)}>
          <div className="modal modal-import" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Upload do Arquivo Excel</h3>
                <span className="meta">Passo 1 de 4</span>
              </div>
              <button className="modal-close" type="button" onClick={() => setOpenImport(false)}>
                ✕
              </button>
            </div>
            <div className="import-tip">
              <strong>Como preparar seu arquivo Excel:</strong>
              <ul>
                <li>A primeira linha deve conter os cabecalhos das colunas</li>
                <li>Inclua colunas como: Nome, Marca, Categoria, Preco, Codigo de Barras, etc.</li>
                <li>Formatos aceitos: .xlsx, .xls, .csv</li>
                <li>Tamanho maximo: 10MB</li>
              </ul>
            </div>
            <div className="import-drop">
              <div className="import-icon">⤴</div>
              <strong>Arraste um arquivo Excel aqui</strong>
              <span>ou clique para selecionar um arquivo</span>
              <button className="button primary" type="button">
                Selecionar Arquivo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="modal-backdrop" onClick={() => setSelectedProduct(null)}>
          <div className="modal modal-product" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-product-header">
                <div className="modal-product-thumb">
                  {getProductImage(selectedProduct) ? (
                    <img src={getProductImage(selectedProduct)} alt={selectedProduct.name} />
                  ) : (
                    <span className="product-initial">{getProductInitials(selectedProduct)}</span>
                  )}
                </div>
                <div>
                  <strong>{getProductHeadline(selectedProduct)}</strong>
                  <span>{getProductMetaLine(selectedProduct)}</span>
                </div>
              </div>
              <button className="modal-close" type="button" onClick={() => setSelectedProduct(null)}>
                ✕
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={productTab === 'estoque' ? 'active' : ''}
                type="button"
                onClick={() => setProductTab('estoque')}
              >
                Estoque
              </button>
              <button
                className={productTab === 'vendas' ? 'active' : ''}
                type="button"
                onClick={() => setProductTab('vendas')}
              >
                Vendas
              </button>
            </div>

            {productTab === 'estoque' ? (
              <div className="modal-product-body">
                {unitsLoading ? (
                  <div className="modal-empty">
                    <div className="modal-empty-icon">⏳</div>
                    <strong>Carregando unidades</strong>
                    <span>Atualizando informacoes do estoque...</span>
                  </div>
                ) : availableUnits.length > 0 && selectedProduct.active ? (
                  <>
                    <div className="modal-product-table">
                      <div className="modal-table-header">
                        <span>Preco de compra</span>
                        <span>Vencimento</span>
                        <span>Acoes</span>
                      </div>
                      {availableUnits.map((unit) => (
                        <div key={unit.id} className="modal-table-row">
                          <span>{formatCurrency(toNumber(unit.cost))}</span>
                          <span>{unit.expires_at ? formatDate(unit.expires_at) : '-'}</span>
                          <div className="unit-actions">
                            <button
                              className={`button icon small${unitMenuOpenId === unit.id ? ' active' : ''}`}
                              type="button"
                              title="Acoes"
                              onClick={() =>
                                setUnitMenuOpenId((prev) => (prev === unit.id ? null : unit.id))
                              }
                            >
                              <IconDots />
                            </button>
                            {unitMenuOpenId === unit.id ? (
                              <div className="inventory-dropdown unit-dropdown">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnitMenuOpenId(null);
                                    openSellUnit(unit);
                                  }}
                                >
                                  Vender
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnitMenuOpenId(null);
                                    openEditUnit(unit);
                                  }}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => {
                                    setUnitMenuOpenId(null);
                                    setDeleteUnit(unit);
                                  }}
                                >
                                  Excluir
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="modal-footer">
                      <button className="button ghost" type="button" onClick={() => openEditForm(selectedProduct)}>
                        <IconEdit /> Editar
                      </button>
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => {
                          setAdjustProduct(selectedProduct);
                          setUnitQuantity('1');
                          setUnitCost('');
                          setUnitExpiry('');
                        }}
                      >
                        <IconPlus /> Incluir unidades
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="modal-empty">
                      <div className="modal-empty-icon">📦</div>
                      <strong>Nenhuma unidade em estoque</strong>
                      <span>Adicione unidades para acompanhar vencimentos e compras.</span>
                    </div>
                    <div className="modal-footer">
                      <button className="button ghost" type="button" onClick={() => openEditForm(selectedProduct)}>
                        <IconEdit /> Editar
                      </button>
                      <button
                        className="button primary"
                        type="button"
                        onClick={() => {
                          setAdjustProduct(selectedProduct);
                          setUnitQuantity('1');
                          setUnitCost('');
                          setUnitExpiry('');
                        }}
                      >
                        <IconPlus /> Incluir unidades
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="modal-product-body">
                {salesLoading ? (
                  <div className="modal-empty">
                    <div className="modal-empty-icon">⏳</div>
                    <strong>Carregando vendas</strong>
                    <span>Buscando historico do produto...</span>
                  </div>
                ) : productSales.length === 0 ? (
                  <div className="modal-empty">
                    <div className="modal-empty-icon">🏷️</div>
                    <strong>Nenhuma venda registrada</strong>
                    <span>As vendas deste produto aparecerao aqui.</span>
                  </div>
                ) : (
                  productSales.map((sale) => {
                    const isCancelled = sale.status === 'cancelled';
                    const isDelivered = sale.status === 'delivered';
                    const isPaid = sale.payment_status === 'paid';
                    return (
                      <div
                        key={sale.sale_id}
                        className="modal-product-row clickable"
                        onClick={() => openSaleDetail(sale)}
                      >
                      <div className="modal-product-info">
                        <strong>
                          {(sale.customer_name || 'Cliente nao informado') +
                            ` - ${toNumber(sale.quantity)} ${toNumber(sale.quantity) === 1 ? 'item' : 'itens'}`}
                        </strong>
                        <span>
                          {formatCurrency(toNumber(sale.price) * toNumber(sale.quantity))} | {formatShortDate(sale.created_at)}
                        </span>
                      </div>
                        <div className="product-sale-actions">
                          {isCancelled ? (
                            <span className="sale-status-pill cancelled">
                              <span className="badge-icon">⛔</span>CANCELADO
                            </span>
                          ) : (
                            <div className="sale-status-stack">
                              <span className={`sale-status-pill ${isPaid ? 'paid' : 'pending'}`}>
                                <span>{isPaid ? 'PAGAMENTO FEITO' : 'PENDENTE'}</span>
                                <span className={`sale-status-icon ${isPaid ? 'paid' : 'pending'}`}>
                                  {isPaid ? '✓' : '🕒'}
                                </span>
                              </span>
                              {isDelivered ? (
                                <span className="sale-status-pill delivered">
                                  <span>PRODUTO ENTREGUE</span>
                                  <span className="sale-status-icon delivered">✓</span>
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      

      {adjustProduct ? (
        <div className="modal-backdrop" onClick={() => setAdjustProduct(null)}>
          <div className="modal modal-units" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Incluir unidades</h3>
              <button className="modal-close" type="button" onClick={() => setAdjustProduct(null)}>
                ✕
              </button>
            </div>
            <div className="unit-product">
              <div className="unit-thumb">
                {getProductImage(adjustProduct) ? (
                  <img src={getProductImage(adjustProduct)} alt={adjustProduct.name} />
                ) : (
                  <span className="product-initial">{getProductInitials(adjustProduct)}</span>
                )}
              </div>
              <div>
                <span>Incluindo unidades do produto</span>
                <strong>{getProductHeadline(adjustProduct)}</strong>
                <span>{getProductMetaLine(adjustProduct)}</span>
              </div>
            </div>
            <label className="modal-field">
              <span>Quantidade</span>
              <input
                type="number"
                min="1"
                value={unitQuantity}
                onChange={(event) => setUnitQuantity(event.target.value)}
              />
            </label>
            <label className="modal-field">
              <span>Preco de compra</span>
              <input
                value={unitCost}
                inputMode="decimal"
                placeholder="R$ 0,00"
                onChange={(event) => setUnitCost(formatCurrencyInput(event.target.value))}
              />
            </label>
            <label className="modal-field">
              <span>Data de validade</span>
              <input
                type="date"
                value={unitExpiry}
                onChange={(event) => setUnitExpiry(event.target.value)}
              />
            </label>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setAdjustProduct(null)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleAddUnits}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sellUnit && selectedProduct ? (
        <div
          className="modal-backdrop"
          onClick={() => {
            setSellUnit(null);
            resetSellForm();
          }}
        >
          <div className="modal modal-sale-entry" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Registrar venda</h3>
              <button
                className="modal-close"
                type="button"
                onClick={() => {
                  setSellUnit(null);
                  resetSellForm();
                }}
              >
                ✕
              </button>
            </div>
            <div className="unit-product">
              <div className="unit-thumb">
                {getProductImage(selectedProduct) ? (
                  <img src={getProductImage(selectedProduct)} alt={selectedProduct.name} />
                ) : (
                  <span className="product-initial">{getProductInitials(selectedProduct)}</span>
                )}
              </div>
              <div>
                <span>Vendendo unidade do produto</span>
                <strong>{getProductHeadline(selectedProduct)}</strong>
                <span>{getProductMetaLine(selectedProduct)}</span>
              </div>
            </div>

            <section className="sale-customer-picker">
              <div className="sale-customer-header">
                <h4>Selecione o cliente</h4>
                <button className="customer-add-trigger" type="button" onClick={openCreateCustomerModal}>
                  + Cadastrar cliente
                </button>
              </div>
              <label className="customer-search-field">
                <input
                  placeholder={customersLoading ? 'Carregando clientes...' : 'Buscar cliente'}
                  value={sellCustomerQuery}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSellCustomerQuery(value);
                    setSellCustomerName(value);
                    const match = customers.find(
                      (customer) => customer.name.trim().toLowerCase() === value.trim().toLowerCase()
                    );
                    setSellCustomerId(match?.id || '');
                  }}
                />
                <span>⌕</span>
              </label>

              {sellCustomerName ? (
                <div className="sale-selected-customer">
                  <strong>{sellCustomerName}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setSellCustomerName('');
                      setSellCustomerId('');
                      setSellCustomerQuery('');
                    }}
                  >
                    Limpar
                  </button>
                </div>
              ) : null}

              <div className="customer-search-results">
                {customersLoading ? (
                  <span className="meta">Carregando clientes...</span>
                ) : customerSearchResults.length === 0 ? (
                  <span className="meta">Nenhum cliente encontrado.</span>
                ) : (
                  customerSearchResults.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      className={`customer-result-item${sellCustomerId === customer.id ? ' active' : ''}`}
                      onClick={() => selectSellCustomer(customer)}
                    >
                      <strong>{customer.name}</strong>
                      <span>{customer.phone || 'Sem telefone'}</span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <div className="form-row">
              <label className="modal-field">
                <span>Preco de venda</span>
                <input
                  value={sellPrice}
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                  onChange={(event) => setSellPrice(formatCurrencyInput(event.target.value))}
                />
              </label>
              <label className="modal-field">
                <span>Data da venda</span>
                <input
                  type="date"
                  value={sellDate}
                  onChange={(event) => setSellDate(event.target.value)}
                />
              </label>
            </div>

            <div className="toggle-row">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={sellPaid}
                  onChange={(event) => setSellPaid(event.target.checked)}
                />
                <span className="slider" />
              </label>
              <span>A venda ja foi paga</span>
            </div>
            <div className="modal-footer">
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  setSellUnit(null);
                  resetSellForm();
                }}
              >
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleConfirmSell} disabled={selling}>
                {selling ? 'Salvando...' : 'Confirmar venda'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createCustomerOpen ? (
        <div className="modal-backdrop" onClick={closeCreateCustomerModal}>
          <div className="modal modal-customer-create" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header customer-create-header">
              <h3>Novo cliente</h3>
              <button className="modal-close customer-create-close" type="button" onClick={closeCreateCustomerModal}>
                ✕
              </button>
            </div>

            <div className="customer-create-grid">
              <div className="customer-photo-column">
                <span className="customer-field-title">Foto do cliente</span>
                <div className="customer-photo-card">
                  <div className="customer-photo-preview">
                    {customerDraft.photoUrl ? (
                      <img src={customerDraft.photoUrl} alt={customerDraft.name || 'Cliente'} />
                    ) : (
                      <span>👤</span>
                    )}
                  </div>
                  <label className="customer-upload-button">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const nextUrl = URL.createObjectURL(file);
                        updateCustomerPhoto(nextUrl);
                        event.currentTarget.value = '';
                      }}
                    />
                    <span>⤴ Carregar</span>
                  </label>
                </div>
              </div>

              <div className="customer-form-column">
                <label className="modal-field">
                  <span>Nome</span>
                  <input
                    value={customerDraft.name}
                    onChange={(event) =>
                      setCustomerDraft((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </label>

                <div className="form-row">
                  <label className="modal-field">
                    <span>Nascimento</span>
                    <input
                      type="date"
                      value={customerDraft.birthDate}
                      onChange={(event) =>
                        setCustomerDraft((prev) => ({ ...prev, birthDate: event.target.value }))
                      }
                    />
                  </label>
                  <label className="modal-field">
                    <span>WhatsApp</span>
                    <input
                      value={customerDraft.whatsapp}
                      placeholder="(00) 00000-0000"
                      onChange={(event) =>
                        setCustomerDraft((prev) => ({
                          ...prev,
                          whatsapp: formatPhoneInput(event.target.value)
                        }))
                      }
                    />
                  </label>
                </div>

                <label className="modal-field">
                  <span>Descricao</span>
                  <textarea
                    rows={4}
                    value={customerDraft.description}
                    onChange={(event) =>
                      setCustomerDraft((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </label>

                <label className="modal-field">
                  <span>Tags</span>
                  <div className="customer-tags-row">
                    <div className={`customer-tags-select${customerTagsOpen ? ' open' : ''}`}>
                      <input
                        placeholder="Selecione ou crie tags"
                        value={customerDraft.tagsInput}
                        onChange={(event) =>
                          setCustomerDraft((prev) => ({ ...prev, tagsInput: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ',') return;
                          event.preventDefault();
                          addCustomerTag(customerDraft.tagsInput);
                        }}
                      />
                      <button
                        type="button"
                        className="customer-tags-toggle"
                        onClick={() => setCustomerTagsOpen((prev) => !prev)}
                      >
                        ⌄
                      </button>
                    </div>
                    <button
                      type="button"
                      className="customer-tags-settings"
                      onClick={() => setCustomerTagsOpen((prev) => !prev)}
                    >
                      ⚙
                    </button>
                  </div>

                  {customerTagsOpen ? (
                    <div className="customer-tags-menu">
                      {customerTagOptions.map((tag) => {
                        const isSelected = customerDraft.tags.some(
                          (item) => item.toLowerCase() === tag.toLowerCase()
                        );
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={`customer-tag-option${isSelected ? ' active' : ''}`}
                            onClick={() => (isSelected ? removeCustomerTag(tag) : addCustomerTag(tag))}
                          >
                            {isSelected ? '✓ ' : ''}
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {customerDraft.tags.length > 0 ? (
                    <div className="customer-tags-list">
                      {customerDraft.tags.map((tag) => (
                        <span key={tag} className="customer-tag-pill">
                          {tag}
                          <button type="button" onClick={() => removeCustomerTag(tag)}>
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </label>
              </div>
            </div>

            <section className={`customer-extra${customerAdditionalOpen ? ' open' : ''}`}>
              <button
                type="button"
                className="customer-extra-toggle"
                onClick={() => setCustomerAdditionalOpen((prev) => !prev)}
              >
                <span>Informacoes adicionais</span>
                <strong>{customerAdditionalOpen ? '⌃' : '⌄'}</strong>
              </button>
              <div className={`customer-extra-content${customerAdditionalOpen ? ' open' : ''}`}>
                <label className="modal-field">
                  <span>CPF/CNPJ</span>
                  <input
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    value={customerDraft.cpfCnpj}
                    onChange={(event) =>
                      setCustomerDraft((prev) => ({
                        ...prev,
                        cpfCnpj: formatCpfCnpjInput(event.target.value)
                      }))
                    }
                  />
                </label>

                <div className="customer-extra-title">ENDERECO</div>

                <label className="modal-field">
                  <span>CEP</span>
                  <input
                    placeholder="00000-000"
                    value={customerDraft.cep}
                    onChange={(event) =>
                      setCustomerDraft((prev) => ({
                        ...prev,
                        cep: formatCepInput(event.target.value)
                      }))
                    }
                  />
                </label>

                <div className="form-row">
                  <label className="modal-field">
                    <span>Rua</span>
                    <input
                      placeholder="Nome da rua"
                      value={customerDraft.street}
                      onChange={(event) =>
                        setCustomerDraft((prev) => ({ ...prev, street: event.target.value }))
                      }
                    />
                  </label>
                  <label className="modal-field">
                    <span>Numero</span>
                    <input
                      placeholder="123"
                      value={customerDraft.number}
                      onChange={(event) =>
                        setCustomerDraft((prev) => ({ ...prev, number: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <label className="modal-field">
                  <span>Complemento</span>
                  <input
                    placeholder="Apto, bloco, etc."
                    value={customerDraft.complement}
                    onChange={(event) =>
                      setCustomerDraft((prev) => ({ ...prev, complement: event.target.value }))
                    }
                  />
                </label>

                <label className="modal-field">
                  <span>Bairro</span>
                  <input
                    placeholder="Nome do bairro"
                    value={customerDraft.neighborhood}
                    onChange={(event) =>
                      setCustomerDraft((prev) => ({ ...prev, neighborhood: event.target.value }))
                    }
                  />
                </label>

                <div className="form-row">
                  <label className="modal-field">
                    <span>Cidade</span>
                    <input
                      placeholder="Nome da cidade"
                      value={customerDraft.city}
                      onChange={(event) =>
                        setCustomerDraft((prev) => ({ ...prev, city: event.target.value }))
                      }
                    />
                  </label>
                  <label className="modal-field">
                    <span>Estado</span>
                    <input
                      placeholder="UF"
                      value={customerDraft.state}
                      maxLength={2}
                      onChange={(event) =>
                        setCustomerDraft((prev) => ({
                          ...prev,
                          state: event.target.value.toUpperCase()
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            </section>

            {customerFormError ? <div className="field-error customer-form-error">{customerFormError}</div> : null}

            <div className="modal-footer customer-create-footer">
              <button className="button ghost" type="button" onClick={closeCreateCustomerModal}>
                Cancelar
              </button>
              <button
                className="button primary customer-create-submit"
                type="button"
                onClick={handleCreateCustomer}
                disabled={customerSaving}
              >
                {customerSaving ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sellPaymentOpen ? (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            if (event.target !== event.currentTarget) return;
            setSellPaymentOpen(false);
          }}
        >
          <div className="modal modal-payment" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Pagamento da venda</h3>
              <button className="modal-close" type="button" onClick={() => setSellPaymentOpen(false)}>
                ✕
              </button>
            </div>
            <label className="modal-field">
              <span>Valor do pagamento</span>
              <input
                className={sellRegisterError ? 'input-error' : undefined}
                value={sellRegisterAmount}
                inputMode="decimal"
                placeholder="R$ 0,00"
                onChange={(event) => {
                  setSellRegisterAmount(formatCurrencyInput(event.target.value));
                  if (sellRegisterError) setSellRegisterError(null);
                }}
              />
              {sellRegisterError ? <span className="field-error">{sellRegisterError}</span> : null}
            </label>
            <label className="modal-field">
              <span>Forma do pagamento</span>
              <div className="select-field">
                <select
                  value={sellRegisterMethod}
                  onChange={(event) => {
                    setSellRegisterMethod(event.target.value);
                    if (sellRegisterError) setSellRegisterError(null);
                  }}
                >
                  <option value="">Selecione</option>
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
                {sellRegisterMethod ? (
                  <button type="button" className="select-clear" onClick={() => setSellRegisterMethod('')}>
                    ✕
                  </button>
                ) : null}
                <span className="select-arrow">▾</span>
              </div>
            </label>
            <div className="installments">
              <div className="installments-header">
                <strong>Parcelas</strong>
                <div className="installments-controls">
                  <button className="button icon small" type="button" onClick={handleDecreaseSellInstallments}>
                    −
                  </button>
                  <span>{sellInstallments.length || 0}</span>
                  <button className="button icon small" type="button" onClick={handleIncreaseSellInstallments}>
                    +
                  </button>
                </div>
              </div>
              {sellRegisterTotal > 0 ? (
                <div className="installments-list">
                  {sellInstallments.map((installment, index) => (
                    <div key={installment.id} className="installment-row">
                      <div className="installment-index">{index + 1}</div>
                      <div className="installment-fields">
                        <label>
                          <span>Vencimento</span>
                          <input
                            type="date"
                            value={installment.dueDate}
                            onChange={(event) => updateSellInstallment(installment.id, 'dueDate', event.target.value)}
                          />
                        </label>
                        <label>
                          <span>Valor</span>
                          <input
                            value={installment.amount}
                            inputMode="decimal"
                            placeholder="R$ 0,00"
                            onChange={(event) =>
                              updateSellInstallment(installment.id, 'amount', formatCurrencyInput(event.target.value))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="installments-empty">Sem parcelas pendentes.</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setSellPaymentOpen(false)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleConfirmSellPayment}>
                Registrar pagamento
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editUnit && selectedProduct ? (
        <div className="modal-backdrop" onClick={() => setEditUnit(null)}>
          <div className="modal modal-units" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar unidade</h3>
              <button className="modal-close" type="button" onClick={() => setEditUnit(null)}>
                ✕
              </button>
            </div>
            <div className="unit-product">
              <div className="unit-thumb">
                {getProductImage(selectedProduct) ? (
                  <img src={getProductImage(selectedProduct)} alt={selectedProduct.name} />
                ) : (
                  <span className="product-initial">{getProductInitials(selectedProduct)}</span>
                )}
              </div>
              <div>
                <span>Atualizando unidade do produto</span>
                <strong>{getProductHeadline(selectedProduct)}</strong>
                <span>{getProductMetaLine(selectedProduct)}</span>
              </div>
            </div>
            <label className="modal-field">
              <span>Preco de compra</span>
              <input
                value={editUnitCost}
                inputMode="decimal"
                placeholder="R$ 0,00"
                onChange={(event) => setEditUnitCost(formatCurrencyInput(event.target.value))}
              />
            </label>
            <label className="modal-field">
              <span>Data de validade</span>
              <input
                type="date"
                value={editUnitExpiry}
                onChange={(event) => setEditUnitExpiry(event.target.value)}
              />
            </label>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setEditUnit(null)}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={handleUpdateUnit}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteUnit ? (
        <div className="modal-backdrop" onClick={() => setDeleteUnit(null)}>
          <div className="modal modal-delete" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Excluir unidade</h3>
              <button className="modal-close" type="button" onClick={() => setDeleteUnit(null)}>
                ✕
              </button>
            </div>
            <p>
              Tem certeza que deseja excluir esta unidade? Unidades vendidas nao podem ser removidas.
            </p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setDeleteUnit(null)}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={handleDeleteUnit}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteProduct ? (
        <div className="modal-backdrop" onClick={() => setDeleteProduct(null)}>
          <div className="modal modal-delete" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Excluir &quot;{deleteProduct.name}&quot;</h3>
              <button className="modal-close" type="button" onClick={() => setDeleteProduct(null)}>
                ✕
              </button>
            </div>
            <p>
              Ao excluir esse produto TODAS UNIDADES dele serao excluidas e voce perdera o historico
              de vendas relacionado ao produto.
            </p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setDeleteProduct(null)}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={() => handleDeleteProduct(deleteProduct)}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoriesOpen ? (
        <div className="modal-backdrop" onClick={closeCategories}>
          <div className="modal modal-categories" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {categoryMode === 'list'
                  ? 'Configurar categorias'
                  : categoryMode === 'edit'
                    ? 'Editar categoria'
                    : 'Nova categoria'}
              </h3>
              <button className="modal-close" type="button" onClick={closeCategories}>
                ✕
              </button>
            </div>

            {categoryMode === 'list' ? (
              <>
                <div className="category-manager-list">
                  {categories.length === 0 ? (
                    <p className="meta">Nenhuma categoria cadastrada.</p>
                  ) : (
                    categories.map((category) => (
                      <div key={category.id} className="category-manager-row">
                        <span
                          className="category-dot"
                          style={{ background: category.color || 'rgba(255,255,255,0.45)' }}
                        />
                        <strong>{category.name}</strong>
                        <div className="category-row-actions">
                          <button type="button" onClick={() => startEditCategory(category)}>
                            <IconEdit /> Editar
                          </button>
                          <button type="button" className="danger" onClick={() => setDeleteCategory(category)}>
                            <IconTrash /> Excluir
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button className="category-action" type="button" onClick={startCreateCategory}>
                  + Nova categoria
                </button>
              </>
            ) : (
              <>
                <label className="modal-field">
                  <span>Nome da categoria</span>
                  <input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Ex: Beleza"
                  />
                </label>
                <label className="modal-field">
                  <span>Cor da categoria</span>
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={(event) => setNewCategoryColor(event.target.value)}
                  />
                </label>
                <div className="modal-footer">
                  <button className="button ghost" type="button" onClick={resetCategoryForm}>
                    Voltar
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    onClick={categoryMode === 'edit' ? handleUpdateCategory : handleCreateCategory}
                  >
                    {categoryMode === 'edit' ? 'Salvar' : 'Criar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {deleteCategory ? (
        <div className="modal-backdrop" onClick={() => setDeleteCategory(null)}>
          <div className="modal modal-delete" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Remover categoria</h3>
              <button className="modal-close" type="button" onClick={() => setDeleteCategory(null)}>
                ✕
              </button>
            </div>
            <p>Tem certeza que deseja remover esta categoria?</p>
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={() => setDeleteCategory(null)}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={() => handleDeleteCategory(deleteCategory)}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}

      <SalesDetailModal
        open={Boolean(saleModal)}
        onClose={() => setSaleModal(null)}
        sale={saleModal}
        onUpdated={(update) => {
          handleSaleUpdated(update);
          if (selectedProduct) refreshProductDetails(selectedProduct.id);
        }}
      />
    </>
  );
}
