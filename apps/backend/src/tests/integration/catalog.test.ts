import request from 'supertest';
import app from '../../app';
import * as db from '../../db';
import * as naturaMagazine from '../../services/natura-magazine';

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
        },
        purchase: {
          value: 131.9
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
        },
        purchase: {
          value: 70.5
        }
      }
    }
  ];

  return `<html><body><script>window.__CATALOG__=${JSON.stringify(products)}</script></body></html>`;
};

const buildConsultantLoginResponse = () =>
  ({
    ok: true,
    status: 200,
    clone: () => ({
      json: async () => ({ accessToken: 'consultant-token' })
    }),
    headers: {
      getSetCookie: () => ['NATSESS=abc123; Path=/; HttpOnly'],
      get: () => null
    }
  }) as unknown as Response;

const buildAvonBffProduct = (index: number) => {
  const code = `AVNBRA-${String(100000 + index)}`;
  const padded = String(index).padStart(3, '0');

  return {
    productId: code,
    productIdView: code,
    name: `Avon Produto ${padded}`,
    friendlyName: `Avon Produto ${padded}`,
    brand: 'Avon',
    categoryId: 'maquiagem',
    classificationId: 'todos-produtos',
    inStock: true,
    orderable: true,
    price: {
      sales: {
        value: 19.9 + index
      }
    },
    images: {
      medium: [
        {
          absURL: `https://cdn.avon.com/produtos/${code}.jpg`
        }
      ]
    }
  };
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

test('uses Natura root catalog strategy when categories are not informed', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        total: 1,
        products: [
          {
            productId: 'NATBRA-44452',
            name: 'Desodorante Colonia Luna 75 ml',
            url: '/p/desodorante-colonia-luna-75-ml/NATBRA-44452',
            inStock: true,
            images: ['https://cdn.natura.com/produtos/NATBRA-44452.jpg'],
            price: {
              sales: {
                value: 154.9
              }
            }
          }
        ]
      })
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  const response = await request(app).get('/api/catalog/natura/products?limit=5');

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.meta.categories).toEqual(['root']);
  expect(response.body.data[0]).toMatchObject({
    id: 'NATBRA-44452',
    sku: 'NATBRA-44452',
    name: 'Desodorante Colonia Luna 75 ml',
    inStock: true
  });
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
  const response = await request(app).get(
    '/api/catalog/brands/avon/products?limit=2&allowSampleFallback=true'
  );

  expect(response.status).toBe(200);
  expect(response.body.meta.brand).toBe('avon');
  expect(response.body.meta.source).toBe('sample');
  expect(response.body.data).toHaveLength(2);
  expect(response.body.data[0].sourceBrand).toBe('avon');
});

test('lists Avon products from Avon BFF endpoint with pagination', async () => {
  const previousCatalogEnableUpstream = process.env.CATALOG_ENABLE_UPSTREAM;
  process.env.CATALOG_ENABLE_UPSTREAM = '1';

  const firstPage = Array.from({ length: 200 }, (_, index) => buildAvonBffProduct(index + 1));
  const secondPage = [buildAvonBffProduct(201)];

  const fetchMock = jest.fn(async (input: string | URL) => {
    const parsed = new URL(String(input));
    if (parsed.pathname === '/bff-app-avon-brazil/search') {
      const start = Number(parsed.searchParams.get('start') || '0');
      if (start === 0) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total: 201,
            products: firstPage
          })
        };
      }
      if (start === 200) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total: 201,
            products: secondPage
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 201,
          products: []
        })
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => null
    };
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  try {
    const response = await request(app).get(
      '/api/catalog/brands/avon/products?allowSampleFallback=false&q=produto%20201&limit=10'
    );

    expect(response.status).toBe(200);
    expect(response.body.meta.source).toBe('upstream');
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: 'AVNBRA-100201',
      sku: 'AVNBRA-100201',
      name: 'Avon Produto 201',
      brand: 'Avon',
      sourceBrand: 'avon',
      sourceCategory: 'maquiagem',
      inStock: true
    });
    expect(response.body.data[0].url).toContain('/p/avon-produto-201/AVNBRA-100201');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstCallUrl = new URL(String(fetchMock.mock.calls[0]?.[0] || ''));
    expect(firstCallUrl.pathname).toBe('/bff-app-avon-brazil/search');
    expect(firstCallUrl.searchParams.get('apiMode')).toBe('product');
    expect(firstCallUrl.searchParams.get('count')).toBe('200');
    expect(firstCallUrl.searchParams.get('start')).toBe('0');
    expect(firstCallUrl.searchParams.get('refine_1')).toBe('cgid=todos-produtos');
  } finally {
    if (typeof previousCatalogEnableUpstream === 'string') {
      process.env.CATALOG_ENABLE_UPSTREAM = previousCatalogEnableUpstream;
    } else {
      delete process.env.CATALOG_ENABLE_UPSTREAM;
    }
  }
});

