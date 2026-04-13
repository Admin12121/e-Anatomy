import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import { serverApiFetch } from "@/lib/api/server"
import { requireAdminApiSession } from "@/lib/auth/session"
import type { CreateViewerAnnotationInput, ViewerAnnotation } from "@/lib/playground/types"

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
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { modalityId, zoneId } = await context.params
  const body = (await request.json()) as CreateViewerAnnotationInput

  try {
    const annotation = await serverApiFetch<ViewerAnnotation>(
      `/playground/zones/${zoneId}/modalities/${modalityId}/viewer/annotations`,
      {
        method: "POST",
        body: JSON.stringify(body),
        cache: "no-store",
        includeCookie: false,
        headers: {
          ...buildInternalAdminHeaders(result.user),
          "content-type": "application/json",
        },
      },
    )

    return NextResponse.json(annotation, { status: 201 })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}
