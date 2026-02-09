import request from 'supertest';
import app from '../../app';
import { closePool, ping, query } from '../../db';
import { DEFAULT_STORE_ID } from '../../config';

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

test('creates and lists receivables', async () => {
  if (!dbReady) {
    return;
  }

  const saleRes = await query(
    `INSERT INTO sales (store_id, subtotal, discount_total, total)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [DEFAULT_STORE_ID, 100, 0, 100]
  );
  const saleId = saleRes.rows[0].id;

  const createRes = await request(app)
    .post('/api/finance/receivables')
    .send({ saleId, amount: 100, dueDate: '2026-01-31' });

  expect(createRes.status).toBe(201);
  expect(createRes.body.data.sale_id).toBe(saleId);

  const listRes = await request(app).get('/api/finance/receivables');
  expect(listRes.status).toBe(200);
  expect(Array.isArray(listRes.body.data)).toBe(true);
});

test('settles receivable', async () => {
  if (!dbReady) {
    return;
  }

  const saleRes = await query(
    `INSERT INTO sales (store_id, subtotal, discount_total, total)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [DEFAULT_STORE_ID, 50, 0, 50]
  );
  const saleId = saleRes.rows[0].id;

  const receivableRes = await query(
    `INSERT INTO receivables (sale_id, amount, due_date, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [saleId, 50, '2026-01-31']
  );

  const settleRes = await request(app)
    .post(`/api/finance/receivables/${receivableRes.rows[0].id}/settle`)
    .send({ amount: 50, settledAt: '2026-01-25T10:00:00Z' });

  expect(settleRes.status).toBe(200);
  expect(settleRes.body.data.status).toBe('paid');
});

test('lists finance payments from sales', async () => {
  if (!dbReady) {
    return;
  }

  const saleRes = await query(
    `INSERT INTO sales (store_id, subtotal, discount_total, total)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [DEFAULT_STORE_ID, 80, 0, 80]
  );
  const saleId = saleRes.rows[0].id as string;

  await query(
    `INSERT INTO payments (sale_id, method, amount)
     VALUES ($1, $2, $3)`,
    [saleId, 'pix', 80]
  );

  const listRes = await request(app).get('/api/finance/payments');
  expect(listRes.status).toBe(200);
  expect(Array.isArray(listRes.body.data)).toBe(true);
  expect(listRes.body.data.some((item: { sale_id?: string }) => item.sale_id === saleId)).toBe(true);
});

test('creates and pays expense', async () => {
  if (!dbReady) {
    return;
  }

  const createRes = await request(app).post('/api/finance/expenses').send({
    description: 'Frete fornecedor',
    amount: 220.5,
    dueDate: '2026-02-10',
    method: 'pix'
  });

  expect(createRes.status).toBe(201);
  expect(createRes.body.data.description).toBe('Frete fornecedor');
  expect(createRes.body.data.status).toBe('pending');

  const expenseId = createRes.body.data.id as string;

  const listRes = await request(app).get('/api/finance/expenses');
  expect(listRes.status).toBe(200);
  expect(Array.isArray(listRes.body.data)).toBe(true);
  expect(listRes.body.data.some((item: { id: string }) => item.id === expenseId)).toBe(true);

  const payRes = await request(app)
    .post(`/api/finance/expenses/${expenseId}/pay`)
    .send({});
  expect(payRes.status).toBe(200);
  expect(payRes.body.data.status).toBe('paid');

  const unpayRes = await request(app)
    .post(`/api/finance/expenses/${expenseId}/unpay`)
    .send({});
  expect(unpayRes.status).toBe(200);
  expect(unpayRes.body.data.status).toBe('pending');

  const deleteRes = await request(app).delete(`/api/finance/expenses/${expenseId}`);
  expect(deleteRes.status).toBe(204);
});
