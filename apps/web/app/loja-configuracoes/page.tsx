'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { IconArrowLeft, IconCart, IconSearch, IconUpload, IconWhatsapp } from '../(dash)/icons';
import { API_BASE, buildMutationHeaders } from '../(dash)/lib';
import {
  buildPublicStoreUrl,
  DEFAULT_STOREFRONT_SETTINGS,
  emitStorefrontSettingsUpdated,
  loadStorefrontSettings,
  normalizeStorefrontSettings,
  sanitizeSubdomain,
  saveStorefrontSettings,
  storefrontSettingsFromPayload,
  storefrontSettingsToPayload
} from '../lib/storefront-settings';

type CatalogProduct = {
  id: string;
  name: string;
  price?: number | string;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
  quantity?: number | string;
  active?: boolean;
};

type PreviewProduct = {
  id: string;
  name: string;
  price: number;
  brand: string;
  category: string;
  imageUrl: string;
  inStock: boolean;
};

const previewFallbackProducts: PreviewProduct[] = [
  { id: 'p1', name: 'Produto 01', price: 100, brand: 'Marca 1', category: 'Categoria 1', imageUrl: '', inStock: true },
  { id: 'p2', name: 'Produto 02', price: 100, brand: 'Marca 1', category: 'Categoria 2', imageUrl: '', inStock: true },
  { id: 'p3', name: 'Produto 03', price: 100, brand: 'Marca 2', category: 'Categoria 1', imageUrl: '', inStock: false },
  { id: 'p4', name: 'Produto 04', price: 100, brand: 'Marca 2', category: 'Categoria 3', imageUrl: '', inStock: true },
  { id: 'p5', name: 'Produto 05', price: 100, brand: 'Marca 3', category: 'Categoria 1', imageUrl: '', inStock: false },
  { id: 'p6', name: 'Produto 06', price: 100, brand: 'Marca 3', category: 'Categoria 2', imageUrl: '', inStock: true },
  { id: 'p7', name: 'Produto 07', price: 100, brand: 'Marca 2', category: 'Categoria 2', imageUrl: '', inStock: true },
  { id: 'p8', name: 'Produto 08', price: 100, brand: 'Marca 1', category: 'Categoria 3', imageUrl: '', inStock: false }
];

const colors = ['#7D58D4', '#1977EA', '#36A368', '#369D9D', '#D03A88', '#DAA12F', '#E07024', '#ED4040', '#000000'];

