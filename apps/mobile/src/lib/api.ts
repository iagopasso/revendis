import { createApiClient } from '@revendis/api-client';
import Constants from 'expo-constants';

const baseUrl =
  (Constants.expoConfig?.extra?.apiUrl as string) || 'http://localhost:3001/api';

export const api = createApiClient({
  baseUrl,
  headers: {
    'x-org-id': '00000000-0000-0000-0000-000000000001',
    'x-store-id': '00000000-0000-0000-0000-000000000101'
  }
});
