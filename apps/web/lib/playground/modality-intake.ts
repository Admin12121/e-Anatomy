import "server-only"

import type { ModalityType } from "@/lib/playground/types"
import {
  buildModalityUploadSummary,
  isLikelyDicomFilename,
  isZipFilename,
  sanitizeUploadName,
  type DetectedModalityUpload,
} from "@/lib/playground/modality-upload-shared"

const MAX_DICOM_FILES = 512
const MAX_SINGLE_FILE_BYTES = 64 * 1024 * 1024
const MAX_TOTAL_UPLOAD_BYTES = 128 * 1024 * 1024

export class ModalityUploadError extends Error {
  constructor(
    message: string,
    public readonly code = "invalid_upload",
    public readonly status = 400,
  ) {
    super(message)
    this.name = "ModalityUploadError"
  }
}

export async function analyzeModalityUpload(
  files: File[],
): Promise<DetectedModalityUpload> {
  if (files.length === 0) {
    throw new ModalityUploadError("Upload one ZIP package or one or more DICOM files.")
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

  if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
    throw new ModalityUploadError("Upload is too large for modality intake.")
  }

  if (files.some((file) => file.size <= 0)) {
    throw new ModalityUploadError("Empty files are not allowed.")
  }

  if (files.some((file) => file.size > MAX_SINGLE_FILE_BYTES)) {
    throw new ModalityUploadError("One of the selected files is too large.")
  }

  const sanitizedNames = files.map((file) => sanitizeUploadName(file.name))

  if (files.length === 1 && isZipFilename(sanitizedNames[0] ?? "")) {
    return inspectZipUpload(files[0], sanitizedNames[0] ?? "")
  }

  if (files.some((file) => isZipFilename(file.name))) {
    throw new ModalityUploadError("ZIP packages must be uploaded by themselves.")
  }

  if (files.length > MAX_DICOM_FILES) {
    throw new ModalityUploadError("Too many DICOM files were selected.")
  }

  await validateDicomFiles(files)

  return buildModalityUploadSummary({
    names: sanitizedNames,
    sourceFileCount: files.length,
    sourceKind: "dicom_files",
    sourceLabel:
      files.length === 1
        ? sanitizedNames[0] ?? "1 DICOM file"
        : `${files.length} DICOM files`,
  })
}

export function resolveModalityTypeOverride(
  value: FormDataEntryValue | null,
  fallback: ModalityType,
) {
  if (typeof value !== "string") {
    return fallback
  }

  const normalized = value.trim().toLowerCase()

  switch (normalized) {
    case "mri":
    case "ct":
    case "mra":
    case "mrv":
    case "angiography":
    case "cbct":
    case "illustration":
    case "photography":
    case "endoscopy":
    case "other":
      return normalized
    default:
      return fallback
  }
}

function normalizeZipName(name: string) {
  const normalized = sanitizeUploadName(name)

  if (!normalized || !isZipFilename(normalized)) {
    throw new ModalityUploadError("Upload a valid ZIP package.")
  }

  return normalized
}

async function inspectZipUpload(file: File, fileName: string) {
  const normalizedName = normalizeZipName(fileName)
  const buffer = new Uint8Array(await file.arrayBuffer())

  if (!hasZipSignature(buffer)) {
    throw new ModalityUploadError("ZIP package signature is invalid.")
  }

  const entries = listZipEntries(buffer)

  if (entries.length === 0) {
    throw new ModalityUploadError("ZIP package is empty.")
  }

  return buildModalityUploadSummary({
    names: [normalizedName, ...entries],
    sourceFileCount: entries.length,
    sourceKind: "zip",
    sourceLabel: normalizedName,
  })
}

async function validateDicomFiles(files: File[]) {
  await Promise.all(
    files.map(async (file) => {
      const normalizedName = sanitizeUploadName(file.name)

      if (!normalizedName) {
        throw new ModalityUploadError("One of the selected files has an invalid name.")
      }

      const header = new Uint8Array(await file.slice(0, 264).arrayBuffer())

      if (!isLikelyDicomFile(normalizedName, header)) {
        throw new ModalityUploadError(
          "Only DICOM files or one ZIP package are allowed in modality intake.",
        )
      }
    }),
  )
}

function isLikelyDicomFile(name: string, header: Uint8Array) {
  if (hasDicomSignature(header)) {
    return true
  }

  return isLikelyDicomFilename(name)
}

function hasDicomSignature(buffer: Uint8Array) {
  if (buffer.length < 132) {
    return false
  }

  return (
    buffer[128] === 0x44 &&
    buffer[129] === 0x49 &&
    buffer[130] === 0x43 &&
    buffer[131] === 0x4d
  )
}

function hasZipSignature(buffer: Uint8Array) {
  if (buffer.length < 4) {
    return false
  }

  const signature = readUint32LE(buffer, 0)
  return signature === 0x04034b50 || signature === 0x06054b50 || signature === 0x08074b50
}

function listZipEntries(buffer: Uint8Array) {
  const eocdOffset = findEndOfCentralDirectoryOffset(buffer)

  if (eocdOffset < 0) {
    throw new ModalityUploadError("ZIP package directory is invalid.")
  }

  const totalEntries = readUint16LE(buffer, eocdOffset + 10)
  const centralDirectorySize = readUint32LE(buffer, eocdOffset + 12)
  const centralDirectoryOffset = readUint32LE(buffer, eocdOffset + 16)

  if (
    centralDirectoryOffset + centralDirectorySize > buffer.length ||
    totalEntries <= 0
  ) {
    throw new ModalityUploadError("ZIP package directory is invalid.")
  }

  const decoder = new TextDecoder()
  const entries: string[] = []
  let cursor = centralDirectoryOffset

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > buffer.length || readUint32LE(buffer, cursor) !== 0x02014b50) {
      throw new ModalityUploadError("ZIP package directory entry is invalid.")
    }

    const fileNameLength = readUint16LE(buffer, cursor + 28)
    const extraLength = readUint16LE(buffer, cursor + 30)
    const commentLength = readUint16LE(buffer, cursor + 32)
    const fileNameStart = cursor + 46
    const fileNameEnd = fileNameStart + fileNameLength

    if (fileNameEnd > buffer.length) {
      throw new ModalityUploadError("ZIP package entry name is invalid.")
    }

    const rawName = decoder.decode(buffer.slice(fileNameStart, fileNameEnd))
    const normalizedName = sanitizeZipEntryName(rawName)

    if (!normalizedName.endsWith("/")) {
      entries.push(normalizedName)
    }

    cursor = fileNameEnd + extraLength + commentLength
  }

  return entries
}

function sanitizeZipEntryName(name: string) {
  const normalized = name.replace(/\\/g, "/").trim()

  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("../") ||
    normalized.includes("..\\") ||
    normalized.includes(":")
  ) {
    throw new ModalityUploadError("ZIP package contains an unsafe file path.")
  }

  return normalized
}

function findEndOfCentralDirectoryOffset(buffer: Uint8Array) {
  const minOffset = Math.max(0, buffer.length - 65_557)

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (readUint32LE(buffer, offset) === 0x06054b50) {
      return offset
    }
  }

  return -1
}

function readUint16LE(buffer: Uint8Array, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8)
}

function readUint32LE(buffer: Uint8Array, offset: number) {
  return (
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16) |
    (buffer[offset + 3] << 24)
  ) >>> 0
}

