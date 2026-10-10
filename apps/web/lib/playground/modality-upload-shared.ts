import type { ModalitySourceKind, ModalityType } from "@/lib/playground/types"

export type DetectedModalityUpload = {
  detectedModalityType: ModalityType
  sourceKind: Exclude<ModalitySourceKind, "manual">
  sourceLabel: string
  sourceFileCount: number
  suggestedName: string
}

const MRI_HINTS = ["mri", "mr", "t1", "t2", "pd", "flair", "adc", "dwi"]
const CT_HINTS = ["ct", "cta"]
const PET_HINTS = ["pet"]
const ULTRASOUND_HINTS = ["ultrasound", "ultrasonography", "usg"]
const XRAY_HINTS = ["xray", "x-ray", "radiograph"]
const MRA_HINTS = ["mra"]
const MRV_HINTS = ["mrv"]
const ANGIOGRAPHY_HINTS = ["angiography", "angio", "angiogram"]
const CBCT_HINTS = ["cbct"]
const ILLUSTRATION_HINTS = ["illustration", "anatomy", "atlas", "diagram"]
const PHOTOGRAPHY_HINTS = ["photo", "photography", "clinical", "surgical"]
const ENDOSCOPY_HINTS = ["endo", "endoscopy", "fibroscopy"]

// Files that DICOM exports ship beside the images. Mirrors the API's
// is_bundled_non_dicom_entry; anything else is judged by its content.
const BUNDLED_NON_DICOM_EXTENSIONS = new Set([
  "bat", "bmp", "cab", "cmd", "css", "csv", "db", "dll", "doc", "docx", "evx",
  "exe", "gif", "htm", "html", "ico", "inf", "ini", "jpeg", "jpg", "js",
  "json", "lnk", "log", "mp4", "mpeg", "msi", "pdf", "png", "rtf", "svg",
  "ttf", "txt", "woff", "woff2", "xls", "xlsx", "xml", "zip",
])
const BUNDLED_NON_DICOM_FOLDERS = new Set([
  "__macosx",
  "css",
  "css_en",
  "evlite",
  "help_di",
  "javascript",
  "viewer",
])

export const NO_DICOM_FILES_MESSAGE =
  "No DICOM images were found. Export the MRI or CT series from the scanner or PACS as DICOM, then upload its folder or a ZIP of it."

export const MAX_DICOM_FILES = 4096
export const MAX_TOTAL_UPLOAD_BYTES = 1024 * 1024 * 1024

export class ModalityUploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModalityUploadValidationError"
  }
}

/**
 * Keeps the DICOM images of a selection. Scanner and PACS exports mix them
 * with viewers and notes, and name slices by UID, so content decides.
 */
export async function keepDicomFiles(files: File[]) {
  const checks = await Promise.all(
    files.map(async (file) =>
      hasDicomSignature(new Uint8Array(await file.slice(0, 132).arrayBuffer())),
    ),
  )
  const dicomFiles = files.filter((_, index) => checks[index])

  return { files: dicomFiles, skipped: files.length - dicomFiles.length }
}

export async function analyzeModalityUploadFiles(
  files: File[],
): Promise<DetectedModalityUpload> {
  if (files.length === 0) {
    throw new ModalityUploadValidationError(
      "Upload one ZIP package or one or more DICOM files.",
    )
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

  if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
    throw new ModalityUploadValidationError(
      "Upload is too large for modality intake.",
    )
  }

  if (files.some((file) => file.size <= 0)) {
    throw new ModalityUploadValidationError("Empty files are not allowed.")
  }

  const sanitizedNames = files.map((file) => sanitizeUploadName(file.name))

  if (files.length === 1 && isZipFilename(sanitizedNames[0] ?? "")) {
    return inspectZipUpload(files[0], sanitizedNames[0] ?? "")
  }

  if (files.some((file) => isZipFilename(file.name))) {
    throw new ModalityUploadValidationError(
      "ZIP packages must be uploaded by themselves.",
    )
  }

  if (files.length > MAX_DICOM_FILES) {
    throw new ModalityUploadValidationError(
      `Too many DICOM files were selected (${files.length}). Upload one series at a time, or a ZIP of up to 10,000 files.`,
    )
  }

  await validateDicomFiles(files)

  return buildModalityUploadSummary({
    names: sanitizedNames,
    sourceFileCount: files.length,
    sourceKind: "dicom_files",
    sourceLabel:
      files.length === 1
        ? sanitizedNames[0] ?? "1 DICOM file"
        : `${files.length} DICOM files selected`,
  })
}

export function buildModalityUploadSummary({
  names,
  sourceFileCount,
  sourceKind,
  sourceLabel,
}: {
  names: string[]
  sourceFileCount: number
  sourceKind: Exclude<ModalitySourceKind, "manual">
  sourceLabel: string
}): DetectedModalityUpload {
  return {
    detectedModalityType: inferModalityTypeFromNames(names),
    sourceKind,
    sourceLabel,
    sourceFileCount,
    suggestedName: deriveSuggestedModalityName(names, sourceKind),
  }
}

export function formatSourceKindLabel(kind: Exclude<ModalitySourceKind, "manual">) {
  return kind === "zip" ? "ZIP package" : "DICOM files"
}

export function sanitizeUploadName(name: string) {
  return name
    .replace(/\\/g, "/")
    .split("/")
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim() ?? ""
}

export function isZipFilename(name: string) {
  return sanitizeUploadName(name).toLowerCase().endsWith(".zip")
}

