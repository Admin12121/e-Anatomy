import { NextResponse } from "next/server"

import { ApiClientError } from "@/lib/api/errors"
import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { serverApiFetch } from "@/lib/api/server"
import { requireAdminApiSession } from "@/lib/auth/session"
import type { CreateZoneInput, ZoneListResponse } from "@/lib/playground/types"

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

export async function GET(request: Request) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  try {
    const zones = await serverApiFetch<ZoneListResponse>("/playground/zones", {
      cache: "no-store",
      includeCookie: false,
      headers: buildInternalAdminHeaders(result.user),
    })

    return NextResponse.json(zones)
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}

export async function POST(request: Request) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const body = (await request.json()) as CreateZoneInput

  try {
    const zone = await serverApiFetch("/playground/zones", {
      method: "POST",
      body: JSON.stringify(body),
      cache: "no-store",
      includeCookie: false,
      headers: {
        ...buildInternalAdminHeaders(result.user),
        "content-type": "application/json",
      },
    })

    return NextResponse.json(zone, { status: 201 })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}
