import type { ModalitySourceKind, ModalityType } from "@/lib/playground/types"

export type DetectedModalityUpload = {
  detectedModalityType: ModalityType
  sourceKind: Exclude<ModalitySourceKind, "manual">
  sourceLabel: string
  sourceFileCount: number
  suggestedName: string
}

type NamedUpload = {
  name: string
}

const MRI_HINTS = ["mri", "mr", "t1", "t2", "flair", "adc", "dwi"]
const CT_HINTS = ["ct", "cta"]
const MRA_HINTS = ["mra"]
const MRV_HINTS = ["mrv"]
const ANGIOGRAPHY_HINTS = ["angiography", "angio", "angiogram"]
const CBCT_HINTS = ["cbct"]
const ILLUSTRATION_HINTS = ["illustration", "anatomy", "atlas", "diagram"]
const PHOTOGRAPHY_HINTS = ["photo", "photography", "clinical", "surgical"]
const ENDOSCOPY_HINTS = ["endo", "endoscopy", "fibroscopy"]

const DICOM_EXTENSIONS = [".dcm", ".dicom", ".ima"] as const

export function createClientModalityUploadPreview(
  files: NamedUpload[],
): DetectedModalityUpload | null {
  if (files.length === 0) {
    return null
  }

  const names = files
    .map((file) => sanitizeUploadName(file.name))
    .filter((name) => name.length > 0)

  if (names.length === 0) {
    return null
  }

  if (names.length === 1 && isZipFilename(names[0])) {
    return buildModalityUploadSummary({
      names,
      sourceFileCount: 1,
      sourceKind: "zip",
      sourceLabel: names[0],
    })
  }

  if (names.every(isLikelyDicomFilename)) {
    return buildModalityUploadSummary({
      names,
      sourceFileCount: names.length,
      sourceKind: "dicom_files",
      sourceLabel:
        names.length === 1 ? names[0] : `${names.length} DICOM files selected`,
    })
  }

  return null
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

export function isLikelyDicomFilename(name: string) {
  const normalized = sanitizeUploadName(name).toLowerCase()

  if (DICOM_EXTENSIONS.some((extension) => normalized.endsWith(extension))) {
    return true
  }

  const extension = normalized.includes(".")
    ? normalized.slice(normalized.lastIndexOf("."))
    : ""

  return extension === ""
}

function inferModalityTypeFromNames(names: string[]): ModalityType {
  const haystack = names.join(" ").toLowerCase()

  if (includesAny(haystack, CBCT_HINTS)) return "cbct"
  if (includesAny(haystack, ANGIOGRAPHY_HINTS)) return "angiography"
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

