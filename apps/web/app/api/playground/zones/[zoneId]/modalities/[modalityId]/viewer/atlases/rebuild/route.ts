import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import { ensureTrustedMutationRequest } from "@/lib/api/request-guard"
import { serverApiFetch } from "@/lib/api/server"
import { requireAdminApiSession } from "@/lib/auth/session"

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

export async function POST(request: Request, context: RouteContext) {
  const requestGuardError = ensureTrustedMutationRequest(request)

  if (requestGuardError) {
    return requestGuardError
  }

  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { modalityId, zoneId } = await context.params

  try {
    await serverApiFetch<void>(
      `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/atlases/rebuild`,
      {
        method: "POST",
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
