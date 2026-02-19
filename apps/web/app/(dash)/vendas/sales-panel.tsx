'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { API_BASE, SALES_SYNC_STORAGE_KEY, digitsOnly, formatCurrency, toNumber } from '../lib';
import { IconChart, IconCreditCard, IconDollar, IconPercent } from '../icons';
import SalesDetailModal, { type SaleDetail, type SaleUpdate } from '../sales-detail-modal';

type PaymentStatus = 'paid' | 'pending' | 'overdue' | 'partial';

type Sale = {
  id: string;
  status: string;
  total: number | string;
  created_at: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_photo_url?: string | null;
  items_count?: number | string;
  cost_total?: number | string;
  profit?: number | string;
  payment_status?: PaymentStatus;
};

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
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

type InstallmentInput = {
  id: string;
  dueDate: string;
  amount: string;
};

type SaleDraftItem = {
  id: string;
  productId: string;
  quantity: string;
  price: string;
  origin: 'stock' | 'order';
};

type SalesPanelProps = {
  sales: Sale[];
  customers: Customer[];
  products: Product[];
  totalSales: number;
  profit: number;
  totalReceivable: number;
  hasSalesInRange: boolean;
  initialCreateOpen?: boolean;
};

const PAGE_SIZE = 6;
const LOW_STOCK_THRESHOLD = 3;
const customerTagSuggestions = ['VIP', 'Frequente', 'Atacado', 'Recompra', 'Indicacao'];
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

const formatDate = (value: string) => {
  if (!value) return '--';
  const date = new Date(value);
  return date.toLocaleDateString('pt-BR');
};

const deliveryLabel = (status: string) => {
  if (status === 'cancelled') return 'Cancelado';
  if (status === 'pending') return 'A entregar';
  if (status === 'delivered') return 'Entregue';
  return 'Confirmado';
};

const deliveryBadge = (status: string) => {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'pending') return 'pending';
  if (status === 'delivered') return 'delivered';
  return 'confirmed';
};

const deliveryIcon = (status: string) => {
  if (status === 'cancelled') return '✕';
  if (status === 'pending') return '⏳';
  if (status === 'delivered') return '✓';
  return '●';
};

const paymentLabel = (status: PaymentStatus) => {
  if (status === 'paid') return 'Pago';
  if (status === 'partial') return 'Pago parcialmente';
  if (status === 'overdue') return 'Atrasado';
  return 'Pendente';
};

const paymentBadge = (status: PaymentStatus) => {
  if (status === 'paid') return 'paid';
  if (status === 'partial') return 'partial';
  if (status === 'overdue') return 'overdue';
  return 'pending';
};

const paymentIcon = (status: PaymentStatus) => {
  if (status === 'paid') return '✓';
  if (status === 'partial') return '⟳';
  if (status === 'overdue') return '!';
  return '⏳';
};

const formatItems = (count: number) => `${count} ${count === 1 ? 'unidade' : 'unidades'}`;

const getInitials = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || value.slice(0, 2).toUpperCase();
};

const toIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getProductNumericCode = (product?: Product | null) => {
  const skuDigits = digitsOnly(product?.sku);
  if (skuDigits) return skuDigits;
  return digitsOnly(product?.barcode);
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('invalid_file_data'));
    };
    reader.onerror = () => reject(new Error('invalid_file_data'));
    reader.readAsDataURL(file);
  });

const shrinkImageToDataUrl = (file: File, maxSize = 520, quality = 0.7) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('invalid_canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    img.onerror = () => reject(new Error('invalid_image'));
    img.src = URL.createObjectURL(file);
  });

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

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

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

const normalizePaymentMethod = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isCreditCardMethod = (value: string) =>
  normalizePaymentMethod(value).includes('cartao de credito');

const CUSTOMER_RETURN_BACK = '__back__';

const parseReturnPath = (value?: string | null) => {
  const next = (value || '').trim();
  if (!next) return null;
  if (!next.startsWith('/')) return null;
  return next;
};

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
      amount: formatCurrency(cents / 100)
    };
  });
};

const rebalanceInstallments = (
  installments: InstallmentInput[],
  changedId: string,
  changedAmount: string,
  targetTotal: number
): InstallmentInput[] => {
  if (!installments.length) return installments;
  const totalCents = Math.max(0, Math.round(targetTotal * 100));
  const changedIndex = installments.findIndex((item) => item.id === changedId);
  if (changedIndex === -1) return installments;

  if (installments.length === 1) {
    return installments.map((item) =>
      item.id === changedId ? { ...item, amount: formatCurrency(totalCents / 100) } : item
    );
  }

  const requestedChangedCents = Math.max(0, Math.round(parseMoney(changedAmount) * 100));
  const changedCents = Math.min(requestedChangedCents, totalCents);
  const remainingCents = totalCents - changedCents;
  const othersCount = installments.length - 1;
  const base = Math.floor(remainingCents / othersCount);
  let remainder = remainingCents - base * othersCount;

  return installments.map((item) => {
    if (item.id === changedId) {
      return { ...item, amount: formatCurrency(changedCents / 100) };
    }
    const cents = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return { ...item, amount: formatCurrency(cents / 100) };
  });
};

const createSaleDraftItem = (product?: Product): SaleDraftItem => {
  const available = Math.max(0, toNumber(product?.quantity ?? 0));
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    productId: product?.id || '',
    quantity: '1',
    price: product ? formatCurrency(toNumber(product.price)) : '',
    origin: available > 0 ? 'stock' : 'order'
  };
};

const getStockState = (quantity: number) => {
  if (quantity <= 0) return 'out';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
};

const getStockStatusLabel = (quantity: number) => {
  if (quantity <= 0) return 'Sem estoque';
  if (quantity <= LOW_STOCK_THRESHOLD) return `Estoque acabando (${quantity} em estoque)`;
  return `Com estoque (${quantity} em estoque)`;
};

