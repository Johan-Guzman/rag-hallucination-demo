/** @type {import('next').NextConfig} */
// Server-side target for the same-origin API proxy: /api/* -> BACKEND_URL.
//
// Resolution order:
//   1. BACKEND_URL environment variable (set it explicitly in Render).
//   2. Production fallback: the published Render backend. `localhost` is NEVER
//      used in production, so the container can never proxy to itself.
//   3. Local development: http://localhost:8000.
//
// Production is detected with NODE_ENV, which `next start` and the production
// Docker runner image both set, plus RENDER as a secondary signal. Relying on
// RENDER alone is unsafe: Render does not inject extra variables into Docker
// runtime, so it can be unset and the container would fall back to localhost.
const PRODUCTION_BACKEND_URL = 'https://rag-hallucination-demo-back.onrender.com';

const isProduction =
  process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

const defaultBackendUrl = isProduction
  ? PRODUCTION_BACKEND_URL
  : 'http://localhost:8000';

// Trailing slashes are stripped so `${backendUrl}/api/...` never yields
// `//api` or `/api/api`.
const backendUrl = (process.env.BACKEND_URL || defaultBackendUrl).replace(/\/+$/, '');

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