test('resolves brand aliases on aggregate endpoint', async () => {
  const response = await request(app).get(
    '/api/catalog/brands/products?brands=tuppware,boticario&allowSampleFallback=true'
  );

  expect(response.status).toBe(200);
  expect(response.body.meta.brands).toEqual(['tupperware', 'boticario']);
  const sourceEntries = response.body.meta.sources as Array<{ brand: string }>;
  const sourceBrands = sourceEntries.map((entry) => entry.brand);
  expect(sourceBrands).toEqual(expect.arrayContaining(['tupperware', 'boticario']));
});

test('resolves DiamanteQ alias to diamante brand', async () => {
  const response = await request(app).get(
    '/api/catalog/brands/products?brands=diamanteq&allowSampleFallback=true&limit=2'
  );

  expect(response.status).toBe(200);
  expect(response.body.meta.brands).toEqual(['diamante']);
});

test('collects Extase products from Tray web_api endpoint without sample fallback', async () => {
  const previousCatalogEnableUpstream = process.env.CATALOG_ENABLE_UPSTREAM;
  process.env.CATALOG_ENABLE_UPSTREAM = '1';

  const fetchMock = jest.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname === '/web_api/products') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          paging: {
            total: 2,
            page: 1,
            offset: 0,
            limit: 50,
            maxLimit: 50
          },
          Products: [
            {
              Product: {
                id: '101',
                name: 'Perfume Feminino Extase 100mL',
                model: 'EXT-100',
                ean: '7891234567890',
                brand: '',
                category_id: 'perfumaria',
                price: '189.90',
                promotional_price: '159.90',
                available: '1',
                available_in_store: '1',
                url: {
                  https: 'https://www.flattercosmeticos.com.br/perfumes-femininos/perfume-feminino-extase'
                },
                ProductImage: [
                  {
                    https: 'https://images.tcdn.com.br/extase.png'
                  }
                ]
              }
            },
            {
              Product: {
                id: '102',
                name: 'Perfume Feminino Rouge 100mL',
                model: 'RGE-100',
                category_id: 'perfumaria',
                price: '179.90',
                available: '1',
                available_in_store: '1',
                url: {
                  https: 'https://www.flattercosmeticos.com.br/perfumes-femininos/perfume-feminino-rouge'
                }
              }
            }
          ]
        })
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => null
    };
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  try {
    const response = await request(app).get(
      '/api/catalog/brands/extase/products?allowSampleFallback=false&limit=10'
    );

    expect(response.status).toBe(200);
    expect(response.body.meta.source).toBe('upstream');
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: '101',
      sku: 'EXT-100',
      barcode: '7891234567890',
      name: 'Perfume Feminino Extase 100mL',
      sourceBrand: 'extase',
      sourceCategory: 'perfumaria',
      inStock: true
    });
    expect(response.body.data[0].url).toContain('/perfume-feminino-extase');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    if (typeof previousCatalogEnableUpstream === 'string') {
      process.env.CATALOG_ENABLE_UPSTREAM = previousCatalogEnableUpstream;
    } else {
      delete process.env.CATALOG_ENABLE_UPSTREAM;
    }
  }
});

