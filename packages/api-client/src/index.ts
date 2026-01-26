import type { operations } from '@revendis/api-types';

export type ApiClientConfig = {
  baseUrl: string;
  getToken?: () => string | undefined;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
};

export type ApiError = {
  status: number;
  data: unknown;
};

type JsonContent<T> = T extends { content: { 'application/json': infer B } } ? B : never;

type RequestBody<Op> = Op extends { requestBody: infer Body } ? JsonContent<Body> : never;

type ResponseBody<Op> = Op extends { responses: infer Responses }
  ? JsonContent<Responses[keyof Responses]>
  : never;

const buildHeaders = (config: ApiClientConfig) => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(config.headers || {})
  };
  const token = config.getToken?.();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
};

const request = async <Op>(
  config: ApiClientConfig,
  path: string,
  method: string,
  body?: unknown
): Promise<ResponseBody<Op>> => {
  const fetcher = config.fetchFn || fetch;
  const response = await fetcher(`${config.baseUrl}${path}`, {
    method,
    headers: buildHeaders(config),
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error: ApiError = { status: response.status, data };
    throw error;
  }

  return data as ResponseBody<Op>;
};

export const createApiClient = (config: ApiClientConfig) => {
  return {
    getHealth: () => request<operations['getHealth']>(config, '/health', 'GET'),
    listProducts: () => request<operations['listProducts']>(config, '/inventory/products', 'GET'),
    createProduct: (body: RequestBody<operations['createProduct']>) =>
      request<operations['createProduct']>(config, '/inventory/products', 'POST', body),
    adjustInventory: (body: RequestBody<operations['adjustInventory']>) =>
      request<operations['adjustInventory']>(config, '/inventory/adjustments', 'POST', body),
    transferInventory: (body: RequestBody<operations['transferInventory']>) =>
      request<operations['transferInventory']>(config, '/inventory/transfers', 'POST', body),
    registerReturn: (body: RequestBody<operations['registerReturn']>) =>
      request<operations['registerReturn']>(config, '/inventory/returns', 'POST', body),
    listSalesOrders: () => request<operations['listSalesOrders']>(config, '/sales/orders', 'GET'),
    checkoutSale: (body: RequestBody<operations['checkoutSale']>) =>
      request<operations['checkoutSale']>(config, '/sales/checkout', 'POST', body),
    cancelSale: (id: string) =>
      request<operations['cancelSale']>(config, `/sales/orders/${id}/cancel`, 'POST'),
    listReceivables: () => request<operations['listReceivables']>(config, '/finance/receivables', 'GET'),
    createReceivable: (body: RequestBody<operations['createReceivable']>) =>
      request<operations['createReceivable']>(config, '/finance/receivables', 'POST', body),
    settleReceivable: (id: string, body: RequestBody<operations['settleReceivable']>) =>
      request<operations['settleReceivable']>(config, `/finance/receivables/${id}/settle`, 'POST', body),
    listCustomers: () => request<operations['listCustomers']>(config, '/customers', 'GET'),
    createCustomer: (body: RequestBody<operations['createCustomer']>) =>
      request<operations['createCustomer']>(config, '/customers', 'POST', body),
    reportDailySales: () =>
      request<operations['reportDailySales']>(config, '/reports/daily-sales', 'GET'),
    reportStockOuts: () =>
      request<operations['reportStockOuts']>(config, '/reports/stock-outs', 'GET'),
    reportReceivablesAging: () =>
      request<operations['reportReceivablesAging']>(config, '/reports/receivables-aging', 'GET'),
    listStorefrontCatalog: () =>
      request<operations['listStorefrontCatalog']>(config, '/storefront/catalog', 'GET'),
    createStorefrontOrder: (body: RequestBody<operations['createStorefrontOrder']>) =>
      request<operations['createStorefrontOrder']>(config, '/storefront/orders', 'POST', body)
  };
};
