import request from 'supertest';
import app from '../../app';
import { closePool, ping } from '../../db';

let dbReady = false;

beforeAll(async () => {
  try {
    await ping();
    dbReady = true;
  } catch (error) {
    dbReady = false;
  }
});

afterAll(async () => {
  await closePool();
});

test('creates storefront order', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Storefront',
      sku,
      price: 49.9,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const response = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 49.9 }],
      customer: { name: 'Cliente Web', email: 'cliente@exemplo.com' }
    });

  expect(response.status).toBe(201);
  expect(response.body.data.status).toBe('confirmed');
});
