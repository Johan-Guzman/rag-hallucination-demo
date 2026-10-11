/** @type {import('next').NextConfig} */
// Server-side target for the same-origin API proxy. Inside Docker this is the
// Compose service name (http://backend:8000); for local `npm run dev` it
// defaults to a backend running on the host.
const backendUrl = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
