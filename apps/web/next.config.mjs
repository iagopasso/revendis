/** @type {import('next').NextConfig} */
const withNoTrailingSlash = (value) => value.replace(/\/+$/, '');
const sanitizeEnvUrl = (value) =>
  withNoTrailingSlash((value || '').trim().replace(/^['"]|['"]$/g, ''));

const resolveBackendProxyBase = () => {
  const explicitTarget = sanitizeEnvUrl(process.env.API_PROXY_TARGET || process.env.AUTH_API_BASE || '');
  if (explicitTarget) return explicitTarget;

  const publicApiBase = sanitizeEnvUrl(process.env.NEXT_PUBLIC_API_URL || '');
  if (/^https?:\/\//i.test(publicApiBase)) return publicApiBase;

  if (process.env.NODE_ENV !== 'production') return 'http://127.0.0.1:3001/api';
  return '';
};

const backendProxyBase = resolveBackendProxyBase();

const nextConfig = {
  transpilePackages: ['@revendis/ui', '@revendis/tokens'],
  async rewrites() {
    if (!backendProxyBase) return [];
    return [
      {
        source: '/api/backend/:path*',
        destination: `${backendProxyBase}/:path*`
      }
    ];
  }
};

export default nextConfig;
