import { MERCADO_PAGO_ACCESS_TOKEN, MERCADO_PAGO_PUBLIC_BASE_URL, MERCADO_PAGO_WEBHOOK_URL } from '../config';

type MercadoPagoMethod = 'pix' | 'credit_card' | 'boleto';

type PaymentItem = {
  title: string;
  quantity: number;
  unitPrice: number;
};

type CreateMercadoPagoPreferenceInput = {
  orderId: string;
  subdomain: string;
  paymentToken: string;
  method: MercadoPagoMethod;
  publicBaseUrl?: string;
  installments?: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  items: PaymentItem[];
};

type CreateMercadoPagoPixPaymentInput = {
  orderId: string;
  subdomain: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  transactionAmount: number;
  expiresAt?: string;
};

type MercadoPagoPreferenceResult = {
  preferenceId: string;
  checkoutUrl: string;
};

type MercadoPagoPixPaymentResult = {
  paymentId: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
};

type MercadoPagoPaymentResult = {
  id: string;
  status: string;
  statusDetail: string;
  externalReference: string;
  paymentTypeId: string;
  paymentMethodId: string;
  dateApproved: string;
  dateCreated: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  metadata: Record<string, unknown>;
};

type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  message?: string;
  error?: string;
  cause?: Array<{ description?: string }>;
};

type MercadoPagoPaymentResponse = {
  id?: string | number;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  payment_type_id?: string;
  payment_method_id?: string;
  date_approved?: string;
  date_created?: string;
  metadata?: Record<string, unknown>;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  message?: string;
  error?: string;
  cause?: Array<{ description?: string }>;
};

type MercadoPagoSearchPaymentsResponse = {
  results?: MercadoPagoPaymentResponse[];
  message?: string;
  error?: string;
  cause?: Array<{ description?: string }>;
};

type MercadoPagoMerchantOrderResponse = {
  id?: string | number;
  external_reference?: string;
  payments?: Array<{
    id?: string | number;
    status?: string;
    payment_type_id?: string;
    payment_method_id?: string;
    date_approved?: string;
    date_created?: string;
  }>;
  message?: string;
  error?: string;
  cause?: Array<{ description?: string }>;
};

type MercadoPagoMerchantOrderResult = {
  id: string;
  externalReference: string;
  payments: Array<{
    id: string;
    status: string;
    paymentTypeId: string;
    paymentMethodId: string;
    dateApproved: string;
    dateCreated: string;
  }>;
};

const MERCADO_PAGO_API_BASE_URL = 'https://api.mercadopago.com';

const toDigits = (value: string) => value.replace(/\D/g, '');

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
};

const toUnitPrice = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

const buildPaymentTypeExclusions = (method: MercadoPagoMethod) => {
  const allTypes = ['ticket', 'bank_transfer', 'atm', 'credit_card', 'debit_card', 'prepaid_card'];
  const allowed = method === 'pix' ? 'bank_transfer' : method === 'boleto' ? 'ticket' : 'credit_card';
  return allTypes.filter((type) => type !== allowed).map((id) => ({ id }));
};

const parsePhone = (value?: string) => {
  const digits = toDigits(value || '');
  if (!digits) return null;
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length !== 10 && local.length !== 11) return null;
  return {
    area_code: local.slice(0, 2),
    number: local.slice(2)
  };
};

const splitPayerName = (value?: string) => {
  const normalized = (value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!normalized) {
    return {
      firstName: 'Cliente',
      lastName: 'Revendis'
    };
  }
  const parts = normalized.split(' ');
  const firstName = (parts.shift() || 'Cliente').slice(0, 120);
  const lastName = (parts.join(' ').trim() || 'Revendis').slice(0, 120);
  return { firstName, lastName };
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const resolvePayerEmail = (value: string | undefined, orderId: string) => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized && isValidEmail(normalized)) return normalized;
  return `cliente.${orderId.slice(0, 8)}@revendis.app`;
};

const extractMercadoPagoErrorMessage = (payload: unknown, status: number) => {
  if (payload && typeof payload === 'object') {
    const typed = payload as MercadoPagoPreferenceResponse;
    const causeDescription = Array.isArray(typed.cause)
      ? typed.cause.find((item) => typeof item?.description === 'string')?.description
      : '';
    const directMessage = typed.message || typed.error || causeDescription || '';
    if (directMessage) return `${directMessage} (HTTP ${status})`;
  }
  return `Nao foi possivel gerar pagamento no Mercado Pago. (HTTP ${status})`;
};

