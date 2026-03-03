import type { NextRequest } from 'next/server';
import { auth } from '../../../../auth';

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const sanitizeEnvUrl = (value: string) =>
  withNoTrailingSlash((value || '').trim().replace(/^['"]|['"]$/g, ''));

const resolveBackendBase = () => {
  const explicitTarget = sanitizeEnvUrl(process.env.API_PROXY_TARGET || process.env.AUTH_API_BASE || '');
  if (explicitTarget) return explicitTarget;

  const publicApiBase = sanitizeEnvUrl(process.env.NEXT_PUBLIC_API_URL || '');
  if (/^https?:\/\//i.test(publicApiBase)) return publicApiBase;

  return 'http://127.0.0.1:3001/api';
};

const BACKEND_BASE = resolveBackendBase();
const SERVER_MUTATION_TOKEN =
  (process.env.MUTATION_AUTH_TOKEN || process.env.NEXT_PUBLIC_MUTATION_AUTH_TOKEN || '').trim();
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TenantContext = {
  orgId: string;
  storeId: string;
  userId: string;
  userEmail: string;
};

const normalizeTenantContext = (value: unknown): TenantContext => {
  const user =
    (value as { user?: { organizationId?: unknown; storeId?: unknown; id?: unknown; email?: unknown } } | null)
      ?.user || {};

  const orgId = `${user.organizationId || ''}`.trim();
  const storeId = `${user.storeId || ''}`.trim();
  const userId = `${user.id || ''}`.trim();
  const userEmail = `${user.email || ''}`.trim().toLowerCase();

  return {
    orgId,
    storeId,
    userId,
    userEmail
  };
};

const resolveTenantContext = async (request: NextRequest): Promise<TenantContext> => {
  const sessionContext = normalizeTenantContext(await auth());
  const hasSessionOrg = UUID_PATTERN.test(sessionContext.orgId);
  const hasSessionStore = UUID_PATTERN.test(sessionContext.storeId);
  if (hasSessionOrg && hasSessionStore) {
    return sessionContext;
  }

  const cookie = request.headers.get('cookie') || '';
  if (!cookie) return sessionContext;

  try {
    const sessionUrl = new URL('/api/auth/session', request.nextUrl.origin);
    const sessionResponse = await fetch(sessionUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { cookie }
    });

    if (!sessionResponse.ok) return sessionContext;
    const payload = (await sessionResponse.json().catch(() => null)) as unknown;
    const contextFromSessionApi = normalizeTenantContext(payload);
    const hasApiOrg = UUID_PATTERN.test(contextFromSessionApi.orgId);
    const hasApiStore = UUID_PATTERN.test(contextFromSessionApi.storeId);
    if (hasApiOrg && hasApiStore) {
      return contextFromSessionApi;
    }
    return sessionContext;
  } catch {
    return sessionContext;
  }
};

const isProtectedProxyPath = (method: string, path: string) => {
  if (method === 'OPTIONS') return false;
  if (path === '/health') return false;
  if (path === '/auth/register' || path === '/auth/login' || path === '/auth/social-sync') return false;
  if (method === 'GET' && /^\/storefront\/public\/[^/]+$/i.test(path)) return false;
  if (method === 'POST' && path === '/storefront/orders') return false;
  if (method === 'POST' && path === '/storefront/payments/mercado-pago/webhook') return false;
  if (method === 'POST' && /^\/storefront\/orders\/[0-9a-f-]+\/payments\/confirm$/i.test(path)) return false;
  if (method === 'POST' && /^\/storefront\/orders\/[0-9a-f-]+\/cancel-public$/i.test(path)) return false;
  return true;
};

const proxyToBackend = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) => {
  if (!BACKEND_BASE) {
    return Response.json(
      {
        code: 'backend_not_configured',
        message: 'Backend target is not configured for this environment.'
      },
      { status: 503 }
    );
  }

  const { path } = await params;
  const joinedPath = path?.join('/') || '';
  const normalizedPath = `/${joinedPath.replace(/^\/+/, '')}`;
  const targetUrl = `${BACKEND_BASE}/${joinedPath}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  headers.delete('x-org-id');
  headers.delete('x-store-id');
  headers.delete('x-user-id');
  headers.delete('x-user-email');

  const method = request.method.toUpperCase();
  const tenantContext = await resolveTenantContext(request);
  const hasOrg = UUID_PATTERN.test(tenantContext.orgId);
  const hasStore = UUID_PATTERN.test(tenantContext.storeId);

  if (isProtectedProxyPath(method, normalizedPath) && (!hasOrg || !hasStore)) {
    return Response.json(
      {
        code: 'tenant_context_required',
        message: 'Sessao invalida para esta conta. Entre novamente.'
      },
      { status: 401 }
    );
  }

  if (hasOrg) {
    headers.set('x-org-id', tenantContext.orgId);
  }
  if (hasStore) {
    headers.set('x-store-id', tenantContext.storeId);
  }
  if (tenantContext.userId) {
    headers.set('x-user-id', tenantContext.userId);
  }
  if (tenantContext.userEmail) {
    headers.set('x-user-email', tenantContext.userEmail);
  }

  if (SERVER_MUTATION_TOKEN && WRITE_METHODS.has(method)) {
    headers.set('x-mutation-token', SERVER_MUTATION_TOKEN);
    headers.set('authorization', `Bearer ${SERVER_MUTATION_TOKEN}`);
  }
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const bodyBuffer = hasBody ? await request.arrayBuffer() : null;
  const body = bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined;

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store'
    });

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return Response.json(
      {
        code: 'proxy_error',
        message: 'Nao foi possivel conectar ao backend.',
        detail: error instanceof Error ? error.message : 'unknown_error'
      },
      { status: 502 }
    );
  }
};

export const GET = proxyToBackend;
export const POST = proxyToBackend;
export const PUT = proxyToBackend;
export const PATCH = proxyToBackend;
export const DELETE = proxyToBackend;
export const OPTIONS = proxyToBackend;
export const HEAD = proxyToBackend;