test('collects Diamante products from product sitemap pages without sample fallback', async () => {
  const previousCatalogEnableUpstream = process.env.CATALOG_ENABLE_UPSTREAM;
  process.env.CATALOG_ENABLE_UPSTREAM = '1';

  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.diamanteprofissional.com.br/sitemap/product-1.xml</loc></sitemap></sitemapindex>`;
  const productSitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.diamanteprofissional.com.br/diamante-shampoo-300ml</loc></url><url><loc>https://www.diamanteprofissional.com.br/diamante-condicionador-300ml</loc></url></urlset>`;
  const inStockProductHtml = `<html><head><meta property="og:title" content="Diamante Shampoo 300ml" /><meta property="og:image" content="https://cdn.awsli.com.br/produtos/shampoo.png" /></head><body><li><a href="https://www.diamanteprofissional.com.br/cabelos">Cabelos</a></li><h1 itemprop="name">Diamante Shampoo 300ml</h1><span itemprop="sku">DIA-300</span><div class="acoes-produto disponivel" data-produto-id="183001"></div><meta itemprop="price" content="49.90" /><meta itemprop="availability" content="http://schema.org/InStock" /></body></html>`;
  const outOfStockProductHtml = `<html><head><meta property="og:title" content="Diamante Condicionador 300ml" /><meta property="og:image" content="https://cdn.awsli.com.br/produtos/condicionador.png" /></head><body><li><a href="https://www.diamanteprofissional.com.br/cabelos">Cabelos</a></li><h1 itemprop="name">Diamante Condicionador 300ml</h1><span itemprop="sku">DIA-301</span><div class="acoes-produto indisponivel" data-produto-id="183002"></div><meta itemprop="price" content="39.90" /><meta itemprop="availability" content="http://schema.org/OutOfStock" /></body></html>`;

  const fetchMock = jest.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith('/sitemap.xml')) {
      return {
        ok: true,
        status: 200,
        text: async () => sitemapIndex
      };
    }
    if (url.endsWith('/sitemap/product-1.xml')) {
      return {
        ok: true,
        status: 200,
        text: async () => productSitemap
      };
    }
    if (url.includes('/diamante-shampoo-300ml')) {
      return {
        ok: true,
        status: 200,
        text: async () => inStockProductHtml
      };
    }
    if (url.includes('/diamante-condicionador-300ml')) {
      return {
        ok: true,
        status: 200,
        text: async () => outOfStockProductHtml
      };
    }
    return {
      ok: false,
      status: 404,
      text: async () => ''
    };
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  try {
    const response = await request(app).get(
      '/api/catalog/brands/diamante/products?allowSampleFallback=false&inStock=true&limit=10'
    );

    expect(response.status).toBe(200);
    expect(response.body.meta.source).toBe('upstream');
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: '183001',
      sku: 'DIA-300',
      name: 'Diamante Shampoo 300ml',
      sourceBrand: 'diamante',
      sourceCategory: 'cabelos',
      inStock: true,
      price: 49.9
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  } finally {
    if (typeof previousCatalogEnableUpstream === 'string') {
      process.env.CATALOG_ENABLE_UPSTREAM = previousCatalogEnableUpstream;
    } else {
      delete process.env.CATALOG_ENABLE_UPSTREAM;
    }
  }
});

test('collects Extase products from sitemap pages without sample fallback', async () => {
  const previousCatalogEnableUpstream = process.env.CATALOG_ENABLE_UPSTREAM;
  process.env.CATALOG_ENABLE_UPSTREAM = '1';

  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.flattercosmeticos.com.br/loja/arquivos/1239485/sitemaps/sitemap_1.xml</loc></sitemap></sitemapindex>`;
  const sitemapProducts = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.flattercosmeticos.com.br/perfumes-femininos/perfume-feminino-extase</loc></url><url><loc>https://www.flattercosmeticos.com.br/perfumes-femininos/perfume-feminino-rouge</loc></url></urlset>`;
  const extaseProductHtml = `<html><body><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Perfume Feminino Extase 100mL","sku":"EXT-100","url":"https://www.flattercosmeticos.com.br/perfumes-femininos/perfume-feminino-extase","image":"https://images.tcdn.com.br/extase.png","offers":{"@type":"Offer","price":"189.90","availability":"https://schema.org/InStock"}}</script></body></html>`;
  const otherProductHtml = `<html><body><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Perfume Feminino Rouge 100mL","sku":"RGE-100","url":"https://www.flattercosmeticos.com.br/perfumes-femininos/perfume-feminino-rouge","image":"https://images.tcdn.com.br/rouge.png","offers":{"@type":"Offer","price":"179.90","availability":"https://schema.org/InStock"}}</script></body></html>`;

  const fetchMock = jest.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes('/sitemap.xml')) {
      return {
        ok: true,
        status: 200,
        text: async () => sitemapIndex
      };
    }
    if (url.includes('/sitemap_index.xml')) {
      return {
        ok: false,
        status: 404,
        text: async () => ''
      };
    }
    if (url.includes('/loja/arquivos/1239485/sitemaps/sitemap_1.xml')) {
      return {
        ok: true,
        status: 200,
        text: async () => sitemapProducts
      };
    }
    if (url.includes('/perfume-feminino-extase')) {
      return {
        ok: true,
        status: 200,
        text: async () => extaseProductHtml
      };
    }
    if (url.includes('/perfume-feminino-rouge')) {
      return {
        ok: true,
        status: 200,
        text: async () => otherProductHtml
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => '<html><body></body></html>'
    };
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  try {
    const response = await request(app).get(
      '/api/catalog/brands/extase/products?allowSampleFallback=false&limit=10'
    );

    expect(response.status).toBe(200);
    expect(response.body.meta.source).toBe('upstream');
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      name: 'Perfume Feminino Extase 100mL',
      sourceBrand: 'extase',
      sku: 'EXT-100'
    });
  } finally {
    if (typeof previousCatalogEnableUpstream === 'string') {
      process.env.CATALOG_ENABLE_UPSTREAM = previousCatalogEnableUpstream;
    } else {
      delete process.env.CATALOG_ENABLE_UPSTREAM;
    }
  }
});

