import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { ApiClientError } from "@/lib/api/errors"
import { serverApiFetch } from "@/lib/api/server"
import { requireAdminApiSession } from "@/lib/auth/session"
import { analyzeModalityUpload, ModalityUploadError, resolveModalityTypeOverride } from "@/lib/playground/modality-intake"
import type {
  CreateZoneModalityInput,
  ZoneModality,
} from "@/lib/playground/types"

export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{
    zoneId: string
  }>
}

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

export async function POST(request: Request, context: RouteContext) {
  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  try {
    const { zoneId } = await context.params
    const formData = await request.formData()
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File)

    const intake = await analyzeModalityUpload(files)
    const nameField = formData.get("name")
    const notesField = formData.get("notes")
    const modalityType = resolveModalityTypeOverride(
      formData.get("modalityTypeOverride"),
      intake.detectedModalityType,
    )

    const body: CreateZoneModalityInput = {
      name:
        typeof nameField === "string" && nameField.trim().length > 0
          ? nameField.trim()
          : intake.suggestedName,
      modalityType,
      notes:
        typeof notesField === "string" && notesField.trim().length > 0
          ? notesField.trim()
          : null,
      processingStatus: "uploaded",
      sourceFileCount: intake.sourceFileCount,
      sourceKind: intake.sourceKind,
      sourceLabel: intake.sourceLabel,
    }

    const modality = await serverApiFetch<ZoneModality>(
      `/playground/zones/${zoneId}/modalities`,
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

    return NextResponse.json(modality, { status: 201 })
  } catch (error) {
    if (error instanceof ModalityUploadError) {
      return jsonError(error.status, error.code, error.message)
    }

    if (error instanceof ApiClientError) {
      return jsonError(error.status, error.code ?? "api_error", error.message)
    }

    throw error
  }
}

