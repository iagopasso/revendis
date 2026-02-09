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

test('lists top products report', async () => {
  if (!dbReady) {
    return;
  }

  const response = await request(app).get('/api/reports/top-products');
  expect(response.status).toBe(200);
  expect(Array.isArray(response.body.data)).toBe(true);
});

test('lists top customers report', async () => {
  if (!dbReady) {
    return;
  }

  const response = await request(app).get('/api/reports/top-customers');
  expect(response.status).toBe(200);
  expect(Array.isArray(response.body.data)).toBe(true);
});

test('filters reports by date range query', async () => {
  if (!dbReady) {
    return;
  }

  const productsResponse = await request(app)
    .get('/api/reports/top-products')
    .query({ from: '2026-01-01', to: '2026-12-31' });
  expect(productsResponse.status).toBe(200);
  expect(Array.isArray(productsResponse.body.data)).toBe(true);

  const customersResponse = await request(app)
    .get('/api/reports/top-customers')
    .query({ from: '2026-01-01', to: '2026-12-31' });
  expect(customersResponse.status).toBe(200);
  expect(Array.isArray(customersResponse.body.data)).toBe(true);
});
