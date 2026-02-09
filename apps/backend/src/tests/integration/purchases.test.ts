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

test('creates, updates and deletes purchase', async () => {
  if (!dbReady) {
    return;
  }

  const createRes = await request(app).post('/api/purchases').send({
    supplier: 'Fornecedor Teste',
    total: 450.75,
    items: 9,
    brand: 'Marca Teste'
  });

  expect(createRes.status).toBe(201);
  expect(createRes.body.data.status).toBe('pending');
  const purchaseId = createRes.body.data.id as string;

  const listRes = await request(app).get('/api/purchases');
  expect(listRes.status).toBe(200);
  expect(Array.isArray(listRes.body.data)).toBe(true);
  expect(listRes.body.data.some((item: { id: string }) => item.id === purchaseId)).toBe(true);

  const statusRes = await request(app).patch(`/api/purchases/${purchaseId}/status`).send({
    status: 'received'
  });
  expect(statusRes.status).toBe(200);
  expect(statusRes.body.data.status).toBe('received');

  const deleteRes = await request(app).delete(`/api/purchases/${purchaseId}`);
  expect(deleteRes.status).toBe(204);
});
