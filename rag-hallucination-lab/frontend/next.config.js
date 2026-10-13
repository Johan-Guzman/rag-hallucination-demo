/** @type {import('next').NextConfig} */
// Server-side target for the same-origin API proxy.
// - Inside Docker Compose it is set explicitly (BACKEND_URL=http://backend:8000).
// - On Render, if BACKEND_URL is not set, fall back to the published backend.
// - Otherwise (local `npm run dev`) default to a backend running on the host.
const isRender = process.env.RENDER === 'true';
const defaultBackendUrl = isRender
  ? 'https://rag-hallucination-demo-back.onrender.com'
  : 'http://localhost:8000';
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
