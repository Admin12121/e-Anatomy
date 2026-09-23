import type {
  ViewerAnnotation,
  ViewerAnnotationPoint,
} from "@/lib/playground/types";

import { clamp } from "../utils";

export type AnnotationLabelSide = "left" | "right";

export type AnnotationLabelCandidate = {
  anchorX: number;
  anchorY: number;
  color: string;
  id: string;
  label: string;
  priority?: number;
  side?: AnnotationLabelSide | "auto";
};

export type PlacedAnnotationLabel = AnnotationLabelCandidate & {
  fontSize: number;
  height: number;
  sideResolved: AnnotationLabelSide;
  textAnchor: "start" | "end";
  textMaxWidth: number;
  textX: number;
  thresholdX: number;
  tickX: number;
  y: number;
};

const regionInteriorAnchorCache = new WeakMap<
  ViewerAnnotationPoint[],
  ViewerAnnotationPoint
>();

export const ANNOTATION_RAIL_GEOMETRY = {
  bottomPadding: 6,
  fontMax: 16,
  fontMin: 12,
  labelMargin: 10,
  minGap: 5,
  railRatio: 0.2,
  shoulder: 15,
  textGap: 4,
  topPadding: 64,
} as const;

function pointInPolygon(
  point: ViewerAnnotationPoint,
  polygon: ViewerAnnotationPoint[],
) {
  let inside = false;

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index]!;
    const previous = polygon[previousIndex]!;
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y || 1e-8) +
          current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToSegment(
  point: ViewerAnnotationPoint,
  start: ViewerAnnotationPoint,
  end: ViewerAnnotationPoint,
) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  if (deltaX === 0 && deltaY === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const factor = clamp(
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
      (deltaX * deltaX + deltaY * deltaY),
    0,
    1,
  );
  const projection = {
    x: start.x + factor * deltaX,
    y: start.y + factor * deltaY,
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

/**
 * Returns a stable point inside an anatomical painted region.
 *
 * The persisted annotation anchor is intentionally not used for an area label:
 * older data can contain a point near the edge or a point inherited from where
 * drawing began. The rail leader should originate comfortably inside the final
 * visible region, like the reference anatomy viewer.
 */
export function findRegionInteriorAnchor(
  polygon: ViewerAnnotationPoint[],
): ViewerAnnotationPoint {
  const cached = regionInteriorAnchorCache.get(polygon);
  if (cached) {
    return cached;
  }

  if (polygon.length === 0) {
    return { x: 0.5, y: 0.5 };
  }

  if (polygon.length < 3) {
    const average = polygon.reduce(
      (sum, point) => ({
        x: sum.x + point.x / polygon.length,
        y: sum.y + point.y / polygon.length,
      }),
      { x: 0, y: 0 },
    );

    regionInteriorAnchorCache.set(polygon, average);
    return average;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const boundsCenter = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
  const average = polygon.reduce(
    (sum, point) => ({
      x: sum.x + point.x / polygon.length,
      y: sum.y + point.y / polygon.length,
    }),
    { x: 0, y: 0 },
  );

  const edgeClearance = (candidate: ViewerAnnotationPoint) => {
    let minimumDistance = Infinity;

    for (let index = 0; index < polygon.length; index += 1) {
      minimumDistance = Math.min(
        minimumDistance,
        distanceToSegment(
          candidate,
          polygon[index]!,
          polygon[(index + 1) % polygon.length]!,
        ),
      );
    }

    return minimumDistance;
  };

  let bestPoint: ViewerAnnotationPoint | null = null;
  let bestScore = -Infinity;

  const consider = (candidate: ViewerAnnotationPoint) => {
    if (!pointInPolygon(candidate, polygon)) {
      return;
    }

    const clearance = edgeClearance(candidate);
    const centerPenalty =
      Math.hypot(
        candidate.x - boundsCenter.x,
        candidate.y - boundsCenter.y,
      ) * 0.08;
    const score = clearance - centerPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestPoint = candidate;
    }
  };

  consider(boundsCenter);
  consider(average);

  const columns = 19;
  const rows = 19;
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      consider({
        x: minX + ((column + 0.5) / columns) * width,
        y: minY + ((row + 0.5) / rows) * height,
      });
    }
  }

  const resolved = bestPoint ?? polygon[0]!;
  regionInteriorAnchorCache.set(polygon, resolved);
  return resolved;
}

export function getAnnotationDisplayAnchor(
  annotation: ViewerAnnotation,
  polygonOverride?: ViewerAnnotationPoint[],
  anchorOverride?: ViewerAnnotationPoint,
) {
  const polygon = polygonOverride ?? annotation.polygonPoints;

  if (polygon.length >= 3) {
    return findRegionInteriorAnchor(polygon);
  }

  return (
    anchorOverride ?? {
      x: annotation.anchorX,
      y: annotation.anchorY,
    }
  );
}

