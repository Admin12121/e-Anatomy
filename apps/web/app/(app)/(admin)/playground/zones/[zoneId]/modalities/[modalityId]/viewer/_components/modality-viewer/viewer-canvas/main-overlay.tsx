import type { MutableRefObject } from "react";

import type {
  ViewerAnnotation,
  ViewerAnnotationPoint,
  ViewerStructure,
} from "@/lib/playground/types";

import {
  DEFAULT_ANNOTATION_COLOR,
  type AnnotationFormState,
  type ViewerCanvasMode,
} from "../../modality-viewer.types";
import type { ViewerLayout } from "./helpers";

type AnchorDragState = {
  annotationId: string;
  pointerId: number;
};

type ResolvePointerPointInput = {
  clientX: number;
  clientY: number;
  currentTarget: SVGSVGElement;
};

type ViewerCanvasMainOverlayProps = {
  activeAreaCursorRadius: number;
  annotationEditingEnabled: boolean;
  annotationForm: AnnotationFormState;
  areaPaintPreviewActive: boolean;
  areaEditTool: "brush" | "erase";
  areaToolCursorPoint: ViewerAnnotationPoint | null;
  canvasMode: ViewerCanvasMode;
  disconnectedOverlayColor: string;
  draftDisconnectedPolygons: ViewerAnnotationPoint[][];
  draftPointerColor: string;
  draggingAnchorRef: MutableRefObject<AnchorDragState | null>;
  editLockEnabled: boolean;
  isAreaPaintMode: boolean;
  onAnnotationHover: (annotationId: string | null) => void;
  onAnnotationSelect: (annotationId: string, structureId: string) => void;
  onDraftAnchorMove: (point: ViewerAnnotationPoint) => void;
  overlayOpacity: number;
  resolvePointerPoint: (
    event: ResolvePointerPointInput,
  ) => ViewerAnnotationPoint;
  selectedAnnotationId: string | null;
  showCrossReferences: boolean;
  showDraftPointer: boolean;
  showPointerMarkers: boolean;
  supplementalPointerMarkers: Array<{
    color: string;
    point: ViewerAnnotationPoint;
  }>;
  structuresById: Map<string, ViewerStructure>;
  viewerLayout: ViewerLayout;
  visibleAnnotations: ViewerAnnotation[];
};

export function pointsToSmoothClosedPath(
  points: ViewerAnnotationPoint[],
  coordinateWidth: number,
  coordinateHeight: number,
) {
  if (points.length < 3) {
    return "";
  }

  const scaledPoints = points.map((point) => ({
    x: point.x * coordinateWidth,
    y: point.y * coordinateHeight,
  }));
  const firstPoint = scaledPoints[0]!;
  const secondPoint = scaledPoints[1]!;
  const start = {
    x: (firstPoint.x + secondPoint.x) / 2,
    y: (firstPoint.y + secondPoint.y) / 2,
  };
  const commands = [`M ${start.x} ${start.y}`];

  for (let index = 1; index <= scaledPoints.length; index += 1) {
    const controlPoint = scaledPoints[index % scaledPoints.length]!;
    const nextPoint = scaledPoints[(index + 1) % scaledPoints.length]!;
    const endPoint = {
      x: (controlPoint.x + nextPoint.x) / 2,
      y: (controlPoint.y + nextPoint.y) / 2,
    };

    commands.push(
      `Q ${controlPoint.x} ${controlPoint.y} ${endPoint.x} ${endPoint.y}`,
    );
  }

  commands.push("Z");
  return commands.join(" ");
}

