import type { NextConfig } from "next";

const proxyTarget = process.env.NEXT_SERVER_API_PROXY_TARGET?.replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.65", "localhost"],
  poweredByHeader: false,
  experimental: {
    proxyClientMaxBodySize: "600mb",
  },
  turbopack: {
    resolveAlias: {
      "@better-auth/passkey/client": "@better-auth/passkey/dist/client.mjs",
    },
  },
  async headers() {
    return [
      {
        // Model chunks are named by content hash (scripts/pack-anatomy-model.mjs),
        // so they never change; atlas-v2.json still revalidates on every visit.
        source:
          "/models/:file(anatomy-[0-9a-f]{12}\\.bin|anatomy-[0-9a-f]{12}\\.bin\\.gz)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  async rewrites() {
    if (!proxyTarget) {
      return [];
    }

    return [
      {
        source: "/api/v1/:path*",
        destination: `${proxyTarget}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
