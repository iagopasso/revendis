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
      customer: { name: 'Cliente Web', phone: '(98) 97026-8723', email: 'cliente@exemplo.com' }
    });

  expect(response.status).toBe(201);
  expect(response.body.data.status).toBe('pending');
});

test('accepts and cancels storefront orders', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-FLOW-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Fluxo Storefront',
      sku,
      price: 29.9,
      stock: 3
    });

  expect(createProduct.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 29.9 }],
      customer: { name: 'Cliente Fluxo', phone: '(11) 91234-5678' }
    });

  expect(createdOrder.status).toBe(201);
  const orderId = createdOrder.body.data.id as string;

  const listedPending = await request(app).get('/api/storefront/orders');
  expect(listedPending.status).toBe(200);
  expect(listedPending.body.data.some((item: { id: string }) => item.id === orderId)).toBe(true);

  const accepted = await request(app).post(`/api/storefront/orders/${orderId}/accept`);
  expect(accepted.status).toBe(200);
  expect(accepted.body.data.status).toBe('accepted');
  expect(typeof accepted.body.data.sale_id).toBe('string');
  const acceptedSaleId = accepted.body.data.sale_id as string;

  const listedAfterAccept = await request(app).get('/api/storefront/orders');
  expect(listedAfterAccept.status).toBe(200);
  expect(listedAfterAccept.body.data.some((item: { id: string }) => item.id === orderId)).toBe(false);

  const listedAllAfterAccept = await request(app).get('/api/storefront/orders?status=all');
  expect(listedAllAfterAccept.status).toBe(200);
  expect(
    listedAllAfterAccept.body.data.some(
      (item: { id: string; status: string }) => item.id === orderId && item.status === 'accepted'
    )
  ).toBe(true);

  const salesAfterAccept = await request(app).get('/api/sales/orders');
  expect(salesAfterAccept.status).toBe(200);
  expect(salesAfterAccept.body.data.some((sale: { id: string }) => sale.id === acceptedSaleId)).toBe(true);

  const cancelledOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 29.9 }],
      customer: { name: 'Cliente Cancelar', phone: '(11) 92345-6789' }
    });

  expect(cancelledOrder.status).toBe(201);
  const cancelOrderId = cancelledOrder.body.data.id as string;

  const cancelled = await request(app).post(`/api/storefront/orders/${cancelOrderId}/cancel`);
  expect(cancelled.status).toBe(200);
  expect(cancelled.body.data.status).toBe('cancelled');
});

test('reserves pending storefront quantity for next orders', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-PENDING-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Reserva Storefront',
      sku,
      price: 19.9,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const firstOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 2, price: 19.9 }],
      customer: { name: 'Cliente Reserva 1', phone: '(11) 93456-7890' }
    });

  expect(firstOrder.status).toBe(201);
  expect(firstOrder.body.data.status).toBe('pending');

  const secondOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 19.9 }],
      customer: { name: 'Cliente Reserva 2', phone: '(11) 94567-8901' }
    });

  expect(secondOrder.status).toBe(409);
  expect(secondOrder.body.code).toBe('insufficient_stock');
});

test('syncs accepted order without sale to sales list', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-SYNC-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Sync Storefront',
      sku,
      price: 15.5,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 15.5 }],
      customer: { name: 'Cliente Sync', phone: '(11) 95678-9012' }
    });

  expect(createdOrder.status).toBe(201);
  const orderId = createdOrder.body.data.id as string;

  await query(
    `UPDATE storefront_orders
     SET status = 'accepted',
         sale_id = NULL,
         accepted_at = now()
     WHERE id = $1`,
    [orderId]
  );

  const synced = await request(app).post(`/api/storefront/orders/${orderId}/accept`).send({});
  expect(synced.status).toBe(200);
  expect(synced.body.data.status).toBe('accepted');
  expect(typeof synced.body.data.sale_id).toBe('string');
  const saleId = synced.body.data.sale_id as string;

  const salesAfterSync = await request(app).get('/api/sales/orders');
  expect(salesAfterSync.status).toBe(200);
  expect(salesAfterSync.body.data.some((sale: { id: string }) => sale.id === saleId)).toBe(true);
});

