import { createApiClient } from '@revendis/api-client';
import Constants from 'expo-constants';

const fallbackBaseUrl = 'http://localhost:3001/api';
const fallbackOrgId = '00000000-0000-0000-0000-000000000001';
const fallbackStoreId = '00000000-0000-0000-0000-000000000101';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const asNonEmptyString = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
const isLocalhostHost = (value: string) =>
  value === 'localhost' || value === '127.0.0.1' || value === '::1';

const resolveRuntimeHostname = () => {
  const maybeHost = (globalThis as { location?: { hostname?: string } }).location?.hostname;
  if (typeof maybeHost !== 'string') return '';
  return maybeHost.trim();
};

const resolveReachableBaseUrl = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return value;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return normalized;
    if (!isLocalhostHost(parsed.hostname)) return normalized;

    const runtimeHost = resolveRuntimeHostname();
    if (!runtimeHost || isLocalhostHost(runtimeHost)) return normalized;

    parsed.hostname = runtimeHost;
    return trimTrailingSlash(parsed.toString());
  } catch {
    return normalized;
  }
};

const expoExtra = Constants.expoConfig?.extra as
  | { apiUrl?: string; orgId?: string; storeId?: string; mutationAuthToken?: string }
  | undefined;

const baseUrl = trimTrailingSlash(
  resolveReachableBaseUrl(
  asNonEmptyString(expoExtra?.apiUrl) ||
    asNonEmptyString(process.env.EXPO_PUBLIC_API_URL) ||
    fallbackBaseUrl
  )
);
const orgId =
  asNonEmptyString(expoExtra?.orgId) ||
  asNonEmptyString(process.env.EXPO_PUBLIC_ORG_ID) ||
  fallbackOrgId;
const storeId =
  asNonEmptyString(expoExtra?.storeId) ||
  asNonEmptyString(process.env.EXPO_PUBLIC_STORE_ID) ||
  fallbackStoreId;
const mutationAuthToken =
  asNonEmptyString(expoExtra?.mutationAuthToken) ||
  asNonEmptyString(process.env.EXPO_PUBLIC_MUTATION_AUTH_TOKEN) ||
  '';

export const api = createApiClient({
  baseUrl,
  headers: {
    'x-org-id': orgId,
    'x-store-id': storeId,
    ...(mutationAuthToken ? { 'x-mutation-token': mutationAuthToken } : {})
  }
});
