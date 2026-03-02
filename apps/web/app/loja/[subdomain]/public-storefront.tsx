'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconArrowLeft, IconCart, IconCopy, IconSearch, IconTrash, IconWhatsapp } from '../../(dash)/icons';
import { API_BASE, buildMutationHeaders } from '../../(dash)/lib';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  loadStorefrontRuntimeState,
  normalizeStorefrontSettings,
  sanitizeSubdomain,
  type StorefrontSettings
} from '../../lib/storefront-settings';

type StoreProduct = {
  id: string;
  sku?: string | null;
  barcode?: string | null;
  name: string;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
  quantity?: number | string;
  price?: number | string;
  active?: boolean;
};

type PublicStoreSettings = Partial<StorefrontSettings> & {
  logoUrl?: string;
  pixKey?: string;
  creditCardLink?: string;
  boletoLink?: string;
  mercadoPagoEnabled?: boolean;
};

type NormalizedProduct = {
  id: string;
  sku: string;
  code: string;
  name: string;
  brand: string;
  category: string;
  imageUrl: string;
  quantity: number;
  price: number;
};

type CartItem = {
  productId: string;
  sku: string;
  code: string;
  name: string;
  brand: string;
  category: string;
  imageUrl: string;
  price: number;
  available: number;
  quantity: number;
};

type PublicView = 'catalog' | 'product' | 'checkout' | 'success';
type CheckoutPaymentMethod = 'pix' | 'credit_card';

