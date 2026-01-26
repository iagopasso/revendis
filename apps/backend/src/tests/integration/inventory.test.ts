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

test('rejects invalid product payload', async () => {
  if (!dbReady) {
    return;
  }
  const response = await request(app)
    .post('/api/inventory/products')
    .send({ sku: 'X1', price: 10 });

  expect(response.status).toBe(400);
  expect(response.body.code).toBe('validation_error');
});

test('creates and lists products', async () => {
  if (!dbReady) {
    return;
  }
  const sku = `SKU-${Date.now()}`;
  const createRes = await request(app)
    .post('/api/inventory/products')
    .send({ name: 'Produto Teste', sku, price: 12.5, stock: 5 });

  expect(createRes.status).toBe(201);
  expect(createRes.body.data.sku).toBe(sku);

  const listRes = await request(app).get('/api/inventory/products');
  expect(listRes.status).toBe(200);
  expect(Array.isArray(listRes.body.data)).toBe(true);
});
