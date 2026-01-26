import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../index';

describe('api-client', () => {
  it('calls fetch with correct path and method', async () => {
    const fetchFn = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { ok: true } })
      } as Response;
    });

    const api = createApiClient({ baseUrl: 'http://localhost:3001/api', fetchFn });

    const response = await api.createProduct({
      name: 'Produto Teste',
      sku: 'SKU-TEST',
      price: 10
    });

    expect(response.data.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/inventory/products');
    expect(options.method).toBe('POST');
  });

  it('throws ApiError on non-ok responses', async () => {
    const fetchFn = vi.fn(async () => {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ code: 'validation_error' })
      } as Response;
    });

    const api = createApiClient({ baseUrl: 'http://localhost:3001/api', fetchFn });

    await expect(
      api.createProduct({
        name: 'Produto Teste',
        sku: 'SKU-TEST',
        price: 10
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
