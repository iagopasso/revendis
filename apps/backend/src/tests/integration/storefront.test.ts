import request from 'supertest';
import app from '../../app';
import { closePool, ping, query } from '../../db';
import * as mercadoPagoService from '../../services/mercado-pago';

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
      customer: { name: 'Cliente Web', phone: '(98) 97026-8723', email: 'cliente@exemplo.com' },
      payment: { method: 'pix', reference: 'chave-pix-teste' }
    });

  expect(response.status).toBe(201);
  expect(response.body.data.status).toBe('pending');
  expect(response.body.data.payment_method).toBe('pix');
  expect(response.body.data.payment_reference).toBe('chave-pix-teste');
  expect(response.body.data.payment_installments).toBe(1);
  expect(typeof response.body.data.payment.token).toBe('string');
});

test('confirms pix payment and finalizes storefront order automatically', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-PIX-CONFIRM-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Confirmacao Pix',
      sku,
      price: 52.9,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 52.9 }],
      customer: { name: 'Cliente Pix Confirm', phone: '(98) 97026-8723' },
      payment: { method: 'pix', reference: 'chave-pix-confirm' }
    });

  expect(createdOrder.status).toBe(201);
  const orderId = createdOrder.body.data.id as string;
  const token = createdOrder.body.data.payment.token as string;
  expect(typeof token).toBe('string');

  const confirmed = await request(app)
    .post(`/api/storefront/orders/${orderId}/payments/confirm`)
    .send({
      method: 'pix',
      token
    });

  expect(confirmed.status).toBe(200);
  expect(confirmed.body.data.status).toBe('accepted');
  expect(confirmed.body.data.payment_status).toBe('paid');
  expect(typeof confirmed.body.data.sale_id).toBe('string');
  const saleId = confirmed.body.data.sale_id as string;

  const saleDetail = await request(app).get(`/api/sales/orders/${saleId}`);
  expect(saleDetail.status).toBe(200);
  expect(Array.isArray(saleDetail.body.data.payments)).toBe(true);
  expect(saleDetail.body.data.payments.some((payment: { method?: string }) => payment.method === 'Pix')).toBe(true);
});

test('confirms storefront order payment through Mercado Pago webhook', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-WEBHOOK-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Webhook MP',
      sku,
      price: 62.9,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 62.9 }],
      customer: { name: 'Cliente Webhook', phone: '(11) 98888-7777' },
      payment: { method: 'pix', reference: 'chave-pix-webhook' }
    });

  expect(createdOrder.status).toBe(201);
  const orderId = createdOrder.body.data.id as string;

  const gatewaySpy = jest.spyOn(mercadoPagoService, 'getMercadoPagoPayment').mockResolvedValue({
    id: '123456789',
    status: 'approved',
    statusDetail: '',
    externalReference: orderId,
    paymentTypeId: 'bank_transfer',
    paymentMethodId: 'pix',
    dateApproved: new Date().toISOString(),
    dateCreated: new Date().toISOString(),
    qrCode: '',
    qrCodeBase64: '',
    ticketUrl: '',
    metadata: { storefront_order_id: orderId }
  });

  try {
    const webhookRes = await request(app)
      .post('/api/storefront/payments/mercado-pago/webhook')
      .send({
        type: 'payment',
        action: 'payment.updated',
        data: { id: '123456789' }
      });

    expect(webhookRes.status).toBe(200);
    expect(gatewaySpy).toHaveBeenCalledWith('123456789');

    const orderRes = await request(app).get(`/api/storefront/orders/${orderId}`);
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.data.status).toBe('accepted');
    expect(orderRes.body.data.payment_status).toBe('paid');
    expect(typeof orderRes.body.data.sale_id).toBe('string');
  } finally {
    gatewaySpy.mockRestore();
  }
});

