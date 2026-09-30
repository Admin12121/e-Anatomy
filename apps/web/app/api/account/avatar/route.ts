import crypto from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"
import sharp from "sharp"

import { ensureMultipartMutationRequest } from "@/lib/api/request-guard"
import { requireApiSession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const OUTPUT_DIR = path.join(
  process.cwd(),
  "public",
  "profile-uploads",
  "avatars",
)
const OUTPUT_PUBLIC_PATH = "/profile-uploads/avatars"
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export async function POST(request: Request) {
  const requestGuardError = ensureMultipartMutationRequest(request)

  if (requestGuardError) {
    return requestGuardError
  }

  const result = await requireApiSession(request.headers)

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.")
  }

  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return jsonError(400, "bad_request", "Choose an image to upload.")
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return jsonError(400, "bad_request", "Image must be between 1 byte and 8MB.")
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return jsonError(
      400,
      "bad_request",
      "Use a PNG, JPG, GIF, WebP, or AVIF image.",
    )
  }

  try {
    const sourceBuffer = Buffer.from(await file.arrayBuffer())
    const outputBuffer = await sharp(sourceBuffer, { failOn: "error" })
      .rotate()
      .resize({
        width: 512,
        height: 512,
        fit: "cover",
        position: "attention",
        withoutEnlargement: false,
      })
      .avif({ quality: 68, effort: 5 })
      .toBuffer()

    await mkdir(OUTPUT_DIR, { recursive: true })

    // One physical avatar file per user avoids leaving an orphan on every update.
    const fileName = `${crypto
      .createHash("sha256")
      .update(result.user.id)
      .digest("hex")
      .slice(0, 32)}.avif`

    await writeFile(path.join(OUTPUT_DIR, fileName), outputBuffer)

    return NextResponse.json({
      // Cache-bust the browser while still overwriting the same physical file.
      url: `${OUTPUT_PUBLIC_PATH}/${fileName}?v=${Date.now()}`,
    })
  } catch {
    return jsonError(400, "bad_request", "Unable to process this image.")
  }
}