test('falls back to sample products when Natura upstream fails in multibrand endpoint', async () => {
  const fetchMock = jest.fn().mockRejectedValue(new Error('network_error'));
  global.fetch = fetchMock as unknown as typeof fetch;

  const response = await request(app).get(
    '/api/catalog/brands/natura/products?limit=3&allowSampleFallback=true'
  );

  expect(response.status).toBe(200);
  expect(response.body.meta.brand).toBe('natura');
  expect(response.body.meta.source).toBe('sample');
  expect(response.body.data).toHaveLength(3);
});

test('lists Natura consultant products with purchase price', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(buildConsultantLoginResponse())
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => buildCatalogHtml()
    });
  global.fetch = fetchMock as unknown as typeof fetch;

  const response = await request(app).post('/api/catalog/natura/consultant/products').send({
    login: 'consultor',
    password: '123456',
    categories: ['perfumaria'],
    inStockOnly: true,
    limit: 10
  });

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0]).toMatchObject({
    code: 'NATBRA-128756',
    sku: 'NATBRA-128756',
    brand: 'Una',
    price: 199.9,
    purchasePrice: 131.9
  });
  expect(response.body.meta.brands).toEqual([{ name: 'Una', count: 1 }]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('uses configured consultant credentials when login/password are omitted in request body', async () => {
  const previousLogin = process.env.NATURA_CONSULTANT_LOGIN;
  const previousPassword = process.env.NATURA_CONSULTANT_PASSWORD;
  process.env.NATURA_CONSULTANT_LOGIN = 'consultor-real';
  process.env.NATURA_CONSULTANT_PASSWORD = 'senha-real';

  try {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(buildConsultantLoginResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => buildCatalogHtml()
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = await request(app).post('/api/catalog/natura/consultant/products').send({
      categories: ['perfumaria'],
      inStockOnly: true
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);

    const callOptions = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(typeof callOptions?.body).toBe('string');
    const body = String(callOptions?.body || '');
    expect(body).toContain('login=consultor-real');
    expect(body).toContain('password=senha-real');
  } finally {
    if (typeof previousLogin === 'string') {
      process.env.NATURA_CONSULTANT_LOGIN = previousLogin;
    } else {
      delete process.env.NATURA_CONSULTANT_LOGIN;
    }
    if (typeof previousPassword === 'string') {
      process.env.NATURA_CONSULTANT_PASSWORD = previousPassword;
    } else {
      delete process.env.NATURA_CONSULTANT_PASSWORD;
    }
  }
});

test('syncs products from brand sites into internal catalog', async () => {
  const queryMock = jest.fn(async (sql: string) => {
    if (sql.includes('DELETE FROM reseller_brands')) {
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('UPDATE products')) {
      return { rowCount: 2, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });

  jest
    .spyOn(db, 'withTransaction')
    .mockImplementation(
      (async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: queryMock })) as typeof db.withTransaction
    );

  const response = await request(app).post('/api/catalog/brands/sync').send({
    brands: ['avon', 'eudora'],
    allowSampleFallback: true,
    inStockOnly: true,
    deactivateMissing: true,
    limit: 2
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.selectedBrands).toEqual(['avon', 'eudora']);
  expect(response.body.meta.total).toBe(4);
  expect(response.body.meta.upsertedProducts).toBe(4);
  expect(response.body.meta.realCatalogOnly).toBe(false);
  expect(response.body.meta.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ brand: 'avon' }),
      expect.objectContaining({ brand: 'eudora' })
    ])
  );
  expect(queryMock).toHaveBeenCalled();
});

