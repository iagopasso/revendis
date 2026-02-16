'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconCart, IconSearch, IconWhatsapp } from '../../(dash)/icons';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  normalizeStorefrontSettings,
  type StorefrontSettings
} from '../../lib/storefront-settings';

type StoreProduct = {
  id: string;
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
  name: string;
  brand: string;
  category: string;
  imageUrl: string;
  quantity: number;
  price: number;
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

const normalizeToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const parseCurrencyValue = (value: string) => {
  const normalized = value
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const onlyDigits = (value: string) => value.replace(/\D/g, '');

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

export default function PublicStorefront({
  subdomain,
  initialProducts,
  initialStoreName,
  initialStoreSettings,
  unavailable
}: {
  subdomain: string;
  initialProducts: StoreProduct[];
  initialStoreName: string;
  initialStoreSettings?: PublicStoreSettings;
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

  const products = useMemo<NormalizedProduct[]>(
    () =>
      initialProducts
        .filter((item) => item.active !== false)
        .map((item) => ({
          id: item.id,
          name: item.name?.trim() || 'Produto sem nome',
          brand: item.brand?.trim() || 'Sem marca',
          category: item.category?.trim() || 'Sem categoria',
          imageUrl: item.image_url?.trim() || '',
          quantity: Math.max(0, toNumber(item.quantity)),
          price: Math.max(0, toNumber(item.price))
        })),
    [initialProducts]
  );

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

  const filteredProducts = useMemo(() => {
    const searchTerm = normalizeToken(search);
    const priceFrom = parseCurrencyValue(priceFromApplied);
    const priceTo = parseCurrencyValue(priceToApplied);

    return productsByConfiguredOptions.filter((product) => {
      if (searchTerm) {
        const searchable = normalizeToken(`${product.name} ${product.brand} ${product.category}`);
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

  const toggleSelection = (value: string, selected: string[], setter: (value: string[]) => void) => {
    const valueToken = normalizeToken(value);
    const exists = selected.some((item) => normalizeToken(item) === valueToken);
    setter(
      exists ? selected.filter((item) => normalizeToken(item) !== valueToken) : [...selected, value]
    );
  };

  const whatsappDigits = onlyDigits(settings.whatsapp || '');

  return (
    <main className="public-stock-link" style={{ ['--public-accent' as string]: settings.shopColor }}>
      <header className="public-stock-topbar">
        <div className="public-stock-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={settings.shopName} className="public-stock-brand-logo" />
          ) : null}
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

        <button type="button" className="public-stock-cart" aria-label="Carrinho">
          <IconCart />
        </button>
      </header>

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
                const blockedByStock = outOfStock;

                return (
                  <article key={product.id} className="public-stock-product">
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
                        {product.brand} • {product.category}
                      </small>
                      <strong>{formatPrice(product.price)}</strong>
                    </div>

                    <button
                      type="button"
                      className={blockedByStock ? 'public-stock-buy soldout' : 'public-stock-buy'}
                      disabled={blockedByStock}
                    >
                      {blockedByStock ? 'Esgotado' : 'Adicionar a sacola'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      {settings.showWhatsappButton && whatsappDigits ? (
        <a
          href={`https://wa.me/${whatsappDigits}`}
          target="_blank"
          rel="noreferrer"
          className="public-stock-whatsapp"
          aria-label="Abrir WhatsApp da loja"
        >
          <IconWhatsapp />
        </a>
      ) : null}
    </main>
  );
}
