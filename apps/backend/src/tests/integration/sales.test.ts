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

test('rejects checkout without items', async () => {
  if (!dbReady) {
    return;
  }
  const response = await request(app).post('/api/sales/checkout').send({});
  expect(response.status).toBe(400);
  expect(response.body.code).toBe('validation_error');
});
