import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import { serverApiFetch } from "@/lib/api/server"
import { requireAdminApiSession } from "@/lib/auth/session"
import type { ZoneModalityViewerManifest } from "@/lib/playground/types"

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
    zoneId: string
    modalityId: string
  }>
}

function rewriteDerivedAssetUrl(
  url: string | null | undefined,
  assetId: string,
) {
  if (!url?.includes("/playground/derived-assets/")) {
    return url ?? null
  }

  const variant = url.endsWith("/thumbnail") ? "thumbnail" : "image"
  return `/api/playground/derived-assets/${assetId}/${variant}`
}

export async function GET(request: Request, context: RouteContext) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { modalityId, zoneId } = await context.params

  try {
    const viewer = await serverApiFetch<ZoneModalityViewerManifest>(
      `/playground/zones/${zoneId}/modalities/${modalityId}/viewer`,
      {
        cache: "no-store",
        includeCookie: false,
        headers: buildInternalAdminHeaders(result.user),
      },
    )

    return NextResponse.json({
      ...viewer,
      assets: viewer.assets.map((asset) => ({
        ...asset,
        imageUrl: rewriteDerivedAssetUrl(asset.imageUrl, asset.id) ?? asset.imageUrl,
        thumbnailUrl: rewriteDerivedAssetUrl(asset.thumbnailUrl, asset.id),
      })),
      modality: {
        ...viewer.modality,
        coverImageUrl: viewer.modality.coverImageUrl,
      },
    })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}
