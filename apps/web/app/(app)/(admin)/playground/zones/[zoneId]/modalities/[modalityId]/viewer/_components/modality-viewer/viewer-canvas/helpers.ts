import type { ViewerAnnotationPoint } from "@/lib/playground/types";

import { clamp } from "../utils";

export const MIN_AREA_STROKE_STEP = 0.0025;
export const MAX_AREA_STROKE_STEP = 0.028;
export const MIN_AREA_RADIUS = 0.004;
export const MAX_AREA_RADIUS = 0.16;
export const AREA_MASK_RESOLUTION = 512;
export const AREA_MASK_ALPHA_THRESHOLD = 12;
export const AREA_MIN_COMPONENT_AREA = 0.00005;
export const AREA_MAX_POLYGON_POINTS = 960;
export const MIN_ZOOM_SCALE = 0.2;
export const MAX_ZOOM_SCALE = 6;
export const LABEL_SAFE_MIN_Y = 0.1;
export const LABEL_SAFE_MAX_Y = 0.9;
export const MAIN_LABEL_BASE_OFFSET_PX = 112;
export const MAIN_LABEL_OFFSET_MIN_PX = 76;
export const MAIN_LABEL_OFFSET_MAX_PX = 172;
export const MAIN_LABEL_BAND_MIN_GAP_PX = 24;
export const LABEL_ROW_GAP_PX = 28;
export const LABEL_BOX_MIN_WIDTH = 46;
export const LABEL_BOX_MAX_WIDTH = 180;
export const LABEL_BOX_PADDING_X = 10;
export const LABEL_BOX_HEIGHT_PADDING = 10;
export const VIEWER_ANNOTATION_INTERACTION_ATTRIBUTE =
  "data-viewer-annotation-interaction";
export const VIEWER_ANNOTATION_INTERACTION_PROPS = {
  [VIEWER_ANNOTATION_INTERACTION_ATTRIBUTE]: "",
} as const;

const VIEWER_COORDINATE_HEIGHT = 1000;
const VIEWER_LABEL_SCALE_MIN = 0.65;
const VIEWER_LABEL_GUTTER_MIN_PX = 88;
const VIEWER_LABEL_GUTTER_MAX_PX = 210;
const VIEWER_IMAGE_MIN_WIDTH_PX = 96;

type DimensionCandidate = {
  height: number | null | undefined;
  width: number | null | undefined;
};

export type ViewerLayout = {
  boundsBottom: number;
  boundsHeight: number;
  boundsLeft: number;
  boundsRight: number;
  boundsTop: number;
  boundsWidth: number;
  coordinateHeight: number;
  coordinateWidth: number;
  fontSize: number;
  labelBaseOffset: number;
  labelBoxHeightPadding: number;
  labelBoxMaxWidth: number;
  labelBoxMinWidth: number;
  labelBoxPaddingX: number;
  labelGutter: number;
  labelOffsetMax: number;
  labelOffsetMin: number;
  labelRowGap: number;
  labelScale: number;
  stagePadding: number;
  surfaceHeight: number;
  surfaceWidth: number;
};

export type ViewerLayoutInput = {
  fitScaleCap?: number | null;
  imageHeight: number;
  imageWidth: number;
  reserveLabelSpace: boolean;
  rotationQuarterTurns: number;
  stageHeight: number;
  stageWidth: number;
};

type AnnotationFocusInput = {
  annotationId: string;
  hoveredId: string | null;
  selectedId: string | null;
};

type AnnotationHoverIntentOptions = {
  bridgeMs: number;
  cancel: (handle: number) => void;
  dwellMs: number;
  onChange: (annotationId: string | null) => void;
  schedule: (callback: () => void, delay: number) => number;
};

export type AnnotationHoverIntent = {
  dismiss: () => void;
  dispose: () => void;
  enter: (annotationId: string, pointerType?: string) => void;
  leave: () => void;
};

