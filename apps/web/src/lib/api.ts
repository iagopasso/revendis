import { createApiClient } from '@revendis/api-client';

const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const api = createApiClient({
  baseUrl,
  headers: {
    'x-org-id': process.env.NEXT_PUBLIC_ORG_ID || '00000000-0000-0000-0000-000000000001',
    'x-store-id': process.env.NEXT_PUBLIC_STORE_ID || '00000000-0000-0000-0000-000000000101'
  }
});
