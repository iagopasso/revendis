import request from 'supertest';
import app from '../../app';
import { closePool, ping } from '../../db';

let dbReady = false;

beforeAll(async () => {
  try {
    await ping();
    dbReady = true;
  } catch {
    dbReady = false;
  }
});

afterAll(async () => {
  await closePool();
});

test('lists latest notifications from audit logs', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-NOTIFY-${Date.now()}`;
  const productRes = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Notificacao',
      sku,
      price: 19.9,
      stock: 1
    });

  expect(productRes.status).toBe(201);

  const response = await request(app).get('/api/notifications?limit=20');
  expect(response.status).toBe(200);
  expect(Array.isArray(response.body.data)).toBe(true);

  const productNotification = response.body.data.find(
    (item: { entity_type?: string; action?: string }) => item.entity_type === 'product' && item.action === 'created'
  );

  expect(productNotification).toBeDefined();
  expect(typeof productNotification.message).toBe('string');
  expect(typeof productNotification.created_at).toBe('string');
});
