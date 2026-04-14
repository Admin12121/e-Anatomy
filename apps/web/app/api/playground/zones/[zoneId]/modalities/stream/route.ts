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

export async function GET(request: Request, context: RouteContext) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { zoneId } = await context.params

  try {
    const response = await fetch(
      buildApiUrl(
        INTERNAL_API_BASE_URL,
        `/playground/zones/${zoneId}/modalities/stream`,
      ),
      {
        method: "GET",
        headers: {
          ...buildInternalAdminHeaders(result.user),
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
        },
        cache: "no-store",
        signal: request.signal,
      },
    )

    if (!response.ok) {
      throw await parseApiError(response)
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type":
          response.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    return jsonError(
      500,
      "stream_proxy_error",
      error instanceof Error ? error.message : "Unable to stream modality updates.",
    )
  }
}
