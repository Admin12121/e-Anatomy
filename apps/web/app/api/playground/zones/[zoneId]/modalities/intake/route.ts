import { NextResponse } from "next/server"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { INTERNAL_API_BASE_URL, buildApiUrl } from "@/lib/api/config"
import { ApiClientError, parseApiError } from "@/lib/api/errors"
import { ensureMultipartMutationRequest } from "@/lib/api/request-guard"
import { requireAdminApiSession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_INTAKE_FILE_COUNT = 512
const MAX_INTAKE_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_INTAKE_SINGLE_FILE_BYTES = 64 * 1024 * 1024
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/
const DANGEROUS_PATH_PATTERN = /(^|[\\/])\.\.($|[\\/])/

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

function isSuspiciousUploadPath(pathValue: string) {
  const normalized = pathValue.trim()

  if (!normalized) {
    return true
  }

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("\\") ||
    normalized.includes(":") ||
    DANGEROUS_PATH_PATTERN.test(normalized) ||
    CONTROL_CHAR_PATTERN.test(normalized)
  ) {
    return true
  }

  return normalized
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .some((segment) => !segment || segment === "." || segment === "..")
}

function isZipFilename(name: string) {
  return name.trim().toLowerCase().endsWith(".zip")
}

function validateIntakeFormData(formData: FormData) {
  const sourceKind = String(formData.get("sourceKind") ?? "").trim()

  if (sourceKind !== "zip" && sourceKind !== "dicom_files") {
    return "Invalid source kind for modality intake."
  }

  const files = formData
    .getAll("file")
    .filter((entry): entry is File => entry instanceof File)

  if (files.length === 0) {
    return "Upload one ZIP package or one or more DICOM files."
  }

  if (files.length > MAX_INTAKE_FILE_COUNT) {
    return "Too many files were uploaded for modality intake."
  }

  let totalBytes = 0

  for (const file of files) {
    totalBytes += file.size

    if (file.size <= 0) {
      return "Empty files are not allowed."
    }

    if (isSuspiciousUploadPath(file.name)) {
      return "Suspicious file names were detected in upload payload."
    }

    if (sourceKind === "dicom_files" && file.size > MAX_INTAKE_SINGLE_FILE_BYTES) {
      return "One of the uploaded files exceeds the allowed size limit."
    }
  }

  if (totalBytes > MAX_INTAKE_TOTAL_BYTES) {
    return "Upload is too large for modality intake."
  }

  if (sourceKind === "zip") {
    if (files.length !== 1) {
      return "ZIP packages must be uploaded by themselves."
    }

    if (!isZipFilename(files[0]?.name ?? "")) {
      return "Upload a valid ZIP package."
    }
  } else if (files.some((file) => isZipFilename(file.name))) {
    return "ZIP packages must be uploaded by themselves."
  }

  const relativePathsValue = String(formData.get("relativePathsJson") ?? "").trim()

  if (relativePathsValue) {
    let relativePaths: unknown

    try {
      relativePaths = JSON.parse(relativePathsValue)
    } catch {
      return "Relative-path manifest is invalid."
    }

    if (!Array.isArray(relativePaths)) {
      return "Relative-path manifest is invalid."
    }

    if (relativePaths.length > files.length) {
      return "Relative-path manifest does not match uploaded files."
    }

    for (const pathValue of relativePaths) {
      const normalizedPath = String(pathValue ?? "").trim()

      if (!normalizedPath) {
        continue
      }

      if (isSuspiciousUploadPath(normalizedPath)) {
        return "Suspicious folder paths were detected in upload payload."
      }
    }
  }

  const declaredSourceFileCountRaw = String(formData.get("sourceFileCount") ?? "").trim()

  if (declaredSourceFileCountRaw && sourceKind === "dicom_files") {
    const declaredSourceFileCount = Number.parseInt(declaredSourceFileCountRaw, 10)

    if (
      Number.isNaN(declaredSourceFileCount) ||
      declaredSourceFileCount <= 0 ||
      declaredSourceFileCount !== files.length
    ) {
      return "Declared source file count does not match uploaded files."
    }
  }

  return null
}

type RouteContext = {
  params: Promise<{
    zoneId: string
  }>
}

export async function POST(request: Request, context: RouteContext) {
  const requestGuardError = ensureMultipartMutationRequest(request)

  if (requestGuardError) {
    return requestGuardError
  }

  const result = await requireAdminApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const { zoneId } = await context.params

  try {
    const formData = await request.formData()
    const validationError = validateIntakeFormData(formData)

    if (validationError) {
      return jsonError(400, "bad_request", validationError)
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
        },
        body: formData,
        cache: "no-store",
      },
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
