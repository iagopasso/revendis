'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconArrowLeft, IconCart, IconSearch, IconTrash, IconWhatsapp } from '../../(dash)/icons';
import { API_BASE } from '../../(dash)/lib';
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
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutError, setCheckoutError] = useState(false);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>([]);
  const [productDescriptions, setProductDescriptions] = useState<Record<string, string>>({});
  const [storePriceOverrides, setStorePriceOverrides] = useState<Record<string, number>>({});

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
        headers: { 'Content-Type': 'application/json' },
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
          }
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || 'Nao foi possivel finalizar o pedido agora.');
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
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : 'Nao foi possivel finalizar o pedido agora.');
      setCheckoutError(true);
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const whatsappPhone = toWhatsappPhone(settings.whatsapp || '');

  return (
    <main className="public-stock-link" style={{ ['--public-accent' as string]: settings.shopColor }}>
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
                  cartDisplayItems.some((item) => item.available <= 0 || item.quantity > item.available)
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
          <p>Obrigado por comprar em meu site! Em breve entrarei em contato com você para finalizar a compra.</p>
          <button
            type="button"
            onClick={() => {
              backToCatalog();
              setSearch('');
            }}
          >
            Voltar para a loja
          </button>
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
