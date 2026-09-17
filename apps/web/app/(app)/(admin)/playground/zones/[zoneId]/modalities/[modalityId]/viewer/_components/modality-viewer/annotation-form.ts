import type {
  ViewerAnnotation,
  ViewerAnnotationPoint,
} from "@/lib/playground/types";

import {
  DEFAULT_ANNOTATION_COLOR,
  EMPTY_ANNOTATION_FORM,
  type AnnotationFormState,
} from "../modality-viewer.types";
import { toColorInputValue } from "./right-panel/utils";
import { clamp, createDefaultLabelX } from "./utils";

const ANNOTATION_EQUALITY_EPSILON = 0.0005;

export function buildAnnotationFormState({
  annotation,
  fallbackColor,
}: {
  annotation: ViewerAnnotation | null;
  fallbackColor: string;
}): AnnotationFormState {
  const resolvedColor = toColorInputValue(annotation?.colorHex, fallbackColor);

  return {
    anchorX: annotation?.anchorX ?? EMPTY_ANNOTATION_FORM.anchorX,
    anchorY: annotation?.anchorY ?? EMPTY_ANNOTATION_FORM.anchorY,
    colorHex: resolvedColor,
    labelX: annotation?.labelX ?? EMPTY_ANNOTATION_FORM.labelX,
    labelY: annotation?.labelY ?? EMPTY_ANNOTATION_FORM.labelY,
    leaderColorHex: toColorInputValue(
      annotation?.leaderColorHex,
      resolvedColor,
    ),
    overlayColorHex: toColorInputValue(
      annotation?.overlayColorHex,
      resolvedColor,
    ),
    overlayOpacity:
      annotation?.overlayOpacity ?? EMPTY_ANNOTATION_FORM.overlayOpacity,
    polygonPoints: annotation?.polygonPoints ?? [],
  };
}

export function areAnnotationPointsEqual(
  left: ViewerAnnotationPoint[],
  right: ViewerAnnotationPoint[],
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((point, index) => {
    const other = right[index];

    if (!other) {
      return false;
    }

    return (
      Math.abs(point.x - other.x) <= ANNOTATION_EQUALITY_EPSILON &&
      Math.abs(point.y - other.y) <= ANNOTATION_EQUALITY_EPSILON
    );
  });
}

export function areAnnotationFormsEqual(
  left: AnnotationFormState,
  right: AnnotationFormState,
) {
  return (
    Math.abs(left.anchorX - right.anchorX) <= ANNOTATION_EQUALITY_EPSILON &&
    Math.abs(left.anchorY - right.anchorY) <= ANNOTATION_EQUALITY_EPSILON &&
    toColorInputValue(left.colorHex, DEFAULT_ANNOTATION_COLOR).toLowerCase() ===
      toColorInputValue(right.colorHex, DEFAULT_ANNOTATION_COLOR).toLowerCase() &&
    Math.abs(left.labelX - right.labelX) <= ANNOTATION_EQUALITY_EPSILON &&
    Math.abs(left.labelY - right.labelY) <= ANNOTATION_EQUALITY_EPSILON &&
    toColorInputValue(
      left.leaderColorHex,
      DEFAULT_ANNOTATION_COLOR,
    ).toLowerCase() ===
      toColorInputValue(
        right.leaderColorHex,
        DEFAULT_ANNOTATION_COLOR,
      ).toLowerCase() &&
    toColorInputValue(
      left.overlayColorHex,
      DEFAULT_ANNOTATION_COLOR,
    ).toLowerCase() ===
      toColorInputValue(
        right.overlayColorHex,
        DEFAULT_ANNOTATION_COLOR,
      ).toLowerCase() &&
    Math.abs(left.overlayOpacity - right.overlayOpacity) <=
      ANNOTATION_EQUALITY_EPSILON &&
    areAnnotationPointsEqual(left.polygonPoints, right.polygonPoints)
  );
}

export function moveAnnotationPolygonPoint(
  form: AnnotationFormState,
  index: number,
  point: ViewerAnnotationPoint,
) {
  if (index < 0 || index >= form.polygonPoints.length) {
    return form;
  }

  const polygonPoints = [...form.polygonPoints];
  polygonPoints[index] = point;

  return {
    ...form,
    polygonPoints,
  };
}

export function replaceAnnotationPolygon(
  form: AnnotationFormState,
  points: ViewerAnnotationPoint[],
  preserveGeometry: boolean,
) {
  if (points.length < 3 || preserveGeometry) {
    return {
      ...form,
      polygonPoints: points,
    };
  }

  const { sumX, sumY } = points.reduce(
    (accumulator, point) => ({
      sumX: accumulator.sumX + point.x,
      sumY: accumulator.sumY + point.y,
    }),
    { sumX: 0, sumY: 0 },
  );
  const anchorX = clamp(sumX / points.length, 0.03, 0.97);
  const anchorY = clamp(sumY / points.length, 0.03, 0.97);

  return {
    ...form,
    anchorX,
    anchorY,
    labelX: createDefaultLabelX(anchorX),
    labelY: clamp(anchorY, 0.08, 0.92),
    polygonPoints: points,
  };
}
