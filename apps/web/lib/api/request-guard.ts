import { NextResponse } from "next/server"

import { AUTH_PASSKEY_ORIGINS } from "@/lib/auth/runtime-config"

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "").toLowerCase()
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  )
}

function parseHeaderOrigin(value: string | null) {
  if (!value) {
    return null
  }

  try {
    return normalizeOrigin(new URL(value).origin)
  } catch {
    return null
  }
}

function getAllowedOrigins(request: Request) {
  const allowed = new Set<string>()

  try {
    allowed.add(normalizeOrigin(new URL(request.url).origin))
  } catch {
    // Ignore malformed runtime URL and rely on configured trusted origins.
  }

  for (const origin of AUTH_PASSKEY_ORIGINS) {
    allowed.add(normalizeOrigin(origin))
  }

  return allowed
}

export function ensureTrustedMutationRequest(request: Request) {
  const requestOrigin =
    parseHeaderOrigin(request.headers.get("origin")) ??
    parseHeaderOrigin(request.headers.get("referer"))

  if (!requestOrigin) {
    return jsonError(
      403,
      "forbidden",
      "This request was blocked because it did not include a trusted origin.",
    )
  }

  if (!getAllowedOrigins(request).has(requestOrigin)) {
    return jsonError(
      403,
      "forbidden",
      "Cross-origin mutation requests are not allowed for this endpoint.",
    )
  }

  return null
}

export function ensureJsonMutationRequest(request: Request) {
  const trustedOriginError = ensureTrustedMutationRequest(request)

  if (trustedOriginError) {
    return trustedOriginError
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""

  if (!contentType.startsWith("application/json")) {
    return jsonError(
      415,
      "unsupported_media_type",
      "Content-Type must be application/json.",
    )
  }

  return null
}

export function ensureMultipartMutationRequest(request: Request) {
  const trustedOriginError = ensureTrustedMutationRequest(request)

  if (trustedOriginError) {
    return trustedOriginError
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""

  if (!contentType.startsWith("multipart/form-data")) {
    return jsonError(
      415,
      "unsupported_media_type",
      "Content-Type must be multipart/form-data.",
    )
  }

  return null
}