function chooseFontSize(count: number, availableHeight: number) {
  if (count <= 3 && availableHeight >= 430) {
    return ANNOTATION_RAIL_GEOMETRY.fontMax;
  }

  if (count <= 6 && availableHeight >= 400) {
    return 14;
  }

  return ANNOTATION_RAIL_GEOMETRY.fontMin;
}

function keepVisibleByPriority(
  items: AnnotationLabelCandidate[],
  availableHeight: number,
  fontSize: number,
) {
  const rowHeight = fontSize + ANNOTATION_RAIL_GEOMETRY.minGap;
  const maximumVisible = Math.max(1, Math.floor(availableHeight / rowHeight));

  if (items.length <= maximumVisible) {
    return items.slice();
  }

  return items
    .slice()
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
    .slice(0, maximumVisible);
}

function resolveSide(candidate: AnnotationLabelCandidate, width: number) {
  if (candidate.side && candidate.side !== "auto") {
    return candidate.side;
  }

  return candidate.anchorX < width / 2 ? "left" : "right";
}

function placeSide(
  sourceItems: AnnotationLabelCandidate[],
  side: AnnotationLabelSide,
  width: number,
  height: number,
) {
  if (sourceItems.length === 0) {
    return [];
  }

  const geometry = ANNOTATION_RAIL_GEOMETRY;
  const top = geometry.topPadding;
  const bottom = geometry.bottomPadding;
  const availableHeight = Math.max(60, height - top - bottom);
  const railX =
    side === "left"
      ? Math.ceil(width * geometry.railRatio)
      : Math.ceil(width * (1 - geometry.railRatio));
  const tickX = railX + (side === "left" ? -geometry.shoulder : geometry.shoulder);
  const textMaxWidth = Math.max(
    56,
    Math.ceil(width * geometry.railRatio) -
      geometry.labelMargin -
      geometry.shoulder -
      geometry.textGap,
  );
  const fontSize = chooseFontSize(sourceItems.length, availableHeight);
  const items = keepVisibleByPriority(
    sourceItems,
    availableHeight,
    fontSize,
  );
  const rowHeight = fontSize;
  const availableGapSpace = Math.max(
    0,
    availableHeight - items.length * rowHeight,
  );
  const interline =
    items.length > 1
      ? clamp(
          availableGapSpace / (items.length - 1),
          geometry.minGap,
          22,
        )
      : 0;
  const totalHeight =
    items.length * rowHeight + Math.max(0, items.length - 1) * interline;
  const averageAnchorY =
    items.reduce((sum, item) => sum + item.anchorY, 0) /
    Math.max(items.length, 1);
  const maximumStart = top + Math.max(0, availableHeight - totalHeight);
  let currentY = clamp(
    averageAnchorY - totalHeight / 2,
    top,
    maximumStart,
  );
  const remaining = items.slice();
  const placed: PlacedAnnotationLabel[] = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestSlope: number | null = null;

    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index]!;
      const denominator = item.anchorX - railX;
      const safeDenominator =
        Math.abs(denominator) < 0.001
          ? denominator < 0
            ? -0.001
            : 0.001
          : denominator;
      const slope =
        (item.anchorY - currentY - rowHeight / 2) / safeDenominator;

      if (
        bestSlope === null ||
        (side === "left" ? slope < bestSlope : slope > bestSlope)
      ) {
        bestSlope = slope;
        bestIndex = index;
      }
    }

    const [item] = remaining.splice(bestIndex, 1);
    const textX =
      side === "left"
        ? tickX - geometry.textGap
        : tickX + geometry.textGap;

    placed.push({
      ...item!,
      fontSize,
      height: rowHeight,
      sideResolved: side,
      textAnchor: side === "left" ? "end" : "start",
      textMaxWidth,
      textX,
      thresholdX: railX,
      tickX,
      y: currentY,
    });

    currentY += rowHeight + interline;
  }

  return placed;
}

export function layoutAnnotationLabels(
  candidates: AnnotationLabelCandidate[],
  width: number,
  height: number,
) {
  const resolved = candidates.map((candidate) => ({
    ...candidate,
    sideResolved: resolveSide(candidate, width),
  }));

  return [
    ...placeSide(
      resolved.filter((candidate) => candidate.sideResolved === "left"),
      "left",
      width,
      height,
    ),
    ...placeSide(
      resolved.filter((candidate) => candidate.sideResolved === "right"),
      "right",
      width,
      height,
    ),
  ];
}
