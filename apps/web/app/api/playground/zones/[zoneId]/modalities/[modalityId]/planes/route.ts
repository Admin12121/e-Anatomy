import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { INTERNAL_API_BASE_URL, buildApiUrl } from "@/lib/api/config"
import { parseApiError } from "@/lib/api/errors"
import { requireAdminApiSession } from "@/lib/auth/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

type RouteContext = {
  params: Promise<{
    zoneId: string
    modalityId: string
  }>
}

// Streams the ZIP of axial, coronal and sagittal images without buffering it.
export async function GET(request: Request, context: RouteContext) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { modalityId, zoneId } = await context.params

  try {
    const response = await fetch(
      buildApiUrl(
        INTERNAL_API_BASE_URL,
        `/playground/zones/${zoneId}/modalities/${modalityId}/planes`,
      ),
      {
        method: "GET",
        headers: buildInternalAdminHeaders(result.user),
        cache: "no-store",
        signal: request.signal,
      },
    )

    if (!response.ok) {
      const error = await parseApiError(response)
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    const headers = new Headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    })
    for (const name of ["content-type", "content-disposition"]) {
      const value = response.headers.get(name)
      if (value) headers.set(name, value)
    }

    return new Response(response.body, { status: response.status, headers })
  } catch {
    return jsonError(
      502,
      "unavailable",
      "The download could not be prepared. Please try again.",
    )
  }
}
