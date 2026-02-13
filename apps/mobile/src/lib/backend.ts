import Constants from 'expo-constants';

const fallbackBaseUrl = 'http://localhost:3001/api';
const fallbackOrgId = '00000000-0000-0000-0000-000000000001';
const fallbackStoreId = '00000000-0000-0000-0000-000000000101';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const expoExtra = Constants.expoConfig?.extra as
  | { apiUrl?: string; orgId?: string; storeId?: string }
  | undefined;

const configuredBaseUrl = trimTrailingSlash(
  (expoExtra?.apiUrl as string | undefined)?.trim() || fallbackBaseUrl
);

const apiBaseUrl = configuredBaseUrl || fallbackBaseUrl;

const defaultHeaders: Record<string, string> = {
  'content-type': 'application/json',
  'x-org-id': (expoExtra?.orgId as string | undefined) || fallbackOrgId,
  'x-store-id': (expoExtra?.storeId as string | undefined) || fallbackStoreId
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