test('registers payment when confirming an already accepted storefront order', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-CONFIRM-ACCEPTED-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Confirmacao Pedido Aceito',
      sku,
      price: 60,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 60 }],
      customer: { name: 'Cliente Override', phone: '(98) 97026-8723' },
      payment: { method: 'pix', reference: 'chave-pix-confirm-accepted' }
    });

  expect(createdOrder.status).toBe(201);
  const orderId = createdOrder.body.data.id as string;
  const token = createdOrder.body.data.payment.token as string;

  const accepted = await request(app)
    .post(`/api/storefront/orders/${orderId}/accept`)
    .send({
      customerName: 'Cliente Override',
      items: [{ sku, quantity: 1, price: 60 }]
    });

  expect(accepted.status).toBe(200);
  expect(typeof accepted.body.data.sale_id).toBe('string');
  const saleId = accepted.body.data.sale_id as string;

  const beforeConfirm = await request(app).get(`/api/sales/orders/${saleId}`);
  expect(beforeConfirm.status).toBe(200);
  expect(Array.isArray(beforeConfirm.body.data.payments)).toBe(true);
  expect(beforeConfirm.body.data.payments.length).toBe(0);

  const confirmed = await request(app)
    .post(`/api/storefront/orders/${orderId}/payments/confirm`)
    .send({
      method: 'pix',
      token
    });

  expect(confirmed.status).toBe(200);
  expect(confirmed.body.data.status).toBe('accepted');
  expect(confirmed.body.data.payment_status).toBe('paid');
  expect(confirmed.body.data.sale_id).toBe(saleId);

  const afterConfirm = await request(app).get(`/api/sales/orders/${saleId}`);
  expect(afterConfirm.status).toBe(200);
  expect(Array.isArray(afterConfirm.body.data.payments)).toBe(true);
  expect(afterConfirm.body.data.payments.some((payment: { method?: string }) => payment.method === 'Pix')).toBe(true);
  expect(
    afterConfirm.body.data.payments.some((payment: { amount?: number | string }) => Number(payment.amount || 0) >= 60)
  ).toBe(true);
});

test('rejects storefront order without payment', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-NO-PAY-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Storefront Sem Pagamento',
      sku,
      price: 45.9,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const response = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 45.9 }],
      customer: { name: 'Cliente Sem Pagamento', phone: '(98) 97026-8723' }
    });

  expect(response.status).toBe(400);
  expect(response.body.code).toBe('validation_error');
});

test('rejects storefront order with boleto payment', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-BOLETO-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Storefront Boleto',
      sku,
      price: 39.9,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const response = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 39.9 }],
      customer: { name: 'Cliente Boleto', phone: '(98) 97026-8723' },
      payment: { method: 'boleto', reference: 'https://pagamentos.exemplo.com/boleto/123' }
    });

  expect(response.status).toBe(400);
  expect(response.body.code).toBe('validation_error');
});

test('creates storefront order with credit card installments', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-CARD-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Storefront Cartao',
      sku,
      price: 59.9,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const response = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 59.9 }],
      customer: { name: 'Cliente Cartao', phone: '(11) 98999-1111' },
      payment: { method: 'credit_card', reference: 'https://pagamentos.exemplo.com/card/123', installments: 3 }
    });

  expect(response.status).toBe(201);
  expect(response.body.data.payment_method).toBe('credit_card');
  expect(response.body.data.payment_reference).toBe('https://pagamentos.exemplo.com/card/123');
  expect(response.body.data.payment_installments).toBe(3);
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
      customer: { name: 'Cliente Fluxo', phone: '(11) 91234-5678' },
      payment: { method: 'pix', reference: 'chave-pix-fluxo' }
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
      customer: { name: 'Cliente Cancelar', phone: '(11) 92345-6789' },
      payment: { method: 'pix', reference: 'chave-pix-cancelar' }
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
      customer: { name: 'Cliente Reserva 1', phone: '(11) 93456-7890' },
      payment: { method: 'pix', reference: 'chave-pix-reserva-1' }
    });

  expect(firstOrder.status).toBe(201);
  expect(firstOrder.body.data.status).toBe('pending');

  const secondOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 19.9 }],
      customer: { name: 'Cliente Reserva 2', phone: '(11) 94567-8901' },
      payment: { method: 'pix', reference: 'chave-pix-reserva-2' }
    });

  expect(secondOrder.status).toBe(409);
  expect(secondOrder.body.code).toBe('insufficient_stock');
});

