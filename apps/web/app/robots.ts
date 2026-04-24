import type { MetadataRoute } from "next"

import { absoluteSiteUrl, SITE_URL } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/login", "/playground", "/settings"],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml").toString(),
    host: SITE_URL.origin,
  }
}