export type AnnotationDetailsSurface = "mpr-drawer" | "study-panel";

export function isViewerAnnotationInteractionTarget(target: unknown): boolean {
  if (!target || typeof target !== "object" || !("closest" in target)) {
    return false;
  }

  const closest = target.closest;

  if (typeof closest !== "function") {
    return false;
  }

  return Boolean(
    closest.call(
      target,
      `[${VIEWER_ANNOTATION_INTERACTION_ATTRIBUTE}]`,
    ),
  );
}

export function resolveAnnotationDetailsSurface({
  isMprViewer,
  readOnly,
}: {
  isMprViewer: boolean;
  readOnly: boolean;
}): AnnotationDetailsSurface | null {
  if (!isMprViewer) {
    return "study-panel";
  }

  return readOnly ? "mpr-drawer" : null;
}

export function createAnnotationHoverIntent({
  bridgeMs,
  cancel,
  dwellMs,
  onChange,
  schedule,
}: AnnotationHoverIntentOptions): AnnotationHoverIntent {
  let activeAnnotationId: string | null = null;
  let pendingAnnotationId: string | null = null;
  let dwellHandle: number | null = null;
  let leaveHandle: number | null = null;

  const cancelDwell = () => {
    if (dwellHandle !== null) cancel(dwellHandle);
    dwellHandle = null;
    pendingAnnotationId = null;
  };
  const cancelLeave = () => {
    if (leaveHandle !== null) cancel(leaveHandle);
    leaveHandle = null;
  };
  const dismiss = () => {
    cancelDwell();
    cancelLeave();

    if (activeAnnotationId !== null) {
      activeAnnotationId = null;
      onChange(null);
    }
  };

  return {
    dismiss,
    dispose: () => {
      cancelDwell();
      cancelLeave();
      activeAnnotationId = null;
    },
    enter: (annotationId, pointerType) => {
      if (pointerType === "touch") {
        dismiss();
        return;
      }

      cancelLeave();

      if (
        annotationId === activeAnnotationId ||
        annotationId === pendingAnnotationId
      ) {
        return;
      }

      cancelDwell();
      if (activeAnnotationId !== null) {
        activeAnnotationId = null;
        onChange(null);
      }

      pendingAnnotationId = annotationId;
      dwellHandle = schedule(() => {
        dwellHandle = null;
        if (pendingAnnotationId !== annotationId) return;

        pendingAnnotationId = null;
        activeAnnotationId = annotationId;
        onChange(annotationId);
      }, dwellMs);
    },
    leave: () => {
      cancelDwell();
      cancelLeave();

      if (activeAnnotationId === null) return;

      leaveHandle = schedule(() => {
        leaveHandle = null;
        if (activeAnnotationId === null) return;

        activeAnnotationId = null;
        onChange(null);
      }, bridgeMs);
    },
  };
}

