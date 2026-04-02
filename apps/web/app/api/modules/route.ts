import { NextResponse } from "next/server"

import { ApiClientError } from "@/lib/api/errors"
import { serverApiFetch } from "@/lib/api/server"
import { requireApiSession } from "@/lib/auth/session"
import type { ModuleListResponse } from "@/lib/auth/types"

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
  const result = await requireApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  if (!result.user.canAccessAdmin) {
    return jsonError(403, "forbidden", "Your account does not have admin dashboard access.")
  }

  const accountId = result.user.apiAccountId

  if (!accountId) {
    return jsonError(403, "forbidden", "Your account does not have admin dashboard access.")
  }

  const internalApiKey = process.env.INTERNAL_WEB_API_KEY

  if (!internalApiKey) {
    return jsonError(500, "internal_error", "INTERNAL_WEB_API_KEY is not configured.")
  }

  try {
    const modules = await serverApiFetch<ModuleListResponse>("/modules", {
      cache: "no-store",
      includeCookie: false,
      headers: {
        "x-account-id": accountId,
        "x-internal-api-key": internalApiKey,
      },
    })

    return NextResponse.json(modules)
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}
