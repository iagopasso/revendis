import { createApiClient } from '@revendis/api-client';

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const resolveBaseUrl = () => {
  const envBase = withNoTrailingSlash(process.env.NEXT_PUBLIC_API_URL || '');
  if (envBase) return envBase;
  if (typeof window === 'undefined') return 'http://localhost:3001/api';
  return '/api/backend';
};

const baseUrl = resolveBaseUrl();

export const api = createApiClient({
  baseUrl,
  headers: {
    'x-org-id': process.env.NEXT_PUBLIC_ORG_ID || '00000000-0000-0000-0000-000000000001',
    'x-store-id': process.env.NEXT_PUBLIC_STORE_ID || '00000000-0000-0000-0000-000000000101'
  }
});
