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
