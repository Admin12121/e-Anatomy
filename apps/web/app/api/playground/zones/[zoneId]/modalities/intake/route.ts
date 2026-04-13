import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { INTERNAL_API_BASE_URL, buildApiUrl } from "@/lib/api/config"
import { ApiClientError, parseApiError } from "@/lib/api/errors"
import { requireAdminApiSession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
  }>
}

export async function POST(request: Request, context: RouteContext) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { zoneId } = await context.params

  try {
    if (!request.body) {
      return jsonError(400, "bad_request", "Upload body is required.")
    }

    const contentType = request.headers.get("content-type")

    if (!contentType) {
      return jsonError(400, "bad_request", "Multipart content type is required.")
    }

    const response = await fetch(
      buildApiUrl(
        INTERNAL_API_BASE_URL,
        `/playground/zones/${zoneId}/modalities/intake`,
      ),
      {
        method: "POST",
        headers: {
          ...buildInternalAdminHeaders(result.user),
          Accept: "application/json",
          "content-type": contentType,
        },
        body: request.body,
        cache: "no-store",
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    )

    if (!response.ok) {
      throw await parseApiError(response)
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    return jsonError(
      500,
      "intake_proxy_error",
      error instanceof Error ? error.message : "Unable to proxy modality intake.",
    )
  }
}
