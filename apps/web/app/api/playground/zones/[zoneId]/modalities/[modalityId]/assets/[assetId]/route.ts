import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import {
  ensureJsonMutationRequest,
  ensureTrustedMutationRequest,
} from "@/lib/api/request-guard"
import { serverApiFetch } from "@/lib/api/server"
import { requireAdminApiSession } from "@/lib/auth/session"
import type {
  UpdateZoneModalityAssetInput,
  ZoneModalityAsset,
} from "@/lib/playground/types"

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
    assetId: string
  }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestGuardError = ensureJsonMutationRequest(request)

  if (requestGuardError) {
    return requestGuardError
  }

  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { assetId, modalityId, zoneId } = await context.params
  const body = (await request.json()) as UpdateZoneModalityAssetInput

  try {
    const asset = await serverApiFetch<ZoneModalityAsset>(
      `/playground/zones/${zoneId}/modalities/${modalityId}/assets/${assetId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        cache: "no-store",
        includeCookie: false,
        headers: {
          ...buildInternalAdminHeaders(result.user),
          "content-type": "application/json",
        },
      },
    )

    return NextResponse.json(asset)
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestGuardError = ensureTrustedMutationRequest(request)

  if (requestGuardError) {
    return requestGuardError
  }

  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { assetId, modalityId, zoneId } = await context.params

  try {
    await serverApiFetch<void>(
      `/playground/zones/${zoneId}/modalities/${modalityId}/assets/${assetId}`,
      {
        method: "DELETE",
        cache: "no-store",
        includeCookie: false,
        headers: buildInternalAdminHeaders(result.user),
      },
    )

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}
