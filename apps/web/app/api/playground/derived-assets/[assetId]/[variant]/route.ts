import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { INTERNAL_API_BASE_URL, buildApiUrl } from "@/lib/api/config"
import { ApiClientError, parseApiError } from "@/lib/api/errors"
import { requireAdminApiSession } from "@/lib/auth/session"
import {
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

  if (variant !== "image" && variant !== "thumbnail") {
    return jsonError(404, "not_found", "Derived asset variant was not found.")
  }

  const url = new URL(request.url)
  const accountId = url.searchParams.get("accountId")
  const userId = url.searchParams.get("userId")
  const token = url.searchParams.get("token")
  const expiresRaw = url.searchParams.get("expires")
  const expires = expiresRaw ? Number(expiresRaw) : Number.NaN
  const hasSignedAccess =
    Boolean(accountId) &&
    Boolean(userId) &&
    Boolean(token) &&
    verifyDerivedAssetToken({
      accountId: accountId ?? "",
      assetId,
      expires,
      token: token ?? "",
      userId: userId ?? "",
      variant: variant as DerivedAssetVariant,
    })

  const result = hasSignedAccess ? null : await requireAdminApiSession(request.headers)

  if (!hasSignedAccess && !result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const requestUser = hasSignedAccess
    ? {
        apiAccountId: accountId!,
        id: userId!,
      }
    : result!.user

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
        },
        cache: "no-store",
      },
    )

    if (!response.ok) {
      throw await parseApiError(response)
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "cache-control": hasSignedAccess
          ? "private, max-age=31536000, immutable"
          : response.headers.get("cache-control") ?? "private, max-age=86400",
        "content-type":
          response.headers.get("content-type") ?? "application/octet-stream",
        ...(response.headers.get("content-length")
          ? { "content-length": response.headers.get("content-length")! }
          : {}),
      },
    })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}
