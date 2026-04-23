import {
  DEFAULT_ANNOTATION_COLOR,
} from "../modality-viewer.types";
import type {
  ViewerAnnotation,
  ViewerStructure,
  ZoneModalityAsset,
} from "@/lib/playground/types";

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

export function isSliceAsset(asset: ZoneModalityAsset) {
  return asset.assetKind === "slice" || asset.assetKind === "derived_slice";
}

export function formatModalityTypeLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  switch (value.toLowerCase()) {
    case "mri":
      return "MRI";
    case "ct":
      return "CT";
    case "mra":
      return "MRA";
    case "mrv":
      return "MRV";
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

export function structureMatchesSearch(structure: ViewerStructure, query: string) {
  return [
    structure.title,
    structure.latinName ?? "",
    structure.shortDescription ?? "",
    ...structure.synonyms,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
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

export async function captureViewerSnapshot({
  annotations,
  asset,
  overlayOpacity,
  pinsOnly,
  practiceMode,
  selectedStructureId,
  showLabels,
  structuresById,
}: {
  annotations: ViewerAnnotation[];
  asset: ZoneModalityAsset;
  overlayOpacity: number;
  pinsOnly: boolean;
  practiceMode: boolean;
  selectedStructureId: string | null;
  showLabels: boolean;
  structuresById: Map<string, ViewerStructure>;
}) {
  const image = await loadImage(asset.imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  context.drawImage(image, 0, 0);

  for (const annotation of annotations) {
    const structure = structuresById.get(annotation.structureId);
    if (!structure) {
      continue;
    }

    const color = structure.colorHex || DEFAULT_ANNOTATION_COLOR;
    const overlayColor = color;
    const leaderColor = color;

    if (annotation.polygonPoints.length >= 3) {
      context.save();
      context.fillStyle = applyAlpha(
        overlayColor,
        annotation.overlayOpacity * overlayOpacity,
      );
      context.strokeStyle = overlayColor;
      context.lineWidth = 2;
      context.beginPath();
      annotation.polygonPoints.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    }

    context.save();
    context.strokeStyle = leaderColor;
    context.fillStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(
      annotation.anchorX * canvas.width,
      annotation.anchorY * canvas.height,
    );
    context.lineTo(
      annotation.labelX * canvas.width,
      annotation.labelY * canvas.height,
    );
    context.stroke();
    context.beginPath();
    context.arc(
      annotation.anchorX * canvas.width,
      annotation.anchorY * canvas.height,
      6,
      0,
      Math.PI * 2,
    );
    context.fill();

    if (
      showLabels &&
      !pinsOnly &&
      (!practiceMode || selectedStructureId === structure.id)
    ) {
      context.font = "24px system-ui";
      context.fillText(
        annotation.titleOverride || structure.title,
        annotation.labelX * canvas.width,
        annotation.labelY * canvas.height,
      );
    }
    context.restore();
  }

  return canvas.toDataURL("image/png");
}

function applyAlpha(color: string, alpha: number) {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) {
    return color;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