test('syncs Natura consultant products into internal catalog and keeps only brands with products', async () => {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(buildConsultantLoginResponse())
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => buildCatalogHtml()
    });
  global.fetch = fetchMock as unknown as typeof fetch;

  const queryMock = jest.fn(async (sql: string) => {
    if (sql.includes('DELETE FROM reseller_brands')) {
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("UPDATE products")) {
      return { rowCount: 2, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });

  jest
    .spyOn(db, 'withTransaction')
    .mockImplementation(
      (async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: queryMock })) as typeof db.withTransaction
    );

  const response = await request(app).post('/api/catalog/natura/consultant/sync').send({
    login: 'consultor',
    password: '123456',
    categories: ['perfumaria'],
    deactivateMissing: true
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.upsertedProducts).toBe(2);
  expect(response.body.meta.removedBrands).toBe(1);
  expect(response.body.meta.deactivatedProducts).toBe(2);
  expect(response.body.meta.brands).toEqual(
    expect.arrayContaining([
      { name: 'Humor', count: 1 },
      { name: 'Una', count: 1 }
    ])
  );
  expect(queryMock).toHaveBeenCalled();
});

test('preloads catalog products into backend cache without touching inventory products', async () => {
  const queryMock = jest.fn(async (sql: string) => {
    if (sql.includes('DELETE FROM catalog_preloaded_products')) {
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });

  jest
    .spyOn(db, 'withTransaction')
    .mockImplementation(
      (async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: queryMock })) as typeof db.withTransaction
    );

  const response = await request(app).post('/api/catalog/preloaded/sync').send({
    brands: ['avon'],
    allowSampleFallback: true,
    inStockOnly: true,
    clearMissing: true,
    limit: 10
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.selectedBrands).toEqual(['avon']);
  expect(response.body.meta.total).toBeGreaterThan(0);
  expect(
    queryMock.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO catalog_preloaded_products')
    )
  ).toBe(true);
  expect(
    queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO products'))
  ).toBe(false);
});

test('preloads only configured catalog brands when payload.brands is omitted', async () => {
  jest.spyOn(db, 'query').mockImplementation(async (sql: string) => {
    if (sql.includes('FROM reseller_brands')) {
      return {
        rowCount: 2,
        rows: [{ sourceBrand: 'avon' }, { sourceBrand: 'marca-invalida' }]
      } as unknown as Awaited<ReturnType<typeof db.query>>;
    }
    return {
      rowCount: 0,
      rows: []
    } as unknown as Awaited<ReturnType<typeof db.query>>;
  });

  const queryMock = jest.fn(async (sql: string) => {
    if (sql.includes('DELETE FROM catalog_preloaded_products')) {
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  });

  jest
    .spyOn(db, 'withTransaction')
    .mockImplementation(
      (async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: queryMock })) as typeof db.withTransaction
    );

  const response = await request(app).post('/api/catalog/preloaded/sync').send({
    allowSampleFallback: true,
    inStockOnly: true,
    clearMissing: true,
    limit: 10
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.selectedBrands).toEqual(['avon']);
  expect(response.body.meta.sources).toEqual(
    expect.arrayContaining([expect.objectContaining({ brand: 'avon' })])
  );
});

test('does not replace upstream cache with sample fallback during preloaded sync', async () => {
  const queryMock = jest.fn(async (sql: string) => {
    if (sql.includes("fetched_source = 'upstream'")) {
      return { rowCount: 1, rows: [{ total: 2 }] };
    }
    return { rowCount: 0, rows: [] };
  });

  jest
    .spyOn(db, 'withTransaction')
    .mockImplementation(
      (async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: queryMock })) as typeof db.withTransaction
    );

  const response = await request(app).post('/api/catalog/preloaded/sync').send({
    brands: ['avon'],
    allowSampleFallback: true,
    inStockOnly: false,
    clearMissing: true,
    limit: 10,
    force: true
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.skippedSampleBrands).toEqual(['avon']);
  expect(
    queryMock.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO catalog_preloaded_products')
    )
  ).toBe(false);
  expect(
    queryMock.mock.calls.some(([sql]) =>
      String(sql).includes('DELETE FROM catalog_preloaded_products')
    )
  ).toBe(false);
});

