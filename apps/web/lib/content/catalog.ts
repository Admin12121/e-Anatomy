import type { ZoneModalityFamily, ZoneSummary } from "@/lib/playground/types"

export type ContentCatalogItem = ZoneModalityFamily & {
  latestUpdatedAt: string
  primaryModalityId: string
  primarySlug: string
  viewerSlug: string
  zoneId: string
  zoneName: string
  zoneSlug: string
}

export type ZoneModalityFamilies = {
  families: ZoneModalityFamily[]
  zone: ZoneSummary
}

export function buildContentCatalog(
  groups: ZoneModalityFamilies[],
): ContentCatalogItem[] {
  return groups
    .flatMap(({ families, zone }) =>
      families.flatMap((family) => {
        const primaryModality =
          family.variants.find(
            (variant) => variant.id === family.primaryModalityId,
          ) ??
          [...family.variants].sort(
            (a, b) =>
              Number(b.processingStatus === "ready") -
                Number(a.processingStatus === "ready") ||
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          )[0]

        if (!primaryModality) {
          return []
        }

        const latestUpdatedAt = family.variants.reduce(
          (latest, variant) =>
            variant.updatedAt.localeCompare(latest) > 0
              ? variant.updatedAt
              : latest,
          primaryModality.updatedAt,
        )

        return [
          {
            ...family,
            latestUpdatedAt,
            primaryModalityId: primaryModality.id,
            primarySlug: family.slug ?? primaryModality.slug,
            viewerSlug: primaryModality.slug,
            zoneId: zone.id,
            zoneName: zone.name,
            zoneSlug: zone.slug,
          },
        ]
      }),
    )
    .sort((left, right) =>
      right.latestUpdatedAt.localeCompare(left.latestUpdatedAt),
    )
}

export function findContentBySlug(items: ContentCatalogItem[], slug: string) {
  return (
    items.find((item) => item.primarySlug === slug) ??
    items.find((item) =>
      item.variants.some((variant) => variant.slug === slug),
    ) ??
    null
  )
}
