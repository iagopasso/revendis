'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconArrowLeft,
  IconCart,
  IconCopy,
  IconLock,
  IconSearch,
  IconStar,
  IconTrash,
  IconTruck,
  IconWhatsapp
} from '../../(dash)/icons';
import { API_BASE, buildMutationHeaders } from '../../(dash)/lib';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  hasStorefrontRuntimeStateData,
  loadStorefrontRuntimeState,
  normalizeStorefrontRuntimeState,
  normalizeStorefrontSettings,
  sanitizeSubdomain,
  type StorefrontRuntimePromotion,
  type StorefrontRuntimeState,
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
  runtimeState?: Partial<StorefrontRuntimeState>;
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
  originalPrice?: number;
  promotionDiscount?: number;
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

type ActiveFilterChip = {
  key: string;
  label: string;
  kind: 'search' | 'brand' | 'category' | 'price_from' | 'price_to';
  value?: string;
};

type PublicView = 'catalog' | 'product' | 'checkout' | 'success';
type CheckoutPaymentMethod = 'pix' | 'credit_card';
type CheckoutPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';

type CheckoutResponse = {
  data?: {
    id?: string;
    status?: string;
    sale_id?: string | null;
    payment?: {
      method?: CheckoutPaymentMethod;
      reference?: string;
      checkoutUrl?: string;
      provider?: string;
      status?: CheckoutPaymentStatus;
      token?: string;
      expiresAt?: string;
      mercadoPagoPaymentId?: string;
      pixQrCodeBase64?: string;
    };
    payment_status?: CheckoutPaymentStatus;
    payment_expires_at?: string | null;
  };
  message?: string;
};

const PENDING_PAYMENT_STORAGE_PREFIX = 'revendis:pending-payment:';
const PENDING_PAYMENT_VERSION = 1;
const CART_STORAGE_PREFIX = 'revendis:storefront-cart:';
const CART_STORAGE_VERSION = 1;
const CHECKOUT_DRAFT_STORAGE_PREFIX = 'revendis:checkout-draft:';
const CHECKOUT_DRAFT_VERSION = 1;

type PendingPaymentSnapshot = {
  version: number;
  orderId: string;
  method: CheckoutPaymentMethod;
  token: string;
  provider: string;
  checkoutUrl: string;
  reference: string;
  status: CheckoutPaymentStatus;
  expiresAt: string;
  mercadoPagoPaymentId?: string;
  pixQrCodeBase64?: string;
  customerName?: string;
  customerPhone?: string;
  installments?: number;
};

type PersistedCartSnapshot = {
  version: number;
  items: CartItem[];
};

type PersistedCheckoutDraft = {
  version: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: CheckoutPaymentMethod | '';
  installments: number;
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

const toIsoDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toUtcIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const normalizeDateInput = (value: string) => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return toIsoDate(parsed);
};

const resolvePromotionStatus = (startDate?: string, endDate?: string) => {
  // Use UTC date to keep SSR/client promotion status deterministic across timezones.
  const today = normalizeDateInput(toUtcIsoDate(new Date()));
  const start = normalizeDateInput(startDate || '');
  const end = normalizeDateInput(endDate || '');
  if (end && end < today) return 'ended' as const;
  if (start && start > today) return 'scheduled' as const;
  return 'active' as const;
};

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
  const stripped = trimmed
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/[^\d,.-]/g, '');
  if (!stripped) return null;

  const signal = stripped.startsWith('-') ? '-' : '';
  const unsigned = stripped.replace(/^[+-]/, '');
  const decimalIndex = Math.max(unsigned.lastIndexOf(','), unsigned.lastIndexOf('.'));
  let normalized = unsigned;

  if (decimalIndex >= 0) {
    const integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '');
    const fractionPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '');
    normalized = `${integerPart || '0'}.${fractionPart}`;
  } else {
    normalized = unsigned.replace(/[.,]/g, '');
  }

  const parsed = Number(`${signal}${normalized}`);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
};

const PRICE_FILTER_PRESETS = [
  { label: 'Ate R$ 50', from: '', to: '50' },
  { label: 'R$ 50 a R$ 150', from: '50', to: '150' },
  { label: 'R$ 150 a R$ 300', from: '150', to: '300' },
  { label: 'Acima de R$ 300', from: '300', to: '' }
] as const;

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

const normalizeCartItem = (
  item: CartItem,
  latest?: NormalizedProduct,
  options?: { preservePendingQuantity?: boolean }
): CartItem => {
  if (!latest) return item;
  const available = Math.max(0, latest.quantity);
  const requestedQuantity = Math.max(0, Math.trunc(toNumber(item.quantity)));
  const quantity = options?.preservePendingQuantity
    ? requestedQuantity
    : Math.max(0, Math.min(requestedQuantity, available));
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
    quantity
  };
};

const normalizeCheckoutPaymentStatus = (value?: string | null): CheckoutPaymentStatus => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'paid' || normalized === 'approved' || normalized === 'accepted') return 'paid';
  if (normalized === 'failed' || normalized === 'rejected' || normalized === 'cancelled') return 'failed';
  if (normalized === 'expired') return 'expired';
  return 'pending';
};