test('keeps stock linked to pending storefront order until payment is confirmed', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-RESERVE-LINK-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Reserva Vinculada',
      sku,
      price: 60,
      stock: 1
    });

  expect(createProduct.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 60 }],
      customer: { name: 'Cliente Reserva Vinculada', phone: '(11) 90000-0000' },
      payment: { method: 'pix', reference: 'chave-pix-reserva-vinculada' }
    });
  expect(createdOrder.status).toBe(201);

  const blockedSale = await request(app)
    .post('/api/sales/checkout')
    .send({
      items: [{ sku, quantity: 1, price: 60 }],
      payments: [{ method: 'Dinheiro', amount: 60 }],
      customerName: 'Cliente Balcao'
    });
  expect(blockedSale.status).toBe(409);
  expect(blockedSale.body.code).toBe('insufficient_stock');

  const confirmed = await request(app)
    .post(`/api/storefront/orders/${createdOrder.body.data.id}/payments/confirm`)
    .send({
      method: 'pix',
      token: createdOrder.body.data.payment.token
    });
  expect(confirmed.status).toBe(200);
  expect(confirmed.body.data.status).toBe('accepted');
  expect(confirmed.body.data.payment_status).toBe('paid');
});

test('releases reserved stock when storefront order is cancelled', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-RESERVE-RELEASE-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Reserva Liberada',
      sku,
      price: 49.9,
      stock: 1
    });

  expect(createProduct.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 49.9 }],
      customer: { name: 'Cliente Cancelamento', phone: '(11) 91111-1111' },
      payment: { method: 'pix', reference: 'chave-pix-cancelamento' }
    });
  expect(createdOrder.status).toBe(201);

  const cancelled = await request(app).post(`/api/storefront/orders/${createdOrder.body.data.id}/cancel`);
  expect(cancelled.status).toBe(200);
  expect(cancelled.body.data.status).toBe('cancelled');

  const saleAfterCancel = await request(app)
    .post('/api/sales/checkout')
    .send({
      items: [{ sku, quantity: 1, price: 49.9 }],
      payments: [{ method: 'Dinheiro', amount: 49.9 }],
      customerName: 'Cliente Balcao'
    });
  expect(saleAfterCancel.status).toBe(201);
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
      customer: { name: 'Cliente Sync', phone: '(11) 95678-9012' },
      payment: { method: 'pix', reference: 'chave-pix-sync' }
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

test('registers payment method when accepting an already paid storefront order', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `SKU-STOREFRONT-ACCEPT-PAID-${Date.now()}`;
  const createProduct = await request(app)
    .post('/api/inventory/products')
    .send({
      name: 'Produto Accept Paid',
      sku,
      price: 33.9,
      stock: 2
    });

  expect(createProduct.status).toBe(201);

  const createdOrder = await request(app)
    .post('/api/storefront/orders')
    .send({
      items: [{ sku, quantity: 1, price: 33.9 }],
      customer: { name: 'Cliente Accept Paid', phone: '(98) 97026-8723' },
      payment: { method: 'credit_card', reference: 'https://pagamentos.exemplo.com/card/accept-paid', installments: 2 }
    });

  expect(createdOrder.status).toBe(201);
  const orderId = createdOrder.body.data.id as string;

  await query(
    `UPDATE storefront_orders
     SET payment_status = 'paid',
         payment_paid_at = now()
     WHERE id = $1`,
    [orderId]
  );

  const accepted = await request(app).post(`/api/storefront/orders/${orderId}/accept`).send({});
  expect(accepted.status).toBe(200);
  expect(accepted.body.data.status).toBe('accepted');
  expect(typeof accepted.body.data.sale_id).toBe('string');
  const saleId = accepted.body.data.sale_id as string;

  const saleDetail = await request(app).get(`/api/sales/orders/${saleId}`);
  expect(saleDetail.status).toBe(200);
  expect(Array.isArray(saleDetail.body.data.payments)).toBe(true);
  expect(
    saleDetail.body.data.payments.some((payment: { method?: string }) => payment.method === 'Cartao de Credito')
  ).toBe(true);
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
      customer: { name: 'Cliente Extra', phone: '(98) 97026-8723' },
      payment: { method: 'pix', reference: 'chave-pix-extra' }
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
      customer: { name: 'Cliente Override', phone: '(98) 97026-8723' },
      payment: { method: 'pix', reference: 'chave-pix-override' }
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
