import type { NextConfig } from "next"

const proxyTarget = process.env.NEXT_SERVER_API_PROXY_TARGET?.replace(/\/$/, "")

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    if (!proxyTarget) {
      return []
    }

    return [
      {
        source: "/api/v1/:path*",
        destination: `${proxyTarget}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
