import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import {
  ensureJsonMutationRequest,
  ensureTrustedMutationRequest,
} from "@/lib/api/request-guard"
import { serverApiFetch } from "@/lib/api/server"
import { requireAdminApiSession } from "@/lib/auth/session"
import type { UpdateViewerStructureInput, ViewerStructure } from "@/lib/playground/types"

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
    structureId: string
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

  const { modalityId, structureId, zoneId } = await context.params
  const body = (await request.json()) as UpdateViewerStructureInput

  try {
    const structure = await serverApiFetch<ViewerStructure>(
      `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/structures/${structureId}`,
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

    return NextResponse.json(structure)
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

  const { modalityId, structureId, zoneId } = await context.params

  try {
    await serverApiFetch<void>(
      `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/structures/${structureId}`,
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
