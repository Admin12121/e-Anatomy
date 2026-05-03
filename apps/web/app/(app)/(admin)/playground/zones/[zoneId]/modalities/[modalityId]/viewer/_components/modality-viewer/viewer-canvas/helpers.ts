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
export const MAIN_LABEL_BAND_WIDTH_PX = 180;
export const MAIN_LABEL_BAND_MIN_GAP_PX = 24;
export const LABEL_ROW_GAP_PX = 28;
export const LABEL_ROW_GAP_LARGE_PX = 36;
export const LABEL_BOX_MIN_WIDTH = 46;
export const LABEL_BOX_MAX_WIDTH = 180;
export const LABEL_BOX_PADDING_X = 10;
export const LABEL_BOX_HEIGHT_PADDING = 10;

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