test('lists preloaded catalog products from cache endpoint', async () => {
  jest.spyOn(db, 'query').mockResolvedValue({
    rowCount: 2,
    rows: [
      {
        id: 'cache-1',
        code: '155708',
        sku: '155708',
        name: '300 Km/h Deo Colonia Boost',
        brand: 'Avon',
        sourceBrand: 'avon',
        sourceLineBrand: '300 Km/h',
        price: 37.9,
        purchasePrice: 37.9,
        inStock: true,
        imageUrl: 'https://cdn.avon.com/155708.jpg',
        sourceCategory: 'perfumaria',
        sourceUrl: 'https://www.avon.com.br/produto/155708',
        fetchedSource: 'upstream',
        updatedAt: '2026-02-11T11:00:00.000Z'
      },
      {
        id: 'cache-2',
        code: '197404',
        sku: '197404',
        name: 'Far Away Deo Colonia',
        brand: 'Avon',
        sourceBrand: 'avon',
        sourceLineBrand: 'Far Away',
        price: 69.9,
        purchasePrice: 69.9,
        inStock: true,
        imageUrl: 'https://cdn.avon.com/197404.jpg',
        sourceCategory: 'perfumaria',
        sourceUrl: 'https://www.avon.com.br/produto/197404',
        fetchedSource: 'upstream',
        updatedAt: '2026-02-11T11:00:00.000Z'
      }
    ]
  } as unknown as Awaited<ReturnType<typeof db.query>>);

  const response = await request(app).get(
    '/api/catalog/preloaded/products?brands=avon&q=boost&inStock=true&limit=10'
  );

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0]).toMatchObject({
    code: '155708',
    name: '300 Km/h Deo Colonia Boost',
    sourceBrand: 'avon'
  });
  expect(response.body.meta.total).toBe(1);
  expect(response.body.meta.brandsWithProducts).toEqual(['avon']);
});

test('lists preloaded products only from configured catalog brands when query.brands is omitted', async () => {
  const querySpy = jest.spyOn(db, 'query').mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM reseller_brands')) {
      return {
        rowCount: 2,
        rows: [{ sourceBrand: 'natura' }, { sourceBrand: null }]
      } as unknown as Awaited<ReturnType<typeof db.query>>;
    }

    if (sql.includes('FROM catalog_preloaded_products')) {
      return {
        rowCount: 1,
        rows: [
          {
            id: 'cache-1',
            code: '397731',
            sku: 'NATBRA-122474',
            barcode: '7909883000011',
            name: 'Desodorante Colonia Luna Nuit Feminino 75 ml',
            brand: 'Natura',
            sourceBrand: 'natura',
            sourceLineBrand: 'Luna',
            price: 164.9,
            purchasePrice: 115.43,
            inStock: true,
            imageUrl: 'https://cdn.natura.com/NATBRA-122474.jpg',
            sourceCategory: 'perfumaria',
            sourceUrl: 'https://www.natura.com.br/p/luna-nuit-75-ml/NATBRA-122474',
            fetchedSource: 'upstream',
            updatedAt: '2026-02-11T11:00:00.000Z'
          }
        ]
      } as unknown as Awaited<ReturnType<typeof db.query>>;
    }

    return {
      rowCount: 0,
      rows: []
    } as unknown as Awaited<ReturnType<typeof db.query>>;
  });

  const response = await request(app).get('/api/catalog/preloaded/products?limit=10');

  expect(response.status).toBe(200);
  expect(response.body.meta.brands).toEqual(['natura']);
  const selectCall = querySpy.mock.calls.find(([sql]) =>
    String(sql).includes('FROM catalog_preloaded_products')
  );
  expect(selectCall?.[1]).toEqual(expect.arrayContaining([expect.arrayContaining(['natura'])]));
});

