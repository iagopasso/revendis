import request from 'supertest';
import app from '../../app';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

const buildCatalogHtml = () => {
  const products = [
    {
      productId: 'NATBRA-128756',
      brand: 'Una',
      name: 'Una Blush Deo Parfum 75 ml',
      inStock: true,
      url: '/p/una-blush-deo-parfum-75-ml/NATBRA-128756',
      images: ['https://cdn.natura.com/produtos/NATBRA-128756.jpg'],
      price: {
        sales: {
          value: 199.9
        }
      }
    },
    {
      productId: 'NATBRA-86723',
      brand: 'Humor',
      name: 'Desodorante Colonia Meu Primeiro Humor Feminino 75 ml',
      inStock: false,
      url: '/p/desodorante-colonia-meu-primeiro-humor-feminino-75-ml/NATBRA-86723',
      images: ['https://cdn.natura.com/produtos/NATBRA-86723.jpg'],
      price: {
        sales: {
          value: 106.9
        }
      }
    }
  ];

  return `<html><body><script>window.__CATALOG__=${JSON.stringify(products)}</script></body></html>`;
};

test('lists Natura catalog products using upstream data', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => buildCatalogHtml()
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  const response = await request(app).get('/api/catalog/natura/products?categories=perfumaria&q=blush&limit=5');

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0]).toMatchObject({
    id: 'NATBRA-128756',
    sku: 'NATBRA-128756',
    brand: 'Una',
    name: 'Una Blush Deo Parfum 75 ml',
    price: 199.9,
    inStock: true,
    sourceCategory: 'perfumaria'
  });
  expect(response.body.meta.total).toBe(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('returns 502 when Natura source is unavailable', async () => {
  const fetchMock = jest.fn().mockRejectedValue(new Error('network_error'));
  global.fetch = fetchMock as unknown as typeof fetch;

  const response = await request(app).get('/api/catalog/natura/products?categories=perfumaria');

  expect(response.status).toBe(502);
  expect(response.body.code).toBe('upstream_unavailable');
});

test('lists sample catalog products by brand endpoint', async () => {
  const response = await request(app).get('/api/catalog/brands/avon/products?limit=2');

  expect(response.status).toBe(200);
  expect(response.body.meta.brand).toBe('avon');
  expect(response.body.meta.source).toBe('sample');
  expect(response.body.data).toHaveLength(2);
  expect(response.body.data[0].sourceBrand).toBe('avon');
});

test('resolves brand aliases on aggregate endpoint', async () => {
  const response = await request(app).get('/api/catalog/brands/products?brands=tuppware,boticario');

  expect(response.status).toBe(200);
  expect(response.body.meta.brands).toEqual(['tupperware', 'boticario']);
  const sourceEntries = response.body.meta.sources as Array<{ brand: string }>;
  const sourceBrands = sourceEntries.map((entry) => entry.brand);
  expect(sourceBrands).toEqual(expect.arrayContaining(['tupperware', 'boticario']));
});

test('falls back to sample products when Natura upstream fails in multibrand endpoint', async () => {
  const fetchMock = jest.fn().mockRejectedValue(new Error('network_error'));
  global.fetch = fetchMock as unknown as typeof fetch;

  const response = await request(app).get('/api/catalog/brands/natura/products?limit=3');

  expect(response.status).toBe(200);
  expect(response.body.meta.brand).toBe('natura');
  expect(response.body.meta.source).toBe('sample');
  expect(response.body.data).toHaveLength(3);
});
