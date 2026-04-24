export const SITE_NAME = "Voxel Anatomy"

export const SITE_DESCRIPTION =
  "Interactive anatomy learning atlas for exploring radiology slices, anatomical areas, and guided medical learning modules."

export const DEFAULT_OG_IMAGE = "/og.webp"

const FALLBACK_SITE_ORIGIN = "http://localhost"

function getConfiguredSiteOrigin() {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.VERCEL_URL

  if (!configuredOrigin) {
    return FALLBACK_SITE_ORIGIN
  }

  if (configuredOrigin.startsWith("http://") || configuredOrigin.startsWith("https://")) {
    return configuredOrigin
  }

  return `https://${configuredOrigin}`
}

function createSiteUrl() {
  try {
    return new URL(getConfiguredSiteOrigin())
  } catch {
    return new URL(FALLBACK_SITE_ORIGIN)
  }
}

export const SITE_URL = createSiteUrl()

export function absoluteSiteUrl(path = "/") {
  return new URL(path, SITE_URL)
}

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL.origin,
  description: SITE_DESCRIPTION,
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
    logo: absoluteSiteUrl("/logo.webp").toString(),
  },
}

export function humanizeSlug(slug: string) {
  let decodedSlug = slug

  try {
    decodedSlug = decodeURIComponent(slug)
  } catch {
    decodedSlug = slug
  }

  return decodedSlug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
