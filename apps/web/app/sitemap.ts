import type { MetadataRoute } from "next"

import {
  getPublicZoneModalities,
  getPublicZones,
} from "@/lib/playground/public-server"
import { absoluteSiteUrl } from "@/lib/seo"

export const revalidate = 3600

const SITEMAP_REVALIDATE_SECONDS = revalidate

function sitemapEntry(
  path: string,
  options: Omit<MetadataRoute.Sitemap[number], "url"> = {},
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteSiteUrl(path).toString(),
    ...options,
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()
  const routes: MetadataRoute.Sitemap = [
    sitemapEntry("/", {
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    }),
    sitemapEntry("/terms", {
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    }),
    sitemapEntry("/privacy", {
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    }),
  ]

  try {
    const zones = await getPublicZones({
      next: { revalidate: SITEMAP_REVALIDATE_SECONDS },
    })
    const modalityRouteGroups = await Promise.all(
      zones.items.map(async (zone) => {
        try {
          const modalities = await getPublicZoneModalities(zone.id, {
            next: { revalidate: SITEMAP_REVALIDATE_SECONDS },
          })

          return modalities.items.map((modality) =>
            sitemapEntry(`/${zone.slug}/${modality.slug}`, {
              lastModified,
              changeFrequency: "weekly",
              priority: 0.8,
            }),
          )
        } catch {
          return []
        }
      }),
    )

    routes.push(...modalityRouteGroups.flat())
  } catch {
    return routes
  }

  return routes
}
