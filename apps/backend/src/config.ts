export const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID || '00000000-0000-0000-0000-000000000001';

export const DEFAULT_STORE_ID =
  process.env.DEFAULT_STORE_ID || '00000000-0000-0000-0000-000000000101';

export const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/revendis';

export const MUTATION_AUTH_TOKEN = process.env.MUTATION_AUTH_TOKEN || '';

export const MERCADO_PAGO_ACCESS_TOKEN = (process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();

export const MERCADO_PAGO_PUBLIC_BASE_URL = (process.env.MERCADO_PAGO_PUBLIC_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

export const MERCADO_PAGO_WEBHOOK_URL = (process.env.MERCADO_PAGO_WEBHOOK_URL || '').trim();

export const STOREFRONT_PIX_EXPIRES_MINUTES = Math.max(
  5,
  Math.min(60, Number(process.env.STOREFRONT_PIX_EXPIRES_MINUTES || 15))
);
