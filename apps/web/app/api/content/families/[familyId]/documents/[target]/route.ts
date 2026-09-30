import { NextResponse } from "next/server"
import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import { ensureJsonMutationRequest } from "@/lib/api/request-guard"
import { serverApiFetch } from "@/lib/api/server"
import { requireApiCapability } from "@/lib/auth/session"
import type { ContentDocument } from "@/lib/content/types"

export async function PUT(
  request: Request,
  context: { params: Promise<{ familyId: string; target: string }> },
) {
  const guardError = ensureJsonMutationRequest(request)
  if (guardError) return guardError
  const actor = await requireApiCapability(request.headers, "manage_content")
  if (!actor)
    return NextResponse.json(
      { error: { message: "Content editing is not permitted." } },
      { status: 403 },
    )
  const { familyId, target } = await context.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid document request." } },
      { status: 400 },
    )
  }
  try {
    const document = await serverApiFetch<ContentDocument>(
      `/content/families/${encodeURIComponent(familyId)}/documents/${encodeURIComponent(target)}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
        cache: "no-store",
        includeCookie: false,
        headers: {
          ...buildInternalAdminHeaders(actor.user),
          "content-type": "application/json",
        },
      },
    )
    return NextResponse.json(document)
  } catch (error) {
    if (error instanceof ApiClientError)
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status },
      )
    throw error
  }
}
