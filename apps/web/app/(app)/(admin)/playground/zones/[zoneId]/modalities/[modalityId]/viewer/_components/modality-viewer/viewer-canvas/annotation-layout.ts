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
  lineHeight: number;
  /** The label wrapped to the rail width: one or two lines, ellipsized. */
  lines: string[];
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

// Sizing follows the reference anatomy viewer: the largest font from fontMin
// to fontMax at which every label on both rails fits, wrapping to maxLines,
// then the spare height spread evenly between labels up to maxGap.
export const ANNOTATION_RAIL_GEOMETRY = {
  bottomPadding: 6,
  fontMax: 20,
  fontMin: 12,
  labelMargin: 10,
  lineHeightRatio: 1.2,
  maxGap: 42,
  maxLines: 2,
  minGap: 8,
  /** A label may run this share past the rail width before it counts as too wide. */
  overflowAllowance: 0.15,
  /** At most this share of a rail's labels may be too wide at a given size. */
  overflowShare: 0.25,
  railRatio: 0.2,
  shoulder: 15,
  textGap: 4,
  topPadding: 64,
} as const;

/** Width of `text` in px at `fontSize`; the viewer passes a canvas measurer. */
export type LabelTextMeasurer = (text: string, fontSize: number) => number;

const estimateTextWidth: LabelTextMeasurer = (text, fontSize) =>
  text.length * fontSize * 0.56;

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

type WrappedLabel = {
  lines: string[];
  /** Widest line before any ellipsis, to judge overflow. */
  widest: number;
};

