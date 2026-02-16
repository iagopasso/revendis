'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconBox,
  IconCopy,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShare,
  IconTag,
  IconTagPercent
} from './icons';
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
  name: string;
  price?: number | string;
  active?: boolean;
};

type Promotion = {
  id: string;
  name: string;
  discount: number;
  productIds: string[];
};

type Section = 'overview' | 'orders' | 'products' | 'promotions';

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

const SecondaryNavItem = ({
  active,
  href,
  icon,
  label,
  onClick
}: {
  active: boolean;
  href: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <Link
    href={href}
    className={active ? 'store-secondary-item active' : 'store-secondary-item'}
    aria-current={active ? 'page' : undefined}
    onClick={(event) => {
      event.preventDefault();
      onClick();
    }}
  >
    <span>{icon}</span>
    <strong>{label}</strong>
  </Link>
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
  const section = parseSection(searchParams.get('section'));

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
  const [activeProducts, setActiveProducts] = useState<StoreProduct[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [panelSearch, setPanelSearch] = useState('');
  const [selectingProducts, setSelectingProducts] = useState<string[]>([]);
  const [productModalOpen, setProductModalOpen] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement | null>(null);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promotionModalOpen, setPromotionModalOpen] = useState(false);
  const [promotionStep, setPromotionStep] = useState<'select' | 'create'>('select');
  const [promotionSearch, setPromotionSearch] = useState('');
  const [promotionSelectedProducts, setPromotionSelectedProducts] = useState<string[]>([]);
  const [promotionName, setPromotionName] = useState('');
  const [promotionDiscount, setPromotionDiscount] = useState('10');
  const runtimeHydratedRef = useRef(false);
  const [publicStoreOrigin, setPublicStoreOrigin] = useState('');

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
    }
    runtimeHydratedRef.current = true;
  }, [initialStoreName, initialStoreSettings]);

  useEffect(() => {
    if (!runtimeHydratedRef.current) return;
    saveStorefrontRuntimeState({
      activeProducts,
      promotions
    });
  }, [activeProducts, promotions]);

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

  const catalogPool = useMemo(() => initialCatalog.filter((item) => item.active !== false), [initialCatalog]);

  const availableProducts = useMemo(() => {
    const activeIds = new Set(activeProducts.map((item) => item.id));
    return catalogPool.filter((item) => !activeIds.has(item.id));
  }, [activeProducts, catalogPool]);

  const filteredAvailableProducts = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    if (!term) return availableProducts;
    return availableProducts.filter((item) => item.name.toLowerCase().includes(term));
  }, [availableProducts, catalogSearch]);

  const filteredActiveProducts = useMemo(() => {
    const term = panelSearch.trim().toLowerCase();
    if (!term) return activeProducts;
    return activeProducts.filter((item) => item.name.toLowerCase().includes(term));
  }, [activeProducts, panelSearch]);

  const promotionCandidates = useMemo(() => {
    const term = promotionSearch.trim().toLowerCase();
    if (!term) return activeProducts;
    return activeProducts.filter((item) => item.name.toLowerCase().includes(term));
  }, [activeProducts, promotionSearch]);

  const storeUrl = buildPublicStoreUrl(storeSettings.subdomain, publicStoreOrigin);

  const setSection = (next: Section) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'overview') {
      params.delete('section');
    } else {
      params.set('section', next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const openProductModal = () => {
    setCatalogSearch('');
    setSelectingProducts([]);
    setProductModalOpen(true);
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
    setPromotionName('');
    setPromotionDiscount('10');
    setPromotionStep('select');
    setPromotionModalOpen(true);
  };

  const savePromotion = () => {
    const discount = Math.max(1, Math.min(99, Number(promotionDiscount) || 0));
    if (!promotionName.trim() || promotionSelectedProducts.length === 0 || discount <= 0) return;
    setPromotions((prev) => [
      {
        id: `${Date.now()}`,
        name: promotionName.trim(),
        discount,
        productIds: promotionSelectedProducts
      },
      ...prev
    ]);
    setPromotionModalOpen(false);
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
            href="/"
            icon={<IconSettings />}
            label="Visão geral"
            onClick={() => setSection('overview')}
          />
          <SecondaryNavItem
            active={section === 'orders'}
            href="/?section=orders"
            icon={<IconTag />}
            label="Pedidos"
            onClick={() => setSection('orders')}
          />
          <SecondaryNavItem
            active={section === 'products'}
            href="/?section=products"
            icon={<IconBox />}
            label="Produtos"
            onClick={() => setSection('products')}
          />
          <SecondaryNavItem
            active={section === 'promotions'}
            href="/?section=promotions"
            icon={<IconTagPercent />}
            label="Promoções"
            onClick={() => setSection('promotions')}
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
                    onClick={() => navigator.clipboard.writeText(storeUrl)}
                  >
                    <IconCopy />
                  </button>
                </div>
              </div>
            </div>
          </article>
        ) : null}

        {section === 'orders' ? (
          <article className="store-empty-panel">
            <div className="store-empty-icon">
              <IconTag />
            </div>
            <h3>Nenhum pedido na loja</h3>
            <p>Quando houver vendas, os pedidos aparecerão aqui.</p>
          </article>
        ) : null}

        {section === 'products' ? (
          <>
            <label className="store-search" aria-label="Buscar produto">
              <IconSearch />
              <input
                type="search"
                placeholder="Buscar produto"
                value={panelSearch}
                onChange={(event) => setPanelSearch(event.target.value)}
              />
            </label>

            {filteredActiveProducts.length === 0 ? (
              <article className="store-empty-panel tall">
                <div className="store-empty-icon">
                  <IconBox />
                </div>
                <h3>Nenhum produto ativo na loja</h3>
                <p>Ative seu primeiro produto para começar a vender na loja</p>
                <button type="button" className="store-btn primary" onClick={openProductModal}>
                  <IconPlus />
                  <span>Adicionar produto</span>
                </button>
              </article>
            ) : (
              <article className="store-list-panel">
                {filteredActiveProducts.map((product) => (
                  <div className="store-item" key={product.id}>
                    <div>
                      <strong>{product.name}</strong>
                      <span>{formatPrice(toNumber(product.price))}</span>
                    </div>
                  </div>
                ))}
              </article>
            )}
          </>
        ) : null}

        {section === 'promotions' ? (
          promotions.length === 0 ? (
            <article className="store-empty-panel tall">
              <div className="store-empty-icon">
                <IconBox />
              </div>
              <h3>Nenhuma promoção ativa na loja</h3>
              <p>Aqui você pode criar promoções para seus produtos</p>
            </article>
          ) : (
            <article className="store-list-panel">
              {promotions.map((promo) => (
                <div className="store-item" key={promo.id}>
                  <div>
                    <strong>{promo.name}</strong>
                    <span>
                      {promo.discount}% OFF · {promo.productIds.length} produto(s)
                    </span>
                  </div>
                </div>
              ))}
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
                  <div className="store-promotion-empty">Nenhum produto ativo para selecionar.</div>
                ) : (
                  <div className="store-modal-list compact">
                    {promotionCandidates.map((item) => {
                      const checked = promotionSelectedProducts.includes(item.id);
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
                          <div>
                            <strong>{item.name}</strong>
                          </div>
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
                    onClick={() => setPromotionStep('create')}
                  >
                    Prosseguir
                  </button>
                </footer>
              </>
            ) : (
              <>
                <div className="store-form-grid">
                  <label>
                    Nome da promoção
                    <input
                      type="text"
                      value={promotionName}
                      onChange={(event) => setPromotionName(event.target.value)}
                      placeholder="Ex.: Semana do cliente"
                    />
                  </label>
                  <label>
                    Desconto (%)
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={promotionDiscount}
                      onChange={(event) => setPromotionDiscount(event.target.value)}
                    />
                  </label>
                </div>

                <footer className="store-modal-footer">
                  <button
                    type="button"
                    className="store-btn"
                    onClick={() => setPromotionStep('select')}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="store-btn primary"
                    onClick={savePromotion}
                    disabled={!promotionName.trim()}
                  >
                    Criar promoção
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
