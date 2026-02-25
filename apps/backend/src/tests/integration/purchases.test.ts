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

test('creates, updates and deletes purchase', async () => {
  if (!dbReady) {
    return;
  }

  const sku = `PUR-${Date.now()}`;
  const productRes = await request(app).post('/api/inventory/products').send({
    name: 'Produto Compra Teste',
    sku,
    price: 15.5
  });
  expect(productRes.status).toBe(201);
  const productId = productRes.body.data.id as string;

  const createRes = await request(app).post('/api/purchases').send({
    supplier: 'Fornecedor Teste',
    total: 450.75,
    items: 9,
    brand: 'Marca Teste',
    purchaseItems: [
      {
        productId,
        quantity: 3,
        unitCost: 10.25
      }
    ]
  });

  expect(createRes.status).toBe(201);
  expect(createRes.body.data.status).toBe('pending');
  const purchaseId = createRes.body.data.id as string;
  const purchaseDate = createRes.body.data.purchase_date as string;

  const expenseAfterCreate = await query<{
    id: string;
    purchase_id: string;
    amount: number | string;
    due_date: string;
    status: string;
  }>(
    `SELECT id, purchase_id, amount, due_date, status
       FROM finance_expenses
      WHERE purchase_id = $1`,
    [purchaseId]
  );
  expect(expenseAfterCreate.rows).toHaveLength(1);
  expect(expenseAfterCreate.rows[0].purchase_id).toBe(purchaseId);
  expect(Number(expenseAfterCreate.rows[0].amount)).toBeCloseTo(450.75, 2);
  const expenseDueDate = new Date(expenseAfterCreate.rows[0].due_date).toISOString().slice(0, 10);
  const purchaseDueDate = new Date(purchaseDate).toISOString().slice(0, 10);
  expect(expenseDueDate).toBe(purchaseDueDate);
  expect(expenseAfterCreate.rows[0].status).toBe('pending');

  const listRes = await request(app).get('/api/purchases');
  expect(listRes.status).toBe(200);
  expect(Array.isArray(listRes.body.data)).toBe(true);
  expect(listRes.body.data.some((item: { id: string }) => item.id === purchaseId)).toBe(true);

  const inventoryRes = await request(app).get('/api/inventory/products');
  expect(inventoryRes.status).toBe(200);
  const createdProduct = (inventoryRes.body.data as Array<{ id: string; quantity: number }>).find(
    (item) => item.id === productId
  );
  expect(createdProduct).toBeTruthy();
  expect(Number(createdProduct?.quantity || 0)).toBe(3);

  const detailRes = await request(app).get(`/api/purchases/${purchaseId}`);
  expect(detailRes.status).toBe(200);
  expect(detailRes.body.data.id).toBe(purchaseId);
  expect(Array.isArray(detailRes.body.data.purchase_items)).toBe(true);
  expect(detailRes.body.data.purchase_items).toHaveLength(1);
  expect(detailRes.body.data.purchase_items[0]).toMatchObject({
    product_id: productId,
    quantity: 3
  });

  const statusRes = await request(app).patch(`/api/purchases/${purchaseId}/status`).send({
    status: 'received'
  });
  expect(statusRes.status).toBe(200);
  expect(statusRes.body.data.status).toBe('received');

  const expenseAfterReceive = await query<{ purchase_id: string }>(
    `SELECT purchase_id
       FROM finance_expenses
      WHERE purchase_id = $1`,
    [purchaseId]
  );
  expect(expenseAfterReceive.rows).toHaveLength(1);

  const cancelRes = await request(app).patch(`/api/purchases/${purchaseId}/status`).send({
    status: 'cancelled'
  });
  expect(cancelRes.status).toBe(200);
  expect(cancelRes.body.data.status).toBe('cancelled');

  const expenseAfterCancel = await query<{ purchase_id: string }>(
    `SELECT purchase_id
       FROM finance_expenses
      WHERE purchase_id = $1`,
    [purchaseId]
  );
  expect(expenseAfterCancel.rows).toHaveLength(0);

  const reopenRes = await request(app).patch(`/api/purchases/${purchaseId}/status`).send({
    status: 'pending'
  });
  expect(reopenRes.status).toBe(200);
  expect(reopenRes.body.data.status).toBe('pending');

  const expenseAfterReopen = await query<{ purchase_id: string; status: string }>(
    `SELECT purchase_id, status
       FROM finance_expenses
      WHERE purchase_id = $1`,
    [purchaseId]
  );
  expect(expenseAfterReopen.rows).toHaveLength(1);
  expect(expenseAfterReopen.rows[0].status).toBe('pending');

  const deleteRes = await request(app).delete(`/api/purchases/${purchaseId}`);
  expect(deleteRes.status).toBe(204);

  const expenseAfterDelete = await query<{ purchase_id: string }>(
    `SELECT purchase_id
       FROM finance_expenses
      WHERE purchase_id = $1`,
    [purchaseId]
  );
  expect(expenseAfterDelete.rows).toHaveLength(0);
});