function isValidDimension(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function resolveViewerImageDimensions(
  candidates: DimensionCandidate[],
): { height: number; width: number } | null {
  for (const candidate of candidates) {
    if (
      isValidDimension(candidate.width) &&
      isValidDimension(candidate.height)
    ) {
      return {
        height: candidate.height,
        width: candidate.width,
      };
    }
  }

  return null;
}

export function getAnnotationFocusOpacity({
  annotationId,
  hoveredId,
  selectedId,
}: AnnotationFocusInput) {
  if (!hoveredId || annotationId === hoveredId || annotationId === selectedId) {
    return 1;
  }

  return 0.28;
}

export function calculateViewerLayout({
  fitScaleCap,
  imageHeight,
  imageWidth,
  reserveLabelSpace,
  rotationQuarterTurns,
  stageHeight,
  stageWidth,
}: ViewerLayoutInput): ViewerLayout {
  const safeStageWidth = isValidDimension(stageWidth) ? stageWidth : 1;
  const safeStageHeight = isValidDimension(stageHeight) ? stageHeight : 1;
  const safeImageWidth = isValidDimension(imageWidth) ? imageWidth : 1;
  const safeImageHeight = isValidDimension(imageHeight) ? imageHeight : 1;
  const stagePadding = clamp(
    Math.min(safeStageWidth, safeStageHeight) * 0.035,
    12,
    32,
  );
  const labelScale = clamp(
    Math.min(safeStageWidth / 1200, safeStageHeight / 760),
    VIEWER_LABEL_SCALE_MIN,
    1,
  );
  const innerWidth = Math.max(safeStageWidth - stagePadding * 2, 1);
  const innerHeight = Math.max(safeStageHeight - stagePadding * 2, 1);
  const minimumImageWidth = Math.min(
    180,
    Math.max(VIEWER_IMAGE_MIN_WIDTH_PX, innerWidth * 0.35),
  );
  const maximumGutter = Math.max((innerWidth - minimumImageWidth) / 2, 0);
  const desiredGutter = clamp(
    safeStageWidth * 0.18,
    VIEWER_LABEL_GUTTER_MIN_PX,
    VIEWER_LABEL_GUTTER_MAX_PX,
  );
  const labelGutter = reserveLabelSpace
    ? Math.min(desiredGutter, maximumGutter)
    : 0;
  const availableWidth = Math.max(innerWidth - labelGutter * 2, 1);
  const availableHeight = innerHeight;
  const normalizedRotation = ((rotationQuarterTurns % 4) + 4) % 4;
  const rotatedByQuarterTurn = normalizedRotation % 2 === 1;
  const effectiveWidth = rotatedByQuarterTurn
    ? safeImageHeight
    : safeImageWidth;
  const effectiveHeight = rotatedByQuarterTurn
    ? safeImageWidth
    : safeImageHeight;
  const uncappedFitScale = Math.min(
    availableWidth / effectiveWidth,
    availableHeight / effectiveHeight,
  );
  const fitScale = isValidDimension(fitScaleCap)
    ? Math.min(uncappedFitScale, fitScaleCap)
    : uncappedFitScale;
  const surfaceWidth = safeImageWidth * fitScale;
  const surfaceHeight = safeImageHeight * fitScale;
  const boundsWidth = rotatedByQuarterTurn ? surfaceHeight : surfaceWidth;
  const boundsHeight = rotatedByQuarterTurn ? surfaceWidth : surfaceHeight;
  const boundsLeft = (safeStageWidth - boundsWidth) / 2;
  const boundsTop = (safeStageHeight - boundsHeight) / 2;
  const responsiveLabelBoxMaxWidth = LABEL_BOX_MAX_WIDTH * labelScale;
  const availableLabelBoxWidth = reserveLabelSpace
    ? Math.max(
        76,
        labelGutter + stagePadding - LABEL_BOX_PADDING_X * 1.6,
      )
    : responsiveLabelBoxMaxWidth;
  const labelBoxMaxWidth = Math.min(
    responsiveLabelBoxMaxWidth,
    availableLabelBoxWidth,
  );

  return {
    boundsBottom: boundsTop + boundsHeight,
    boundsHeight,
    boundsLeft,
    boundsRight: boundsLeft + boundsWidth,
    boundsTop,
    boundsWidth,
    coordinateHeight: VIEWER_COORDINATE_HEIGHT,
    coordinateWidth:
      VIEWER_COORDINATE_HEIGHT * (safeImageWidth / safeImageHeight),
    fontSize: 18 * labelScale,
    labelBaseOffset: MAIN_LABEL_BASE_OFFSET_PX * labelScale,
    labelBoxHeightPadding: LABEL_BOX_HEIGHT_PADDING * labelScale,
    labelBoxMaxWidth,
    labelBoxMinWidth: LABEL_BOX_MIN_WIDTH * labelScale,
    labelBoxPaddingX: LABEL_BOX_PADDING_X * labelScale,
    labelGutter,
    labelOffsetMax: MAIN_LABEL_OFFSET_MAX_PX * labelScale,
    labelOffsetMin: MAIN_LABEL_OFFSET_MIN_PX * labelScale,
    labelRowGap: LABEL_ROW_GAP_PX * labelScale,
    labelScale,
    stagePadding,
    surfaceHeight,
    surfaceWidth,
  };
}

export type LabelSide = "left" | "right";

export type ArrangedLabel = {
  anchorX: number;
  anchorY: number;
  side: LabelSide;
  textAnchor: "start" | "end";
  textX: number;
  y: number;
};

type MaskGridNode = {
  x: number;
  y: number;
};

type MaskEdge = {
  edgeKey: string;
  end: MaskGridNode;
};

export function distributeLabelRows(
  targets: number[],
  minimum: number,
  maximum: number,
  gap: number,
) {
  if (targets.length === 0) {
    return [];
  }

  const rows = targets.map((target) => clamp(target, minimum, maximum));

  for (let index = 1; index < rows.length; index += 1) {
    rows[index] = Math.max(rows[index]!, rows[index - 1]! + gap);
  }

  for (let index = rows.length - 2; index >= 0; index -= 1) {
    rows[index] = Math.min(rows[index]!, rows[index + 1]! - gap);
  }

  if (rows[0]! < minimum) {
    const offset = minimum - rows[0]!;
    for (let index = 0; index < rows.length; index += 1) {
      rows[index] = rows[index]! + offset;
    }
  }

  const lastIndex = rows.length - 1;
  if (rows[lastIndex]! > maximum) {
    const offset = rows[lastIndex]! - maximum;
    for (let index = 0; index < rows.length; index += 1) {
      rows[index] = rows[index]! - offset;
    }
  }

  return rows.map((row) => clamp(row, minimum, maximum));
}

function getMaskGridNodeKey(node: MaskGridNode) {
  return `${node.x},${node.y}`;
}

function getMaskEdgeKey(start: MaskGridNode, end: MaskGridNode) {
  return `${start.x},${start.y}->${end.x},${end.y}`;
}

export function getPolygonArea(points: ViewerAnnotationPoint[]) {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;

    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area / 2);
}