const normalizeMercadoPagoPublicBaseUrl = (rawValue?: string) => {
  const raw = (rawValue || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
};

const MERCADO_PAGO_PUBLIC_CHECKOUT_BASE_URL = normalizeMercadoPagoPublicBaseUrl(MERCADO_PAGO_PUBLIC_BASE_URL);

const buildStorefrontReturnUrl = (baseUrl: string, subdomain: string) => {
  const resolvedBase = normalizeMercadoPagoPublicBaseUrl(baseUrl);
  const normalizedSubdomain = (subdomain || '').trim();
  if (!resolvedBase || !normalizedSubdomain) return '';
  const baseWithoutTrailingSlash = resolvedBase.replace(/\/+$/, '');
  if (baseWithoutTrailingSlash.toLowerCase().endsWith('/loja')) {
    return `${baseWithoutTrailingSlash}/${encodeURIComponent(normalizedSubdomain)}`;
  }
  return `${baseWithoutTrailingSlash}/loja/${encodeURIComponent(normalizedSubdomain)}`;
};

const buildBackUrls = (
  subdomain: string,
  orderId: string,
  paymentToken: string,
  method: MercadoPagoMethod,
  publicBaseUrl?: string
) => {
  const resolvedPublicBaseUrl =
    normalizeMercadoPagoPublicBaseUrl(publicBaseUrl) || MERCADO_PAGO_PUBLIC_CHECKOUT_BASE_URL;
  const storefrontReturnUrl = buildStorefrontReturnUrl(resolvedPublicBaseUrl, subdomain);
  if (!storefrontReturnUrl) return null;
  const query = `pedido=${encodeURIComponent(orderId)}&token=${encodeURIComponent(paymentToken)}&metodo=${encodeURIComponent(method)}`;
  return {
    success: `${storefrontReturnUrl}?pagamento=sucesso&${query}`,
    pending: `${storefrontReturnUrl}?pagamento=pendente&${query}`,
    failure: `${storefrontReturnUrl}?pagamento=falha&${query}`
  };
};

const shouldUseMercadoPagoAutoReturn = (backUrls: { success: string; pending: string; failure: string } | null) => {
  if (!backUrls) return false;
  try {
    const successUrl = new URL(backUrls.success);
    const pendingUrl = new URL(backUrls.pending);
    const failureUrl = new URL(backUrls.failure);
    const allHttps =
      successUrl.protocol === 'https:' && pendingUrl.protocol === 'https:' && failureUrl.protocol === 'https:';
    const isLocalHost =
      successUrl.hostname === 'localhost' ||
      successUrl.hostname === '127.0.0.1' ||
      successUrl.hostname === '::1';
    return allHttps && !isLocalHost;
  } catch {
    return false;
  }
};

export const isMercadoPagoEnabled = () => Boolean(MERCADO_PAGO_ACCESS_TOKEN);

export const createMercadoPagoPreference = async (
  input: CreateMercadoPagoPreferenceInput
): Promise<MercadoPagoPreferenceResult> => {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error('Mercado Pago nao configurado.');
  }

  const validItems = input.items
    .map((item) => ({
      title: item.title.trim() || 'Produto',
      quantity: toPositiveInt(item.quantity, 1),
      unit_price: toUnitPrice(item.unitPrice),
      currency_id: 'BRL'
    }))
    .filter((item) => item.unit_price > 0 && item.quantity > 0);

  if (validItems.length === 0) {
    throw new Error('Pedido sem itens validos para pagamento.');
  }

  const paymentMethods: {
    excluded_payment_types: Array<{ id: string }>;
    installments?: number;
    default_installments?: number;
  } = {
    excluded_payment_types: buildPaymentTypeExclusions(input.method)
  };

  if (input.method === 'credit_card') {
    const maxInstallments = Math.min(12, toPositiveInt(input.installments, 1));
    paymentMethods.installments = maxInstallments;
    paymentMethods.default_installments = 1;
  }

  const payerPhone = parsePhone(input.customerPhone);
  const backUrls = buildBackUrls(input.subdomain, input.orderId, input.paymentToken, input.method, input.publicBaseUrl);
  const payload: Record<string, unknown> = {
    items: validItems,
    external_reference: input.orderId,
    payment_methods: paymentMethods,
    metadata: {
      storefront_order_id: input.orderId,
      storefront_subdomain: input.subdomain,
      payment_method: input.method
    },
    payer: {
      name: input.customerName.trim().slice(0, 150) || 'Cliente',
      email: resolvePayerEmail(input.customerEmail, input.orderId)
    }
  };

  if (payerPhone) {
    (payload.payer as Record<string, unknown>).phone = payerPhone;
  }

  if (backUrls) {
    payload.back_urls = backUrls;
    if (shouldUseMercadoPagoAutoReturn(backUrls)) {
      payload.auto_return = 'approved';
    }
  }

  if (MERCADO_PAGO_WEBHOOK_URL) {
    payload.notification_url = MERCADO_PAGO_WEBHOOK_URL;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let response: Response;
  try {
    response = await fetch(`${MERCADO_PAGO_API_BASE_URL}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch {
    throw new Error('Falha de comunicacao com Mercado Pago.');
  } finally {
    clearTimeout(timeout);
  }

  const responsePayload = (await response.json().catch(() => null)) as MercadoPagoPreferenceResponse | null;
  if (!response.ok) {
    throw new Error(extractMercadoPagoErrorMessage(responsePayload, response.status));
  }

  const useSandbox = MERCADO_PAGO_ACCESS_TOKEN.startsWith('TEST-');
  const checkoutUrl = useSandbox
    ? responsePayload?.sandbox_init_point || responsePayload?.init_point || ''
    : responsePayload?.init_point || responsePayload?.sandbox_init_point || '';

  if (!checkoutUrl) {
    throw new Error('Mercado Pago retornou resposta sem link de pagamento.');
  }

  return {
    preferenceId: responsePayload?.id || '',
    checkoutUrl
  };
};

export const createMercadoPagoPixPayment = async (
  input: CreateMercadoPagoPixPaymentInput
): Promise<MercadoPagoPixPaymentResult> => {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error('Mercado Pago nao configurado.');
  }

  const amountInCents = Math.round(toUnitPrice(input.transactionAmount) * 100);
  const amount = amountInCents / 100;
  if (amountInCents <= 0) {
    throw new Error('Valor invalido para pagamento Pix.');
  }

  const payerPhone = parsePhone(input.customerPhone);
  const payerName = splitPayerName(input.customerName);
  const payload: Record<string, unknown> = {
    transaction_amount: amount,
    payment_method_id: 'pix',
    description: `Pedido ${input.orderId.slice(0, 8).toUpperCase()}`,
    external_reference: input.orderId,
    metadata: {
      storefront_order_id: input.orderId,
      storefront_subdomain: input.subdomain,
      payment_method: 'pix'
    },
    payer: {
      first_name: payerName.firstName,
      last_name: payerName.lastName,
      email: resolvePayerEmail(input.customerEmail, input.orderId)
    }
  };

  if (payerPhone) {
    (payload.payer as Record<string, unknown>).phone = payerPhone;
  }

  if (input.expiresAt) {
    payload.date_of_expiration = input.expiresAt;
  }

  if (MERCADO_PAGO_WEBHOOK_URL) {
    payload.notification_url = MERCADO_PAGO_WEBHOOK_URL;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let response: Response;
  try {
    response = await fetch(`${MERCADO_PAGO_API_BASE_URL}/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pix-${input.orderId}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch {
    throw new Error('Falha de comunicacao com Mercado Pago.');
  } finally {
    clearTimeout(timeout);
  }

  const responsePayload = (await response.json().catch(() => null)) as MercadoPagoPaymentResponse | null;
  if (!response.ok) {
    throw new Error(extractMercadoPagoErrorMessage(responsePayload, response.status));
  }

  const paymentId = `${responsePayload?.id || ''}`.trim();
  const qrCode = `${responsePayload?.point_of_interaction?.transaction_data?.qr_code || ''}`.trim();
  const qrCodeBase64 = `${responsePayload?.point_of_interaction?.transaction_data?.qr_code_base64 || ''}`.trim();
  const ticketUrl = `${responsePayload?.point_of_interaction?.transaction_data?.ticket_url || ''}`.trim();
  const status = `${responsePayload?.status || ''}`.trim().toLowerCase();

  if (!paymentId) {
    throw new Error('Mercado Pago retornou resposta sem identificador do pagamento Pix.');
  }

  if (!qrCode) {
    throw new Error('Mercado Pago nao retornou o codigo Pix copia e cola.');
  }

  return {
    paymentId,
    status,
    qrCode,
    qrCodeBase64,
    ticketUrl
  };
};

const fetchMercadoPagoJson = async <T>(path: string): Promise<T> => {
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error('Mercado Pago nao configurado.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(`${MERCADO_PAGO_API_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
  } catch {
    throw new Error('Falha de comunicacao com Mercado Pago.');
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(extractMercadoPagoErrorMessage(payload, response.status));
  }
  return (payload || {}) as T;
};

const mapMercadoPagoPaymentResult = (
  payload: MercadoPagoPaymentResponse | null | undefined,
  fallbackPaymentId = ''
): MercadoPagoPaymentResult => {
  const metadata =
    payload?.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? payload.metadata
      : {};

  return {
    id: `${payload?.id || fallbackPaymentId}`.trim(),
    status: `${payload?.status || ''}`.trim().toLowerCase(),
    statusDetail: `${payload?.status_detail || ''}`.trim(),
    externalReference: `${payload?.external_reference || ''}`.trim(),
    paymentTypeId: `${payload?.payment_type_id || ''}`.trim().toLowerCase(),
    paymentMethodId: `${payload?.payment_method_id || ''}`.trim().toLowerCase(),
    dateApproved: `${payload?.date_approved || ''}`.trim(),
    dateCreated: `${payload?.date_created || ''}`.trim(),
    qrCode: `${payload?.point_of_interaction?.transaction_data?.qr_code || ''}`.trim(),
    qrCodeBase64: `${payload?.point_of_interaction?.transaction_data?.qr_code_base64 || ''}`.trim(),
    ticketUrl: `${payload?.point_of_interaction?.transaction_data?.ticket_url || ''}`.trim(),
    metadata
  };
};

export const getMercadoPagoPayment = async (paymentId: string): Promise<MercadoPagoPaymentResult> => {
  const normalizedPaymentId = `${paymentId || ''}`.trim();
  if (!normalizedPaymentId) {
    throw new Error('Pagamento Mercado Pago invalido.');
  }

  const payload = await fetchMercadoPagoJson<MercadoPagoPaymentResponse>(
    `/v1/payments/${encodeURIComponent(normalizedPaymentId)}`
  );
  return mapMercadoPagoPaymentResult(payload, normalizedPaymentId);
};

export const getLatestMercadoPagoPaymentByExternalReference = async (
  externalReference: string
): Promise<MercadoPagoPaymentResult | null> => {
  const normalizedExternalReference = `${externalReference || ''}`.trim();
  if (!normalizedExternalReference) return null;

  const payload = await fetchMercadoPagoJson<MercadoPagoSearchPaymentsResponse>(
    `/v1/payments/search?external_reference=${encodeURIComponent(
      normalizedExternalReference
    )}&sort=date_created&criteria=desc&limit=1`
  );

  const payment = Array.isArray(payload.results) ? payload.results[0] : null;
  if (!payment) return null;
  return mapMercadoPagoPaymentResult(payment);
};

export const getMercadoPagoMerchantOrder = async (
  merchantOrderId: string
): Promise<MercadoPagoMerchantOrderResult> => {
  const normalizedMerchantOrderId = `${merchantOrderId || ''}`.trim();
  if (!normalizedMerchantOrderId) {
    throw new Error('Merchant order Mercado Pago invalido.');
  }

  const payload = await fetchMercadoPagoJson<MercadoPagoMerchantOrderResponse>(
    `/merchant_orders/${encodeURIComponent(normalizedMerchantOrderId)}`
  );

  const payments = Array.isArray(payload.payments)
    ? payload.payments
        .map((entry) => ({
          id: `${entry?.id || ''}`.trim(),
          status: `${entry?.status || ''}`.trim().toLowerCase(),
          paymentTypeId: `${entry?.payment_type_id || ''}`.trim().toLowerCase(),
          paymentMethodId: `${entry?.payment_method_id || ''}`.trim().toLowerCase(),
          dateApproved: `${entry?.date_approved || ''}`.trim(),
          dateCreated: `${entry?.date_created || ''}`.trim()
        }))
        .filter((entry) => Boolean(entry.id))
    : [];

  return {
    id: `${payload.id || normalizedMerchantOrderId}`.trim(),
    externalReference: `${payload.external_reference || ''}`.trim(),
    payments
  };
};
