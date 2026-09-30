import { NextResponse } from "next/server"
import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import { ensureJsonMutationRequest } from "@/lib/api/request-guard"
import { serverApiFetch } from "@/lib/api/server"
import { requireApiCapability } from "@/lib/auth/session"
import type { ContentFamily } from "@/lib/content/types"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ familyId: string }> },
) {
  const guard = ensureJsonMutationRequest(request)
  if (guard) return guard
  const actor = await requireApiCapability(request.headers, "manage_content")
  if (!actor)
    return NextResponse.json(
      { error: { message: "Content editing is not permitted." } },
      { status: 403 },
    )
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid request." } },
      { status: 400 },
    )
  }
  const { familyId } = await context.params
  try {
    return NextResponse.json(
      await serverApiFetch<ContentFamily>(
        `/content/families/${encodeURIComponent(familyId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
          cache: "no-store",
          includeCookie: false,
          headers: {
            ...buildInternalAdminHeaders(actor.user),
            "content-type": "application/json",
          },
        },
      ),
    )
  } catch (error) {
    if (error instanceof ApiClientError)
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status },
      )
    throw error
  }
}