export function simplifyPolygon(points: ViewerAnnotationPoint[]) {
  if (points.length < 3) {
    return points;
  }

  const deduped = points.filter((point, index) => {
    const previousPoint = points[(index - 1 + points.length) % points.length]!;
    const deltaX = point.x - previousPoint.x;
    const deltaY = point.y - previousPoint.y;

    return Math.hypot(deltaX, deltaY) > 0.0005;
  });

  if (deduped.length < 3) {
    return deduped;
  }

  const compacted = deduped.filter((point, index) => {
    const previousPoint = deduped[(index - 1 + deduped.length) % deduped.length]!;
    const nextPoint = deduped[(index + 1) % deduped.length]!;
    const crossProduct =
      (point.x - previousPoint.x) * (nextPoint.y - point.y) -
      (point.y - previousPoint.y) * (nextPoint.x - point.x);

    return Math.abs(crossProduct) > 0.000001;
  });

  if (compacted.length <= AREA_MAX_POLYGON_POINTS) {
    return compacted;
  }

  const stride = Math.ceil(compacted.length / AREA_MAX_POLYGON_POINTS);

  return compacted.filter((_, index) => index % stride === 0);
}

export function smoothPolygon(points: ViewerAnnotationPoint[], passes = 2) {
  if (points.length < 4 || passes <= 0) {
    return points;
  }

  let current = points;

  for (let pass = 0; pass < passes; pass += 1) {
    current = current.map((point, index, allPoints) => {
      const previousPoint = allPoints[(index - 1 + allPoints.length) % allPoints.length]!;
      const nextPoint = allPoints[(index + 1) % allPoints.length]!;

      return {
        x: clamp(
          previousPoint.x * 0.2 + point.x * 0.6 + nextPoint.x * 0.2,
          0,
          1,
        ),
        y: clamp(
          previousPoint.y * 0.2 + point.y * 0.6 + nextPoint.y * 0.2,
          0,
          1,
        ),
      };
    });
  }

  return current;
}