const toCountdownText = (seconds: number) => {
  const safe = Math.max(0, Math.trunc(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
};

type HeroVariant = 'a' | 'b';
type AudienceSegment = 'revenda' | 'cliente-final' | 'atacado';

type SegmentCopy = {
  audienceLabel: string;
  heroTitle: Record<HeroVariant, string>;
  heroSubtitle: Record<HeroVariant, string>;
  heroPrimaryCta: Record<HeroVariant, string>;
  heroSecondaryCta: Record<HeroVariant, string>;
  checkoutIntro: Record<HeroVariant, string>;
  trust: [string, string, string];
  checkoutAssurances: [string, string, string];
};

const SEGMENT_COPY: Record<AudienceSegment, SegmentCopy> = {
  revenda: {
    audienceLabel: 'foco em revenda',
    heroTitle: {
      a: 'Catalogo confiavel para acelerar sua revenda.',
      b: 'Lucro rapido com pedido fechado hoje.'
    },
    heroSubtitle: {
      a: 'Escolha seus itens com previsibilidade de estoque e pagamento simplificado.',
      b: 'Aproveite as melhores oportunidades do dia e garanta margem no proximo ciclo.'
    },
    heroPrimaryCta: {
      a: 'Ver catalogo completo',
      b: 'Garantir oferta agora'
    },
    heroSecondaryCta: {
      a: 'Montar carrinho',
      b: 'Quero montar meu pedido'
    },
    checkoutIntro: {
      a: 'Confirme seu pedido de revenda com pagamento seguro e acompanhamento claro.',
      b: 'Feche seu pedido agora para nao perder condicoes e estoque.'
    },
    trust: ['Checkout protegido', 'Reposicao agil', 'Atendimento consultivo'],
    checkoutAssurances: ['Ambiente protegido', 'Separacao prioritaria', 'Suporte rapido da loja']
  },
  'cliente-final': {
    audienceLabel: 'compra para uso pessoal',
    heroTitle: {
      a: 'Compre com tranquilidade e receba sem complicacao.',
      b: 'Leve agora o que voce precisa, sem burocracia.'
    },
    heroSubtitle: {
      a: 'Produtos selecionados, pagamento seguro e atendimento proximo do inicio ao fim.',
      b: 'Ofertas diretas com checkout rapido para concluir sua compra em minutos.'
    },
    heroPrimaryCta: {
      a: 'Escolher produtos',
      b: 'Comprar com desconto'
    },
    heroSecondaryCta: {
      a: 'Ver carrinho',
      b: 'Quero meu carrinho'
    },
    checkoutIntro: {
      a: 'Revise seus itens e finalize com seguranca em um processo simples.',
      b: 'Finalize agora para garantir preco e disponibilidade da sua selecao.'
    },
    trust: ['Pagamento seguro', 'Suporte humano', 'Entrega acompanhada'],
    checkoutAssurances: ['Transacao protegida', 'Processo transparente', 'Suporte dedicado']
  },
  atacado: {
    audienceLabel: 'compra em volume',
    heroTitle: {
      a: 'Pedido em volume com organizacao e controle.',
      b: 'Volume alto, condicao forte e pedido fechado rapido.'
    },
    heroSubtitle: {
      a: 'Monte lotes com visao clara de estoque, oferta e condicoes de pagamento.',
      b: 'Aproveite a janela de oportunidade para garantir disponibilidade em escala.'
    },
    heroPrimaryCta: {
      a: 'Montar pedido em lote',
      b: 'Fechar lote agora'
    },
    heroSecondaryCta: {
      a: 'Revisar carrinho',
      b: 'Abrir meu pedido'
    },
    checkoutIntro: {
      a: 'Valide seu pedido em volume e conclua com seguranca operacional.',
      b: 'Conclua agora para garantir escala, prazo e condicao comercial.'
    },
    trust: ['Fluxo profissional', 'Separacao em escala', 'Atendimento especializado'],
    checkoutAssurances: ['Checkout seguro', 'Processo com prioridade', 'Suporte para volume']
  }
};

const normalizeAudienceSegment = (value: string): AudienceSegment => {
  const normalized = normalizeToken(value || '');
  if (!normalized) return 'revenda';
  if (
    normalized === 'cliente-final' ||
    normalized === 'clientefinal' ||
    normalized === 'consumidor' ||
    normalized === 'varejo' ||
    normalized === 'retail'
  ) {
    return 'cliente-final';
  }
  if (normalized === 'atacado' || normalized === 'volume' || normalized === 'lote' || normalized === 'bulk') {
    return 'atacado';
  }
  return 'revenda';
};

const parseHeroVariant = (value: string): HeroVariant | null => {
  const normalized = normalizeToken(value || '');
  if (!normalized) return null;
  if (normalized === 'a' || normalized === 'sobria' || normalized === 'sobrio' || normalized === 'controle') {
    return 'a';
  }
  if (normalized === 'b' || normalized === 'agressiva' || normalized === 'agressivo' || normalized === 'bold') {
    return 'b';
  }
  return null;
};

const pickHeroVariant = (seed: string): HeroVariant => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) % 2 === 0 ? 'a' : 'b';
};

