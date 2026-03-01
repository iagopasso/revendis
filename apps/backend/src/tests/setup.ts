import { DEFAULT_ORG_ID, DEFAULT_STORE_ID } from '../config';
import { query } from '../db';

beforeAll(async () => {
  await query(
    `INSERT INTO organizations (id, name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [DEFAULT_ORG_ID, 'Revendis']
  );

  await query(
    `INSERT INTO stores (id, organization_id, name, timezone)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE
     SET organization_id = EXCLUDED.organization_id,
         name = EXCLUDED.name,
         timezone = EXCLUDED.timezone`,
    [DEFAULT_STORE_ID, DEFAULT_ORG_ID, 'Loja Principal', 'America/Sao_Paulo']
  );
});