function ellipsize(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: LabelTextMeasurer,
) {
  if (measure(text, fontSize) <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  let best = "…";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = `${text.slice(0, middle).trimEnd()}…`;
    if (measure(candidate, fontSize) <= maxWidth) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

/** Greedy word wrap to `maxLines`; the last line is ellipsized if needed. */
export function wrapLabelText(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: LabelTextMeasurer = estimateTextWidth,
  maxLines: number = ANNOTATION_RAIL_GEOMETRY.maxLines,
): WrappedLabel {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [""], widest: 0 };

  const lines: string[] = [];
  let current = words[0]!;
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (measure(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);

  const widest = Math.max(...lines.map((line) => measure(line, fontSize)));
  const fitted =
    lines.length > maxLines
      ? [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")]
      : lines;
  return {
    lines: fitted.map((line) => ellipsize(line, fontSize, maxWidth, measure)),
    widest,
  };
}

function lineHeightFor(fontSize: number) {
  return Math.ceil(fontSize * ANNOTATION_RAIL_GEOMETRY.lineHeightRatio);
}

function resolveSide(candidate: AnnotationLabelCandidate, width: number) {
  if (candidate.side && candidate.side !== "auto") {
    return candidate.side;
  }

  return candidate.anchorX < width / 2 ? "left" : "right";
}

type RailFrame = {
  availableHeight: number;
  railX: number;
  textMaxWidth: number;
  tickX: number;
  top: number;
};

function railFrame(
  side: AnnotationLabelSide,
  width: number,
  height: number,
): RailFrame {
  const geometry = ANNOTATION_RAIL_GEOMETRY;
  const top = geometry.topPadding;
  const availableHeight = Math.max(60, height - top - geometry.bottomPadding);
  const railX =
    side === "left"
      ? Math.ceil(width * geometry.railRatio)
      : Math.ceil(width * (1 - geometry.railRatio));
  const tickX =
    railX + (side === "left" ? -geometry.shoulder : geometry.shoulder);
  const textMaxWidth = Math.max(
    56,
    Math.ceil(width * geometry.railRatio) -
      geometry.labelMargin -
      geometry.shoulder -
      geometry.textGap,
  );
  return { availableHeight, railX, textMaxWidth, tickX, top };
}

/** Whether every label of a rail fits at this size, wrapping included. */
function railFits(
  items: AnnotationLabelCandidate[],
  frame: RailFrame,
  fontSize: number,
  measure: LabelTextMeasurer,
) {
  const geometry = ANNOTATION_RAIL_GEOMETRY;
  const lineHeight = lineHeightFor(fontSize);
  let total = 0;
  let tooWide = 0;
  for (const item of items) {
    const wrapped = wrapLabelText(
      item.label,
      fontSize,
      frame.textMaxWidth,
      measure,
    );
    total += wrapped.lines.length * lineHeight + geometry.minGap;
    if (
      wrapped.widest >
      frame.textMaxWidth * (1 + geometry.overflowAllowance)
    ) {
      tooWide += 1;
    }
  }
  return (
    total <= frame.availableHeight &&
    tooWide <= items.length * geometry.overflowShare
  );
}

function placeRail(
  sourceItems: AnnotationLabelCandidate[],
  side: AnnotationLabelSide,
  frame: RailFrame,
  fontSize: number,
  measure: LabelTextMeasurer,
) {
  if (sourceItems.length === 0) return [];

  const geometry = ANNOTATION_RAIL_GEOMETRY;
  const lineHeight = lineHeightFor(fontSize);
  const wrapped = new Map(
    sourceItems.map((item) => [
      item.id,
      wrapLabelText(item.label, fontSize, frame.textMaxWidth, measure).lines,
    ]),
  );
  const heightOf = (item: AnnotationLabelCandidate) =>
    wrapped.get(item.id)!.length * lineHeight;

  // Highest priority first; labels are dropped only when even the smallest
  // font cannot fit every one of them.
  const items: AnnotationLabelCandidate[] = [];
  let used = 0;
  for (const item of sourceItems
    .slice()
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))) {
    const next = used + heightOf(item) + (items.length ? geometry.minGap : 0);
    if (items.length && next > frame.availableHeight) continue;
    items.push(item);
    used = next;
  }

  const textHeight = items.reduce((sum, item) => sum + heightOf(item), 0);
  const interline =
    items.length > 1
      ? Math.floor(
          clamp(
            (frame.availableHeight - textHeight) / items.length,
            geometry.minGap,
            geometry.maxGap,
          ),
        )
      : 0;
  const totalHeight = textHeight + interline * (items.length - 1);
  const averageAnchorY =
    items.reduce((sum, item) => sum + item.anchorY, 0) / items.length;
  let currentY = clamp(
    averageAnchorY - totalHeight / 2,
    frame.top,
    frame.top + Math.max(0, frame.availableHeight - totalHeight),
  );

  // Fill slots top to bottom, each with the anchor whose leader is steepest
  // in the slot's direction, so leaders do not cross.
  const remaining = items.slice();
  const placed: PlacedAnnotationLabel[] = [];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestSlope: number | null = null;

    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index]!;
      const denominator = item.anchorX - frame.railX;
      const safeDenominator =
        Math.abs(denominator) < 0.001
          ? denominator < 0
            ? -0.001
            : 0.001
          : denominator;
      const slope =
        (item.anchorY - currentY - heightOf(item) / 2) / safeDenominator;

      if (
        bestSlope === null ||
        (side === "left" ? slope < bestSlope : slope > bestSlope)
      ) {
        bestSlope = slope;
        bestIndex = index;
      }
    }

    const [item] = remaining.splice(bestIndex, 1);
    const height = heightOf(item!);
    placed.push({
      ...item!,
      fontSize,
      height,
      lineHeight,
      lines: wrapped.get(item!.id)!,
      sideResolved: side,
      textAnchor: side === "left" ? "end" : "start",
      textMaxWidth: frame.textMaxWidth,
      textX:
        side === "left"
          ? frame.tickX - geometry.textGap
          : frame.tickX + geometry.textGap,
      thresholdX: frame.railX,
      tickX: frame.tickX,
      y: currentY,
    });

    currentY += height + interline;
  }

  return placed;
}

export function layoutAnnotationLabels(
  candidates: AnnotationLabelCandidate[],
  width: number,
  height: number,
  measure: LabelTextMeasurer = estimateTextWidth,
) {
  const geometry = ANNOTATION_RAIL_GEOMETRY;
  const rails = (["left", "right"] as const).map((side) => ({
    frame: railFrame(side, width, height),
    items: candidates.filter(
      (candidate) => resolveSide(candidate, width) === side,
    ),
    side,
  }));

  // One font size for both rails: the largest at which both fit.
  let fontSize: number = geometry.fontMin;
  for (let size = geometry.fontMax; size >= geometry.fontMin; size -= 1) {
    if (
      rails.every((rail) => railFits(rail.items, rail.frame, size, measure))
    ) {
      fontSize = size;
      break;
    }
  }

  return rails.flatMap((rail) =>
    placeRail(rail.items, rail.side, rail.frame, fontSize, measure),
  );
}