export default function PublicStorefront({
  subdomain,
  initialProducts,
  initialStoreName,
  initialStoreSettings,
  initialProductId,
  initialSegmentParam,
  initialHeroParam,
  unavailable
}: {
  subdomain: string;
  initialProducts: StoreProduct[];
  initialStoreName: string;
  initialStoreSettings?: PublicStoreSettings;
  initialProductId?: string | null;
  initialSegmentParam?: string;
  initialHeroParam?: string;
  unavailable?: boolean;
}) {
  const segmentParam = (initialSegmentParam || '').trim();
  const heroParam = (initialHeroParam || '').trim();
  const audienceSegment = useMemo(() => normalizeAudienceSegment(segmentParam), [segmentParam]);

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
  const [heroVariant, setHeroVariant] = useState<HeroVariant>(() => parseHeroVariant(heroParam) || 'a');

  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<CheckoutPaymentMethod | ''>(
    mercadoPagoEnabled || pixKey ? 'pix' : creditCardLink ? 'credit_card' : ''
  );
  const [creditCardInstallments, setCreditCardInstallments] = useState(1);
  const [paymentHelperMessage, setPaymentHelperMessage] = useState('');
  const [paymentHelperError, setPaymentHelperError] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutError, setCheckoutError] = useState(false);
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [promotions, setPromotions] = useState<StorefrontRuntimePromotion[]>([]);
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>([]);
  const [productDescriptions, setProductDescriptions] = useState<Record<string, string>>({});
  const [storePriceOverrides, setStorePriceOverrides] = useState<Record<string, number>>({});
  const [successPaymentUrl, setSuccessPaymentUrl] = useState('');
  const [successPaymentMethod, setSuccessPaymentMethod] = useState<CheckoutPaymentMethod | ''>('');
  const [successPaymentProvider, setSuccessPaymentProvider] = useState('');
  const [successPaymentReference, setSuccessPaymentReference] = useState('');
  const [successMercadoPagoPaymentId, setSuccessMercadoPagoPaymentId] = useState('');
  const [successPixQrCodeBase64, setSuccessPixQrCodeBase64] = useState('');
  const [successOrderId, setSuccessOrderId] = useState('');
  const [successPaymentToken, setSuccessPaymentToken] = useState('');
  const [successPaymentStatus, setSuccessPaymentStatus] = useState<CheckoutPaymentStatus>('pending');
  const [successPixExpiresAt, setSuccessPixExpiresAt] = useState('');
  const [successPixSecondsLeft, setSuccessPixSecondsLeft] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [pendingPaymentSnapshot, setPendingPaymentSnapshot] = useState<PendingPaymentSnapshot | null>(null);
  const manualCartChangeRef = useRef(false);
  const previousCartItemsCountRef = useRef(0);

  const viewStateSubdomain = useMemo(
    () => sanitizeSubdomain(subdomain) || DEFAULT_STOREFRONT_SETTINGS.subdomain,
    [subdomain]
  );
  const initialRuntimeState = useMemo(
    () => normalizeStorefrontRuntimeState(initialStoreSettings?.runtimeState || null),
    [initialStoreSettings]
  );
  const pendingPaymentStorageKey = `${PENDING_PAYMENT_STORAGE_PREFIX}${viewStateSubdomain}`;
  const cartStorageKey = `${CART_STORAGE_PREFIX}${viewStateSubdomain}`;
  const checkoutDraftStorageKey = `${CHECKOUT_DRAFT_STORAGE_PREFIX}${viewStateSubdomain}`;

  useEffect(() => {
    const forcedVariant = parseHeroVariant(heroParam);
    if (forcedVariant) {
      setHeroVariant(forcedVariant);
      return;
    }

    if (typeof window === 'undefined') return;

    try {
      const storageKey = `revendis:hero-variant:v1:${viewStateSubdomain}:${audienceSegment}`;
      const persisted = window.localStorage.getItem(storageKey);
      if (persisted === 'a' || persisted === 'b') {
        setHeroVariant(persisted);
        return;
      }

      const visitorKey = 'revendis:hero-visitor:v1';
      let visitorId = window.localStorage.getItem(visitorKey);
      if (!visitorId) {
        visitorId = `v${Math.random().toString(36).slice(2, 10)}`;
        window.localStorage.setItem(visitorKey, visitorId);
      }

      const nextVariant = pickHeroVariant(`${viewStateSubdomain}:${audienceSegment}:${visitorId}`);
      window.localStorage.setItem(storageKey, nextVariant);
      setHeroVariant(nextVariant);
    } catch {
      setHeroVariant('a');
    }
  }, [audienceSegment, heroParam, viewStateSubdomain]);

  const clearPendingPaymentSnapshot = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(pendingPaymentStorageKey);
    setPendingPaymentSnapshot(null);
  };

  const savePendingPaymentSnapshot = (snapshot: PendingPaymentSnapshot) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(pendingPaymentStorageKey, JSON.stringify(snapshot));
    setPendingPaymentSnapshot(snapshot);
  };

  const loadPendingPaymentSnapshot = (): PendingPaymentSnapshot | null => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(pendingPaymentStorageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PendingPaymentSnapshot;
      if (!parsed || parsed.version !== PENDING_PAYMENT_VERSION) return null;
      if (!parsed.orderId || !parsed.method || !parsed.token) return null;
      return {
        ...parsed,
        mercadoPagoPaymentId: (parsed.mercadoPagoPaymentId || '').trim() || undefined,
        pixQrCodeBase64: (parsed.pixQrCodeBase64 || '').trim() || undefined,
        customerName: (parsed.customerName || '').trim(),
        customerPhone: (parsed.customerPhone || '').trim(),
        installments: Math.min(12, Math.max(1, Math.trunc(toNumber(parsed.installments) || 1)))
      };
    } catch {
      return null;
    }
  };

  const clearPersistedCart = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(cartStorageKey);
  };

  const clearCheckoutDraft = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(checkoutDraftStorageKey);
  };

  const loadPersistedCart = (): CartItem[] => {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(cartStorageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as PersistedCartSnapshot;
      if (!parsed || parsed.version !== CART_STORAGE_VERSION || !Array.isArray(parsed.items)) return [];
      return parsed.items
        .filter((item): item is CartItem => Boolean(item && typeof item === 'object' && typeof item.productId === 'string'))
        .map((item) => ({
          productId: item.productId,
          sku: (item.sku || '').trim(),
          code: (item.code || '').trim(),
          name: (item.name || '').trim(),
          brand: (item.brand || '').trim(),
          category: (item.category || '').trim(),
          imageUrl: (item.imageUrl || '').trim(),
          price: Math.max(0, toNumber(item.price)),
          available: Math.max(0, Math.trunc(toNumber(item.available))),
          quantity: Math.max(0, Math.trunc(toNumber(item.quantity)))
        }))
        .filter((item) => item.productId && item.sku && item.quantity > 0);
    } catch {
      return [];
    }
  };

  const loadCheckoutDraft = (): PersistedCheckoutDraft | null => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(checkoutDraftStorageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PersistedCheckoutDraft;
      if (!parsed || parsed.version !== CHECKOUT_DRAFT_VERSION) return null;
      const method =
        parsed.paymentMethod === 'pix' || parsed.paymentMethod === 'credit_card' ? parsed.paymentMethod : '';
      return {
        version: CHECKOUT_DRAFT_VERSION,
        customerName: (parsed.customerName || '').trim(),
        customerPhone: (parsed.customerPhone || '').trim(),
        paymentMethod: method,
        installments: Math.min(12, Math.max(1, Math.trunc(toNumber(parsed.installments) || 1)))
      };
    } catch {
      return null;
    }
  };

  const resetSuccessState = () => {
    setSuccessPaymentUrl('');
    setSuccessPaymentMethod('');
    setSuccessPaymentProvider('');
    setSuccessPaymentReference('');
    setSuccessMercadoPagoPaymentId('');
    setSuccessPixQrCodeBase64('');
    setSuccessOrderId('');
    setSuccessPaymentToken('');
    setSuccessPaymentStatus('pending');
    setSuccessPixExpiresAt('');
    setSuccessPixSecondsLeft(0);
    setSuccessMessage('');
    setConfirmingPayment(false);
  };

  const applyPendingPaymentSnapshot = (
    snapshot: PendingPaymentSnapshot,
    options?: {
      openSuccess?: boolean;
      message?: string;
    }
  ) => {
    if (!snapshot) return;
    if (options?.openSuccess) {
      setView('success');
    }
    setSuccessOrderId(snapshot.orderId);
    setSuccessPaymentMethod(snapshot.method);
    setSuccessPaymentToken(snapshot.token);
    setSuccessPaymentProvider(snapshot.provider || '');
    setSuccessPaymentUrl(snapshot.checkoutUrl || '');
    setSuccessPaymentReference(snapshot.reference || '');
    setSuccessMercadoPagoPaymentId(snapshot.mercadoPagoPaymentId || '');
    setSuccessPixQrCodeBase64(snapshot.pixQrCodeBase64 || '');
    setSuccessPaymentStatus(normalizeCheckoutPaymentStatus(snapshot.status));
    setSuccessPixExpiresAt(snapshot.expiresAt || '');
    setSelectedPaymentMethod(snapshot.method);
    setCustomerName(snapshot.customerName || '');
    setCustomerPhone(snapshot.customerPhone || '');
    if (snapshot.method === 'credit_card') {
      setCreditCardInstallments(Math.min(12, Math.max(1, Math.trunc(toNumber(snapshot.installments) || 1))));
    }
    if (options?.message) {
      setSuccessMessage(options.message);
    }
  };

  useEffect(() => {
    setProductsSource(initialProducts || []);
  }, [initialProducts]);

  useEffect(() => {
    setCartHydrated(false);
    const restored = loadPersistedCart();
    setCartItems(restored);
    setCartHydrated(true);
  }, [cartStorageKey]);

  useEffect(() => {
    const draft = loadCheckoutDraft();
    if (!draft) return;
    if (draft.customerName) setCustomerName(draft.customerName);
    if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
    if (draft.paymentMethod) setSelectedPaymentMethod(draft.paymentMethod);
    setCreditCardInstallments(draft.installments);
  }, [checkoutDraftStorageKey]);

  useEffect(() => {
    const syncRuntime = () => {
      const runtime = loadStorefrontRuntimeState();
      const resolvedRuntime =
        hasStorefrontRuntimeStateData(initialRuntimeState) || !runtime ? initialRuntimeState : runtime;
      setPromotions(resolvedRuntime.promotions || []);
      setHiddenProductIds(resolvedRuntime.hiddenProductIds || []);
      setProductDescriptions(resolvedRuntime.productDescriptions || {});
      setStorePriceOverrides(resolvedRuntime.storePriceOverrides || {});
    };
    syncRuntime();
    const onStorage = (event: StorageEvent) => {
      if (event.key && !event.key.includes('revendis:storefront-runtime')) return;
      const runtime = loadStorefrontRuntimeState();
      if (!runtime) return;
      setPromotions(runtime.promotions || []);
      setHiddenProductIds(runtime.hiddenProductIds || []);
      setProductDescriptions(runtime.productDescriptions || {});
      setStorePriceOverrides(runtime.storePriceOverrides || {});
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [initialRuntimeState]);

  const activePromotionDiscountByProductId = useMemo(() => {
    const maxDiscountByProductId = new Map<string, number>();
    for (const promotion of promotions) {
      const status = promotion.status || resolvePromotionStatus(promotion.startDate, promotion.endDate);
      if (status !== 'active') continue;
      for (const productId of promotion.productIds) {
        const discount =
          promotion.mode === 'per_product'
            ? Math.max(0, Math.min(99, toNumber(promotion.discountsByProduct?.[productId] ?? promotion.discount)))
            : Math.max(0, Math.min(99, toNumber(promotion.discount)));
        if (discount <= 0) continue;
        const current = maxDiscountByProductId.get(productId) || 0;
        if (discount > current) {
          maxDiscountByProductId.set(productId, discount);
        }
      }
    }
    return maxDiscountByProductId;
  }, [promotions]);

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

          const promotionDiscount = activePromotionDiscountByProductId.get(normalized.id) || 0;
          if (promotionDiscount > 0) {
            const basePrice = Math.max(0, normalized.price);
            const promotionPrice = Math.max(0, basePrice - basePrice * (promotionDiscount / 100));
            normalized.originalPrice = basePrice;
            normalized.price = promotionPrice;
            normalized.promotionDiscount = promotionDiscount;
          }

          return normalized;
        }),
    [activePromotionDiscountByProductId, hiddenProductIds, productsSource, storePriceOverrides]
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
    if (mercadoPagoEnabled || pixKey) {
      methods.push('pix');
    }
    if (mercadoPagoEnabled || creditCardLink) {
      methods.push('credit_card');
    }
    return methods;
  }, [creditCardLink, mercadoPagoEnabled, pixKey]);

  const productsByStockRule = useMemo(
    () =>
      settings.showOutOfStockProducts ? products : products.filter((item) => item.quantity > 0),
    [products, settings.showOutOfStockProducts]
  );

  const productsByConfiguredOptions = useMemo(
    () =>
      productsByStockRule.filter((item) => {
        const allowedBrand =
          configuredBrandTokens.length === 0 || configuredBrandTokens.includes(normalizeToken(item.brand));
        const allowedBrandStock = configuredBrandTokens.length === 0 || item.quantity > 0;
        const allowedCategory =
          configuredCategoryTokens.length === 0 || configuredCategoryTokens.includes(normalizeToken(item.category));
        return allowedBrand && allowedBrandStock && allowedCategory;
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
    if (!settings.filterByPrice) return;
    const timer = window.setTimeout(() => {
      setPriceFromApplied((current) => (current === priceFromDraft ? current : priceFromDraft));
      setPriceToApplied((current) => (current === priceToDraft ? current : priceToDraft));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [priceFromDraft, priceToDraft, settings.filterByPrice]);

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
    if (!successPixExpiresAt || successPaymentStatus !== 'pending') {
      setSuccessPixSecondsLeft(0);
      return;
    }

    const tick = () => {
      const expiresAtMs = new Date(successPixExpiresAt).getTime();
      if (!Number.isFinite(expiresAtMs)) {
        setSuccessPixSecondsLeft(0);
        return;
      }
      const seconds = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setSuccessPixSecondsLeft(seconds);
      if (seconds === 0) {
        setSuccessPaymentStatus('expired');
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [successPixExpiresAt, successPaymentStatus]);

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

  const priceFromDraftValue = useMemo(() => parseCurrencyValue(priceFromDraft), [priceFromDraft]);
  const priceToDraftValue = useMemo(() => parseCurrencyValue(priceToDraft), [priceToDraft]);
  const applyPriceRangeFilter = (from: string, to: string) => {
    setPriceFromDraft(from);
    setPriceToDraft(to);
    setPriceFromApplied(from);
    setPriceToApplied(to);
  };

  const clearCatalogFilters = () => {
    setSearch('');
    setSelectedBrands([]);
    setSelectedCategories([]);
    applyPriceRangeFilter('', '');
  };

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

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      chips.push({ key: `search:${trimmedSearch}`, label: `Busca: ${trimmedSearch}`, kind: 'search' });
    }

    if (settings.filterByBrand) {
      for (const brand of selectedBrands) {
        const value = brand.trim();
        if (!value) continue;
        chips.push({ key: `brand:${normalizeToken(value)}`, label: value, kind: 'brand', value });
      }
    }

    if (settings.filterByCategory) {
      for (const category of selectedCategories) {
        const value = category.trim();
        if (!value) continue;
        chips.push({ key: `category:${normalizeToken(value)}`, label: value, kind: 'category', value });
      }
    }

    if (settings.filterByPrice) {
      const from = parseCurrencyValue(priceFromApplied);
      const to = parseCurrencyValue(priceToApplied);
      if (from !== null) {
        chips.push({
          key: `price-from:${from}`,
          label: `A partir de ${formatPrice(from)}`,
          kind: 'price_from'
        });
      }
      if (to !== null) {
        chips.push({
          key: `price-to:${to}`,
          label: `Ate ${formatPrice(to)}`,
          kind: 'price_to'
        });
      }
    }

    return chips;
  }, [
    priceFromApplied,
    priceToApplied,
    search,
    selectedBrands,
    selectedCategories,
    settings.filterByBrand,
    settings.filterByCategory,
    settings.filterByPrice
  ]);

  const hasActiveFilters = activeFilterChips.length > 0;
  const productsResultText = `${filteredProducts.length} ${filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}`;
  const inStockProductsCount = useMemo(
    () => productsByConfiguredOptions.filter((product) => product.quantity > 0).length,
    [productsByConfiguredOptions]
  );
  const segmentCopy = useMemo(() => SEGMENT_COPY[audienceSegment], [audienceSegment]);
  const promotionalProductsCount = useMemo(
    () =>
      productsByConfiguredOptions.filter(
        (product) => typeof product.originalPrice === 'number' && product.originalPrice > product.price
      ).length,
    [productsByConfiguredOptions]
  );
  const isPricePresetActive = (from: string, to: string) =>
    parseCurrencyValue(from) === priceFromDraftValue && parseCurrencyValue(to) === priceToDraftValue;

  const removeActiveFilter = (chip: ActiveFilterChip) => {
    if (chip.kind === 'search') {
      setSearch('');
      return;
    }

    if (chip.kind === 'brand' && chip.value) {
      const normalized = normalizeToken(chip.value);
      setSelectedBrands((prev) => prev.filter((item) => normalizeToken(item) !== normalized));
      return;
    }

    if (chip.kind === 'category' && chip.value) {
      const normalized = normalizeToken(chip.value);
      setSelectedCategories((prev) => prev.filter((item) => normalizeToken(item) !== normalized));
      return;
    }

    if (chip.kind === 'price_from') {
      applyPriceRangeFilter('', priceToDraft);
      return;
    }

    if (chip.kind === 'price_to') {
      applyPriceRangeFilter(priceFromDraft, '');
    }
  };

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
        .map((item) =>
          normalizeCartItem(item, productsById.get(item.productId), {
            preservePendingQuantity: Boolean(pendingPaymentSnapshot)
          })
        )
        .filter((item) => item.quantity > 0),
    [cartItems, pendingPaymentSnapshot, productsById]
  );
  const hasActivePendingOrder = Boolean(
    pendingPaymentSnapshot &&
      normalizeCheckoutPaymentStatus(pendingPaymentSnapshot.status) !== 'paid' &&
      pendingPaymentSnapshot.orderId &&
      pendingPaymentSnapshot.token
  );

  useEffect(() => {
    if (!hasActivePendingOrder || !pendingPaymentSnapshot) return;
    setCustomerName(pendingPaymentSnapshot.customerName || '');
    setCustomerPhone(pendingPaymentSnapshot.customerPhone || '');
    setSelectedPaymentMethod(pendingPaymentSnapshot.method);
    if (pendingPaymentSnapshot.method === 'credit_card') {
      setCreditCardInstallments(Math.min(12, Math.max(1, Math.trunc(toNumber(pendingPaymentSnapshot.installments) || 1))));
    }
  }, [hasActivePendingOrder, pendingPaymentSnapshot]);

  useEffect(() => {
    if (!cartHydrated || typeof window === 'undefined') return;
    if (cartItems.length === 0) {
      clearPersistedCart();
      return;
    }
    const snapshot: PersistedCartSnapshot = {
      version: CART_STORAGE_VERSION,
      items: cartItems
    };
    window.localStorage.setItem(cartStorageKey, JSON.stringify(snapshot));
  }, [cartHydrated, cartItems, cartStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasDraftData =
      customerName.trim().length > 0 ||
      customerPhone.trim().length > 0 ||
      selectedPaymentMethod.length > 0 ||
      creditCardInstallments > 1;
    if (!hasDraftData) {
      clearCheckoutDraft();
      return;
    }
    const draft: PersistedCheckoutDraft = {
      version: CHECKOUT_DRAFT_VERSION,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      paymentMethod: selectedPaymentMethod,
      installments: Math.min(12, Math.max(1, Math.trunc(creditCardInstallments || 1)))
    };
    window.localStorage.setItem(checkoutDraftStorageKey, JSON.stringify(draft));
  }, [checkoutDraftStorageKey, creditCardInstallments, customerName, customerPhone, selectedPaymentMethod]);

  useEffect(() => {
    if (!cartHydrated) return;
    const previousCount = previousCartItemsCountRef.current;
    const currentCount = cartItems.length;
    const manualCartChange = manualCartChangeRef.current;
    manualCartChangeRef.current = false;
    previousCartItemsCountRef.current = currentCount;

    const hasPendingOrder =
      pendingPaymentSnapshot &&
      normalizeCheckoutPaymentStatus(pendingPaymentSnapshot.status) !== 'paid' &&
      Boolean(pendingPaymentSnapshot.orderId) &&
      Boolean(pendingPaymentSnapshot.token);

    if (!manualCartChange || previousCount <= 0 || currentCount > 0 || !hasPendingOrder) return;
    void cancelPendingOrderByToken(pendingPaymentSnapshot);
  }, [cartHydrated, cartItems.length, pendingPaymentSnapshot]);

  const cartCount = useMemo(
    () => cartDisplayItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartDisplayItems]
  );

  const cartTotal = useMemo(
    () => cartDisplayItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartDisplayItems]
  );
  const cartSavings = useMemo(
    () =>
      cartDisplayItems.reduce((sum, item) => {
        const source = productsById.get(item.productId);
        if (!source || typeof source.originalPrice !== 'number' || source.originalPrice <= source.price) {
          return sum;
        }
        return sum + (source.originalPrice - source.price) * item.quantity;
      }, 0),
    [cartDisplayItems, productsById]
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
    manualCartChangeRef.current = true;
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
    manualCartChangeRef.current = true;
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

  const scrollToCatalogProducts = () => {
    if (typeof document === 'undefined') return;
    const target = document.getElementById('public-stock-catalog-grid');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCatalogPrimaryAction = () => {
    if (cartDisplayItems.length > 0) {
      openCheckout();
      return;
    }
    scrollToCatalogProducts();
  };

  const cancelPendingOrderByToken = async (snapshot: PendingPaymentSnapshot) => {
    if (!snapshot.orderId || !snapshot.token) return;

    try {
      const response = await fetch(`${API_BASE}/storefront/orders/${snapshot.orderId}/cancel-public`, {
        method: 'POST',
        headers: buildMutationHeaders(),
        body: JSON.stringify({
          subdomain: viewStateSubdomain,
          token: snapshot.token
        })
      });
      const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
      if (!response.ok) {
        const alreadyHandled =
          payload?.code === 'already_cancelled' || payload?.code === 'already_accepted' || response.status === 409;
        if (!alreadyHandled) {
          throw new Error(payload?.message || 'Nao foi possivel cancelar o pedido pendente.');
        }
      }

      clearPendingPaymentSnapshot();
      resetSuccessState();
      clearCheckoutDraft();
      setToastMessage('Pedido pendente cancelado.');
    } catch (error) {
      setToastMessage(
        error instanceof Error
          ? error.message
          : 'Carrinho limpo, mas nao foi possivel cancelar o pedido pendente.'
      );
    }
  };

  const confirmOrderPayment = async ({
    orderId,
    method,
    token,
    returnStatus,
    mercadoPagoStatus,
    mercadoPagoPaymentId
  }: {
    orderId: string;
    method: CheckoutPaymentMethod;
    token: string;
    returnStatus?: string;
    mercadoPagoStatus?: string;
    mercadoPagoPaymentId?: string;
  }) => {
    if (!orderId || !token) return;

    setConfirmingPayment(true);
    setCheckoutMessage('');
    setCheckoutError(false);
    try {
      const response = await fetch(`${API_BASE}/storefront/orders/${orderId}/payments/confirm`, {
        method: 'POST',
        headers: buildMutationHeaders(),
        body: JSON.stringify({
          subdomain: viewStateSubdomain,
          method,
          token,
          returnStatus,
          mercadoPagoStatus,
          mercadoPagoPaymentId
        })
      });
      const payload = (await response.json().catch(() => null)) as CheckoutResponse | null;
      if (!response.ok) {
        throw new Error(payload?.message || 'Nao foi possivel confirmar o pagamento.');
      }

      const nextStatus = normalizeCheckoutPaymentStatus(payload?.data?.payment_status);
      setSuccessPaymentStatus(nextStatus);
      const nextExpiresAt = payload?.data?.payment_expires_at || successPixExpiresAt || '';
      if (nextExpiresAt) {
        setSuccessPixExpiresAt(nextExpiresAt);
      }

      if (pendingPaymentSnapshot && pendingPaymentSnapshot.orderId === orderId) {
        savePendingPaymentSnapshot({
          ...pendingPaymentSnapshot,
          status: nextStatus,
          expiresAt: nextExpiresAt || pendingPaymentSnapshot.expiresAt || ''
        });
      }

      if (nextStatus === 'paid') {
        setSuccessMessage('Pagamento feito.');
        setCartItems([]);
        clearPersistedCart();
        clearPendingPaymentSnapshot();
        clearCheckoutDraft();
      } else if (nextStatus === 'expired') {
        setSuccessMessage('Tempo do Pix expirado. Gere um novo pedido para continuar.');
      } else if (nextStatus === 'failed') {
        setSuccessMessage('Pagamento nao aprovado. Tente novamente.');
      } else if (method === 'credit_card') {
        setSuccessMessage('Pagamento ainda pendente no cartao. Conclua no Mercado Pago.');
      } else {
        setSuccessMessage('Pagamento Pix pendente. Assim que pagar, confirme aqui.');
      }
    } catch (error) {
      setSuccessMessage(error instanceof Error ? error.message : 'Nao foi possivel confirmar o pagamento.');
      setCheckoutError(true);
    } finally {
      setConfirmingPayment(false);
    }
  };

  const goToPaymentStep = () => {
    if (pendingPaymentSnapshot) {
      setSelectedPaymentMethod(pendingPaymentSnapshot.method);
      setCustomerName(pendingPaymentSnapshot.customerName || customerName);
      setCustomerPhone(pendingPaymentSnapshot.customerPhone || customerPhone);
      if (pendingPaymentSnapshot.method === 'credit_card') {
        setCreditCardInstallments(Math.min(12, Math.max(1, Math.trunc(toNumber(pendingPaymentSnapshot.installments) || 1))));
      }
    }
    setView('checkout');
    setCheckoutMessage('');
    setCheckoutError(false);
  };

  const continuePendingPayment = () => {
    if (successPaymentMethod === 'credit_card' && successPaymentUrl) {
      window.location.assign(successPaymentUrl);
      return;
    }
    if (
      pendingPaymentSnapshot &&
      pendingPaymentSnapshot.method === 'credit_card' &&
      pendingPaymentSnapshot.checkoutUrl
    ) {
      window.location.assign(pendingPaymentSnapshot.checkoutUrl);
      return;
    }
    goToPaymentStep();
  };

  const changePendingPaymentMethod = async () => {
    if (pendingPaymentSnapshot) {
      await cancelPendingOrderByToken(pendingPaymentSnapshot);
    }
    setView('checkout');
    setCheckoutMessage('Escolha uma nova forma de pagamento para continuar.');
    setCheckoutError(false);
  };

  useEffect(() => {
    const pendingSnapshot = loadPendingPaymentSnapshot();
    setPendingPaymentSnapshot(pendingSnapshot);
    if (pendingSnapshot) {
      const snapshotStatus = normalizeCheckoutPaymentStatus(pendingSnapshot.status);
      applyPendingPaymentSnapshot(pendingSnapshot, {
        openSuccess: true,
        message:
          snapshotStatus === 'expired'
            ? 'Pagamento expirado. Continue para pagar novamente ou troque a forma de pagamento.'
            : snapshotStatus === 'failed'
              ? 'Pagamento nao aprovado. Continue para tentar novamente ou troque a forma de pagamento.'
              : pendingSnapshot.method === 'pix'
                ? pendingSnapshot.provider === 'mercado_pago'
                  ? 'Continue o pagamento Pix para concluir o pedido.'
                  : 'Pagamento Pix pendente. Copie o codigo e confirme apos pagar.'
                : 'Continue o pagamento com cartao para concluir o pedido.'
      });
    }

    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const pagamento = (url.searchParams.get('pagamento') || '').trim();
    const orderId = (url.searchParams.get('pedido') || '').trim();
    const token = (url.searchParams.get('token') || '').trim();
    const methodParam = (url.searchParams.get('metodo') || '').trim().toLowerCase();
    const mpStatus = (url.searchParams.get('status') || url.searchParams.get('collection_status') || '').trim();
    const paymentId = (url.searchParams.get('payment_id') || '').trim();

    if (!pagamento || !orderId || !token) return;
    const methodFromQuery: CheckoutPaymentMethod | '' =
      methodParam === 'pix' || methodParam === 'credit_card' ? methodParam : '';
    const methodFromSnapshot: CheckoutPaymentMethod | '' =
      pendingSnapshot && pendingSnapshot.orderId === orderId && pendingSnapshot.token === token
        ? pendingSnapshot.method
        : '';
    const method = methodFromQuery || methodFromSnapshot || 'credit_card';

    setView('success');
    setSuccessOrderId(orderId);
    setSuccessPaymentMethod(method);
    setSuccessPaymentProvider('mercado_pago');
    setSuccessPaymentToken(token);
    setSuccessMercadoPagoPaymentId(paymentId || pendingSnapshot?.mercadoPagoPaymentId || '');
    setSuccessPixQrCodeBase64(pendingSnapshot?.pixQrCodeBase64 || '');
    setSuccessMessage(method === 'pix' ? 'Confirmando pagamento Pix...' : 'Confirmando pagamento no cartao...');
    void confirmOrderPayment({
      orderId,
      method,
      token,
      returnStatus: pagamento,
      mercadoPagoStatus: mpStatus || pagamento,
      mercadoPagoPaymentId: paymentId || undefined
    });

    url.searchParams.delete('pagamento');
    url.searchParams.delete('pedido');
    url.searchParams.delete('token');
    url.searchParams.delete('metodo');
    url.searchParams.delete('status');
    url.searchParams.delete('collection_status');
    url.searchParams.delete('payment_id');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [pendingPaymentStorageKey]);

  const handleFinalizeOrder = async () => {
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

    if (hasActivePendingOrder && pendingPaymentSnapshot) {
      if (pendingPaymentSnapshot.method === 'credit_card' && pendingPaymentSnapshot.checkoutUrl) {
        window.location.assign(pendingPaymentSnapshot.checkoutUrl);
        return;
      }
      applyPendingPaymentSnapshot(pendingPaymentSnapshot, {
        openSuccess: true,
        message:
          pendingPaymentSnapshot.method === 'pix'
            ? 'Pedido pendente. Realize o pagamento e clique em "Confirmar pagamento".'
            : 'Pedido pendente. Conclua o pagamento e depois confirme.'
      });
      return;
    }

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
    if (selectedPaymentMethod === 'pix' && !mercadoPagoEnabled && !paymentReference) {
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
          publicOrigin: typeof window !== 'undefined' ? window.location.origin : '',
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
      const orderId = payload?.data?.id || '';
      const responsePaymentReference = payload?.data?.payment?.reference || '';
      const checkoutUrl =
        payload?.data?.payment?.checkoutUrl ||
        (/^https?:\/\//i.test(responsePaymentReference) ? responsePaymentReference : '');
      const method = payload?.data?.payment?.method || selectedPaymentMethod;
      const paymentProvider = payload?.data?.payment?.provider || '';
      const paymentToken = payload?.data?.payment?.token || '';
      const mercadoPagoPaymentId = payload?.data?.payment?.mercadoPagoPaymentId || '';
      const pixQrCodeBase64 = payload?.data?.payment?.pixQrCodeBase64 || '';
      const paymentStatus = normalizeCheckoutPaymentStatus(payload?.data?.payment?.status || payload?.data?.payment_status);
      const paymentExpiresAt = payload?.data?.payment?.expiresAt || payload?.data?.payment_expires_at || '';

      if (orderId && paymentToken) {
        savePendingPaymentSnapshot({
          version: PENDING_PAYMENT_VERSION,
          orderId,
          method,
          token: paymentToken,
          provider: paymentProvider,
          checkoutUrl,
          reference: responsePaymentReference,
          status: paymentStatus,
          expiresAt: paymentExpiresAt || '',
          mercadoPagoPaymentId: mercadoPagoPaymentId || undefined,
          pixQrCodeBase64: pixQrCodeBase64 || undefined,
          customerName: trimmedName,
          customerPhone: trimmedPhone,
          installments: method === 'credit_card' ? creditCardInstallments : 1
        });
      }

      // Credit card remains redirect-based. Pix is rendered in-page with QR/copie-cola.
      if (method === 'credit_card' && checkoutUrl) {
        setCheckoutMessage('Redirecionando para o pagamento...');
        setCheckoutError(false);
        window.location.assign(checkoutUrl);
        return;
      }

      setCartOpen(false);
      setSelectedProductId(null);
      setProductQuantity(1);
      setView('success');
      syncProductQueryParam(null);
      setCheckoutMessage('');
      setCheckoutError(false);
      setPaymentHelperMessage('');
      setPaymentHelperError(false);
      setSuccessPaymentUrl(checkoutUrl);
      setSuccessPaymentMethod(method);
      setSuccessPaymentProvider(paymentProvider);
      setSuccessPaymentReference(responsePaymentReference);
      setSuccessMercadoPagoPaymentId(mercadoPagoPaymentId);
      setSuccessPixQrCodeBase64(pixQrCodeBase64);
      setSuccessOrderId(orderId);
      setSuccessPaymentToken(paymentToken);
      setSuccessPaymentStatus(paymentStatus);
      setSuccessPixExpiresAt(paymentExpiresAt || '');
      if (method === 'pix') {
        setSuccessMessage(
          paymentProvider === 'mercado_pago'
            ? 'Pix gerado no Mercado Pago. Escaneie o QR Code ou copie o codigo Pix.'
            : 'Pagamento Pix pendente. Pague e toque em "Ja paguei" para confirmar.'
        );
      } else if (paymentProvider === 'mercado_pago') {
        setSuccessMessage('Aguardando confirmacao do pagamento no cartao.');
      } else {
        setSuccessMessage('Pedido criado. Conclua o pagamento no link para finalizar.');
      }
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : 'Nao foi possivel finalizar o pedido agora.');
      setCheckoutError(true);
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const whatsappPhone = toWhatsappPhone(settings.whatsapp || '');
  const isPixAvailable = mercadoPagoEnabled || Boolean(pixKey);
  const isCreditCardAvailable = mercadoPagoEnabled || Boolean(creditCardLink);
  const heroPrimaryCtaLabel =
    cartCount > 0
      ? heroVariant === 'b'
        ? `Fechar pedido agora (${cartCount})`
        : `Ir para checkout (${cartCount})`
      : segmentCopy.heroPrimaryCta[heroVariant];
  const heroSecondaryCtaLabel = cartCount > 0 ? 'Revisar carrinho' : segmentCopy.heroSecondaryCta[heroVariant];
  const heroKicker =
    heroVariant === 'b'
      ? `${segmentCopy.audienceLabel} em destaque`
      : `Loja oficial ${settings.shopName} · ${segmentCopy.audienceLabel}`;
  const heroSubtitle =
    promotionalProductsCount > 0
      ? `${segmentCopy.heroSubtitle[heroVariant]} ${promotionalProductsCount} ofertas ativas e ${inStockProductsCount} itens em estoque.`
      : `${segmentCopy.heroSubtitle[heroVariant]} ${inStockProductsCount} itens em estoque.`;
  const successPixQrCodeUrl = useMemo(
    () =>
      successPaymentMethod === 'pix' && successPaymentStatus === 'pending' && successPaymentReference
        ? successPixQrCodeBase64
          ? `data:image/png;base64,${successPixQrCodeBase64}`
          : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(successPaymentReference)}`
        : '',
    [successPaymentMethod, successPaymentStatus, successPaymentReference, successPixQrCodeBase64]
  );

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
        <>
          <section
            className={`public-stock-hero public-stock-hero-${heroVariant}`}
            data-segment={audienceSegment}
            data-variant={heroVariant}
          >
            <div className="public-stock-hero-copy">
              <span className="public-stock-hero-kicker">{heroKicker}</span>
              <h1>{segmentCopy.heroTitle[heroVariant]}</h1>
              <p>{heroSubtitle}</p>
              <div className="public-stock-hero-actions">
                <button type="button" className="public-stock-hero-cta primary" onClick={handleCatalogPrimaryAction}>
                  {heroPrimaryCtaLabel}
                </button>
                <button type="button" className="public-stock-hero-cta ghost" onClick={() => setCartOpen(true)}>
                  {heroSecondaryCtaLabel}
                </button>
              </div>
              <div className="public-stock-hero-trust">
                <span>
                  <IconLock />
                  {segmentCopy.trust[0]}
                </span>
                <span>
                  <IconTruck />
                  {segmentCopy.trust[1]}
                </span>
                <span>
                  {whatsappPhone ? <IconWhatsapp /> : <IconStar />}
                  {segmentCopy.trust[2]}
                </span>
              </div>
            </div>

            <div className="public-stock-hero-metrics">
              <article>
                <strong>{productsByConfiguredOptions.length}</strong>
                <span>itens no catalogo</span>
              </article>
              <article>
                <strong>{inStockProductsCount}</strong>
                <span>pronta entrega</span>
              </article>
              <article>
                <strong>{promotionalProductsCount > 0 ? promotionalProductsCount : availablePaymentMethods.length}</strong>
                <span>{promotionalProductsCount > 0 ? 'ofertas ativas' : 'formas de pagamento'}</span>
              </article>
            </div>
          </section>

          <section className="public-stock-body">
            <aside className="public-stock-filters">
              <div className="public-stock-filter-panel-head">
                <strong>Filtros</strong>
                {hasActiveFilters ? (
                  <button type="button" className="public-stock-filter-clear-inline" onClick={clearCatalogFilters}>
                    Limpar tudo
                  </button>
                ) : null}
              </div>

              {settings.filterByBrand ? (
                <section className="public-stock-filter-card">
                  <button type="button" className="public-stock-filter-head" onClick={() => setBrandOpen((prev) => !prev)}>
                    <strong>Marca</strong>
                    <span className="public-stock-filter-head-meta">
                      {selectedBrands.length > 0 ? <small>{selectedBrands.length}</small> : null}
                      <span>{brandOpen ? '▾' : '▸'}</span>
                    </span>
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
                    <span className="public-stock-filter-head-meta">
                      {selectedCategories.length > 0 ? <small>{selectedCategories.length}</small> : null}
                      <span>{categoryOpen ? '▾' : '▸'}</span>
                    </span>
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
                    <span className="public-stock-filter-head-meta">
                      {priceFromApplied || priceToApplied ? <small>ativo</small> : null}
                      <span>{priceOpen ? '▾' : '▸'}</span>
                    </span>
                  </button>
                  {priceOpen ? (
                    <div className="public-stock-filter-content">
                      <div className="public-stock-price-range">
                        <label>
                          De
                          <input
                            value={priceFromDraft}
                            onChange={(event) => setPriceFromDraft(event.target.value)}
                            inputMode="decimal"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                applyPriceRangeFilter(priceFromDraft, priceToDraft);
                              }
                            }}
                            placeholder="Minimo"
                          />
                        </label>
                        <label>
                          Até
                          <input
                            value={priceToDraft}
                            onChange={(event) => setPriceToDraft(event.target.value)}
                            inputMode="decimal"
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                applyPriceRangeFilter(priceFromDraft, priceToDraft);
                              }
                            }}
                            placeholder="Maximo"
                          />
                        </label>
                      </div>

                      <div className="public-stock-price-presets">
                        {PRICE_FILTER_PRESETS.map((preset) => {
                          const active = isPricePresetActive(preset.from, preset.to);
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              className={active ? 'public-stock-price-preset active' : 'public-stock-price-preset'}
                              onClick={() => applyPriceRangeFilter(preset.from, preset.to)}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className="public-stock-filter-apply"
                        onClick={() => applyPriceRangeFilter(priceFromDraft, priceToDraft)}
                      >
                        Aplicar agora
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </aside>

            <section className="public-stock-products" id="public-stock-catalog-grid">
              <header className="public-stock-products-head">
                <strong>{productsResultText}</strong>
                <span>{hasActiveFilters ? `${activeFilterChips.length} filtro(s) ativos` : 'Sem filtros ativos'}</span>
              </header>

              {activeFilterChips.length > 0 ? (
                <div className="public-stock-active-filters">
                  {activeFilterChips.map((chip) => (
                    <button key={chip.key} type="button" className="public-stock-active-chip" onClick={() => removeActiveFilter(chip)}>
                      {chip.label}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              ) : null}

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
                    const lowStock = product.quantity > 0 && product.quantity <= 3;
                    const hasPromotion =
                      typeof product.originalPrice === 'number' && product.originalPrice > product.price;
                    const installmentCount = Math.min(6, Math.max(1, Math.floor(product.price / 30)));
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
                          {hasPromotion ? (
                            <span className="public-stock-product-badge promo">
                              -{Math.max(1, Math.round(product.promotionDiscount || 0))}%
                            </span>
                          ) : null}
                          {lowStock ? <span className="public-stock-product-badge low-stock">Ultimas unidades</span> : null}
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
                          {hasPromotion ? (
                            <span className="public-stock-product-old-price">{formatPrice(product.originalPrice || 0)}</span>
                          ) : null}
                          <strong>{formatPrice(product.price)}</strong>
                          {isCreditCardAvailable && installmentCount > 1 ? (
                            <span className="public-stock-product-installments">
                              ou {installmentCount}x de {formatPrice(product.price / installmentCount)}
                            </span>
                          ) : null}
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
        </>
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
                {typeof selectedProduct.originalPrice === 'number' &&
                selectedProduct.originalPrice > selectedProduct.price ? (
                  <span className="public-stock-detail-old-price">{formatPrice(selectedProduct.originalPrice)}</span>
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
          <p className="public-stock-checkout-intro">
            {segmentCopy.checkoutIntro[heroVariant]}
          </p>

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
              {cartSavings > 0 ? (
                <div className="public-stock-checkout-saving">
                  <span>Economia no pedido</span>
                  <strong>{formatPrice(cartSavings)}</strong>
                </div>
              ) : null}
            </article>

            <aside className="public-stock-checkout-form">
              <h2>Seus dados</h2>

              <label>
                Seu nome
                <input
                  value={customerName}
                  disabled={hasActivePendingOrder}
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
                  disabled={hasActivePendingOrder}
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
                          disabled={!isPixAvailable || hasActivePendingOrder}
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
                          <span>
                            {mercadoPagoEnabled
                              ? 'Ao finalizar, vamos gerar o QR Code Pix e o copia e cola aqui mesmo.'
                              : `Chave Pix: ${pixKey}`}
                          </span>
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
                          disabled={!isCreditCardAvailable || hasActivePendingOrder}
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
                              disabled={hasActivePendingOrder}
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

              <div className="public-stock-checkout-assurances">
                <span>
                  <IconLock />
                  {segmentCopy.checkoutAssurances[0]}
                </span>
                <span>
                  <IconTruck />
                  {segmentCopy.checkoutAssurances[1]}
                </span>
                <span>
                  {whatsappPhone ? <IconWhatsapp /> : <IconStar />}
                  {segmentCopy.checkoutAssurances[2]}
                </span>
              </div>

              {checkoutMessage ? (
                <p className={checkoutError ? 'public-stock-checkout-feedback error' : 'public-stock-checkout-feedback'}>
                  {checkoutMessage}
                </p>
              ) : null}
              {hasActivePendingOrder ? (
                <p className="public-stock-checkout-feedback">
                  Pedido pendente encontrado. Os dados do cliente e pagamento foram mantidos ate confirmar o pagamento ou remover os itens do carrinho.
                </p>
              ) : null}
              {hasActivePendingOrder ? (
                <div className="public-stock-success-actions">
                  <button type="button" className="public-stock-success-pay" onClick={continuePendingPayment}>
                    {pendingPaymentSnapshot?.method === 'credit_card' ? 'Ir para pagamento' : 'Ver etapa de pagamento'}
                  </button>
                  <button
                    type="button"
                    className="public-stock-success-pay"
                    onClick={() => void changePendingPaymentMethod()}
                  >
                    Trocar forma de pagamento
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="public-stock-checkout-submit"
                onClick={handleFinalizeOrder}
                disabled={
                  submittingCheckout ||
                  (!hasActivePendingOrder &&
                    (cartDisplayItems.length === 0 ||
                      cartDisplayItems.some((item) => item.available <= 0 || item.quantity > item.available) ||
                      availablePaymentMethods.length === 0 ||
                      !selectedPaymentMethod))
                }
              >
                {submittingCheckout
                  ? 'Finalizando...'
                  : hasActivePendingOrder
                    ? 'Continuar pedido pendente'
                    : 'Finalizar pedido'}
              </button>
            </aside>
          </div>
        </section>
      ) : null}

      {view === 'success' ? (
        <section className="public-stock-success-page">
          <div className="public-stock-success-icon">✓</div>
          <h1>{successPaymentStatus === 'paid' ? 'Pagamento feito' : 'Pedido criado'}</h1>
          <p>
            {successMessage ||
              (successPaymentStatus === 'paid'
                ? 'Seu pagamento foi confirmado e a venda foi finalizada.'
                : 'Aguardando confirmacao do pagamento.')}
          </p>
          {successOrderId ? <p className="public-stock-success-order">Pedido: #{successOrderId.slice(0, 8).toUpperCase()}</p> : null}
          {successPaymentMethod === 'pix' && successPaymentStatus === 'pending' ? (
            <p className="public-stock-success-timer">Tempo restante do Pix: {toCountdownText(successPixSecondsLeft)}</p>
          ) : null}
          {successPaymentMethod === 'pix' &&
          successPaymentStatus === 'pending' &&
          successPaymentReference ? (
            <div className="public-stock-success-pix">
              {successPixQrCodeUrl ? (
                <div className="public-stock-pix-qr">
                  <img src={successPixQrCodeUrl} alt="QR Code Pix" />
                </div>
              ) : null}
              <code>{successPaymentReference}</code>
              <button
                type="button"
                className="public-stock-success-pay"
                onClick={() =>
                  void copyText(successPaymentReference).then((copied) => {
                    setSuccessMessage(copied ? 'Codigo Pix copiado.' : 'Nao foi possivel copiar o codigo Pix.');
                  })
                }
              >
                <IconCopy />
                Copiar Pix
              </button>
            </div>
          ) : null}
          <div className="public-stock-success-actions">
            {successPaymentStatus !== 'paid' ? (
              <button
                type="button"
                className="public-stock-success-pay"
                onClick={continuePendingPayment}
              >
                {successPaymentMethod === 'credit_card' ? 'Ir para pagamento' : 'Ver etapa de pagamento'}
              </button>
            ) : null}
            {successOrderId && successPaymentToken && successPaymentStatus !== 'paid' && successPaymentMethod ? (
              <button
                type="button"
                className="public-stock-success-pay"
                onClick={() =>
                  void confirmOrderPayment({
                    orderId: successOrderId,
                    method: successPaymentMethod,
                    token: successPaymentToken,
                    mercadoPagoPaymentId: successMercadoPagoPaymentId || undefined
                  })
                }
                disabled={confirmingPayment || (successPaymentMethod === 'pix' && successPaymentStatus === 'expired')}
              >
                {confirmingPayment ? 'Confirmando...' : 'Confirmar pagamento'}
              </button>
            ) : null}
            {successPaymentStatus !== 'paid' && successPaymentMethod ? (
              <button
                type="button"
                className="public-stock-success-pay"
                onClick={() => void changePendingPaymentMethod()}
              >
                Trocar forma de pagamento
              </button>
            ) : null}
            {successPaymentStatus === 'paid' ? (
              <button
                type="button"
                onClick={() => {
                  backToCatalog();
                  setSearch('');
                  resetSuccessState();
                }}
              >
                Voltar para a loja
              </button>
            ) : null}
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

          </aside>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="public-stock-toast-center" role="status" aria-live="polite">
          <div className="public-stock-toast-card">
            <span>{toastMessage}</span>
            <button type="button" aria-label="Fechar aviso" onClick={() => setToastMessage('')}>
              x
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