test('lists preloaded products from all known brands when allBrands=true', async () => {
  const querySpy = jest.spyOn(db, 'query').mockImplementation(async (sql: string) => {
    if (sql.includes('FROM catalog_preloaded_products')) {
      return {
        rowCount: 0,
        rows: []
      } as unknown as Awaited<ReturnType<typeof db.query>>;
    }

    if (sql.includes('FROM reseller_brands')) {
      return {
        rowCount: 0,
        rows: []
      } as unknown as Awaited<ReturnType<typeof db.query>>;
    }

    return {
      rowCount: 0,
      rows: []
    } as unknown as Awaited<ReturnType<typeof db.query>>;
  });

  const response = await request(app).get('/api/catalog/preloaded/products?allBrands=true&limit=10');

  expect(response.status).toBe(200);
  expect(response.body.meta.allBrands).toBe(true);
  expect(response.body.meta.brands).toEqual(
    expect.arrayContaining(['avon', 'natura', 'boticario'])
  );
  expect(
    querySpy.mock.calls.some(([sql]) => String(sql).includes('FROM reseller_brands'))
  ).toBe(false);
});

test('imports manual catalog products into preloaded cache table', async () => {
  const queryMock = jest.fn(async (_sql: string) => ({
    rowCount: 1,
    rows: []
  }));

  jest
    .spyOn(db, 'withTransaction')
    .mockImplementation(
      (async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: queryMock })) as typeof db.withTransaction
    );

  const response = await request(app).post('/api/catalog/preloaded/manual/import').send({
    products: [
      {
        name: 'Desodorante Colonia Luna Nuit Feminino 75 ml',
        brand: 'Natura',
        code: '397731',
        price: '164,90',
        imageUrl:
          'https://production.na01.natura.com/on/demandware.static/-/Sites-natura-br-storefront-catalog/default/dw9b2f7373/Produtos/NATBRA-122474_1.jpg'
      },
      {
        name: 'Produto sem marca mapeada',
        brand: 'Marca Desconhecida',
        code: 'X-001'
      }
    ]
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.total).toBe(1);
  expect(response.body.meta.ignoredProducts).toBe(1);
  expect(response.body.meta.invalidRows).toEqual(
    expect.arrayContaining([expect.objectContaining({ row: 2 })])
  );
  expect(
    queryMock.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO catalog_preloaded_products')
    )
  ).toBe(true);
});

test('collects products from website json-ld and imports into preloaded cache', async () => {
  const websiteProductHtml = `<html><body><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Desodorante Colonia Luna Nuit Feminino 75 ml","sku":"NATBRA-122474","gtin13":"7909883000011","brand":{"@type":"Brand","name":"Natura"},"image":"https://cdn.natura.com/produtos/NATBRA-122474.jpg","offers":{"@type":"Offer","price":"164.90","availability":"https://schema.org/InStock"}}</script></body></html>`;

  const fetchMock = jest.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes('/p/luna-nuit')) {
      return {
        ok: true,
        status: 200,
        text: async () => websiteProductHtml
      };
    }

    return {
      ok: false,
      status: 404,
      text: async () => ''
    };
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  const queryMock = jest.fn(async (_sql: string) => ({
    rowCount: 1,
    rows: []
  }));

  jest
    .spyOn(db, 'withTransaction')
    .mockImplementation(
      (async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: queryMock })) as typeof db.withTransaction
    );

  const response = await request(app).post('/api/catalog/preloaded/collect').send({
    mode: 'website',
    sourceBrand: 'natura',
    clearMissing: false,
    website: {
      siteUrl: 'https://example.com',
      productUrls: ['https://example.com/p/luna-nuit']
    }
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.mode).toBe('website');
  expect(response.body.meta.total).toBe(1);
  expect(response.body.data[0]).toMatchObject({
    sourceBrand: 'natura',
    sku: 'NATBRA-122474',
    name: 'Desodorante Colonia Luna Nuit Feminino 75 ml',
    barcode: '7909883000011'
  });
  expect(
    queryMock.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO catalog_preloaded_products')
    )
  ).toBe(true);
});

