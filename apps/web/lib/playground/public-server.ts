import "server-only"

import { BROWSER_API_BASE_URL, INTERNAL_API_BASE_URL } from "@/lib/api/config"
import type {
  PublicZoneListResponse,
  PublicZoneModalityListResponse,
} from "@/lib/playground/types"
import { SITE_URL } from "@/lib/seo"

type PublicPlaygroundFetchInit = RequestInit & {
  next?: {
    revalidate?: number | false
    tags?: string[]
  }
}

const SERVER_PUBLIC_API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL ??
  process.env.SERVER_PUBLIC_API_BASE_URL ??
  INTERNAL_API_BASE_URL ??
  BROWSER_API_BASE_URL

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`
}

function buildPublicApiUrl(path: string) {
  const normalizedPath = normalizePath(path)

  if (
    SERVER_PUBLIC_API_BASE_URL.startsWith("http://") ||
    SERVER_PUBLIC_API_BASE_URL.startsWith("https://")
  ) {
    return new URL(
      `${trimTrailingSlash(SERVER_PUBLIC_API_BASE_URL)}${normalizedPath}`,
    )
  }

  return new URL(
    `${trimTrailingSlash(normalizePath(SERVER_PUBLIC_API_BASE_URL))}${normalizedPath}`,
    SITE_URL,
  )
}

async function fetchPublicPlayground<T>(
  path: string,
  init: PublicPlaygroundFetchInit = {},
) {
  const { headers: initHeaders, ...requestInit } = init
  const requestHeaders = new Headers(initHeaders)

  requestHeaders.set("Accept", "application/json")

  const response = await fetch(buildPublicApiUrl(path), {
    ...requestInit,
    headers: requestHeaders,
  })

  if (!response.ok) {
    throw new Error(`Public playground request failed with ${response.status}`)
  }

  return (await response.json()) as T
}

export function getPublicZones(init?: PublicPlaygroundFetchInit) {
  return fetchPublicPlayground<PublicZoneListResponse>(
    "/public/playground/zones",
    init,
  )
}

export function getPublicZoneModalities(
  zoneId: string,
  init?: PublicPlaygroundFetchInit,
) {
  return fetchPublicPlayground<PublicZoneModalityListResponse>(
    `/public/playground/zones/${encodeURIComponent(zoneId)}/modalities`,
    init,
  )
}
