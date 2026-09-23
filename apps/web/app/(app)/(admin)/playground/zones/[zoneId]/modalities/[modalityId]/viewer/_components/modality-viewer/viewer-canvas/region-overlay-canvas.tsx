import { Fragment, useLayoutEffect, useRef } from "react";

import type {
  ViewerAnnotation,
  ViewerAnnotationPoint,
  ViewerStructure,
} from "@/lib/playground/types";

import type {
  AnnotationFormState,
  ViewerCanvasMode,
} from "../../modality-viewer.types";
import { clamp } from "../utils";
import type { ViewerLayout } from "./helpers";

const MAX_RENDER_DIMENSION = 1400;

function traceSmoothClosedPath(
  context: CanvasRenderingContext2D,
  points: ViewerAnnotationPoint[],
  width: number,
  height: number,
) {
  if (points.length < 3) {
    return false;
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;

  context.beginPath();
  context.moveTo(
    ((last.x + first.x) / 2) * width,
    ((last.y + first.y) / 2) * height,
  );

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;

    context.quadraticCurveTo(
      current.x * width,
      current.y * height,
      ((current.x + next.x) / 2) * width,
      ((current.y + next.y) / 2) * height,
    );
  }

  context.closePath();
  return true;
}

function ensureCanvasSize(
  canvas: HTMLCanvasElement,
  viewerLayout: ViewerLayout,
) {
  const aspectRatio =
    viewerLayout.coordinateWidth / Math.max(viewerLayout.coordinateHeight, 1);
  const width = Math.max(
    256,
    Math.min(MAX_RENDER_DIMENSION, Math.round(1000 * aspectRatio)),
  );
  const height = Math.max(
    256,
    Math.min(MAX_RENDER_DIMENSION, Math.round(width / aspectRatio)),
  );

  if (canvas.width !== width) {
    canvas.width = width;
  }

  if (canvas.height !== height) {
    canvas.height = height;
  }

  return { height, width };
}

function resolveRegionColor({
  annotation,
  annotationForm,
  isSelected,
  structure,
}: {
  annotation: ViewerAnnotation;
  annotationForm: AnnotationFormState;
  isSelected: boolean;
  structure: ViewerStructure | undefined;
}) {
  if (isSelected) {
    return (
      annotationForm.overlayColorHex.trim() ||
      annotationForm.colorHex.trim() ||
      annotation.overlayColorHex ||
      annotation.colorHex ||
      structure?.colorHex ||
      "#6468f0"
    );
  }

  return (
    annotation.overlayColorHex ||
    annotation.colorHex ||
    structure?.colorHex ||
    "#6468f0"
  );
}

type ViewerRegionOverlayCanvasProps = {
  annotationForm: AnnotationFormState;
  canvasMode: ViewerCanvasMode;
  editorMode: boolean;
  hoveredAnnotationId: string | null;
  overlayOpacity: number;
  selectedAnnotationId: string | null;
  structuresById: Map<string, ViewerStructure>;
  viewerLayout: ViewerLayout;
  visibleAnnotations: ViewerAnnotation[];
};

/**
 * Draws saved anatomical regions as a flattened raster overlay.
 *
 * The base region layer and active-highlight layer are intentionally separate:
 * hovering a label only repaints the small active canvas, not every region.
 * This keeps pointer movement cheap even on slices with many anatomical areas.
 */
