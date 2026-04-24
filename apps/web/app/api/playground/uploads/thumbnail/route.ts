import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { ensureMultipartMutationRequest } from "@/lib/api/request-guard";
import { requireAdminApiSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const OUTPUT_DIR = path.join(process.cwd(), "public", "playground-uploads", "thumbnails");
const OUTPUT_PUBLIC_PATH = "/playground-uploads/thumbnails";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const requestGuardError = ensureMultipartMutationRequest(request);

  if (requestGuardError) {
    return requestGuardError;
  }

  const result = await requireAdminApiSession(request.headers);

  if (!result) {
    return jsonError(401, "unauthorized", "You are not signed in.");
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError(400, "bad_request", "Choose an image to upload.");
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return jsonError(400, "bad_request", "Image must be between 1 byte and 8MB.");
  }

  if (!file.type.startsWith("image/")) {
    return jsonError(400, "bad_request", "Only image uploads are allowed.");
  }

  const sourceBuffer = Buffer.from(await file.arrayBuffer());
  const outputBuffer = await sharp(sourceBuffer, { failOn: "error" })
    .rotate()
    .resize({
      width: 640,
      height: 640,
      fit: "inside",
      withoutEnlargement: true,
    })
    .avif({ quality: 58, effort: 5 })
    .toBuffer();

  await mkdir(OUTPUT_DIR, { recursive: true });

  const fileName = `${Date.now()}-${crypto.randomUUID()}.avif`;
  await writeFile(path.join(OUTPUT_DIR, fileName), outputBuffer);

  return NextResponse.json({
    url: `${OUTPUT_PUBLIC_PATH}/${fileName}`,
  });
}
