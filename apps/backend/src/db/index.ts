import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { DATABASE_URL } from '../config';

const pool = new Pool({
  connectionString: DATABASE_URL
});

export const query = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: Array<unknown> = []
) => {
  return pool.query<T>(text, params);
};

export const withTransaction = async <T>(
  handler: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const ping = async (): Promise<QueryResult> => {
  return query('SELECT 1');
};

export const closePool = () => {
  return pool.end();
};
