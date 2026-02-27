import type { NextRequest } from 'next/server';

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const sanitizeEnvUrl = (value: string) =>
  withNoTrailingSlash((value || '').trim().replace(/^['"]|['"]$/g, ''));

const resolveBackendBase = () => {
  const explicitTarget = sanitizeEnvUrl(process.env.API_PROXY_TARGET || process.env.AUTH_API_BASE || '');
  if (explicitTarget) return explicitTarget;

  const publicApiBase = sanitizeEnvUrl(process.env.NEXT_PUBLIC_API_URL || '');
  if (/^https?:\/\//i.test(publicApiBase)) return publicApiBase;

  if (process.env.NODE_ENV !== 'production') return 'http://127.0.0.1:3001/api';
  return '';
};

const BACKEND_BASE = resolveBackendBase();
const SERVER_MUTATION_TOKEN =
  (process.env.MUTATION_AUTH_TOKEN || process.env.NEXT_PUBLIC_MUTATION_AUTH_TOKEN || '').trim();
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
  const targetUrl = `${BACKEND_BASE}/${joinedPath}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const method = request.method.toUpperCase();
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
