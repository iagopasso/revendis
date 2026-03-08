import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../../app';
import { closePool, ping, query } from '../../db';
import { ensureUserStoreColumn } from '../../services/account-provisioning';

let dbReady = false;

beforeAll(async () => {
  try {
    await ping();
    await ensureUserStoreColumn();
    dbReady = true;
  } catch {
    dbReady = false;
  }
});

afterAll(async () => {
  await closePool();
});

const seedOrganizationWithOwner = async (timestamp: number) => {
  const orgId = randomUUID();
  const storeId = randomUUID();
  const ownerId = randomUUID();
  const ownerEmail = `legacy-owner-${timestamp}@example.com`;

  await query(`INSERT INTO organizations (id, name) VALUES ($1, $2)`, [orgId, `Org ${timestamp}`]);
  await query(
    `INSERT INTO stores (id, organization_id, name, timezone)
     VALUES ($1, $2, $3, $4)`,
    [storeId, orgId, 'Loja Principal', 'America/Sao_Paulo']
  );
  await query(
    `INSERT INTO organization_settings (organization_id, owner_name, owner_email, business_name)
     VALUES ($1, $2, $3, $4)`,
    [orgId, 'Conta Principal', ownerEmail, `Negocio ${timestamp}`]
  );
  await query(
    `INSERT INTO users (id, organization_id, store_id, name, email, role, active, created_at)
     VALUES ($1, $2, $3, $4, $5, 'owner', true, now() - interval '2 minutes')`,
    [ownerId, orgId, storeId, 'Conta Principal', ownerEmail]
  );

  return {
    orgId,
    storeId,
    ownerId,
    ownerEmail
  };
};

test('creates a separate account in the same organization with its own store', async () => {
  if (!dbReady) {
    return;
  }

  const timestamp = Date.now();
  const { orgId, storeId, ownerId } = await seedOrganizationWithOwner(timestamp);
  const memberEmail = `separate-member-${timestamp}@example.com`;
  const memberPassword = `Senha!${timestamp}`;

  const response = await request(app)
    .post('/api/settings/access/separate-account')
    .set('x-org-id', orgId)
    .set('x-store-id', storeId)
    .set('x-user-id', ownerId)
    .send({
      name: 'Conta Separada',
      email: memberEmail,
      password: memberPassword
    });

  expect(response.status).toBe(201);
  expect(response.body.data.email).toBe(memberEmail);
  expect(response.body.data.store_id).toBeTruthy();
  expect(response.body.data.store_id).not.toBe(storeId);

  const createdUserResult = await query<{ organization_id: string; store_id: string }>(
    `SELECT organization_id, store_id
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [memberEmail]
  );
  expect(createdUserResult.rows[0]?.organization_id).toBe(orgId);
  expect(createdUserResult.rows[0]?.store_id).toBe(response.body.data.store_id);

  const loginResponse = await request(app).post('/api/auth/login').send({
    email: memberEmail,
    password: memberPassword
  });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.data.organizationId).toBe(orgId);
  expect(loginResponse.body.data.storeId).toBe(response.body.data.store_id);
});

test('migrates legacy shared accounts into distinct stores within the same organization and preserves credentials', async () => {
  if (!dbReady) {
    return;
  }

  const timestamp = Date.now() + 1;
  const { orgId, storeId, ownerId, ownerEmail } = await seedOrganizationWithOwner(timestamp);
  const memberId = randomUUID();
  const memberEmail = `legacy-member-${timestamp}@example.com`;
  const memberPassword = `Senha!${timestamp}`;

  await query(
    `INSERT INTO users (id, organization_id, name, email, role, active, created_at, store_id)
     VALUES ($1, $2, $3, $4, 'seller', true, now() - interval '1 minute', NULL)`,
    [memberId, orgId, 'Conta Separada', memberEmail]
  );
  await query(
    `INSERT INTO user_credentials (user_id, password_hash)
     VALUES ($1, crypt($2, gen_salt('bf')))`,
    [memberId, memberPassword]
  );

  const response = await request(app)
    .post('/api/settings/access/migrate-legacy')
    .set('x-org-id', orgId)
    .set('x-store-id', storeId)
    .set('x-user-id', ownerId)
    .send({});

  expect(response.status).toBe(200);
  expect(response.body.data.primaryMember.email).toBe(ownerEmail);
  expect(response.body.data.primaryMember.store_id).toBe(storeId);
  expect(response.body.data.migratedMembers).toHaveLength(1);
  expect(response.body.data.migratedMembers[0].email).toBe(memberEmail);
  expect(response.body.data.migratedMembers[0].store_id).toBeTruthy();
  expect(response.body.data.migratedMembers[0].store_id).not.toBe(storeId);
  expect(response.body.data.migratedMembers[0].previous_store_id).toBe(storeId);
  expect(response.body.data.remainingMembers).toHaveLength(2);

  const movedUserResult = await query<{ organization_id: string; store_id: string }>(
    `SELECT organization_id, store_id
     FROM users
     WHERE id = $1`,
    [memberId]
  );
  expect(movedUserResult.rows[0]?.organization_id).toBe(orgId);
  expect(movedUserResult.rows[0]?.store_id).toBeTruthy();
  expect(movedUserResult.rows[0]?.store_id).not.toBe(storeId);

  const loginResponse = await request(app).post('/api/auth/login').send({
    email: memberEmail,
    password: memberPassword
  });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.data.organizationId).toBe(orgId);
  expect(loginResponse.body.data.storeId).toBe(movedUserResult.rows[0]?.store_id);
});

test('requires the primary account to run legacy access migration', async () => {
  if (!dbReady) {
    return;
  }

  const timestamp = Date.now() + 2;
  const { orgId, storeId } = await seedOrganizationWithOwner(timestamp);
  const memberId = randomUUID();
  const memberEmail = `legacy-member-block-${timestamp}@example.com`;

  await query(
    `INSERT INTO users (id, organization_id, name, email, role, active, created_at, store_id)
     VALUES ($1, $2, $3, $4, 'seller', true, now() - interval '1 minute', NULL)`,
    [memberId, orgId, 'Conta Secundaria', memberEmail]
  );

  const response = await request(app)
    .post('/api/settings/access/migrate-legacy')
    .set('x-org-id', orgId)
    .set('x-store-id', storeId)
    .set('x-user-id', memberId)
    .send({});

  expect(response.status).toBe(403);
  expect(response.body.code).toBe('primary_account_required');
});
