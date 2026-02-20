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
  | { apiUrl?: string; orgId?: string; storeId?: string }
  | undefined;

const resolvedApiUrl =
  asNonEmptyString(expoExtra?.apiUrl) ||
  asNonEmptyString(process.env.EXPO_PUBLIC_API_URL) ||
  fallbackBaseUrl;
const resolvedOrgId =
  asNonEmptyString(expoExtra?.orgId) ||
  asNonEmptyString(process.env.EXPO_PUBLIC_ORG_ID) ||
  fallbackOrgId;
const resolvedStoreId =
  asNonEmptyString(expoExtra?.storeId) ||
  asNonEmptyString(process.env.EXPO_PUBLIC_STORE_ID) ||
  fallbackStoreId;

const apiBaseUrl = trimTrailingSlash(resolveReachableBaseUrl(resolvedApiUrl)) || fallbackBaseUrl;

const defaultHeaders: Record<string, string> = {
  'content-type': 'application/json',
  'x-org-id': resolvedOrgId,
  'x-store-id': resolvedStoreId
};

const buildUrl = (path: string) => {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
};

export const getApiBaseUrl = () => apiBaseUrl;

export const backendRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      ...defaultHeaders,
      ...(init?.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new Error(
      typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message?: string }).message || 'Request failed')
        : `Request failed: ${response.status}`
    );
  }

  return payload as T;
};

export const backendList = async <T>(path: string): Promise<T[]> => {
  const payload = await backendRequest<unknown>(path);

  if (Array.isArray(payload)) return payload as T[];

  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: T[] }).data;
  }

  return [];
};
