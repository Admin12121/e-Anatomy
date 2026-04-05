import { NextResponse } from "next/server"

import { ApiClientError } from "@/lib/api/errors"
import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { serverApiFetch } from "@/lib/api/server"
import { requireAdminApiSession } from "@/lib/auth/session"
import type { UpdateZoneInput, ZoneDetail } from "@/lib/playground/types"

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
  }>
}

export async function GET(request: Request, context: RouteContext) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { zoneId } = await context.params

  try {
    const zone = await serverApiFetch<ZoneDetail>(`/playground/zones/${zoneId}`, {
      cache: "no-store",
      includeCookie: false,
      headers: buildInternalAdminHeaders(result.user),
    })

    return NextResponse.json(zone)
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { zoneId } = await context.params
  const body = (await request.json()) as UpdateZoneInput

  try {
    const zone = await serverApiFetch<ZoneDetail>(`/playground/zones/${zoneId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      cache: "no-store",
      includeCookie: false,
      headers: {
        ...buildInternalAdminHeaders(result.user),
        "content-type": "application/json",
      },
    })

    return NextResponse.json(zone)
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}