type CheckoutResponse = {
  data?: {
    payment?: {
      method?: CheckoutPaymentMethod;
      reference?: string;
      checkoutUrl?: string;
      provider?: string;
    };
  };
  message?: string;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatPrice = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const toTlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`;

const computeCrc16 = (payload: string) => {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const normalizePixText = (value: string, fallback: string, maxLength: number) => {
  const clean = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (clean || fallback).slice(0, maxLength);
};

const buildPixCopyPasteCode = ({
  key,
  amount,
  merchantName,
  merchantCity,
  txid
}: {
  key: string;
  amount: number;
  merchantName: string;
  merchantCity: string;
  txid: string;
}) => {
  const pixKey = key.trim();
  if (!pixKey) return '';

  const merchantAccountInfo = `${toTlv('00', 'br.gov.bcb.pix')}${toTlv('01', pixKey.slice(0, 77))}`;
  const merchantNameField = normalizePixText(merchantName, 'LOJA', 25);
  const merchantCityField = normalizePixText(merchantCity, 'SAO PAULO', 15);
  const txidField = normalizePixText(txid, 'PEDIDO', 25);
  const safeAmount = Math.max(0, amount);

  const payloadWithoutCrc = [
    toTlv('00', '01'),
    toTlv('26', merchantAccountInfo),
    toTlv('52', '0000'),
    toTlv('53', '986'),
    toTlv('54', safeAmount.toFixed(2)),
    toTlv('58', 'BR'),
    toTlv('59', merchantNameField),
    toTlv('60', merchantCityField),
    toTlv('62', toTlv('05', txidField)),
    '6304'
  ].join('');

  return `${payloadWithoutCrc}${computeCrc16(payloadWithoutCrc)}`;
};

const normalizeToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const parseCurrencyValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = value
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const toWhatsappPhone = (value: string) => {
  const digits = onlyDigits(value);
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
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

const isValidCustomerPhone = (value: string) => {
  const digits = onlyDigits(value);
  if (!digits) return false;
  if (digits.startsWith('55')) {
    const local = digits.slice(2);
    return local.length === 10 || local.length === 11;
  }
  return digits.length === 10 || digits.length === 11;
};

const uniqueTextValues = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.toLowerCase())
    )
  );

const includesToken = (list: string[], value: string) =>
  list.some((item) => normalizeToken(item) === normalizeToken(value));

const buildProductCode = (item: StoreProduct) => {
  const barcode = item.barcode?.trim();
  if (barcode) return barcode;
  const sku = item.sku?.trim() || '';
  const numericFromSku = sku.replace(/\D/g, '');
  if (numericFromSku) return numericFromSku;
  if (sku) return sku;
  return item.id.slice(0, 8).toUpperCase();
};

const normalizeStoreProduct = (item: StoreProduct): NormalizedProduct => ({
  id: item.id,
  sku: (item.sku || item.id || '').trim(),
  code: buildProductCode(item),
  name: item.name?.trim() || 'Produto sem nome',
  brand: item.brand?.trim() || 'Sem marca',
  category: item.category?.trim() || 'Sem categoria',
  imageUrl: item.image_url?.trim() || '',
  quantity: Math.max(0, Math.trunc(toNumber(item.quantity))),
  price: Math.max(0, toNumber(item.price))
});

const normalizeCartItem = (item: CartItem, latest?: NormalizedProduct): CartItem => {
  if (!latest) return item;
  const available = Math.max(0, latest.quantity);
  return {
    productId: item.productId,
    sku: latest.sku,
    code: latest.code,
    name: latest.name,
    brand: latest.brand,
    category: latest.category,
    imageUrl: latest.imageUrl,
    price: latest.price,
    available,
    quantity: Math.max(0, Math.min(item.quantity, available))
  };
};

export default function PublicStorefront({
  subdomain,
  initialProducts,
  initialStoreName,
  initialStoreSettings,
  initialProductId,
  unavailable
}: {
  subdomain: string;
  initialProducts: StoreProduct[];
  initialStoreName: string;
  initialStoreSettings?: PublicStoreSettings;
  initialProductId?: string | null;
  unavailable?: boolean;
}) {
  const settings = useMemo(
    () =>
      normalizeStorefrontSettings({
        ...DEFAULT_STOREFRONT_SETTINGS,
        ...(initialStoreSettings || {}),
        shopName: initialStoreSettings?.shopName?.trim() || initialStoreName || DEFAULT_STOREFRONT_SETTINGS.shopName
      }),
    [initialStoreName, initialStoreSettings]
  );

  const logoUrl = initialStoreSettings?.logoUrl?.trim() || '';
  const pixKey = initialStoreSettings?.pixKey?.trim() || '';
  const creditCardLink = initialStoreSettings?.creditCardLink?.trim() || '';
  const mercadoPagoEnabled = Boolean(initialStoreSettings?.mercadoPagoEnabled);
  const initialProductFromQuery = (initialProductId || '').trim();

  const [view, setView] = useState<PublicView>(initialProductFromQuery ? 'product' : 'catalog');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductFromQuery || null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productsSource, setProductsSource] = useState<StoreProduct[]>(() => initialProducts || []);

  const [search, setSearch] = useState('');
  const [brandOpen, setBrandOpen] = useState(true);
  const [categoryOpen, setCategoryOpen] = useState(true);
  const [priceOpen, setPriceOpen] = useState(true);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(() => settings.selectedBrands || []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => settings.selectedCategories || []);
  const [priceFromDraft, setPriceFromDraft] = useState(settings.priceFrom || '');
  const [priceToDraft, setPriceToDraft] = useState(settings.priceTo || '');
  const [priceFromApplied, setPriceFromApplied] = useState(settings.priceFrom || '');
  const [priceToApplied, setPriceToApplied] = useState(settings.priceTo || '');

  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [toastMessage, setToastMessage] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<CheckoutPaymentMethod | ''>(
    pixKey ? 'pix' : mercadoPagoEnabled || creditCardLink ? 'credit_card' : ''
  );
  const [creditCardInstallments, setCreditCardInstallments] = useState(1);
  const [paymentHelperMessage, setPaymentHelperMessage] = useState('');
  const [paymentHelperError, setPaymentHelperError] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutError, setCheckoutError] = useState(false);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>([]);
  const [productDescriptions, setProductDescriptions] = useState<Record<string, string>>({});
  const [storePriceOverrides, setStorePriceOverrides] = useState<Record<string, number>>({});
  const [successPaymentUrl, setSuccessPaymentUrl] = useState('');
  const [successPaymentMethod, setSuccessPaymentMethod] = useState<CheckoutPaymentMethod | ''>('');
  const [successPaymentProvider, setSuccessPaymentProvider] = useState('');

  const viewStateSubdomain = useMemo(
    () => sanitizeSubdomain(subdomain) || DEFAULT_STOREFRONT_SETTINGS.subdomain,
    [subdomain]
  );

  useEffect(() => {
    setProductsSource(initialProducts || []);
  }, [initialProducts]);

  useEffect(() => {
    const syncRuntime = () => {
      const runtime = loadStorefrontRuntimeState();
      if (!runtime) {
        setHiddenProductIds([]);
        setProductDescriptions({});
        setStorePriceOverrides({});
        return;
      }
      setHiddenProductIds(runtime.hiddenProductIds || []);
      setProductDescriptions(runtime.productDescriptions || {});
      setStorePriceOverrides(runtime.storePriceOverrides || {});
    };
    syncRuntime();
    const onStorage = (event: StorageEvent) => {
      if (event.key && !event.key.includes('revendis:storefront-runtime')) return;
      syncRuntime();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const products = useMemo<NormalizedProduct[]>(
    () =>
      productsSource
        .filter((item) => item.active !== false)
        .filter((item) => !hiddenProductIds.includes(item.id))
        .map((item) => {
          const normalized = normalizeStoreProduct(item);
          const override = storePriceOverrides[normalized.id];
          if (typeof override === 'number' && Number.isFinite(override)) {
            normalized.price = Math.max(0, override);
          }
          return normalized;
        }),
    [hiddenProductIds, productsSource, storePriceOverrides]
  );

  const productsById = useMemo(() => {
    const map = new Map<string, NormalizedProduct>();
    for (const product of products) {
      map.set(product.id, product);
    }
    return map;
  }, [products]);

  const configuredBrandTokens = useMemo(
    () => uniqueTextValues(settings.selectedBrands || []).map(normalizeToken),
    [settings.selectedBrands]
  );
  const configuredCategoryTokens = useMemo(
    () => uniqueTextValues(settings.selectedCategories || []).map(normalizeToken),
    [settings.selectedCategories]
  );
  const availablePaymentMethods = useMemo<CheckoutPaymentMethod[]>(() => {
    const methods: CheckoutPaymentMethod[] = [];
    if (pixKey) {
      methods.push('pix');
    }
    if (mercadoPagoEnabled || creditCardLink) {
      methods.push('credit_card');
    }
    return methods;
  }, [creditCardLink, mercadoPagoEnabled, pixKey]);

  const productsByStockRule = useMemo(
    () =>
      settings.onlyStockProducts || !settings.showOutOfStockProducts
        ? products.filter((item) => item.quantity > 0)
        : products,
    [products, settings.onlyStockProducts, settings.showOutOfStockProducts]
  );

  const productsByConfiguredOptions = useMemo(
    () =>
      productsByStockRule.filter((item) => {
        const allowedBrand =
          configuredBrandTokens.length === 0 || configuredBrandTokens.includes(normalizeToken(item.brand));
        const allowedCategory =
          configuredCategoryTokens.length === 0 || configuredCategoryTokens.includes(normalizeToken(item.category));
        return allowedBrand && allowedCategory;
      }),
    [configuredBrandTokens, configuredCategoryTokens, productsByStockRule]
  );

  const brandOptions = useMemo(
    () =>
      Array.from(new Set(productsByConfiguredOptions.map((item) => item.brand)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [productsByConfiguredOptions]
  );

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(productsByConfiguredOptions.map((item) => item.category)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [productsByConfiguredOptions]
  );

  const selectedBrandTokens = useMemo(() => uniqueTextValues(selectedBrands).map(normalizeToken), [selectedBrands]);
  const selectedCategoryTokens = useMemo(
    () => uniqueTextValues(selectedCategories).map(normalizeToken),
    [selectedCategories]
  );

  useEffect(() => {
    setSelectedBrands((prev) =>
      prev.filter((value) => brandOptions.some((option) => normalizeToken(option) === normalizeToken(value)))
    );
  }, [brandOptions]);

  useEffect(() => {
    setSelectedCategories((prev) =>
      prev.filter((value) => categoryOptions.some((option) => normalizeToken(option) === normalizeToken(value)))
    );
  }, [categoryOptions]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!paymentHelperMessage) return;
    const timer = window.setTimeout(() => {
      setPaymentHelperMessage('');
      setPaymentHelperError(false);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [paymentHelperMessage]);

  useEffect(() => {
    if (availablePaymentMethods.length === 0) {
      setSelectedPaymentMethod('');
      return;
    }
    setSelectedPaymentMethod((prev) => (prev && availablePaymentMethods.includes(prev) ? prev : availablePaymentMethods[0]));
  }, [availablePaymentMethods]);

  useEffect(() => {
    if (view !== 'product') return;
    const selected = selectedProductId ? productsById.get(selectedProductId) : null;
    if (!selected) {
      setView('catalog');
      setSelectedProductId(null);
      return;
    }
    setProductQuantity((prev) => Math.max(1, Math.min(prev, Math.max(1, selected.quantity || 1))));
  }, [view, selectedProductId, productsById]);

  const filteredProducts = useMemo(() => {
    const searchTerm = normalizeToken(search);
    const priceFrom = parseCurrencyValue(priceFromApplied);
    const priceTo = parseCurrencyValue(priceToApplied);

    return productsByConfiguredOptions.filter((product) => {
      if (searchTerm) {
        const searchable = normalizeToken(`${product.name} ${product.brand} ${product.category} ${product.code}`);
        if (!searchable.includes(searchTerm)) return false;
      }

      if (settings.filterByBrand && selectedBrandTokens.length > 0) {
        if (!selectedBrandTokens.includes(normalizeToken(product.brand))) return false;
      }

      if (settings.filterByCategory && selectedCategoryTokens.length > 0) {
        if (!selectedCategoryTokens.includes(normalizeToken(product.category))) return false;
      }

      if (settings.filterByPrice) {
        if (priceFrom !== null && product.price < priceFrom) return false;
        if (priceTo !== null && product.price > priceTo) return false;
      }

      return true;
    });
  }, [
    priceFromApplied,
    priceToApplied,
    productsByConfiguredOptions,
    search,
    selectedBrandTokens,
    selectedCategoryTokens,
    settings.filterByBrand,
    settings.filterByCategory,
    settings.filterByPrice
  ]);

  const selectedProduct = useMemo(
    () => (selectedProductId ? productsById.get(selectedProductId) || null : null),
    [selectedProductId, productsById]
  );

  const selectedProductDescription = useMemo(() => {
    if (!selectedProduct) return '';
    return (productDescriptions[selectedProduct.id] || '').trim();
  }, [productDescriptions, selectedProduct]);

  const cartDisplayItems = useMemo(
    () =>
      cartItems
        .map((item) => normalizeCartItem(item, productsById.get(item.productId)))
        .filter((item) => item.quantity > 0),
    [cartItems, productsById]
  );

  const cartCount = useMemo(
    () => cartDisplayItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartDisplayItems]
  );

  const cartTotal = useMemo(
    () => cartDisplayItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartDisplayItems]
  );
  const pixCopyPasteCode = useMemo(
    () =>
      buildPixCopyPasteCode({
        key: pixKey,
        amount: cartTotal,
        merchantName: settings.shopName || 'Loja',
        merchantCity: 'Sao Paulo',
        txid: `PEDIDO${Math.round(cartTotal * 100) || 1}`
      }),
    [cartTotal, pixKey, settings.shopName]
  );
  const pixQrCodeUrl = useMemo(
    () =>
      pixCopyPasteCode
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixCopyPasteCode)}`
        : '',
    [pixCopyPasteCode]
  );
  const installmentOptions = useMemo(() => {
    const maxInstallments = Math.min(6, Math.max(1, Math.floor(cartTotal / 30)));
    return Array.from({ length: maxInstallments }, (_, index) => index + 1);
  }, [cartTotal]);

  useEffect(() => {
    setCreditCardInstallments((prev) => {
      if (installmentOptions.length === 0) return 1;
      return installmentOptions.includes(prev) ? prev : installmentOptions[0];
    });
  }, [installmentOptions]);

  const syncProductQueryParam = (productId: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (productId) {
      url.searchParams.set('produto', productId);
    } else {
      url.searchParams.delete('produto');
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const openProductDetails = (productId: string) => {
    setSelectedProductId(productId);
    setProductQuantity(1);
    setView('product');
    syncProductQueryParam(productId);
  };

  const backToCatalog = () => {
    setView('catalog');
    setSelectedProductId(null);
    syncProductQueryParam(null);
  };

  const toggleSelection = (value: string, selected: string[], setter: (value: string[]) => void) => {
    const valueToken = normalizeToken(value);
    const exists = selected.some((item) => normalizeToken(item) === valueToken);
    setter(exists ? selected.filter((item) => normalizeToken(item) !== valueToken) : [...selected, value]);
  };

  const updateCartItemQuantity = (productId: string, nextQuantity: number) => {
    setCartItems((prev) =>
      prev.flatMap((item) => {
        if (item.productId !== productId) return [item];
        const latest = productsById.get(productId);
        const available = Math.max(0, latest?.quantity ?? item.available);
        const quantity = Math.max(0, Math.min(Math.trunc(nextQuantity), available));
        if (quantity <= 0) return [];
        const normalized = normalizeCartItem(item, latest);
        return [{ ...normalized, quantity }];
      })
    );
  };

  const removeCartItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const addToCart = (product: NormalizedProduct, requestedQuantity: number = 1) => {
    const available = Math.max(0, product.quantity);
    if (available <= 0) return;

    setCartItems((prev) => {
      const quantity = Math.max(1, Math.trunc(requestedQuantity));
      const index = prev.findIndex((item) => item.productId === product.id);
      if (index < 0) {
        return [
          ...prev,
          {
            productId: product.id,
            sku: product.sku,
            code: product.code,
            name: product.name,
            brand: product.brand,
            category: product.category,
            imageUrl: product.imageUrl,
            price: product.price,
            available,
            quantity: Math.min(quantity, available)
          }
        ];
      }

      const clone = [...prev];
      const current = clone[index];
      const merged = normalizeCartItem(current, product);
      clone[index] = {
        ...merged,
        quantity: Math.min(available, merged.quantity + quantity)
      };
      return clone;
    });

    setToastMessage('Produto adicionado ao carrinho');
    setCartOpen(true);
  };

  const openCheckout = () => {
    if (cartDisplayItems.length === 0) return;
    setView('checkout');
    setCartOpen(false);
    setCheckoutMessage('');
    setCheckoutError(false);
    setPaymentHelperMessage('');
    setPaymentHelperError(false);
  };

  const handleFinalizeOrder = async () => {
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

    if (!trimmedName) {
      setCheckoutMessage('Informe seu nome para finalizar o pedido.');
      setCheckoutError(true);
      return;
    }

    if (!isValidCustomerPhone(trimmedPhone)) {
      setCheckoutMessage('Informe um telefone valido com DDD.');
      setCheckoutError(true);
      return;
    }

    if (cartDisplayItems.length === 0) {
      setCheckoutMessage('Seu carrinho esta vazio.');
      setCheckoutError(true);
      return;
    }

    if (availablePaymentMethods.length === 0) {
      setCheckoutMessage('Esta loja ainda nao configurou forma de pagamento.');
      setCheckoutError(true);
      return;
    }

    if (!selectedPaymentMethod) {
      setCheckoutMessage('Selecione uma forma de pagamento.');
      setCheckoutError(true);
      return;
    }

    const paymentReference =
      selectedPaymentMethod === 'pix'
        ? pixCopyPasteCode || pixKey
        : mercadoPagoEnabled
          ? ''
          : creditCardLink;
    if (selectedPaymentMethod === 'pix' && !paymentReference) {
      setCheckoutMessage('A chave Pix da loja nao esta configurada.');
      setCheckoutError(true);
      return;
    }
    if (selectedPaymentMethod !== 'pix' && !mercadoPagoEnabled && !paymentReference) {
      setCheckoutMessage('A forma de pagamento selecionada nao esta disponivel agora.');
      setCheckoutError(true);
      return;
    }

    const hasUnavailable = cartDisplayItems.some((item) => item.available <= 0 || item.quantity > item.available);
    if (hasUnavailable) {
      setCheckoutMessage('Alguns itens ficaram sem estoque. Revise o carrinho e tente novamente.');
      setCheckoutError(true);
      return;
    }

    setSubmittingCheckout(true);
    setCheckoutMessage('');
    setCheckoutError(false);

    try {
      const response = await fetch(`${API_BASE}/storefront/orders`, {
        method: 'POST',
        headers: buildMutationHeaders(),
        body: JSON.stringify({
          subdomain: viewStateSubdomain,
          items: cartDisplayItems.map((item) => ({
            sku: item.sku,
            quantity: item.quantity,
            price: item.price
          })),
          customer: {
            name: trimmedName,
            phone: trimmedPhone
          },
          payment: {
            method: selectedPaymentMethod,
            reference: paymentReference,
            installments: selectedPaymentMethod === 'credit_card' ? creditCardInstallments : undefined
          }
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as CheckoutResponse | null;
        throw new Error(payload?.message || 'Nao foi possivel finalizar o pedido agora.');
      }
      const payload = (await response.json().catch(() => null)) as CheckoutResponse | null;
      const responsePaymentReference = payload?.data?.payment?.reference || '';
      const checkoutUrl =
        payload?.data?.payment?.checkoutUrl ||
        (/^https?:\/\//i.test(responsePaymentReference) ? responsePaymentReference : '');
      const method = payload?.data?.payment?.method || selectedPaymentMethod;
      const paymentProvider = payload?.data?.payment?.provider || '';

      // When Mercado Pago returns a checkout URL, continue directly to payment.
      if (paymentProvider === 'mercado_pago' && checkoutUrl) {
        setCheckoutMessage('Redirecionando para o pagamento...');
        setCheckoutError(false);
        window.location.assign(checkoutUrl);
        return;
      }

      setCartItems([]);
      setCartOpen(false);
      setSelectedProductId(null);
      setProductQuantity(1);
      setCustomerName('');
      setCustomerPhone('');
      setView('success');
      syncProductQueryParam(null);
      setCheckoutMessage('');
      setCheckoutError(false);
      setPaymentHelperMessage('');
      setPaymentHelperError(false);
      setSuccessPaymentUrl(checkoutUrl);
      setSuccessPaymentMethod(method);
      setSuccessPaymentProvider(paymentProvider);
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : 'Nao foi possivel finalizar o pedido agora.');
      setCheckoutError(true);
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const whatsappPhone = toWhatsappPhone(settings.whatsapp || '');
  const isPixAvailable = Boolean(pixKey);
  const isCreditCardAvailable = mercadoPagoEnabled || Boolean(creditCardLink);

  return (
    <main
      suppressHydrationWarning
      className="public-stock-link"
      style={{ ['--public-accent' as string]: settings.shopColor }}
    >
      <header className="public-stock-topbar">
        <div className="public-stock-brand">
          {logoUrl ? <img src={logoUrl} alt={settings.shopName} className="public-stock-brand-logo" /> : null}
          <strong>{settings.shopName}</strong>
        </div>

        <label className="public-stock-search" aria-label="Buscar produto">
          <IconSearch />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar produtos..."
          />
        </label>

        <button
          type="button"
          className="public-stock-cart"
          aria-label="Abrir carrinho"
          onClick={() => setCartOpen(true)}
        >
          <IconCart />
          {cartCount > 0 ? <span className="public-stock-cart-badge">{cartCount}</span> : null}
        </button>
      </header>

      {view === 'catalog' ? (
        <section className="public-stock-body">
          <aside className="public-stock-filters">
            {settings.filterByBrand ? (
              <section className="public-stock-filter-card">
                <button type="button" className="public-stock-filter-head" onClick={() => setBrandOpen((prev) => !prev)}>
                  <strong>Marca</strong>
                  <span>{brandOpen ? '^' : 'v'}</span>
                </button>
                {brandOpen ? (
                  <div className="public-stock-filter-content">
                    {brandOptions.length === 0 ? (
                      <span className="public-stock-filter-empty">Nenhuma marca disponivel</span>
                    ) : (
                      brandOptions.map((brand) => (
                        <label key={brand} className="public-stock-check">
                          <input
                            type="checkbox"
                            checked={includesToken(selectedBrands, brand)}
                            onChange={() => toggleSelection(brand, selectedBrands, setSelectedBrands)}
                          />
                          <span>{brand}</span>
                        </label>
                      ))
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            {settings.filterByCategory ? (
              <section className="public-stock-filter-card">
                <button
                  type="button"
                  className="public-stock-filter-head"
                  onClick={() => setCategoryOpen((prev) => !prev)}
                >
                  <strong>Categoria</strong>
                  <span>{categoryOpen ? '^' : 'v'}</span>
                </button>
                {categoryOpen ? (
                  <div className="public-stock-filter-content">
                    {categoryOptions.length === 0 ? (
                      <span className="public-stock-filter-empty">Nenhuma categoria disponivel</span>
                    ) : (
                      categoryOptions.map((category) => (
                        <label key={category} className="public-stock-check">
                          <input
                            type="checkbox"
                            checked={includesToken(selectedCategories, category)}
                            onChange={() => toggleSelection(category, selectedCategories, setSelectedCategories)}
                          />
                          <span>{category}</span>
                        </label>
                      ))
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            {settings.filterByPrice ? (
              <section className="public-stock-filter-card">
                <button type="button" className="public-stock-filter-head" onClick={() => setPriceOpen((prev) => !prev)}>
                  <strong>Preço</strong>
                  <span>{priceOpen ? '^' : 'v'}</span>
                </button>
                {priceOpen ? (
                  <div className="public-stock-filter-content">
                    <div className="public-stock-price-range">
                      <label>
                        De
                        <input
                          value={priceFromDraft}
                          onChange={(event) => setPriceFromDraft(event.target.value)}
                          placeholder="Minimo"
                        />
                      </label>
                      <label>
                        Até
                        <input
                          value={priceToDraft}
                          onChange={(event) => setPriceToDraft(event.target.value)}
                          placeholder="Maximo"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="public-stock-filter-apply"
                      onClick={() => {
                        setPriceFromApplied(priceFromDraft);
                        setPriceToApplied(priceToDraft);
                      }}
                    >
                      Aplicar
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </aside>

          <section className="public-stock-products">
            {unavailable ? (
              <article className="public-stock-empty">
                <strong>Loja indisponivel</strong>
                <span>O link "{subdomain}" nao foi encontrado agora.</span>
              </article>
            ) : filteredProducts.length === 0 ? (
              <article className="public-stock-empty">
                <strong>Nenhum produto encontrado</strong>
                <span>Ajuste os filtros para visualizar mais itens.</span>
              </article>
            ) : (
              <div className="public-stock-grid">
                {filteredProducts.map((product) => {
                  const outOfStock = product.quantity <= 0;
                  return (
                    <article
                      key={product.id}
                      className="public-stock-product"
                      role="button"
                      tabIndex={0}
                      onClick={() => openProductDetails(product.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openProductDetails(product.id);
                        }
                      }}
                    >
                      <div className="public-stock-product-image">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} loading="lazy" />
                        ) : (
                          <span className="public-stock-product-placeholder">Sem foto</span>
                        )}
                      </div>

                      <div className="public-stock-product-info">
                        <p>{product.name}</p>
                        <small>
                          {product.brand} • Cód: {product.code}
                        </small>
                        <strong>{formatPrice(product.price)}</strong>
                      </div>

                      <button
                        type="button"
                        className={outOfStock ? 'public-stock-buy soldout' : 'public-stock-buy'}
                        disabled={outOfStock}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (outOfStock) return;
                          addToCart(product, 1);
                        }}
                      >
                        {outOfStock ? 'Esgotado' : 'Adicionar'}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      ) : null}

      {view === 'product' ? (
        <section className="public-stock-detail-page">
          <button
            type="button"
            className="public-stock-back"
            onClick={backToCatalog}
          >
            <IconArrowLeft /> Voltar para a loja
          </button>

          {!selectedProduct ? (
            <article className="public-stock-empty">
              <strong>Produto indisponivel</strong>
              <span>Esse item nao esta disponivel no momento.</span>
            </article>
          ) : (
            <div className="public-stock-detail-layout">
              <article className="public-stock-detail-image">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.name} loading="lazy" />
                ) : (
                  <span className="public-stock-product-placeholder">Sem foto</span>
                )}
              </article>

              <article className="public-stock-detail-card">
                <small>{selectedProduct.brand.toUpperCase()}</small>
                <h1>{selectedProduct.name}</h1>
                <span className="public-stock-detail-code">Cód: {selectedProduct.code}</span>
                {selectedProductDescription ? (
                  <p className="public-stock-detail-description">{selectedProductDescription}</p>
                ) : null}
                <strong>{formatPrice(selectedProduct.price)}</strong>

                <div className="public-stock-detail-quantity-row">
                  <span>Quantidade:</span>
                  <div className="public-stock-qty-control">
                    <button
                      type="button"
                      onClick={() => setProductQuantity((prev) => Math.max(1, prev - 1))}
                      disabled={selectedProduct.quantity <= 0}
                    >
                      -
                    </button>
                    <span>{productQuantity}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setProductQuantity((prev) => Math.min(Math.max(1, selectedProduct.quantity), prev + 1))
                      }
                      disabled={selectedProduct.quantity <= 0 || productQuantity >= Math.max(1, selectedProduct.quantity)}
                    >
                      +
                    </button>
                  </div>
                  <em>{selectedProduct.quantity} disponíveis</em>
                </div>

                <button
                  type="button"
                  className={selectedProduct.quantity <= 0 ? 'public-stock-buy soldout full' : 'public-stock-buy full'}
                  disabled={selectedProduct.quantity <= 0}
                  onClick={() => {
                    if (selectedProduct.quantity <= 0) return;
                    addToCart(selectedProduct, productQuantity);
                  }}
                >
                  {selectedProduct.quantity <= 0 ? 'Esgotado' : 'Adicionar à sacola'}
                </button>
              </article>
            </div>
          )}
        </section>
      ) : null}

      {view === 'checkout' ? (
        <section className="public-stock-checkout-page">
          <button
            type="button"
            className="public-stock-back"
            onClick={backToCatalog}
          >
            <IconArrowLeft /> Voltar para a loja
          </button>

          <h1>Finalizar Compra</h1>

          <div className="public-stock-checkout-grid">
            <article className="public-stock-checkout-summary">
              <h2>Resumo do Pedido</h2>

              {cartDisplayItems.length === 0 ? (
                <div className="public-stock-checkout-empty">Nenhum item no carrinho.</div>
              ) : (
                <div className="public-stock-checkout-list">
                  {cartDisplayItems.map((item) => (
                    <div key={item.productId} className="public-stock-checkout-item">
                      <div className="public-stock-checkout-item-main">
                        <div className="public-stock-checkout-thumb">
                          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : null}
                        </div>
                        <div className="public-stock-checkout-item-copy">
                          <strong>{item.name}</strong>
                          <span>Cód: {item.code}</span>
                          <div className="public-stock-checkout-item-actions">
                            <div className="public-stock-qty-control">
                              <button type="button" onClick={() => updateCartItemQuantity(item.productId, item.quantity - 1)}>
                                -
                              </button>
                              <span>{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateCartItemQuantity(item.productId, item.quantity + 1)}
                                disabled={item.quantity >= item.available}
                              >
                                +
                              </button>
                            </div>
                            <em>{item.available} disponíveis</em>
                          </div>
                        </div>
                      </div>
                      <strong className="public-stock-checkout-item-price">{formatPrice(item.price * item.quantity)}</strong>
                    </div>
                  ))}
                </div>
              )}

              <div className="public-stock-checkout-total">
                <strong>Total</strong>
                <strong>{formatPrice(cartTotal)}</strong>
              </div>
            </article>

            <aside className="public-stock-checkout-form">
              <h2>Seus dados</h2>

              <label>
                Seu nome
                <input
                  value={customerName}
                  onChange={(event) => {
                    setCustomerName(event.target.value);
                    setCheckoutMessage('');
                  }}
                  placeholder="Insira seu nome"
                />
              </label>

              <label>
                Seu telefone
                <input
                  value={customerPhone}
                  onChange={(event) => {
                    setCustomerPhone(event.target.value);
                    setCheckoutMessage('');
                  }}
                  placeholder="Insira seu telefone"
                />
              </label>

              <div className="public-stock-payment-box">
                <div className="public-stock-payment-head">Forma de pagamento</div>

                {availablePaymentMethods.length === 0 ? (
                  <p className="public-stock-payment-note">Nenhuma forma de pagamento disponivel para esta loja.</p>
                ) : (
                  <>
                    <section className="public-stock-payment-group">
                      <strong className="public-stock-payment-group-title">Pix</strong>
                      <label
                        className={
                          !isPixAvailable
                            ? 'public-stock-payment-option disabled'
                            : selectedPaymentMethod === 'pix'
                              ? 'public-stock-payment-option active'
                              : 'public-stock-payment-option'
                        }
                      >
                        <input
                          type="radio"
                          name="checkout-payment-method"
                          value="pix"
                          checked={selectedPaymentMethod === 'pix'}
                          disabled={!isPixAvailable}
                          onChange={() => {
                            setSelectedPaymentMethod('pix');
                            setCheckoutMessage('');
                          }}
                        />
                        <span className="public-stock-payment-logo pix">PIX</span>
                        <span className="public-stock-payment-option-text">
                          {isPixAvailable ? 'Pagamento instantaneo' : 'Indisponivel no momento'}
                        </span>
                      </label>

                      {selectedPaymentMethod === 'pix' && isPixAvailable ? (
                        <div className="public-stock-payment-reference">
                          <span>Chave Pix: {pixKey}</span>
                          {pixQrCodeUrl ? (
                            <div className="public-stock-pix-qr">
                              <img src={pixQrCodeUrl} alt="QR Code Pix" />
                            </div>
                          ) : null}
                          <span>Pix copia e cola:</span>
                          <code className="public-stock-pix-code">{pixCopyPasteCode || pixKey}</code>
                          <button
                            type="button"
                            className="public-stock-payment-copy"
                            onClick={() =>
                              void copyText(pixCopyPasteCode || pixKey).then((copied) => {
                                setPaymentHelperMessage(
                                  copied ? 'Codigo Pix copiado.' : 'Nao foi possivel copiar o codigo Pix.'
                                );
                                setPaymentHelperError(!copied);
                              })
                            }
                          >
                            <IconCopy />
                            Copiar codigo Pix
                          </button>
                        </div>
                      ) : null}
                    </section>

                    <section className="public-stock-payment-group">
                      <strong className="public-stock-payment-group-title">Cartao de credito</strong>
                      <label
                        className={
                          !isCreditCardAvailable
                            ? 'public-stock-payment-option disabled'
                            : selectedPaymentMethod === 'credit_card'
                              ? 'public-stock-payment-option active'
                              : 'public-stock-payment-option'
                        }
                      >
                        <input
                          type="radio"
                          name="checkout-payment-method"
                          value="credit_card"
                          checked={selectedPaymentMethod === 'credit_card'}
                          disabled={!isCreditCardAvailable}
                          onChange={() => {
                            setSelectedPaymentMethod('credit_card');
                            setCheckoutMessage('');
                          }}
                        />
                        <span className="public-stock-payment-logo card">CC</span>
                        <span className="public-stock-payment-option-text">
                          {isCreditCardAvailable
                            ? `Em ate ${installmentOptions[installmentOptions.length - 1] || 1}x`
                            : 'Indisponivel no momento'}
                        </span>
                      </label>

                      {selectedPaymentMethod === 'credit_card' && isCreditCardAvailable ? (
                        <div className="public-stock-payment-reference">
                          <label className="public-stock-payment-installments">
                            <span>Parcelamento</span>
                            <select
                              value={creditCardInstallments}
                              onChange={(event) => setCreditCardInstallments(Math.max(1, Number(event.target.value) || 1))}
                            >
                              {installmentOptions.map((installment) => (
                                <option key={installment} value={installment}>
                                  {installment}x de {formatPrice(cartTotal / installment)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {mercadoPagoEnabled ? (
                            <span>Ao finalizar o pedido, voce sera redirecionado para pagar com cartao no Mercado Pago.</span>
                          ) : (
                            <a href={creditCardLink} target="_blank" rel="noreferrer" className="public-stock-payment-link">
                              Abrir link de pagamento
                            </a>
                          )}
                        </div>
                      ) : null}
                    </section>

                  </>
                )}

                {paymentHelperMessage ? (
                  <p className={paymentHelperError ? 'public-stock-payment-feedback error' : 'public-stock-payment-feedback'}>
                    {paymentHelperMessage}
                  </p>
                ) : null}
              </div>

              {checkoutMessage ? (
                <p className={checkoutError ? 'public-stock-checkout-feedback error' : 'public-stock-checkout-feedback'}>
                  {checkoutMessage}
                </p>
              ) : null}

              <button
                type="button"
                className="public-stock-checkout-submit"
                onClick={handleFinalizeOrder}
                disabled={
                  submittingCheckout ||
                  cartDisplayItems.length === 0 ||
                  cartDisplayItems.some((item) => item.available <= 0 || item.quantity > item.available) ||
                  availablePaymentMethods.length === 0 ||
                  !selectedPaymentMethod
                }
              >
                {submittingCheckout ? 'Finalizando...' : 'Finalizar pedido'}
              </button>
            </aside>
          </div>
        </section>
      ) : null}

      {view === 'success' ? (
        <section className="public-stock-success-page">
          <div className="public-stock-success-icon">✓</div>
          <h1>Compra realizada com sucesso!</h1>
          <p>
            {successPaymentProvider === 'mercado_pago'
              ? 'Pedido registrado. Agora finalize o pagamento com seguranca pelo Mercado Pago.'
              : 'Obrigado por comprar em meu site! Em breve entrarei em contato com voce para finalizar a compra.'}
          </p>
          <div className="public-stock-success-actions">
            {successPaymentUrl ? (
              <a href={successPaymentUrl} target="_blank" rel="noreferrer" className="public-stock-success-pay">
                {successPaymentMethod === 'pix' ? 'Pagar com Pix' : 'Pagar com cartao'}
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => {
                backToCatalog();
                setSearch('');
                setSuccessPaymentUrl('');
                setSuccessPaymentMethod('');
                setSuccessPaymentProvider('');
              }}
            >
              Voltar para a loja
            </button>
          </div>
        </section>
      ) : null}

      {settings.showWhatsappButton ? (
        <a
          href={whatsappPhone ? `https://wa.me/${whatsappPhone}` : '#'}
          target="_blank"
          rel="noreferrer"
          className={`public-stock-whatsapp${whatsappPhone ? '' : ' disabled'}`}
          aria-label="Abrir WhatsApp da loja"
          aria-disabled={!whatsappPhone}
          onClick={(event) => {
            if (!whatsappPhone) event.preventDefault();
          }}
        >
          <IconWhatsapp />
        </a>
      ) : null}

      {cartOpen ? (
        <div className="public-stock-cart-overlay" role="presentation" onClick={() => setCartOpen(false)}>
          <aside className="public-stock-cart-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>Seu Carrinho</h3>
              <button type="button" aria-label="Fechar carrinho" onClick={() => setCartOpen(false)}>
                x
              </button>
            </header>

            {cartDisplayItems.length === 0 ? (
              <div className="public-stock-cart-empty">Nenhum produto no carrinho.</div>
            ) : (
              <div className="public-stock-cart-list">
                {cartDisplayItems.map((item) => (
                  <article key={item.productId} className="public-stock-cart-item">
                    <div className="public-stock-cart-item-main">
                      <div className="public-stock-cart-thumb">
                        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : null}
                      </div>

                      <div className="public-stock-cart-copy">
                        <strong>{item.name}</strong>
                        <span>Cód: {item.code}</span>
                        <div className="public-stock-cart-item-actions">
                          <div className="public-stock-qty-control">
                            <button type="button" onClick={() => updateCartItemQuantity(item.productId, item.quantity - 1)}>
                              -
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateCartItemQuantity(item.productId, item.quantity + 1)}
                              disabled={item.quantity >= item.available}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remover ${item.name}`}
                            className="public-stock-cart-remove"
                            onClick={() => removeCartItem(item.productId)}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    </div>
                    <strong>{formatPrice(item.price * item.quantity)}</strong>
                  </article>
                ))}
              </div>
            )}

            <footer>
              <div className="public-stock-cart-total">
                <strong>Total</strong>
                <strong>{formatPrice(cartTotal)}</strong>
              </div>
              <button
                type="button"
                className="public-stock-cart-checkout"
                onClick={openCheckout}
                disabled={cartDisplayItems.length === 0}
              >
                Finalizar compra
              </button>
              <button type="button" className="public-stock-cart-continue" onClick={() => setCartOpen(false)}>
                Continuar comprando
              </button>
            </footer>

            {toastMessage ? (
              <div className="public-stock-cart-toast">
                <span>{toastMessage}</span>
                <button type="button" onClick={() => setToastMessage('')}>
                  x
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
