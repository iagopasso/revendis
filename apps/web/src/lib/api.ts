import { createApiClient } from '@revendis/api-client';

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const resolveBaseUrl = () => {
  if (typeof window !== 'undefined') return '/api/backend';
  const envBase = withNoTrailingSlash(process.env.NEXT_PUBLIC_API_URL || '');
  if (envBase) return envBase;
  return 'http://localhost:3001/api';
};

const baseUrl = resolveBaseUrl();

export const api = createApiClient({
  baseUrl,
  headers: {
    ...(process.env.NEXT_PUBLIC_MUTATION_AUTH_TOKEN
      ? { 'x-mutation-token': process.env.NEXT_PUBLIC_MUTATION_AUTH_TOKEN }
      : {})
  }
});
