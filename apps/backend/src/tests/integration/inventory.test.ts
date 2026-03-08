import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../../app';
import { closePool, ping, query } from '../../db';

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

test('returns explicit conflict message when trying to create duplicated product sku', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `DUP-${Date.now()}`;

  const firstCreate = await request(app).post('/api/inventory/products').send({
    name: 'Produto Duplicado',
    sku,
    price: 10
  });
  expect(firstCreate.status).toBe(201);

  const secondCreate = await request(app).post('/api/inventory/products').send({
    name: 'Produto Duplicado 2',
    sku,
    price: 12
  });

  expect(secondCreate.status).toBe(409);
  expect(secondCreate.body.code).toBe('product_already_exists');
  expect(secondCreate.body.message).toContain('Produto ja cadastrado');
});

test('applies manual stock adjustments to the current store from session headers', async () => {
  if (!dbReady) {
    return;
  }

  const timestamp = Date.now();
  const organizationId = randomUUID();
  const storeId = randomUUID();

  await query(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, [organizationId, `Org ${timestamp}`]);
  await query(
    `INSERT INTO stores (id, organization_id, name, timezone)
     VALUES ($1, $2, $3, $4)`,
    [storeId, organizationId, `Loja ${timestamp}`, 'America/Sao_Paulo']
  );

  const sku = `ADJ-${timestamp}`;
  const createRes = await request(app)
    .post('/api/inventory/products')
    .set('x-org-id', organizationId)
    .set('x-store-id', storeId)
    .send({ name: 'Produto Ajuste', sku, price: 19.9 });

  expect(createRes.status).toBe(201);

  const adjustRes = await request(app)
    .post('/api/inventory/adjustments')
    .set('x-org-id', organizationId)
    .set('x-store-id', storeId)
    .send({
      sku,
      quantity: 3,
      reason: 'manual_add'
    });

  expect(adjustRes.status).toBe(201);
  expect(adjustRes.body.data.storeId).toBe(storeId);

  const listRes = await request(app)
    .get('/api/inventory/products')
    .set('x-org-id', organizationId)
    .set('x-store-id', storeId);

  expect(listRes.status).toBe(200);
  const adjustedProduct = (listRes.body.data as Array<{ sku: string; quantity: number | string }>).find(
    (item) => item.sku === sku
  );
  expect(Number(adjustedProduct?.quantity || 0)).toBe(3);
});
