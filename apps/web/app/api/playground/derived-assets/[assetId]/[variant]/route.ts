import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { INTERNAL_API_BASE_URL, buildApiUrl } from "@/lib/api/config"
import { ApiClientError, parseApiError } from "@/lib/api/errors"
import { requireAdminApiSession } from "@/lib/auth/session"
import {
  DERIVED_ASSET_TOKEN_TTL_SECONDS,
  type DerivedAssetVariant,
  verifyDerivedAssetToken,
} from "@/lib/playground/derived-asset-token"

export const dynamic = "force-dynamic"

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

type RouteContext = {
  params: Promise<{
    assetId: string
    variant: string
  }>
}

export async function GET(request: Request, context: RouteContext) {
  const { assetId, variant } = await context.params

  if (variant !== "image") {
    return jsonError(404, "not_found", "Derived asset variant was not found.")
  }

  const url = new URL(request.url)
  const token = url.searchParams.get("token")
  const signedAssetAccess = token
    ? verifyDerivedAssetToken({
        assetId,
        token,
        variant: variant as DerivedAssetVariant,
      })
    : null

  const result = signedAssetAccess
    ? null
    : await requireAdminApiSession(request.headers)

  if (!signedAssetAccess && !result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const requestUser = signedAssetAccess
    ? {
        apiAccountId: signedAssetAccess.accountId,
        id: signedAssetAccess.userId,
      }
    : result!.user
  const ifNoneMatch = request.headers.get("if-none-match")
  const ifModifiedSince = request.headers.get("if-modified-since")

  try {
    const response = await fetch(
      buildApiUrl(
        INTERNAL_API_BASE_URL,
        `/playground/derived-assets/${assetId}/${variant}`,
      ),
      {
        method: "GET",
        headers: {
          ...buildInternalAdminHeaders(requestUser),
          Accept: "*/*",
          ...(ifNoneMatch ? { "if-none-match": ifNoneMatch } : {}),
          ...(ifModifiedSince
            ? { "if-modified-since": ifModifiedSince }
            : {}),
        },
        cache: "no-store",
      },
    )

    const cacheControl = signedAssetAccess
      ? `private, max-age=${DERIVED_ASSET_TOKEN_TTL_SECONDS}, immutable`
      : response.headers.get("cache-control") ?? "private, max-age=86400"
    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream"
    const contentLength = response.headers.get("content-length")
    const etag = response.headers.get("etag")
    const lastModified = response.headers.get("last-modified")

    if (response.status === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "cache-control": cacheControl,
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          ...(etag ? { etag } : {}),
          ...(lastModified ? { "last-modified": lastModified } : {}),
        },
      })
    }

    if (!response.ok) {
      throw await parseApiError(response)
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "cache-control": cacheControl,
        "content-type": contentType,
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        ...(contentLength ? { "content-length": contentLength } : {}),
        ...(etag ? { etag } : {}),
        ...(lastModified ? { "last-modified": lastModified } : {}),
      },
    })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}
