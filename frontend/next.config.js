/** @type {import('next').NextConfig} */
const API = process.env.CARGOX_API_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  env: { CARGOX_API_URL: API },
  async rewrites() {
    return [{ source: "/api/backend/:path*", destination: `${API}/api/:path*` }];
  },
};

module.exports = nextConfig;