test('accepts storefront order with extra products added during confirmation', async () => {
  if (!dbReady) {
    return;
  }

  const baseSku = `SKU-STOREFRONT-BASE-${Date.now()}`;
  const extraSku = `SKU-STOREFRONT-EXTRA-${Date.now()}`;

  const baseProductRes = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Base Storefront',
      sku: baseSku,
      price: 20,
      stock: 3
    });
  expect(baseProductRes.status).toBe(201);

  const extraProductRes = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Extra Storefront',
      sku: extraSku,
      price: 11.5,
      stock: 2
    });
  expect(extraProductRes.status).toBe(201);
  const extraProductId = extraProductRes.body.data.id as string;

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku: baseSku, quantity: 1, price: 20 }],
      customer: { name: 'Cliente Extra', phone: '(98) 97026-8723' }
    });
  expect(createdOrder.status).toBe(201);

  const orderId = createdOrder.body.data.id as string;
  const orderItemId = createdOrder.body.data.items[0].id as string;

  const accepted = await request(app)
    .post(`/api/storefront/orders/${orderId}/accept`)
    .send({
      items: [
        {
          id: orderItemId,
          quantity: 1,
          price: 20
        },
        {
          productId: extraProductId,
          sku: extraSku,
          quantity: 1,
          price: 11.5
        }
      ]
    });

  expect(accepted.status).toBe(200);
  expect(accepted.body.data.status).toBe('accepted');
  const saleId = accepted.body.data.sale_id as string;

  const saleDetail = await request(app).get(`/api/sales/orders/${saleId}`);
  expect(saleDetail.status).toBe(200);
  expect(Array.isArray(saleDetail.body.data.items)).toBe(true);
  expect(saleDetail.body.data.items.length).toBe(2);
  expect(saleDetail.body.data.items.some((item: { sku: string }) => item.sku === baseSku)).toBe(true);
  expect(saleDetail.body.data.items.some((item: { sku: string }) => item.sku === extraSku)).toBe(true);
});

test('accepts storefront order with quantity overrides including 0/1 and 2/1', async () => {
  if (!dbReady) {
    return;
  }

  const skuMain = `SKU-STOREFRONT-OVR-MAIN-${Date.now()}`;
  const skuSecondary = `SKU-STOREFRONT-OVR-SECOND-${Date.now()}`;

  const mainProductRes = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Override Principal',
      sku: skuMain,
      price: 30,
      stock: 3
    });
  expect(mainProductRes.status).toBe(201);

  const secondaryProductRes = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Override Secundario',
      sku: skuSecondary,
      price: 8,
      stock: 2
    });
  expect(secondaryProductRes.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [
        { sku: skuMain, quantity: 1, price: 30 },
        { sku: skuSecondary, quantity: 1, price: 8 }
      ],
      customer: { name: 'Cliente Override', phone: '(98) 97026-8723' }
    });
  expect(createdOrder.status).toBe(201);

  const orderId = createdOrder.body.data.id as string;
  const mainOrderItemId = createdOrder.body.data.items.find((item: { sku: string }) => item.sku === skuMain)?.id;
  const secondaryOrderItemId = createdOrder.body.data.items.find((item: { sku: string }) => item.sku === skuSecondary)?.id;
  expect(typeof mainOrderItemId).toBe('string');
  expect(typeof secondaryOrderItemId).toBe('string');

  const accepted = await request(app)
    .post(`/api/storefront/orders/${orderId}/accept`)
    .send({
      items: [
        {
          id: mainOrderItemId,
          quantity: 2,
          price: 30
        },
        {
          id: secondaryOrderItemId,
          quantity: 0,
          price: 8
        }
      ]
    });

  expect(accepted.status).toBe(200);
  expect(accepted.body.data.status).toBe('accepted');
  const saleId = accepted.body.data.sale_id as string;

  const saleDetail = await request(app).get(`/api/sales/orders/${saleId}`);
  expect(saleDetail.status).toBe(200);
  const saleItems = saleDetail.body.data.items as Array<{ sku: string; quantity: number }>;
  expect(Array.isArray(saleItems)).toBe(true);
  expect(saleItems.some((item) => item.sku === skuMain && Number(item.quantity) === 2)).toBe(true);
  expect(saleItems.some((item) => item.sku === skuSecondary)).toBe(false);
});
