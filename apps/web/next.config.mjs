/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@revendis/ui', '@revendis/tokens'],
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: 'http://127.0.0.1:3001/api/:path*'
      }
    ];
  }
};

export default nextConfig;
