import type { NextRequest } from 'next/server';

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const DEFAULT_PRODUCTION_BACKEND_BASE = 'https://backend-production-3ec7.up.railway.app/api';

const resolveBackendBase = () => {
  const explicitTarget = withNoTrailingSlash(process.env.API_PROXY_TARGET || process.env.AUTH_API_BASE || '');
  if (explicitTarget) return explicitTarget;

  const publicApiBase = withNoTrailingSlash(process.env.NEXT_PUBLIC_API_URL || '');
  if (/^https?:\/\//i.test(publicApiBase)) return publicApiBase;

  if (process.env.NODE_ENV !== 'production') return 'http://127.0.0.1:3001/api';
  return DEFAULT_PRODUCTION_BACKEND_BASE;
};

const BACKEND_BASE = resolveBackendBase();

const proxyToBackend = async (
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) => {
  const { path } = await params;
  const joinedPath = path?.join('/') || '';
  const targetUrl = `${BACKEND_BASE}/${joinedPath}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const method = request.method.toUpperCase();
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