export function extractPolygonsFromMask(
  alphaChannel: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const isFilledPixel = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return false;
    }

    return alphaChannel[(y * width + x) * 4 + 3] >= AREA_MASK_ALPHA_THRESHOLD;
  };

  const outgoingEdges = new Map<string, MaskEdge[]>();

  const addEdge = (startX: number, startY: number, endX: number, endY: number) => {
    const startNode = {
      x: startX,
      y: startY,
    };
    const endNode = {
      x: endX,
      y: endY,
    };
    const startNodeKey = getMaskGridNodeKey(startNode);
    const edgeKey = getMaskEdgeKey(startNode, endNode);
    const existingEdges = outgoingEdges.get(startNodeKey) ?? [];

    if (existingEdges.some((edge) => edge.edgeKey === edgeKey)) {
      return;
    }

    existingEdges.push({
      edgeKey,
      end: endNode,
    });
    outgoingEdges.set(startNodeKey, existingEdges);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isFilledPixel(x, y)) {
        continue;
      }

      if (!isFilledPixel(x, y - 1)) {
        addEdge(x, y, x + 1, y);
      }

      if (!isFilledPixel(x + 1, y)) {
        addEdge(x + 1, y, x + 1, y + 1);
      }

      if (!isFilledPixel(x, y + 1)) {
        addEdge(x + 1, y + 1, x, y + 1);
      }

      if (!isFilledPixel(x - 1, y)) {
        addEdge(x, y + 1, x, y);
      }
    }
  }

  if (outgoingEdges.size === 0) {
    return [];
  }

  const visitedEdges = new Set<string>();
  const loops: ViewerAnnotationPoint[][] = [];

  for (const [startNodeKey, edges] of outgoingEdges.entries()) {
    const [startX, startY] = startNodeKey.split(",").map((value) => Number(value));
    const startNode = {
      x: startX,
      y: startY,
    };

    for (const firstEdge of edges) {
      if (visitedEdges.has(firstEdge.edgeKey)) {
        continue;
      }

      const gridLoop: MaskGridNode[] = [startNode];
      visitedEdges.add(firstEdge.edgeKey);

      let currentNode = firstEdge.end;
      let guard = 0;
      const guardLimit = width * height * 6;

      while (guard <= guardLimit) {
        gridLoop.push(currentNode);

        if (currentNode.x === startNode.x && currentNode.y === startNode.y) {
          break;
        }

        const currentNodeKey = getMaskGridNodeKey(currentNode);
        const nextEdge = (outgoingEdges.get(currentNodeKey) ?? []).find(
          (candidate) => !visitedEdges.has(candidate.edgeKey),
        );

        if (!nextEdge) {
          break;
        }

        visitedEdges.add(nextEdge.edgeKey);
        currentNode = nextEdge.end;
        guard += 1;
      }

      if (gridLoop.length < 4) {
        continue;
      }

      const lastNode = gridLoop[gridLoop.length - 1]!;
      if (lastNode.x === startNode.x && lastNode.y === startNode.y) {
        gridLoop.pop();
      }

      const normalizedLoop = gridLoop.map((node) => ({
        x: clamp(node.x / width, 0, 1),
        y: clamp(node.y / height, 0, 1),
      }));

      const simplifiedLoop = simplifyPolygon(normalizedLoop);
      const smoothedLoop = simplifyPolygon(smoothPolygon(simplifiedLoop, 2));

      if (
        smoothedLoop.length >= 3 &&
        getPolygonArea(smoothedLoop) >= AREA_MIN_COMPONENT_AREA
      ) {
        loops.push(smoothedLoop);
      }
    }
  }

  if (loops.length === 0) {
    return [];
  }

  return loops.sort((left, right) => getPolygonArea(right) - getPolygonArea(left));
}
