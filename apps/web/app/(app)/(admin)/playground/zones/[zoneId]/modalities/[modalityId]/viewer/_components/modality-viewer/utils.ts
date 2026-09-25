import type { ZoneModalityAsset } from "@/lib/playground/types";

export function readMutationError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    if ("data" in error && error.data && typeof error.data === "object") {
      const errorBody = error.data as { error?: { message?: string } };
      const message = errorBody.error?.message;

      if (message) {
        return message;
      }
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return fallback;
}

export function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitMultilineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatModalityTypeLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  switch (value.toLowerCase()) {
    case "mri":
      return "MRI";
    case "mpr":
      return "MPR";
    case "ct":
      return "CT";
    case "pet":
      return "PET";
    case "ultrasound":
      return "Ultrasound";
    case "xray":
      return "X-ray";
    case "mra":
      return "MRA";
    case "mrv":
      return "MRV";
    case "angiography":
      return "Angiography";
    case "cbct":
      return "CBCT";
    default:
      return value.toUpperCase();
  }
}

export function formatOrientationLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  switch (value.toLowerCase()) {
    case "axial":
      return "Axial";
    case "sagittal":
      return "Sagittal";
    case "coronal":
      return "Coronal";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function buildStackWarmupOrder(
  assets: ZoneModalityAsset[],
  centerIndex: number,
  preferredDirection: -1 | 0 | 1 = 0,
) {
  if (assets.length === 0) {
    return [];
  }

  const safeCenterIndex = clamp(centerIndex, 0, assets.length - 1);
  const orderedIndices = [safeCenterIndex];

  for (let offset = 1; orderedIndices.length < assets.length; offset += 1) {
    const nextIndex = safeCenterIndex + offset;
    const previousIndex = safeCenterIndex - offset;

    const directionalIndices =
      preferredDirection >= 0
        ? [nextIndex, previousIndex]
        : [previousIndex, nextIndex];

    for (const index of directionalIndices) {
      if (index >= 0 && index < assets.length) {
        orderedIndices.push(index);
      }
    }
  }

  return orderedIndices.map((index) => assets[index]!).filter(Boolean);
}

export function buildImmediatePreloadOrder(
  assets: ZoneModalityAsset[],
  centerIndex: number,
  preferredDirection: -1 | 0 | 1,
  radius: number,
) {
  if (assets.length === 0) {
    return [];
  }

  const safeCenterIndex = clamp(centerIndex, 0, assets.length - 1);
  const orderedAssets: ZoneModalityAsset[] = [];

  for (const asset of buildStackWarmupOrder(
    assets,
    safeCenterIndex,
    preferredDirection,
  )) {
    if (orderedAssets.length >= radius) {
      break;
    }

    orderedAssets.push(asset);
  }

  return orderedAssets;
}

export function createDefaultLabelX(anchorX: number) {
  return anchorX < 0.55
    ? clamp(anchorX + 0.24, 0.08, 0.92)
    : clamp(anchorX - 0.24, 0.08, 0.92);
}
