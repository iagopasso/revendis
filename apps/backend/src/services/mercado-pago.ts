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
  method: MercadoPagoMethod;
  installments?: number;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  items: PaymentItem[];
};

type MercadoPagoPreferenceResult = {
  preferenceId: string;
  checkoutUrl: string;
};

type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  message?: string;
  error?: string;
  cause?: Array<{ description?: string }>;
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

const buildBackUrls = (subdomain: string) => {
  if (!MERCADO_PAGO_PUBLIC_BASE_URL) return null;
  return {
    success: `${MERCADO_PAGO_PUBLIC_BASE_URL}/loja/${subdomain}?pagamento=sucesso`,
    pending: `${MERCADO_PAGO_PUBLIC_BASE_URL}/loja/${subdomain}?pagamento=pendente`,
    failure: `${MERCADO_PAGO_PUBLIC_BASE_URL}/loja/${subdomain}?pagamento=falha`
  };
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
  const backUrls = buildBackUrls(input.subdomain);
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