export default function SalesPanel({
  sales,
  customers,
  products,
  totalSales,
  profit,
  totalReceivable,
  hasSalesInRange,
  initialCreateOpen = false
}: SalesPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [localSales, setLocalSales] = useState<Sale[]>(sales);
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(customers);
  const [localProducts, setLocalProducts] = useState<Product[]>(products);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const [createSaleOpen, setCreateSaleOpen] = useState(false);
  const [createSaleSaving, setCreateSaleSaving] = useState(false);
  const [createSaleError, setCreateSaleError] = useState<string | null>(null);
  const [saleCustomerName, setSaleCustomerName] = useState('');
  const [saleCustomerQuery, setSaleCustomerQuery] = useState('');
  const [saleCustomerId, setSaleCustomerId] = useState('');
  const [saleItems, setSaleItems] = useState<SaleDraftItem[]>([]);
  const [saleDate, setSaleDate] = useState(toIsoDate(new Date()));
  const [salePaid, setSalePaid] = useState(false);
  const [saleRegisterAmount, setSaleRegisterAmount] = useState('');
  const [saleDownPayment, setSaleDownPayment] = useState('');
  const [saleRegisterMethod, setSaleRegisterMethod] = useState('');
  const [saleInstallments, setSaleInstallments] = useState<InstallmentInput[]>([]);
  const [saleDiscount, setSaleDiscount] = useState('');
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [productModalProduct, setProductModalProduct] = useState<Product | null>(null);
  const [productModalPrice, setProductModalPrice] = useState('');
  const [productModalOrigin, setProductModalOrigin] = useState<'stock' | 'order'>('stock');
  const [productModalError, setProductModalError] = useState<string | null>(null);

  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(emptyCustomerDraft);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerFormError, setCustomerFormError] = useState<string | null>(null);
  const [customerAdditionalOpen, setCustomerAdditionalOpen] = useState(false);
  const [customerTagsOpen, setCustomerTagsOpen] = useState(false);
  const [autoOpenedFromQuery, setAutoOpenedFromQuery] = useState(false);
  const [customerReturnTarget, setCustomerReturnTarget] = useState<string | null>(null);
  const customerSearchRef = useRef<HTMLDivElement>(null);
  const customerTagsRef = useRef<HTMLLabelElement>(null);

  const saleProducts = useMemo(
    () => localProducts.filter((product) => product.active !== false),
    [localProducts]
  );

  const availableProducts = useMemo(() => saleProducts, [saleProducts]);

  const saleItemsDetailed = useMemo(
    () =>
      saleItems.map((item) => {
        const product = saleProducts.find((candidate) => candidate.id === item.productId) || null;
        const quantityRaw = Number.parseInt(item.quantity || '0', 10);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 0;
        const origin = item.origin || 'stock';
        const unitPrice = parseMoney(item.price);
        const available = Math.max(0, toNumber(product?.quantity ?? 0));
        return {
          ...item,
          origin,
          product,
          available,
          quantity,
          unitPrice,
          subtotal: quantity * unitPrice
        };
      }),
    [saleProducts, saleItems]
  );

  const filteredProducts = useMemo(() => {
    const normalized = normalizeSearchText(productSearch);
    if (!normalized) return saleProducts;
    return saleProducts.filter((product) => {
      const numericCode = getProductNumericCode(product);
      const haystack = normalizeSearchText(
        `${product.name || ''} ${product.brand || ''} ${product.sku || ''} ${product.barcode || ''} ${numericCode}`
      );
      return haystack.includes(normalized);
    });
  }, [saleProducts, productSearch]);

  const normalizedCustomerQuery = saleCustomerQuery.trim().toLowerCase();
  const selectedCustomerMatchesQuery =
    !!saleCustomerName &&
    saleCustomerName.trim().toLowerCase() === saleCustomerQuery.trim().toLowerCase();
  const customerSearchResults = normalizedCustomerQuery
    ? localCustomers.filter(
        (customer) =>
          customer.name.toLowerCase().includes(normalizedCustomerQuery) ||
          (customer.phone || '').toLowerCase().includes(normalizedCustomerQuery)
      )
    : localCustomers.slice(0, 8);
  const shouldShowCustomerResults =
    customerSearchOpen && (normalizedCustomerQuery.length === 0 || !selectedCustomerMatchesQuery);

  const customerTagOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...customerTagSuggestions,
          ...customerDraft.tags,
          ...(customerDraft.tagsInput.trim() ? [customerDraft.tagsInput.trim()] : [])
        ])
      ),
    [customerDraft.tags, customerDraft.tagsInput]
  );

  const saleSubtotal = saleItemsDetailed.reduce((sum, item) => sum + item.subtotal, 0);
  const saleDiscountTotal = Math.min(parseMoney(saleDiscount), Math.max(0, saleSubtotal));
  const saleTotalValue = Math.max(0, saleSubtotal - saleDiscountTotal);
  const saleRegisterTotal = parseMoney(saleRegisterAmount);
  const saleDownPaymentTotal = parseMoney(saleDownPayment);
  const saleIsCreditCardPayment = isCreditCardMethod(saleRegisterMethod);
  const saleEffectiveDownPaymentTotal = saleIsCreditCardPayment ? saleRegisterTotal : saleDownPaymentTotal;
  const salePendingTotal = Math.max(0, saleRegisterTotal - saleEffectiveDownPaymentTotal);

  const clearCreateParams = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('newSale') && !params.has('newCustomer') && !params.has('returnTo')) return;
    params.delete('newSale');
    params.delete('newCustomer');
    params.delete('returnTo');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
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
    setCustomerReturnTarget(null);
    resetCustomerDraft();
  };

  const openCreateCustomerModal = () => {
    setCustomerReturnTarget(null);
    setCreateCustomerOpen(true);
    setCustomerFormError(null);
    setCustomerAdditionalOpen(false);
    setCustomerTagsOpen(false);
    setCustomerPickerOpen(false);
    setCustomerSearchOpen(false);
  };

  const selectSaleCustomer = (customer: Customer) => {
    setSaleCustomerName(customer.name);
    setSaleCustomerQuery(customer.name);
    setSaleCustomerId(customer.id);
    setCustomerSearchOpen(false);
    setCustomerPickerOpen(false);
  };

  const updateCustomerPhoto = (nextUrl: string) => {
    setCustomerDraft((prev) => {
      if (prev.photoUrl && prev.photoUrl.startsWith('blob:') && prev.photoUrl !== nextUrl) {
        URL.revokeObjectURL(prev.photoUrl);
      }
      return { ...prev, photoUrl: nextUrl };
    });
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

  const updateSaleItem = (
    itemId: string,
    field: keyof Omit<SaleDraftItem, 'id'>,
    value: string
  ) => {
    setSaleItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    );
    if (createSaleError) setCreateSaleError(null);
  };

  const handleSaleItemProductChange = (itemId: string, productId: string) => {
    const nextProduct = saleProducts.find((product) => product.id === productId);
    setSaleItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              productId,
              price: nextProduct ? formatCurrency(toNumber(nextProduct.price)) : ''
            }
          : item
      )
    );
    if (createSaleError) setCreateSaleError(null);
  };

  const handleAddSaleItem = () => {
    if (availableProducts.length === 0) return;
    setSaleItems((prev) => {
      const selectedProductIds = new Set(prev.map((item) => item.productId).filter(Boolean));
      const nextProduct = availableProducts.find((product) => !selectedProductIds.has(product.id));
      return [...prev, createSaleDraftItem(nextProduct)];
    });
    if (createSaleError) setCreateSaleError(null);
  };

  const handleRemoveSaleItem = (itemId: string) => {
    setSaleItems((prev) => prev.filter((item) => item.id !== itemId));
    if (createSaleError) setCreateSaleError(null);
  };

  const openAddProductModal = (product: Product) => {
    const existing = saleItems.find((item) => item.productId === product.id);
    const available = Math.max(0, toNumber(product.quantity ?? 0));
    setProductModalProduct(product);
    setProductModalPrice(
      existing ? existing.price : product.price ? formatCurrency(toNumber(product.price)) : ''
    );
    setProductModalOrigin(existing ? existing.origin : available > 0 ? 'stock' : 'order');
    setProductModalError(null);
  };

  const closeAddProductModal = () => {
    setProductModalProduct(null);
    setProductModalPrice('');
    setProductModalOrigin('stock');
    setProductModalError(null);
  };

  const confirmAddProduct = () => {
    if (!productModalProduct) return;
    const unitPrice = parseMoney(productModalPrice);
    const available = Math.max(0, toNumber(productModalProduct.quantity ?? 0));

    if (unitPrice <= 0) {
      setProductModalError('Informe um preco de venda');
      return;
    }

    if (productModalOrigin === 'stock' && available <= 0) {
      setProductModalError('Produto sem estoque. Use \"Vou encomendar\".');
      return;
    }

    setSaleItems((prev) => {
      const existing = prev.find((item) => item.productId === productModalProduct.id);
      if (existing) {
        const currentQuantity = Number.parseInt(existing.quantity || '1', 10) || 1;
        const nextQuantity =
          productModalOrigin === 'stock'
            ? Math.min(Math.max(currentQuantity, 1), Math.max(1, available))
            : Math.max(currentQuantity, 1);
        return prev.map((item) =>
          item.productId === productModalProduct.id
            ? {
                ...item,
                price: formatCurrency(unitPrice),
                origin: productModalOrigin,
                quantity: String(nextQuantity)
              }
            : item
        );
      }

      const initialQuantity =
        productModalOrigin === 'stock' ? Math.min(1, Math.max(available, 1)) : 1;

      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          productId: productModalProduct.id,
          quantity: String(initialQuantity),
          price: formatCurrency(unitPrice),
          origin: productModalOrigin
        }
      ];
    });

    setCreateSaleError(null);
    closeAddProductModal();
  };

  const stepSaleItemQuantity = (itemId: string, delta: number) => {
    setSaleItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const product = saleProducts.find((candidate) => candidate.id === item.productId);
        const available = Math.max(0, toNumber(product?.quantity ?? 0));
        const current = Number.parseInt(item.quantity || '0', 10) || 0;
        let next = Math.max(1, current + delta);
        if (item.origin === 'stock') {
          if (available <= 0) {
            return { ...item, origin: 'order', quantity: String(Math.max(1, next)) };
          }
          next = Math.min(next, available);
        }
        return { ...item, quantity: String(next) };
      })
    );
    if (createSaleError) setCreateSaleError(null);
  };

  const resetCreateSaleForm = () => {
    setSaleCustomerName('');
    setSaleCustomerQuery('');
    setSaleCustomerId('');
    setCustomerSearchOpen(false);
    setCustomerPickerOpen(false);
    setSaleItems([]);
    setSaleDate(toIsoDate(new Date()));
    setSalePaid(true);
    setSaleRegisterAmount('');
    setSaleDownPayment('');
    setSaleRegisterMethod('Dinheiro');
    setSaleInstallments([]);
    setSaleDiscount('');
    setProductSearch('');
    setProductModalProduct(null);
    setProductModalPrice('');
    setProductModalOrigin('stock');
    setProductModalError(null);
    setCreateSaleError(null);
    setCreateCustomerOpen(false);
    resetCustomerDraft();
  };

  const openCreateSaleModal = () => {
    setCreateSaleOpen(true);
    resetCreateSaleForm();
    setCustomerPickerOpen(true);
  };

  const closeCreateSaleModal = () => {
    setCreateSaleOpen(false);
    resetCreateSaleForm();
    clearCreateParams();
  };

  useEffect(() => {
    setLocalSales(sales);
    setPage(1);
  }, [sales]);

  useEffect(() => {
    const pendingSync = window.localStorage.getItem(SALES_SYNC_STORAGE_KEY);
    if (!pendingSync) return;
    window.localStorage.removeItem(SALES_SYNC_STORAGE_KEY);
    router.refresh();
  }, [router]);

  useEffect(() => {
    setLocalCustomers(customers);
  }, [customers]);

  useEffect(() => {
    setLocalProducts(products);
  }, [products]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (
      (!createSaleOpen || !customerSearchOpen) &&
      !customerPickerOpen &&
      (!createCustomerOpen || !customerTagsOpen)
    )
      return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (createSaleOpen && customerSearchOpen && !customerSearchRef.current?.contains(target)) {
        setCustomerSearchOpen(false);
      }
      if (createCustomerOpen && customerTagsOpen && !customerTagsRef.current?.contains(target)) {
        setCustomerTagsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setCustomerSearchOpen(false);
      setCustomerTagsOpen(false);
      setCustomerPickerOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [createSaleOpen, customerSearchOpen, createCustomerOpen, customerTagsOpen]);

  useEffect(() => {
    if (autoOpenedFromQuery) return;
    const shouldOpenSale = initialCreateOpen || searchParams.get('newSale') === '1';
    const shouldOpenCustomer = searchParams.get('newCustomer') === '1';
    if (!shouldOpenSale && !shouldOpenCustomer) return;
    setAutoOpenedFromQuery(true);
    if (shouldOpenCustomer) {
      setCustomerReturnTarget(parseReturnPath(searchParams.get('returnTo')) || CUSTOMER_RETURN_BACK);
    }
    resetCreateSaleForm();
    if (shouldOpenSale) {
      setCreateSaleOpen(true);
      setCustomerPickerOpen(true);
    }
    if (shouldOpenCustomer) {
      setCreateCustomerOpen(true);
    }
    clearCreateParams();
  }, [autoOpenedFromQuery, initialCreateOpen, searchParams]);

  useEffect(() => {
    if (!createSaleOpen || salePaid) return;
    if (saleTotalValue <= 0) {
      setSaleRegisterAmount('');
      setSaleDownPayment('');
      setSaleInstallments([]);
      return;
    }
    setSaleRegisterAmount(formatCurrency(saleTotalValue));
  }, [createSaleOpen, salePaid, saleTotalValue]);

  useEffect(() => {
    if (!createSaleOpen || salePaid) return;
    if (salePendingTotal <= 0) {
      setSaleInstallments([]);
      return;
    }
    const count = saleInstallments.length || 1;
    const baseDate = saleDate || toIsoDate(new Date());
    setSaleInstallments(buildInstallments(count, salePendingTotal, baseDate));
  }, [createSaleOpen, salePaid, salePendingTotal, saleInstallments.length, saleDate]);

  useEffect(() => {
    if (!createSaleOpen || salePaid) return;
    if (saleRegisterTotal <= 0) {
      setSaleDownPayment('');
      return;
    }
    if (saleDownPaymentTotal > saleRegisterTotal) {
      setSaleDownPayment(formatCurrency(saleRegisterTotal));
    }
  }, [createSaleOpen, salePaid, saleRegisterTotal, saleDownPaymentTotal]);

  useEffect(() => {
    if (!createSaleOpen || salePaid || !saleIsCreditCardPayment) return;
    if (saleRegisterTotal <= 0) {
      setSaleDownPayment('');
      setSaleInstallments([]);
      return;
    }
    if (Math.abs(saleDownPaymentTotal - saleRegisterTotal) > 0.01) {
      setSaleDownPayment(formatCurrency(saleRegisterTotal));
    }
    if (saleInstallments.length > 0) {
      setSaleInstallments([]);
    }
  }, [
    createSaleOpen,
    salePaid,
    saleIsCreditCardPayment,
    saleRegisterTotal,
    saleDownPaymentTotal,
    saleInstallments.length
  ]);

  const updateSaleInstallment = (id: string, field: 'dueDate' | 'amount', value: string) => {
    if (field === 'amount') {
      setSaleInstallments((prev) => rebalanceInstallments(prev, id, value, salePendingTotal));
    } else {
      setSaleInstallments((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
      );
    }
    if (createSaleError) setCreateSaleError(null);
  };

  const handleIncreaseSaleInstallments = () => {
    if (salePendingTotal <= 0) return;
    const nextCount = Math.max(saleInstallments.length + 1, 1);
    setSaleInstallments(buildInstallments(nextCount, salePendingTotal, saleDate || toIsoDate(new Date())));
  };

  const handleDecreaseSaleInstallments = () => {
    if (saleInstallments.length <= 1) return;
    const nextCount = saleInstallments.length - 1;
    setSaleInstallments(buildInstallments(nextCount, salePendingTotal, saleDate || toIsoDate(new Date())));
  };

  const openModal = (sale: Sale) => {
    const mappedStatus: SaleDetail['status'] =
      sale.status === 'cancelled' ? 'cancelled' : sale.status === 'pending' ? 'pending' : 'delivered';
    const itemsCount = Math.max(0, toNumber(sale.items_count ?? 0));
    setSelectedSale({
      id: sale.id,
      customer: sale.customer_name || 'Cliente nao informado',
      customerPhotoUrl: sale.customer_photo_url || undefined,
      date: sale.created_at,
      status: mappedStatus,
      total: Number(sale.total),
      paid: 0,
      itemName: '',
      itemQty: itemsCount || 1,
      dueDate: sale.created_at
    });
  };

  const handleSaleUpdated = (update: SaleUpdate) => {
    setLocalSales((prev) => {
      if (update.removed) {
        return prev.filter((sale) => sale.id !== update.id);
      }
      return prev.map((sale) =>
        sale.id === update.id
          ? {
              ...sale,
              status: update.status ?? sale.status,
              payment_status: update.paymentStatus ?? sale.payment_status
            }
          : sale
      );
    });
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
      const safePhotoUrl =
        customerDraft.photoUrl && customerDraft.photoUrl.length <= 3900 ? customerDraft.photoUrl : undefined;
      if (customerDraft.photoUrl && !safePhotoUrl) {
        setCustomerFormError('A foto é muito grande para enviar. Tente uma imagem menor.');
        setCustomerSaving(false);
        return;
      }

      const res = await fetch(`${API_BASE}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          birthDate: customerDraft.birthDate || undefined,
          description: customerDraft.description.trim() || undefined,
          photoUrl: safePhotoUrl,
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
      const payload = (await res.json()) as { data?: Customer };
      const createdCustomer = payload.data;
      if (!createdCustomer) {
        setCustomerFormError('Erro ao cadastrar cliente');
        return;
      }
      setLocalCustomers((prev) => [createdCustomer, ...prev.filter((item) => item.id !== createdCustomer.id)]);
      if (customerReturnTarget) {
        const target = customerReturnTarget;
        closeCreateCustomerModal();
        setToast('Cliente cadastrado');
        setCustomerReturnTarget(null);
        if (target === CUSTOMER_RETURN_BACK) {
          router.back();
        } else {
          router.push(target);
        }
        return;
      }
      selectSaleCustomer(createdCustomer);
      closeCreateCustomerModal();
      setToast('Cliente cadastrado');
    } catch {
      setCustomerFormError('Erro ao cadastrar cliente');
    } finally {
      setCustomerSaving(false);
    }
  };

  const handleCreateSale = async () => {
    const normalizedItems = saleItems.map((item, index) => {
      const product = saleProducts.find((candidate) => candidate.id === item.productId) || null;
      const quantityRaw = Number.parseInt(item.quantity || '0', 10);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 0;
      const origin = item.origin || 'stock';
      const unitPrice = parseMoney(item.price);
      return {
        index,
        productId: item.productId,
        origin,
        product,
        quantity,
        unitPrice
      };
    });

    if (normalizedItems.length === 0) {
      setCreateSaleError('Adicione ao menos um produto para registrar a venda');
      return;
    }

    for (const item of normalizedItems) {
      if (!item.productId || !item.product) {
        setCreateSaleError(`Selecione um produto no item ${item.index + 1}`);
        return;
      }
      if (!item.quantity) {
        setCreateSaleError(`Informe uma quantidade valida no item ${item.index + 1}`);
        return;
      }
      if (item.unitPrice <= 0) {
        setCreateSaleError(`Informe o preco de venda no item ${item.index + 1}`);
        return;
      }
    }

    const requestedByProduct = new Map<string, number>();
    for (const item of normalizedItems) {
      if (!item.product || item.origin === 'order') continue;
      requestedByProduct.set(item.product.id, (requestedByProduct.get(item.product.id) || 0) + item.quantity);
    }

    for (const item of normalizedItems) {
      if (!item.product || item.origin === 'order') continue;
      const requested = requestedByProduct.get(item.product.id) || 0;
      const available = Math.max(0, toNumber(item.product.quantity ?? 0));
      if (requested > available) {
        setCreateSaleError(`Estoque insuficiente para ${item.product.name}. Disponivel: ${available}`);
        return;
      }
    }

    const customerNameValue = (saleCustomerName || saleCustomerQuery).trim();
    if (!customerNameValue) {
      setCreateSaleError('Selecione ou cadastre um cliente');
      return;
    }

    const rawTotalAmount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountValue = Math.min(rawTotalAmount, saleDiscountTotal);
    const totalAmount = Math.max(0, rawTotalAmount - discountValue);
    const saleDateValue = saleDate || toIsoDate(new Date());
    const downPaymentAmount = Math.max(0, saleIsCreditCardPayment ? saleRegisterTotal : saleDownPaymentTotal);
    const remainingAmount = Math.max(0, saleRegisterTotal - downPaymentAmount);
    const normalizedInstallments =
      !saleIsCreditCardPayment && remainingAmount > 0
        ? saleInstallments.length > 0
          ? saleInstallments
          : buildInstallments(1, remainingAmount, saleDateValue)
        : [];

    if (!salePaid) {
      if (saleRegisterTotal <= 0) {
        setCreateSaleError('Informe o valor do pagamento');
        return;
      }

      if (Math.abs(saleRegisterTotal - totalAmount) > 0.01) {
        setCreateSaleError('O valor do pagamento precisa ser igual ao valor da venda');
        return;
      }

      if (!saleIsCreditCardPayment && downPaymentAmount > saleRegisterTotal) {
        setCreateSaleError('A entrada nao pode ser maior que o valor do pagamento');
        return;
      }

      if (!saleIsCreditCardPayment && remainingAmount > 0) {
        if (normalizedInstallments.some((installment) => !installment.dueDate)) {
          setCreateSaleError('Informe o vencimento de todas as parcelas');
          return;
        }

        const installmentsTotal = normalizedInstallments.reduce(
          (sum, installment) => sum + parseMoney(installment.amount),
          0
        );

        if (Math.abs(installmentsTotal - remainingAmount) > 0.01) {
          setCreateSaleError('A soma das parcelas precisa ser igual ao valor restante');
          return;
        }
      }
    }

    const paidAtCheckout = salePaid ? totalAmount : downPaymentAmount;

    setCreateSaleSaving(true);
    setCreateSaleError(null);
    try {
      // Distribui desconto nos itens para refletir no backend
      let remainingDiscountCents = Math.round(discountValue * 100);
      const adjustedItems = normalizedItems.map((item) => {
        if (remainingDiscountCents <= 0 || item.quantity <= 0) return item;
        const itemTotalCents = Math.round(item.unitPrice * 100 * item.quantity);
        const discountedItemTotalCents = Math.max(0, itemTotalCents - remainingDiscountCents);
        remainingDiscountCents = Math.max(0, remainingDiscountCents - itemTotalCents);
        const adjustedUnit = item.quantity > 0 ? discountedItemTotalCents / (100 * item.quantity) : item.unitPrice;
        return { ...item, unitPrice: adjustedUnit };
      });

      const saleRes = await fetch(`${API_BASE}/sales/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: saleCustomerId || undefined,
          customerName: saleCustomerId ? undefined : customerNameValue,
          createdAt: `${saleDateValue}T00:00:00`,
          items: adjustedItems.flatMap((item) =>
            item.product
              ? [
                  {
                    sku: item.product.sku,
                    quantity: item.quantity,
                    price: item.unitPrice
                  }
                ]
              : []
          ),
          payments: paidAtCheckout > 0
            ? [
                {
                  method: saleRegisterMethod || 'Dinheiro',
                  amount: paidAtCheckout
                }
              ]
            : []
        })
      });

      if (!saleRes.ok) {
        const payload = (await saleRes.json().catch(() => null)) as { message?: string } | null;
        setCreateSaleError(payload?.message || 'Erro ao registrar a venda');
        return;
      }

      const payload = (await saleRes.json()) as {
        data?: { id?: string; created_at?: string; status?: string; customer_name?: string | null };
      };

      const saleId = payload.data?.id;
      let receivableFailed = false;

      if (!salePaid && saleId && normalizedInstallments.length > 0) {
        for (const installment of normalizedInstallments) {
          const amount = parseMoney(installment.amount);
          if (!amount || !installment.dueDate) {
            receivableFailed = true;
            continue;
          }

          const receivableRes = await fetch(`${API_BASE}/finance/receivables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              saleId,
              amount,
              dueDate: installment.dueDate,
              method: saleRegisterMethod || undefined
            })
          });

          if (!receivableRes.ok) {
            receivableFailed = true;
          }
        }
      }

      const soldByProduct = new Map<string, number>();
      for (const item of normalizedItems) {
        if (!item.product || item.origin === 'order') continue;
        soldByProduct.set(item.product.id, (soldByProduct.get(item.product.id) || 0) + item.quantity);
      }

      setLocalProducts((prev) =>
        prev.map((product) =>
          soldByProduct.has(product.id)
            ? {
                ...product,
                quantity: Math.max(0, toNumber(product.quantity ?? 0) - (soldByProduct.get(product.id) || 0))
              }
            : product
        )
      );

      closeCreateSaleModal();
      router.refresh();
      setToast(receivableFailed ? 'Venda criada, mas houve erro ao registrar parcela' : 'Venda registrada');
    } catch {
      setCreateSaleError('Erro ao registrar a venda');
    } finally {
      setCreateSaleSaving(false);
    }
  };

  const totalRows = localSales.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalRows);
  const pageSales = localSales.slice(startIndex, endIndex);

  return (
    <>
      <section className="stat-grid sales-stat-grid">
        <div className="stat-card">
          <div>
            <div className="stat-label">Quantidade de vendas</div>
            <div className="stat-value">{totalRows}</div>
          </div>
          <div className="stat-icon sales-count">
            <IconChart />
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Valor em vendas</div>
            <div className="stat-value">{formatCurrency(totalSales)}</div>
          </div>
          <div className="stat-icon sales-total">
            <IconDollar />
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Lucros</div>
            <div className="stat-value">{formatCurrency(profit)}</div>
          </div>
          <div className="stat-icon sales-profit">
            <IconPercent />
          </div>
        </div>
        <div className="stat-card">
          <div>
            <div className="stat-label">Total a receber</div>
            <div className="stat-value">{formatCurrency(totalReceivable)}</div>
          </div>
          <div className="stat-icon sales-receivable">
            <IconCreditCard />
          </div>
        </div>
      </section>

      <section className="panel sales-table-panel">
        {totalRows === 0 ? (
          <div className="empty-state">
            {hasSalesInRange ? (
              <>
                <div className="empty-icon">🔎</div>
                <strong>Nenhuma venda encontrada</strong>
                <span>Revise os filtros ou selecione outro periodo.</span>
              </>
            ) : (
              <>
                <div className="empty-icon">🏷️</div>
                <strong>Nenhuma venda registrada</strong>
                <span>Crie sua primeira venda para alimentar os indicadores.</span>
                <button className="button primary" type="button" onClick={openCreateSaleModal}>
                  + Nova venda
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="data-list">
              <div className="data-row cols-7 header">
                <span>Cliente</span>
                <span>Itens</span>
                <span>Total da venda</span>
                <span>Pagamento</span>
                <span>Entrega</span>
                <span>Lucro</span>
                <span>Data</span>
              </div>
              {pageSales.map((sale) => {
                const customerName = sale.customer_name || 'Cliente nao informado';
                const itemsCount = Math.max(0, toNumber(sale.items_count ?? 0));
                const profitValue = toNumber(
                  sale.profit ?? toNumber(sale.total) - toNumber(sale.cost_total)
                );
                const paymentStatus = sale.payment_status ?? 'paid';
                return (
                  <button
                    key={sale.id}
                    className="data-row cols-7 sale-row"
                    type="button"
                    onClick={() => openModal(sale)}
                  >
                    <div className="sale-customer">
                      <div className="sale-avatar">
                        {sale.customer_photo_url ? (
                          <img src={sale.customer_photo_url} alt={customerName} />
                        ) : (
                          getInitials(customerName)
                        )}
                      </div>
                      <div>
                        <strong>{customerName}</strong>
                        <div className="meta">Venda #{sale.id.slice(0, 6)}</div>
                      </div>
                    </div>
                    <div className="data-cell mono">{formatItems(itemsCount)}</div>
                    <div className="data-cell mono">{formatCurrency(toNumber(sale.total))}</div>
                    <span className={`payment-badge ${paymentBadge(paymentStatus)}`}>
                      <span className="badge-icon">{paymentIcon(paymentStatus)}</span>
                      {paymentLabel(paymentStatus)}
                    </span>
                    <span className={`delivery-badge ${deliveryBadge(sale.status)}`}>
                      <span className="badge-icon">{deliveryIcon(sale.status)}</span>
                      {deliveryLabel(sale.status)}
                    </span>
                    <div className="data-cell mono">{formatCurrency(profitValue)}</div>
                    <div className="data-cell mono">{formatDate(sale.created_at)}</div>
                  </button>
                );
              })}
            </div>
            <div className="table-footer">
              <span className="meta">
                {totalRows === 0 ? '0' : `${startIndex + 1} - ${endIndex} de ${totalRows}`}
              </span>
              <div className="pager">
                <button
                  className="button icon"
                  type="button"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  ‹
                </button>
                <button
                  className="button icon"
                  type="button"
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {createSaleOpen ? (
        <div className="modal-backdrop sale-overlay" onClick={closeCreateSaleModal}>
          <div className="sale-overlay-panel" onClick={(event) => event.stopPropagation()}>
            <div className="sale-overlay-header">
              <h3>Escolher produtos</h3>
              <div className="sale-overlay-actions">
                <button
                  className="sale-link-button"
                  type="button"
                  onClick={() => router.push('/categorias')}
                >
                  + Cadastrar produto
                </button>
                <button className="sale-icon-button" type="button" onClick={closeCreateSaleModal}>
                  ✕
                </button>
              </div>
            </div>

            <div className="sale-overlay-body">
              <section className="sale-products-column">
                <label className="sale-product-search">
                  <input
                    placeholder="Busque usando o nome, codigo da marca ou codigo de barras"
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                  <span>⌕</span>
                </label>

                <div className="sale-product-grid">
                  {filteredProducts.length === 0 ? (
                    <div className="sale-grid-empty">Nenhum produto encontrado.</div>
                  ) : (
                    filteredProducts.map((product) => {
                      const stock = Math.max(0, toNumber(product.quantity ?? 0));
                      const priceLabel = product.price ? formatCurrency(toNumber(product.price)) : 'Sem preco';
                      const inCart = saleItems.some((item) => item.productId === product.id);
                      const numericCode = getProductNumericCode(product);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          className={`sale-product-card${inCart ? ' selected' : ''}${stock <= 0 ? ' out' : ''}`}
                          onClick={() => openAddProductModal(product)}
                        >
                          <div className="sale-product-thumb">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} />
                            ) : (
                              <span className="sale-product-placeholder">📦</span>
                            )}
                            <span className={`sale-product-badge ${stock > 0 ? 'stock' : 'nostock'}`}>
                              {stock > 0 ? `${stock} un.` : 'Sem estoque'}
                            </span>
                          </div>
                          <div className="sale-product-meta">
                            <strong>
                              {numericCode ? `${numericCode} - ${product.name}` : product.name}
                            </strong>
                            <span>{product.brand || 'Sem marca'}</span>
                          </div>
                          <div className="sale-product-price">{priceLabel}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <aside className="sale-cart-column">
                <div className="sale-cart-header">
                  <div className="sale-cart-customer">
                    <span className="sale-cart-label">Vendendo para</span>
                    {saleCustomerName ? (
                      <button
                        type="button"
                        className="sale-customer-chip"
                        onClick={() => {
                          setCustomerPickerOpen(true);
                          setCustomerSearchOpen(true);
                        }}
                      >
                        <span className="sale-customer-avatar">
                          {saleCustomerName ? getInitials(saleCustomerName) : '👤'}
                        </span>
                        <span className="sale-customer-name">{saleCustomerName}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="sale-customer-ghost"
                        onClick={() => {
                          setCustomerPickerOpen(true);
                          setCustomerSearchOpen(true);
                        }}
                      >
                        Selecionar cliente
                      </button>
                    )}
                  </div>
                </div>

                <div className="sale-cart-list">
                  {saleItemsDetailed.length === 0 ? (
                    <div className="sale-cart-empty">Nenhum produto adicionado</div>
                  ) : (
                    saleItemsDetailed.map((item) => {
                      const product = item.product;
                      const quantity = item.quantity;
                      const available = item.available;
                      const cartProductCode = getProductNumericCode(product);
                      return (
                        <div key={item.id} className="sale-cart-item">
                          <div className="sale-cart-info">
                            <div className="sale-cart-thumb">
                              {product?.image_url ? (
                                <img src={product.image_url} alt={product.name} />
                              ) : (
                                getInitials(product?.name || 'Produto')
                              )}
                            </div>
                            <div className="sale-cart-text">
                              <div className="sale-cart-title">{product?.name || 'Produto'}</div>
                              <div className="sale-cart-meta">
                                {product?.brand || 'Sem marca'}
                                {cartProductCode ? ` • ${cartProductCode}` : ''}
                                <span className={`sale-origin ${item.origin === 'stock' ? 'stock' : 'order'}`}>
                                  {item.origin === 'stock' ? 'Estoque' : 'Encomendar'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="sale-cart-actions">
                            <label className="sale-cart-price">
                              <span>Preco</span>
                              <input
                                value={item.price}
                                inputMode="decimal"
                                placeholder="R$ 0,00"
                                onChange={(event) =>
                                  updateSaleItem(item.id, 'price', formatCurrencyInput(event.target.value))
                                }
                              />
                            </label>
                            <div className="sale-qty-stepper">
                              <button
                                type="button"
                                onClick={() => stepSaleItemQuantity(item.id, -1)}
                                disabled={quantity <= 1}
                              >
                                −
                              </button>
                              <span>{quantity}</span>
                              <button
                                type="button"
                                onClick={() => stepSaleItemQuantity(item.id, 1)}
                                disabled={item.origin === 'stock' && available > 0 && quantity >= available}
                                title={
                                  item.origin === 'stock' && available > 0 && quantity >= available
                                    ? 'Maximo em estoque atingido'
                                    : undefined
                                }
                              >
                                +
                              </button>
                            </div>
                            <button
                              className="sale-icon-button ghost"
                              type="button"
                              aria-label="Remover"
                              onClick={() => handleRemoveSaleItem(item.id)}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="sale-cart-summary">
                  <div className="summary-row">
                    <span>Subtotal</span>
                    <strong>{formatCurrency(saleSubtotal)}</strong>
                  </div>
                  <label className="modal-field sale-discount-field">
                    <span>Desconto</span>
                    <input
                      value={saleDiscount}
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      onChange={(event) => {
                        setSaleDiscount(formatCurrencyInput(event.target.value));
                        if (createSaleError) setCreateSaleError(null);
                      }}
                    />
                  </label>
                  <div className="summary-row total">
                    <span>Total</span>
                    <strong>{formatCurrency(saleTotalValue)}</strong>
                  </div>
                  <label className="modal-field sale-date-field">
                    <span>Data da venda</span>
                    <input type="date" value={saleDate} onChange={(event) => setSaleDate(event.target.value)} />
                  </label>
                  {createSaleError ? <div className="field-error">{createSaleError}</div> : null}
                  <button
                    className="button primary sale-submit"
                    type="button"
                    onClick={handleCreateSale}
                    disabled={createSaleSaving || saleItemsDetailed.length === 0 || !saleCustomerName}
                  >
                    {createSaleSaving ? 'Salvando...' : 'Concluir venda'}
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {productModalProduct ? (
        <div className="modal-backdrop" onClick={closeAddProductModal}>
          <div className="modal modal-add-product" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Adicionar produto</h3>
              <button className="modal-close" type="button" onClick={closeAddProductModal}>
                ✕
              </button>
            </div>
            <div className="add-product-summary">
              <div className="add-product-thumb">
                {productModalProduct.image_url ? (
                  <img src={productModalProduct.image_url} alt={productModalProduct.name} />
                ) : (
                  <span>📦</span>
                )}
              </div>
              <div className="add-product-meta">
                <span>
                  {productModalProduct.brand || 'Sem marca'} ·{' '}
                  {getProductNumericCode(productModalProduct) || 'Sem codigo'}
                </span>
                <strong>{productModalProduct.name}</strong>
              </div>
            </div>
            <label className="modal-field">
              <span>Preco de venda</span>
              <input
                value={productModalPrice}
                inputMode="decimal"
                placeholder="R$ 0,00"
                onChange={(event) => {
                  setProductModalPrice(formatCurrencyInput(event.target.value));
                  setProductModalError(null);
                }}
              />
            </label>
            <div className="add-product-origin">
              <span>Origem do produto</span>
              <div className="origin-toggle">
                <button
                  type="button"
                  className={productModalOrigin === 'stock' ? 'active' : ''}
                  onClick={() => setProductModalOrigin('stock')}
                  disabled={Math.max(0, toNumber(productModalProduct.quantity ?? 0)) <= 0}
                >
                  Tenho no estoque
                </button>
                <button
                  type="button"
                  className={productModalOrigin === 'order' ? 'active' : ''}
                  onClick={() => setProductModalOrigin('order')}
                >
                  Vou encomendar
                </button>
              </div>
              {productModalOrigin === 'stock' ? (
                <small className="meta">
                  {Math.max(0, toNumber(productModalProduct.quantity ?? 0))} unidade(s) disponivel(is)
                </small>
              ) : (
                <small className="meta">Sem limite de unidades para encomenda.</small>
              )}
            </div>
            {productModalError ? <div className="field-error">{productModalError}</div> : null}
            <div className="modal-footer">
              <button className="button ghost" type="button" onClick={closeAddProductModal}>
                Cancelar
              </button>
              <button className="button primary" type="button" onClick={confirmAddProduct}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {customerPickerOpen ? (
        <div className="modal-backdrop" onClick={() => setCustomerPickerOpen(false)}>
          <div className="modal modal-customer-picker" onClick={(event) => event.stopPropagation()}>
            <div className="customer-picker-header">
              <h3>Selecione o cliente</h3>
              <button className="sale-link-button" type="button" onClick={openCreateCustomerModal}>
                + Cadastrar cliente
              </button>
            </div>
            <label className="customer-picker-search">
              <input
                placeholder="Buscar cliente"
                value={saleCustomerQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setSaleCustomerQuery(value);
                  setCustomerSearchOpen(true);
                  const match = localCustomers.find(
                    (customer) => customer.name.trim().toLowerCase() === value.trim().toLowerCase()
                  );
                  if (match) {
                    setSaleCustomerId(match.id);
                    setSaleCustomerName(match.name);
                  }
                }}
                autoFocus
              />
              <span>⌕</span>
            </label>

            <div className="customer-picker-results">
              {customerSearchResults.length === 0 ? (
                <span className="meta">Nenhum cliente encontrado.</span>
              ) : (
                customerSearchResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className={`customer-picker-item${saleCustomerId === customer.id ? ' active' : ''}`}
                    onClick={() => selectSaleCustomer(customer)}
                  >
                    <span className="customer-picker-avatar">{getInitials(customer.name)}</span>
                    <div className="customer-picker-text">
                      <strong>{customer.name}</strong>
                      <span>{customer.phone || 'Sem telefone'}</span>
                    </div>
                  </button>
                ))
              )}
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
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        try {
                          const base = await fileToDataUrl(file);
                          const fitSize = 3800;
                          if (base.length > fitSize) {
                            const shrunk = await shrinkImageToDataUrl(file, 520, 0.72);
                            if (shrunk.length > fitSize) {
                              setCustomerFormError('A foto é muito grande. Use uma imagem menor (até ~3KB).');
                              updateCustomerPhoto('');
                            } else {
                              updateCustomerPhoto(shrunk);
                              setCustomerFormError(null);
                            }
                          } else {
                            updateCustomerPhoto(base);
                            setCustomerFormError(null);
                          }
                        } catch {
                          setCustomerFormError('Nao foi possivel carregar a imagem do cliente');
                        }
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

                <label ref={customerTagsRef} className="modal-field">
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

      <SalesDetailModal
        open={Boolean(selectedSale)}
        onClose={() => setSelectedSale(null)}
        sale={selectedSale}
        onUpdated={handleSaleUpdated}
      />

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