test('lists Natura magazine products and enriches by product code', async () => {
  jest.spyOn(naturaMagazine, 'extractNaturaMagazineProducts').mockResolvedValue({
    products: [
      {
        code: '102038',
        name: 'Luna Confiante 75 ml',
        price: 185.9,
        page: 18
      },
      {
        code: '122474',
        name: 'Desodorante Colonia Luna Nuit 75 ml',
        price: 164.9,
        page: 20
      }
    ],
    meta: {
      uniqueCodes: 2
    },
    source: {
      type: 'path',
      value: '/tmp/catalogue.pdf'
    }
  });

  const fetchMock = jest.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes('q=102038')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            total: 1,
            products: [
              {
                productId: 'NATBRA-102038',
                productIdView: 'NATBRA-102038',
                name: 'Desodorante Colonia Luna Confiante Feminino 75 ml',
                brand: 'Luna',
                inStock: true,
                url: '/p/luna-confiante-75-ml/NATBRA-102038',
                images: {
                  medium: [
                    {
                      absURL:
                        'https://production.na01.natura.com/on/demandware.static/-/Sites-natura-br-storefront-catalog/default/dw6f1f7380/Produtos/NATBRA-102038_1.jpg'
                    }
                  ]
                },
                price: {
                  sales: {
                    value: 185.9
                  }
                }
              }
            ]
          })
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          total: 1,
          products: [
            {
              productId: 'NATBRA-122474',
              productIdView: 'NATBRA-122474',
              name: 'Desodorante Colonia Luna Nuit Feminino 75 ml',
              brand: 'Luna',
              inStock: true,
              url: '/p/luna-nuit-75-ml/NATBRA-122474',
              images: {
                medium: [
                  {
                    absURL:
                      'https://production.na01.natura.com/on/demandware.static/-/Sites-natura-br-storefront-catalog/default/dw9b2f7373/Produtos/NATBRA-122474_1.jpg'
                  }
                ]
              },
              price: {
                sales: {
                  value: 164.9
                }
              }
            }
          ]
        })
    };
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  const response = await request(app).post('/api/catalog/natura/magazine/products').send({
    pdfPath: '/tmp/catalogue.pdf',
    limit: 10,
    enrichWithCatalog: true
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.total).toBe(2);
  expect(response.body.meta.enrichedCount).toBe(2);
  expect(response.body.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: '102038',
        brand: 'Natura',
        name: 'Desodorante Colonia Luna Confiante Feminino 75 ml',
        imageUrl: expect.stringContaining('NATBRA-102038_1.jpg')
      }),
      expect.objectContaining({
        code: '122474',
        brand: 'Natura',
        name: 'Desodorante Colonia Luna Nuit Feminino 75 ml',
        imageUrl: expect.stringContaining('NATBRA-122474_1.jpg')
      })
    ])
  );
});

test('syncs Natura magazine products into preloaded catalog table', async () => {
  jest.spyOn(naturaMagazine, 'extractNaturaMagazineProducts').mockResolvedValue({
    products: [
      {
        code: '102038',
        name: 'Luna Confiante 75 ml',
        price: 185.9,
        page: 18
      }
    ],
    meta: {
      uniqueCodes: 1
    },
    source: {
      type: 'path',
      value: '/tmp/catalogue.pdf'
    }
  });

  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        total: 1,
        products: [
          {
            productId: 'NATBRA-102038',
            productIdView: 'NATBRA-102038',
            name: 'Desodorante Colonia Luna Confiante Feminino 75 ml',
            brand: 'Luna',
            inStock: true,
            url: '/p/luna-confiante-75-ml/NATBRA-102038',
            images: {
              medium: [
                {
                  absURL:
                    'https://production.na01.natura.com/on/demandware.static/-/Sites-natura-br-storefront-catalog/default/dw6f1f7380/Produtos/NATBRA-102038_1.jpg'
                }
              ]
            },
            price: {
              sales: {
                value: 185.9
              }
            }
          }
        ]
      })
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  const queryMock = jest.fn(async (_sql: string) => ({
    rowCount: 1,
    rows: []
  }));

  jest
    .spyOn(db, 'withTransaction')
    .mockImplementation(
      (async (handler: (client: unknown) => Promise<unknown>) =>
        handler({ query: queryMock })) as typeof db.withTransaction
    );

  const response = await request(app).post('/api/catalog/natura/magazine/sync').send({
    pdfPath: '/tmp/catalogue.pdf',
    clearMissing: true
  });

  expect(response.status).toBe(200);
  expect(response.body.meta.total).toBe(1);
  expect(response.body.meta.upsertedProducts).toBe(1);
  expect(
    queryMock.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO catalog_preloaded_products')
    )
  ).toBe(true);
  expect(
    queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO products'))
  ).toBe(false);
});