async function inspectZipUpload(file: File, fileName: string) {
  const normalizedName = sanitizeUploadName(fileName)

  if (!normalizedName || !isZipFilename(normalizedName)) {
    throw new ModalityUploadValidationError("Upload a valid ZIP package.")
  }

  const buffer = new Uint8Array(await file.arrayBuffer())

  if (!hasZipSignature(buffer)) {
    throw new ModalityUploadValidationError("ZIP package signature is invalid.")
  }

  const entries = listZipEntries(buffer).filter(
    (entry) => !isBundledNonDicomEntry(entry),
  )

  if (entries.length === 0) {
    throw new ModalityUploadValidationError(NO_DICOM_FILES_MESSAGE)
  }

  return buildModalityUploadSummary({
    names: [normalizedName, ...entries],
    sourceFileCount: entries.length,
    sourceKind: "zip",
    sourceLabel: normalizedName,
  })
}

export function isBundledNonDicomEntry(name: string) {
  const segments = name
    .replace(/\\/g, "/")
    .trim()
    .toLowerCase()
    .split("/")
    .filter(Boolean)
  const fileName = segments.at(-1) ?? ""

  if (!fileName || fileName.startsWith(".")) {
    return true
  }

  if (segments.some((segment) => BUNDLED_NON_DICOM_FOLDERS.has(segment))) {
    return true
  }

  const dotIndex = fileName.lastIndexOf(".")
  return (
    dotIndex >= 0 && BUNDLED_NON_DICOM_EXTENSIONS.has(fileName.slice(dotIndex + 1))
  )
}

function inferModalityTypeFromNames(names: string[]): ModalityType {
  const haystack = names.join(" ").toLowerCase()

  if (includesAny(haystack, CBCT_HINTS)) return "cbct"
  if (includesAny(haystack, ANGIOGRAPHY_HINTS)) return "angiography"
  if (includesAny(haystack, ULTRASOUND_HINTS)) return "ultrasound"
  if (includesAny(haystack, XRAY_HINTS)) return "xray"
  if (includesAny(haystack, PET_HINTS)) return "pet"
  if (includesAny(haystack, MRV_HINTS)) return "mrv"
  if (includesAny(haystack, MRA_HINTS)) return "mra"
  if (includesAny(haystack, CT_HINTS)) return "ct"
  if (includesAny(haystack, MRI_HINTS)) return "mri"
  if (includesAny(haystack, ENDOSCOPY_HINTS)) return "endoscopy"
  if (includesAny(haystack, PHOTOGRAPHY_HINTS)) return "photography"
  if (includesAny(haystack, ILLUSTRATION_HINTS)) return "illustration"

  return "other"
}

function deriveSuggestedModalityName(
  names: string[],
  sourceKind: Exclude<ModalitySourceKind, "manual">,
) {
  if (sourceKind === "zip") {
    return humanizeStem(names[0] ?? "Uploaded package")
  }

  if (names.length === 1) {
    return humanizeStem(names[0] ?? "Uploaded study")
  }

  const firstName = names[0] ?? "Uploaded study"
  return `${humanizeStem(firstName)} set`
}

function humanizeStem(name: string) {
  const stem = sanitizeUploadName(name)
    .replace(/\.zip$/i, "")
    .replace(/\.(dcm|dicom|ima)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!stem) {
    return "Uploaded study"
  }

  return stem.replace(/\b\w/g, (match) => match.toUpperCase())
}

function includesAny(haystack: string, needles: readonly string[]) {
  return needles.some((needle) => haystack.includes(needle))
}

async function validateDicomFiles(files: File[]) {
  await Promise.all(
    files.map(async (file) => {
      const normalizedName = sanitizeUploadName(file.name)

      if (!normalizedName) {
        throw new ModalityUploadValidationError(
          "One of the selected files has an invalid name.",
        )
      }

      const header = new Uint8Array(await file.slice(0, 132).arrayBuffer())

      if (!hasDicomSignature(header)) {
        throw new ModalityUploadValidationError(NO_DICOM_FILES_MESSAGE)
      }
    }),
  )
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
  return (
    signature === 0x04034b50 ||
    signature === 0x06054b50 ||
    signature === 0x08074b50
  )
}

function listZipEntries(buffer: Uint8Array) {
  const eocdOffset = findEndOfCentralDirectoryOffset(buffer)

  if (eocdOffset < 0) {
    throw new ModalityUploadValidationError("ZIP package directory is invalid.")
  }

  const totalEntries = readUint16LE(buffer, eocdOffset + 10)
  const centralDirectorySize = readUint32LE(buffer, eocdOffset + 12)
  const centralDirectoryOffset = readUint32LE(buffer, eocdOffset + 16)

  if (
    centralDirectoryOffset + centralDirectorySize > buffer.length ||
    totalEntries <= 0
  ) {
    throw new ModalityUploadValidationError("ZIP package directory is invalid.")
  }

  const decoder = new TextDecoder()
  const entries: string[] = []
  let cursor = centralDirectoryOffset

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > buffer.length || readUint32LE(buffer, cursor) !== 0x02014b50) {
      throw new ModalityUploadValidationError(
        "ZIP package directory entry is invalid.",
      )
    }

    const fileNameLength = readUint16LE(buffer, cursor + 28)
    const extraLength = readUint16LE(buffer, cursor + 30)
    const commentLength = readUint16LE(buffer, cursor + 32)
    const fileNameStart = cursor + 46
    const fileNameEnd = fileNameStart + fileNameLength

    if (fileNameEnd > buffer.length) {
      throw new ModalityUploadValidationError(
        "ZIP package entry name is invalid.",
      )
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
    throw new ModalityUploadValidationError(
      "ZIP package contains an unsafe file path.",
    )
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