export function ViewerRegionOverlayCanvas({
  annotationForm,
  canvasMode,
  editorMode,
  hoveredAnnotationId,
  overlayOpacity,
  selectedAnnotationId,
  structuresById,
  viewerLayout,
  visibleAnnotations,
}: ViewerRegionOverlayCanvasProps) {
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorLayerRef = useRef<HTMLCanvasElement | null>(null);
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeMaskRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const canvas = baseCanvasRef.current;

    if (!canvas) {
      return;
    }

    const { height, width } = ensureCanvasSize(canvas, viewerLayout);
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, width, height);

    let colorLayer = colorLayerRef.current;
    if (!colorLayer) {
      colorLayer = document.createElement("canvas");
      colorLayerRef.current = colorLayer;
    }
    if (colorLayer.width !== width) {
      colorLayer.width = width;
    }
    if (colorLayer.height !== height) {
      colorLayer.height = height;
    }

    const colorContext = colorLayer.getContext("2d");
    if (!colorContext) {
      return;
    }

    colorContext.clearRect(0, 0, width, height);
    colorContext.globalAlpha = 1;
    colorContext.globalCompositeOperation = "screen";

    let maximumOpacity = 0;

    for (const annotation of visibleAnnotations) {
      const isSelected = annotation.id === selectedAnnotationId;
      const polygonPoints = isSelected
        ? annotationForm.polygonPoints
        : annotation.polygonPoints;

      if (polygonPoints.length < 3) {
        continue;
      }

      // During a live admin brush stroke, the selected region is provided by
      // the existing mask preview. Other saved regions stay underneath it.
      if (canvasMode === "draw-region" && isSelected) {
        continue;
      }

      const structure = structuresById.get(annotation.structureId);
      const color = resolveRegionColor({
        annotation,
        annotationForm,
        isSelected,
        structure,
      });
      const annotationOpacity = isSelected
        ? annotationForm.overlayOpacity
        : annotation.overlayOpacity;

      maximumOpacity = Math.max(maximumOpacity, annotationOpacity);

      if (!traceSmoothClosedPath(colorContext, polygonPoints, width, height)) {
        continue;
      }

      colorContext.fillStyle = color;
      colorContext.fill();
    }

    if (maximumOpacity <= 0) {
      return;
    }

    // Resolve region overlap before transparency is applied. This prevents the
    // darker/brighter "stacked acetate" effect of multiple translucent SVGs.
    context.save();
    context.globalAlpha = clamp(maximumOpacity * overlayOpacity, 0, 0.92);
    context.globalCompositeOperation = "source-over";
    context.drawImage(colorLayer, 0, 0);
    context.restore();
  }, [
    annotationForm.colorHex,
    annotationForm.overlayColorHex,
    annotationForm.overlayOpacity,
    annotationForm.polygonPoints,
    canvasMode,
    overlayOpacity,
    selectedAnnotationId,
    structuresById,
    viewerLayout,
    visibleAnnotations,
  ]);

  useLayoutEffect(() => {
    const canvas = activeCanvasRef.current;

    if (!canvas) {
      return;
    }

    const { height, width } = ensureCanvasSize(canvas, viewerLayout);
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, width, height);

    const activeId =
      hoveredAnnotationId ?? (editorMode ? null : selectedAnnotationId);
    const activeAnnotation = activeId
      ? visibleAnnotations.find((annotation) => annotation.id === activeId)
      : null;

    if (!activeAnnotation) {
      return;
    }

    const activeIsSelected = activeAnnotation.id === selectedAnnotationId;
    const activePolygon = activeIsSelected
      ? annotationForm.polygonPoints
      : activeAnnotation.polygonPoints;

    if (
      activePolygon.length < 3 ||
      (canvasMode === "draw-region" && activeIsSelected)
    ) {
      return;
    }

    let activeMask = activeMaskRef.current;
    if (!activeMask) {
      activeMask = document.createElement("canvas");
      activeMaskRef.current = activeMask;
    }
    if (activeMask.width !== width) {
      activeMask.width = width;
    }
    if (activeMask.height !== height) {
      activeMask.height = height;
    }

    const activeContext = activeMask.getContext("2d");
    if (!activeContext) {
      return;
    }

    activeContext.clearRect(0, 0, width, height);
    if (!traceSmoothClosedPath(activeContext, activePolygon, width, height)) {
      return;
    }

    const structure = structuresById.get(activeAnnotation.structureId);
    const activeColor = resolveRegionColor({
      annotation: activeAnnotation,
      annotationForm,
      isSelected: activeIsSelected,
      structure,
    });

    activeContext.fillStyle = activeColor;
    activeContext.fill();

    // Match the final visible segmentation at overlaps. A region later in the
    // annotation stack hides the covered portion of this active mask, so hover
    // never re-introduces an overlap that the flattened base layer removed.
    const activeIndex = visibleAnnotations.findIndex(
      (annotation) => annotation.id === activeAnnotation.id,
    );
    if (activeIndex >= 0) {
      activeContext.globalCompositeOperation = "destination-out";
      for (let index = activeIndex + 1; index < visibleAnnotations.length; index += 1) {
        const occluder = visibleAnnotations[index]!;
        const occluderIsSelected = occluder.id === selectedAnnotationId;
        const occluderPolygon = occluderIsSelected
          ? annotationForm.polygonPoints
          : occluder.polygonPoints;

        if (occluderPolygon.length < 3) {
          continue;
        }

        if (
          traceSmoothClosedPath(
            activeContext,
            occluderPolygon,
            width,
            height,
          )
        ) {
          activeContext.fillStyle = "#000000";
          activeContext.fill();
        }
      }
      activeContext.globalCompositeOperation = "source-over";
    }

    // Keep the selected/hovered area soft. The persistent rail label and leader
    // communicate focus; a hard polygon stroke would expose drawing artifacts.
    context.save();
    context.globalCompositeOperation = "screen";
    context.globalAlpha = 0.14;
    context.filter = "blur(7px)";
    context.drawImage(activeMask, 0, 0);
    context.filter = "none";
    context.globalAlpha = 0.1;
    context.drawImage(activeMask, 0, 0);
    context.restore();
  }, [
    annotationForm.colorHex,
    annotationForm.overlayColorHex,
    annotationForm.polygonPoints,
    canvasMode,
    editorMode,
    hoveredAnnotationId,
    selectedAnnotationId,
    structuresById,
    viewerLayout,
    visibleAnnotations,
  ]);

  return (
    <Fragment>
      <canvas
        ref={baseCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <canvas
        ref={activeCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </Fragment>
  );
}