export function ViewerCanvasMainOverlay({
  activeAreaCursorRadius,
  annotationEditingEnabled,
  annotationForm,
  areaPaintPreviewActive,
  areaEditTool,
  areaToolCursorPoint,
  canvasMode,
  disconnectedOverlayColor,
  draftDisconnectedPolygons,
  draftPointerColor,
  draggingAnchorRef,
  editLockEnabled,
  isAreaPaintMode,
  onAnnotationHover,
  onAnnotationSelect,
  onDraftAnchorMove,
  overlayOpacity,
  resolvePointerPoint,
  selectedAnnotationId,
  showCrossReferences,
  showDraftPointer,
  showPointerMarkers,
  supplementalPointerMarkers,
  structuresById,
  viewerLayout,
  visibleAnnotations,
}: ViewerCanvasMainOverlayProps) {
  const canvasUnitsPerScreenPixel =
    viewerLayout.coordinateHeight /
    Math.max(viewerLayout.surfaceHeight, 1);
  const overlayPreview =
    canvasMode !== "browse" && !areaPaintPreviewActive
      ? pointsToSmoothClosedPath(
          annotationForm.polygonPoints,
          viewerLayout.coordinateWidth,
          viewerLayout.coordinateHeight,
        )
      : null;

  return (
    <>
      {visibleAnnotations.map((annotation) => {
        const structure = structuresById.get(annotation.structureId);
        if (!structure) {
          return null;
        }

        const isSelected = annotation.id === selectedAnnotationId;
        const interactionBlocked = editLockEnabled
          ? selectedAnnotationId
            ? !isSelected
            : true
          : false;
        const polygonPoints = isSelected
          ? annotationForm.polygonPoints
          : annotation.polygonPoints;
        const isRegion = polygonPoints.length >= 3;
        const anchorX = isSelected
          ? annotationForm.anchorX
          : annotation.anchorX;
        const anchorY = isSelected
          ? annotationForm.anchorY
          : annotation.anchorY;
        const color =
          (isSelected
            ? annotationForm.colorHex.trim() || structure.colorHex
            : structure.colorHex) || DEFAULT_ANNOTATION_COLOR;
        const canDragAnchor =
          annotationEditingEnabled &&
          isSelected &&
          !isRegion &&
          !interactionBlocked &&
          canvasMode === "set-anchor";

        return (
          <g
            key={annotation.id}
            style={{
              pointerEvents: interactionBlocked ? "none" : undefined,
            }}
            onMouseEnter={() => {
              if (!interactionBlocked) {
                onAnnotationHover(annotation.id);
              }
            }}
            onMouseLeave={() => {
              if (!interactionBlocked) {
                onAnnotationHover(null);
              }
            }}
            onClick={(event) => {
              if (interactionBlocked) {
                return;
              }

              event.stopPropagation();
              onAnnotationSelect(annotation.id, annotation.structureId);
            }}
          >
            {isRegion ? (
              <path
                d={pointsToSmoothClosedPath(
                  polygonPoints,
                  viewerLayout.coordinateWidth,
                  viewerLayout.coordinateHeight,
                )}
                fill="rgba(0,0,0,0.001)"
                pointerEvents="all"
              />
            ) : (
              <circle
                cx={anchorX * viewerLayout.coordinateWidth}
                cy={anchorY * viewerLayout.coordinateHeight}
                fill="rgba(0,0,0,0.001)"
                pointerEvents="all"
                r={Math.max(10, 10 * canvasUnitsPerScreenPixel)}
              />
            )}

            {showPointerMarkers && !isRegion && !canDragAnchor ? (
              <circle
                cx={anchorX * viewerLayout.coordinateWidth}
                cy={anchorY * viewerLayout.coordinateHeight}
                fill={color}
                pointerEvents="none"
                r={3.2 * canvasUnitsPerScreenPixel}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={1.15 * canvasUnitsPerScreenPixel}
              />
            ) : null}

            {canDragAnchor ? (
              <circle
                className="cursor-move"
                cx={anchorX * viewerLayout.coordinateWidth}
                cy={anchorY * viewerLayout.coordinateHeight}
                fill={color}
                r={7 * canvasUnitsPerScreenPixel}
                stroke="rgba(255,255,255,0.82)"
                strokeWidth={1.4 * canvasUnitsPerScreenPixel}
                onPointerDown={(event) => {
                  const svg = event.currentTarget.ownerSVGElement;
                  if (!svg) {
                    return;
                  }

                  event.stopPropagation();
                  draggingAnchorRef.current = {
                    annotationId: annotation.id,
                    pointerId: event.pointerId,
                  };
                  svg.setPointerCapture(event.pointerId);
                  onDraftAnchorMove(
                    resolvePointerPoint({
                      clientX: event.clientX,
                      clientY: event.clientY,
                      currentTarget: svg,
                    }),
                  );
                }}
              />
            ) : null}
          </g>
        );
      })}

      {supplementalPointerMarkers.map((marker, markerIndex) => (
        <circle
          key={`supplemental-pointer-${markerIndex}`}
          cx={marker.point.x * viewerLayout.coordinateWidth}
          cy={marker.point.y * viewerLayout.coordinateHeight}
          fill={marker.color}
          pointerEvents="none"
          r={3.2 * canvasUnitsPerScreenPixel}
          stroke="rgba(255,255,255,0.92)"
          strokeWidth={1.15 * canvasUnitsPerScreenPixel}
        />
      ))}

      {showDraftPointer ? (
        <circle
          className={
            annotationEditingEnabled && canvasMode === "set-anchor"
              ? "cursor-move"
              : undefined
          }
          cx={annotationForm.anchorX * viewerLayout.coordinateWidth}
          cy={annotationForm.anchorY * viewerLayout.coordinateHeight}
          fill={draftPointerColor}
          r={7 * canvasUnitsPerScreenPixel}
          stroke="rgba(255,255,255,0.92)"
          strokeWidth={1.4 * canvasUnitsPerScreenPixel}
          onPointerDown={(event) => {
            if (!annotationEditingEnabled || canvasMode !== "set-anchor") {
              return;
            }

            const svg = event.currentTarget.ownerSVGElement;
            if (!svg) {
              return;
            }

            event.stopPropagation();
            draggingAnchorRef.current = {
              annotationId: "__draft__",
              pointerId: event.pointerId,
            };
            svg.setPointerCapture(event.pointerId);
            onDraftAnchorMove(
              resolvePointerPoint({
                clientX: event.clientX,
                clientY: event.clientY,
                currentTarget: svg,
              }),
            );
          }}
        />
      ) : null}

      {overlayPreview ? (
        <path
          d={overlayPreview}
          fill={
            annotationForm.overlayColorHex.trim() ||
            annotationForm.colorHex.trim() ||
            DEFAULT_ANNOTATION_COLOR
          }
          fillOpacity={annotationForm.overlayOpacity * overlayOpacity}
        />
      ) : null}

      {canvasMode === "draw-region" && !areaPaintPreviewActive
        ? draftDisconnectedPolygons.map((polygonPoints, polygonIndex) => {
            if (polygonPoints.length < 3) {
              return null;
            }

            return (
              <path
                d={pointsToSmoothClosedPath(
                  polygonPoints,
                  viewerLayout.coordinateWidth,
                  viewerLayout.coordinateHeight,
                )}
                key={`draft-disconnected-${polygonIndex}`}
                fill={disconnectedOverlayColor}
                fillOpacity={annotationForm.overlayOpacity * overlayOpacity}
              />
            );
          })
        : null}

      {isAreaPaintMode && areaToolCursorPoint ? (
        <circle
          cx={areaToolCursorPoint.x * viewerLayout.coordinateWidth}
          cy={areaToolCursorPoint.y * viewerLayout.coordinateHeight}
          fill={
            areaEditTool === "erase"
              ? "rgba(248,113,113,0.14)"
              : "rgba(34,211,238,0.14)"
          }
          pointerEvents="none"
          r={activeAreaCursorRadius * viewerLayout.coordinateHeight}
        />
      ) : null}

      {showCrossReferences ? (
        <>
          <line
            stroke="rgb(17 107 207)"
            strokeWidth={2}
            x1={viewerLayout.coordinateWidth / 2}
            x2={viewerLayout.coordinateWidth / 2}
            y1={0}
            y2={viewerLayout.coordinateHeight}
          />
          <line
            stroke="rgb(17 107 207)"
            strokeWidth={2}
            x1={0}
            x2={viewerLayout.coordinateWidth}
            y1={viewerLayout.coordinateHeight / 2}
            y2={viewerLayout.coordinateHeight / 2}
          />
        </>
      ) : null}
    </>
  );
}
