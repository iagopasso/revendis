import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../../app';
import { closePool, ping, query } from '../../db';

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

const seedOrganizationWithStores = async (suffix: string) => {
  const organizationId = randomUUID();
  const primaryStoreId = randomUUID();
  const secondaryStoreId = randomUUID();

  await query(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, [organizationId, `Org ${suffix}`]);
  await query(
    `INSERT INTO stores (id, organization_id, name, timezone)
     VALUES ($1, $2, $3, $4), ($5, $2, $6, $4)`,
    [
      primaryStoreId,
      organizationId,
      `Loja A ${suffix}`,
      'America/Sao_Paulo',
      secondaryStoreId,
      `Loja B ${suffix}`
    ]
  );

  return { organizationId, primaryStoreId, secondaryStoreId };
};

test('lists customers scoped to the current store', async () => {
  if (!dbReady) return;

  const suffix = `${Date.now()}`;
  const { organizationId, primaryStoreId, secondaryStoreId } = await seedOrganizationWithStores(suffix);

  const storeARes = await request(app)
    .post('/api/customers')
    .set('x-org-id', organizationId)
    .set('x-store-id', primaryStoreId)
    .send({ name: 'Cliente Loja A', phone: '11999990001' });

  const storeBRes = await request(app)
    .post('/api/customers')
    .set('x-org-id', organizationId)
    .set('x-store-id', secondaryStoreId)
    .send({ name: 'Cliente Loja B', phone: '11999990002' });

  expect(storeARes.status).toBe(201);
  expect(storeBRes.status).toBe(201);

  const listARes = await request(app)
    .get('/api/customers')
    .set('x-org-id', organizationId)
    .set('x-store-id', primaryStoreId);

  const listBRes = await request(app)
    .get('/api/customers')
    .set('x-org-id', organizationId)
    .set('x-store-id', secondaryStoreId);

  expect(listARes.status).toBe(200);
  expect(listBRes.status).toBe(200);
  expect(listARes.body.data.some((item: { name: string }) => item.name === 'Cliente Loja A')).toBe(true);
  expect(listARes.body.data.some((item: { name: string }) => item.name === 'Cliente Loja B')).toBe(false);
  expect(listBRes.body.data.some((item: { name: string }) => item.name === 'Cliente Loja B')).toBe(true);
  expect(listBRes.body.data.some((item: { name: string }) => item.name === 'Cliente Loja A')).toBe(false);
});

test('keeps customer history and customer ids isolated per store', async () => {
  if (!dbReady) return;

  const suffix = `${Date.now()}-history`;
  const { organizationId, primaryStoreId, secondaryStoreId } = await seedOrganizationWithStores(suffix);
  const sku = `CUS-${suffix}`;

  const productRes = await request(app)
    .post('/api/inventory/products')
    .set('x-org-id', organizationId)
    .set('x-store-id', primaryStoreId)
    .send({ name: 'Produto Cliente', sku, price: 25 });

  expect(productRes.status).toBe(201);

  const customerRes = await request(app)
    .post('/api/customers')
    .set('x-org-id', organizationId)
    .set('x-store-id', primaryStoreId)
    .send({ name: 'Cliente Historico', phone: '11999990003' });

  expect(customerRes.status).toBe(201);
  const customerId = customerRes.body.data.id as string;

  const storeASaleRes = await request(app)
    .post('/api/sales/checkout')
    .set('x-org-id', organizationId)
    .set('x-store-id', primaryStoreId)
    .send({
      customerId,
      customerName: 'Cliente Historico',
      items: [{ sku, quantity: 1, price: 25, origin: 'order' }]
    });

  expect(storeASaleRes.status).toBe(201);

  const storeBSaleRes = await request(app)
    .post('/api/sales/checkout')
    .set('x-org-id', organizationId)
    .set('x-store-id', secondaryStoreId)
    .send({
      customerName: 'Cliente Historico',
      items: [{ sku, quantity: 1, price: 25, origin: 'order' }]
    });

  expect(storeBSaleRes.status).toBe(201);

  const historyRes = await request(app)
    .get(`/api/customers/${customerId}/sales`)
    .set('x-org-id', organizationId)
    .set('x-store-id', primaryStoreId);

  expect(historyRes.status).toBe(200);
  expect(historyRes.body.data).toHaveLength(1);
  expect(historyRes.body.data[0].id).toBe(storeASaleRes.body.data.id);

  const foreignHistoryRes = await request(app)
    .get(`/api/customers/${customerId}/sales`)
    .set('x-org-id', organizationId)
    .set('x-store-id', secondaryStoreId);

  expect(foreignHistoryRes.status).toBe(404);

  const crossStoreSaleRes = await request(app)
    .post('/api/sales/checkout')
    .set('x-org-id', organizationId)
    .set('x-store-id', secondaryStoreId)
    .send({
      customerId,
      customerName: 'Cliente Historico',
      items: [{ sku, quantity: 1, price: 25, origin: 'order' }]
    });

  expect(crossStoreSaleRes.status).toBe(404);
  expect(crossStoreSaleRes.body.code).toBe('customer_not_found');
});