const formatPrice = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const mapCatalogProducts = (items?: CatalogProduct[] | null): PreviewProduct[] => {
  const mapped =
    items
      ?.filter((item) => item.active !== false)
      .map<PreviewProduct>((item) => ({
        id: item.id,
        name: item.name?.trim() || 'Produto sem nome',
        price: Math.max(0, toNumber(item.price)),
        brand: item.brand?.trim() || 'Sem marca',
        category: item.category?.trim() || 'Sem categoria',
        imageUrl: item.image_url?.trim() || '',
        inStock: toNumber(item.quantity) > 0
      })) || [];
  return mapped.length > 0 ? mapped : previewFallbackProducts;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const normalizeApiMessage = (value: unknown, fallback: string) => {
  if (
    value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    return (value as { message: string }).message;
  }
  return fallback;
};

const uniqueValues = (list: string[]) =>
  Array.from(new Set(list.map((item) => item.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );

const normalizeToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const includesToken = (list: string[], value: string) =>
  list.some((item) => normalizeToken(item) === normalizeToken(value));

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const toWhatsappPhone = (value: string) => {
  const digits = onlyDigits(value);
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

export default function LojaConfiguracoesPage() {
  const [shopName, setShopName] = useState(DEFAULT_STOREFRONT_SETTINGS.shopName);
  const [subdomain, setSubdomain] = useState(DEFAULT_STOREFRONT_SETTINGS.subdomain);
  const [shopColor, setShopColor] = useState(DEFAULT_STOREFRONT_SETTINGS.shopColor);
  const [publicStorePrefix, setPublicStorePrefix] = useState('/loja/');
  const [onlyStockProducts, setOnlyStockProducts] = useState(DEFAULT_STOREFRONT_SETTINGS.onlyStockProducts);
  const [showOutOfStockProducts, setShowOutOfStockProducts] = useState(
    DEFAULT_STOREFRONT_SETTINGS.showOutOfStockProducts
  );
  const [filterByCategory, setFilterByCategory] = useState(DEFAULT_STOREFRONT_SETTINGS.filterByCategory);
  const [filterByBrand, setFilterByBrand] = useState(DEFAULT_STOREFRONT_SETTINGS.filterByBrand);
  const [filterByPrice, setFilterByPrice] = useState(DEFAULT_STOREFRONT_SETTINGS.filterByPrice);
  const [whatsapp, setWhatsapp] = useState(DEFAULT_STOREFRONT_SETTINGS.whatsapp);
  const [showWhatsappButton, setShowWhatsappButton] = useState(DEFAULT_STOREFRONT_SETTINGS.showWhatsappButton);
  const [catalogProducts, setCatalogProducts] = useState<PreviewProduct[]>(previewFallbackProducts);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const previewSearch = '';
  const previewSelectedBrands: string[] = [];
  const previewSelectedCategories: string[] = [];
  const previewPriceFrom = '';
  const previewPriceTo = '';

  const applySettings = (settings: ReturnType<typeof normalizeStorefrontSettings>) => {
    setShopName(settings.shopName);
    setSubdomain(settings.subdomain);
    setShopColor(settings.shopColor);
    setOnlyStockProducts(settings.onlyStockProducts);
    setShowOutOfStockProducts(settings.showOutOfStockProducts);
    setFilterByCategory(settings.filterByCategory);
    setFilterByBrand(settings.filterByBrand);
    setFilterByPrice(settings.filterByPrice);
    setWhatsapp(settings.whatsapp);
    setShowWhatsappButton(settings.showWhatsappButton);
  };

  useEffect(() => {
    setPublicStorePrefix(`${window.location.origin.replace(/\/+$/, '')}/loja/`);

    const saved = loadStorefrontSettings();
    if (saved) applySettings(saved);

    const controller = new AbortController();

    const readData = async () => {
      try {
        const [settingsResponse, catalogResponse] = await Promise.all([
          fetch(`${API_BASE}/settings/storefront`, {
            cache: 'no-store',
            signal: controller.signal
          }),
          fetch(`${API_BASE}/storefront/catalog`, {
            cache: 'no-store',
            signal: controller.signal
          })
        ]);

        if (settingsResponse.ok) {
          const payload = (await settingsResponse.json()) as {
            data?: Partial<ReturnType<typeof storefrontSettingsToPayload>>;
          };
          const merged = storefrontSettingsFromPayload(payload?.data);
          applySettings(merged);
          saveStorefrontSettings(merged);
          emitStorefrontSettingsUpdated(merged);
        } else if (!saved) {
          applySettings(DEFAULT_STOREFRONT_SETTINGS);
        }

        if (catalogResponse.ok) {
          const payload = (await catalogResponse.json()) as { data?: CatalogProduct[] };
          setCatalogProducts(mapCatalogProducts(payload?.data));
        }
      } catch {
        // keep local and fallback values
      }
    };

    void readData();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = window.setTimeout(() => {
      setSaveStatus('idle');
      setSaveMessage('');
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const brandOptions = useMemo(
    () => uniqueValues(catalogProducts.map((item) => item.brand).filter(Boolean)),
    [catalogProducts]
  );
  const categoryOptions = useMemo(
    () => uniqueValues(catalogProducts.map((item) => item.category).filter(Boolean)),
    [catalogProducts]
  );

  const buildSettingsPayload = () =>
    normalizeStorefrontSettings({
      shopName,
      subdomain,
      shopColor,
      onlyStockProducts,
      showOutOfStockProducts,
      filterByCategory,
      filterByBrand,
      filterByPrice,
      whatsapp,
      showWhatsappButton,
      // The right panel is preview-only; no preselected filters are configured here.
      selectedBrands: [],
      selectedCategories: [],
      priceFrom: '',
      priceTo: ''
    });

  const handleSave = async () => {
    const settings = buildSettingsPayload();
    saveStorefrontSettings(settings);
    emitStorefrontSettingsUpdated(settings);

    setSaveStatus('saving');
    setSaveMessage('Salvando configuracoes...');

    try {
      const response = await fetch(`${API_BASE}/settings/storefront`, {
        method: 'PATCH',
        headers: buildMutationHeaders(),
        body: JSON.stringify(storefrontSettingsToPayload(settings))
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(normalizeApiMessage(body, 'Nao foi possivel salvar no servidor.'));
      }

      const payload = (await response.json()) as {
        data?: Partial<ReturnType<typeof storefrontSettingsToPayload>>;
      };
      const synced = storefrontSettingsFromPayload(payload?.data || settings);
      saveStorefrontSettings(synced);
      emitStorefrontSettingsUpdated(synced);
      applySettings(synced);

      try {
        const catalogResponse = await fetch(`${API_BASE}/storefront/catalog`, { cache: 'no-store' });
        if (catalogResponse.ok) {
          const catalogPayload = (await catalogResponse.json()) as { data?: CatalogProduct[] };
          setCatalogProducts(mapCatalogProducts(catalogPayload?.data));
        }
      } catch {
        // keep current preview list when catalog refresh is unavailable
      }

      setSaveStatus('saved');
      setSaveMessage('Configuracoes salvas.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Salvo localmente. Falha ao sincronizar com o servidor.';
      setSaveStatus('error');
      setSaveMessage(message);
    }
  };

  const filteredProducts = useMemo(() => {
    return catalogProducts.filter((item) => {
      const matchesStockVisibility = (showOutOfStockProducts && !onlyStockProducts) || item.inStock;
      return matchesStockVisibility;
    });
  }, [catalogProducts, onlyStockProducts, showOutOfStockProducts]);

  const whatsappPhone = toWhatsappPhone(whatsapp);

  const publicStoreUrl = buildPublicStoreUrl(subdomain, typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <main className="store-config-page" style={{ ['--store-accent' as string]: shopColor }}>
      <header className="store-config-header">
        <div className="store-config-header-left">
          <Link href="/" className="store-config-back" aria-label="Voltar para loja online">
            <IconArrowLeft />
          </Link>
          <h1>Configurações da loja</h1>
        </div>

        <label className="store-subdomain">
          <span>{publicStorePrefix}</span>
          <input value={subdomain} onChange={(event) => setSubdomain(sanitizeSubdomain(event.target.value))} />
        </label>

        <div className="store-config-save">
          {saveMessage ? <span className={`store-save-status ${saveStatus}`}>{saveMessage}</span> : null}
          <button
            type="button"
            className="store-btn primary"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
          >
            {saveStatus === 'saving' ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </header>

      <div className="store-public-link-row">
        <span>Link da loja virtual:</span>
        <a href={publicStoreUrl} target="_blank" rel="noreferrer">
          {publicStoreUrl}
        </a>
      </div>

      <section className="store-config-shell">
        <aside className="store-config-sidebar">
          <label className="store-config-field">
            Nome da loja
            <input value={shopName} onChange={(event) => setShopName(event.target.value)} />
          </label>

          <div className="store-config-block">
            <strong>Cor da loja</strong>
            <div className="store-color-grid">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={shopColor === color ? 'active' : ''}
                  style={{ backgroundColor: color }}
                  aria-label={`Selecionar cor ${color}`}
                  onClick={() => setShopColor(color)}
                />
              ))}
            </div>
          </div>

          <div className="store-upload-row">
            <button type="button" aria-label="Enviar logo">
              <IconUpload />
            </button>
            <p>
              <strong>Dica:</strong> Seu logo ficará melhor apresentado caso tenha um fundo transparente.
            </p>
          </div>

          <div className="store-config-block">
            <strong>Produtos</strong>
            <label className="store-toggle-row">
              <span>Somente permitir pedidos de produtos em estoque</span>
              <button
                type="button"
                className={onlyStockProducts ? 'store-switch on' : 'store-switch'}
                role="switch"
                aria-checked={onlyStockProducts}
                aria-label="Somente permitir pedidos de produtos em estoque"
                onClick={() => setOnlyStockProducts((prev) => !prev)}
              >
                <span />
              </button>
            </label>
            <label className="store-toggle-row">
              <span>Mostrar produtos sem estoque</span>
              <button
                type="button"
                className={showOutOfStockProducts ? 'store-switch on' : 'store-switch'}
                role="switch"
                aria-checked={showOutOfStockProducts}
                aria-label="Mostrar produtos sem estoque"
                onClick={() => setShowOutOfStockProducts((prev) => !prev)}
              >
                <span />
              </button>
            </label>
          </div>

          <div className="store-config-block">
            <strong>Filtros</strong>
            <label className="store-toggle-row">
              <span>Possibilitar filtrar por categoria</span>
              <button
                type="button"
                className={filterByCategory ? 'store-switch on' : 'store-switch'}
                role="switch"
                aria-checked={filterByCategory}
                aria-label="Possibilitar filtrar por categoria"
                onClick={() => setFilterByCategory((prev) => !prev)}
              >
                <span />
              </button>
            </label>
            <label className="store-toggle-row">
              <span>Possibilitar filtrar por marca</span>
              <button
                type="button"
                className={filterByBrand ? 'store-switch on' : 'store-switch'}
                role="switch"
                aria-checked={filterByBrand}
                aria-label="Possibilitar filtrar por marca"
                onClick={() => setFilterByBrand((prev) => !prev)}
              >
                <span />
              </button>
            </label>
            <label className="store-toggle-row">
              <span>Possibilitar filtrar por preço</span>
              <button
                type="button"
                className={filterByPrice ? 'store-switch on' : 'store-switch'}
                role="switch"
                aria-checked={filterByPrice}
                aria-label="Possibilitar filtrar por preço"
                onClick={() => setFilterByPrice((prev) => !prev)}
              >
                <span />
              </button>
            </label>
          </div>

          <div className="store-config-block">
            <strong>Whatsapp da loja</strong>
            <input
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              placeholder="(00) 00000-0000"
            />
            <label className="store-toggle-row">
              <span>Mostrar botão de WhatsApp</span>
              <button
                type="button"
                className={showWhatsappButton ? 'store-switch on' : 'store-switch'}
                role="switch"
                aria-checked={showWhatsappButton}
                aria-label="Mostrar botão de WhatsApp"
                onClick={() => setShowWhatsappButton((prev) => !prev)}
              >
                <span />
              </button>
            </label>
          </div>
        </aside>

        <section className="store-config-preview">
          <div className="store-preview-top">
            <strong>{shopName || 'Loja'}</strong>
            <label className="store-preview-search readonly">
              <input
                value={previewSearch}
                readOnly
                placeholder="Buscar por produtos"
              />
              <IconSearch />
            </label>
            <button type="button" className="store-preview-cart" aria-label="Carrinho" tabIndex={-1}>
              <IconCart />
            </button>
          </div>

          <div className="store-preview-body">
            <aside className="store-preview-filters readonly">
              {filterByBrand ? (
                <>
                  <strong>Marcas</strong>
                  {brandOptions.length === 0 ? (
                    <span className="store-filter-empty">Nenhuma marca encontrada</span>
                  ) : (
                    brandOptions.map((brand) => (
                      <label key={brand} className="store-check">
                        <input type="checkbox" checked={includesToken(previewSelectedBrands, brand)} readOnly />
                        <span>{brand}</span>
                      </label>
                    ))
                  )}
                </>
              ) : null}

              {filterByCategory ? (
                <>
                  <strong>Categorias</strong>
                  {categoryOptions.length === 0 ? (
                    <span className="store-filter-empty">Nenhuma categoria encontrada</span>
                  ) : (
                    categoryOptions.map((category) => (
                      <label key={category} className="store-check">
                        <input type="checkbox" checked={includesToken(previewSelectedCategories, category)} readOnly />
                        <span>{category}</span>
                      </label>
                    ))
                  )}
                </>
              ) : null}

              {filterByPrice ? (
                <>
                  <strong>Preço</strong>
                  <div className="store-price-range">
                    <label>
                      De
                      <input value={previewPriceFrom} readOnly placeholder="R$ 0,00" />
                    </label>
                    <label>
                      Até
                      <input value={previewPriceTo} readOnly placeholder="R$ 0,00" />
                    </label>
                  </div>
                  <button type="button" className="store-btn primary full" aria-disabled="true">
                    Aplicar
                  </button>
                </>
              ) : null}
            </aside>

            <div className="store-preview-grid">
              {filteredProducts.map((product) => (
                <article key={product.id} className="store-preview-product">
                  <div className="store-preview-thumb">
                    {product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" /> : null}
                  </div>
                  <strong>{product.name}</strong>
                  <span>{formatPrice(product.price)}</span>
                  {!product.inStock ? <em>Produto esgotado</em> : null}
                  {!onlyStockProducts || product.inStock ? (
                    <button type="button" className="store-btn primary">
                      Adicionar à sacola
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </div>

          {showWhatsappButton ? (
            <a
              href={whatsappPhone ? `https://wa.me/${whatsappPhone}` : '#'}
              target="_blank"
              rel="noreferrer"
              className={`store-preview-whatsapp${whatsappPhone ? '' : ' disabled'}`}
              aria-label="Abrir WhatsApp da loja"
              aria-disabled={!whatsappPhone}
              onClick={(event) => {
                if (!whatsappPhone) event.preventDefault();
              }}
            >
              <IconWhatsapp />
            </a>
          ) : null}
        </section>
      </section>
    </main>
  );
}
