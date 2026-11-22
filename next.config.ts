import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local-first app: pages read SQLite on every request, so the simpler
  // request-time rendering model is used instead of Cache Components.
  cacheComponents: false,
  serverExternalPackages: ["sharp", "playwright", "playwright-core"],
  poweredByHeader: false,
  experimental: {
    // Allow multi-screenshot payloads through Server Actions/Route Handlers.
    serverActions: { bodySizeLimit: "30mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
