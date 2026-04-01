import "server-only"

import { headers } from "next/headers"

import { INTERNAL_API_BASE_URL, buildApiUrl } from "@/lib/api/config"
import { parseApiError } from "@/lib/api/errors"

type ServerApiFetchOptions = RequestInit & {
  includeCookie?: boolean
}

export async function serverApiFetch<T>(
  path: string,
  init: ServerApiFetchOptions = {},
) {
  const { includeCookie = true, headers: initHeaders, ...requestInit } = init
  const requestHeaders = new Headers(initHeaders)

  requestHeaders.set("Accept", "application/json")

  if (includeCookie) {
    const incomingHeaders = await headers()
    const cookie = incomingHeaders.get("cookie")

    if (cookie) {
      requestHeaders.set("cookie", cookie)
    }
  }

  const response = await fetch(buildApiUrl(INTERNAL_API_BASE_URL, path), {
    ...requestInit,
    headers: requestHeaders,
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
