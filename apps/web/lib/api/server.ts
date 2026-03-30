import "server-only"

import { headers } from "next/headers"

import { INTERNAL_API_BASE_URL, buildApiUrl } from "@/lib/api/config"
import { parseApiError } from "@/lib/api/errors"

export async function serverApiFetch<T>(path: string, init: RequestInit = {}) {
  const incomingHeaders = await headers()
  const cookie = incomingHeaders.get("cookie")

  const response = await fetch(buildApiUrl(INTERNAL_API_BASE_URL, path), {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw await parseApiError(response)
  }

  const body = await response.text()

  if (!body) {
    return undefined as T
  }

  return JSON.parse(body) as T
}
