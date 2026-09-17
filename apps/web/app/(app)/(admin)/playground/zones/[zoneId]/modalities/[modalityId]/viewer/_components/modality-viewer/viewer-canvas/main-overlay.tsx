import type { Dispatch, MutableRefObject, SetStateAction } from "react";

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
import { clamp } from "../utils";
import { getAnnotationFocusOpacity, type ViewerLayout } from "./helpers";

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
  draftPointerLabel: string;
  draggingAnchorRef: MutableRefObject<AnchorDragState | null>;
  draggingLabelId: string | null;
  draggingLabelRef: MutableRefObject<string | null>;
  editLockEnabled: boolean;
  fitLabelText: (
    text: string,
    fontSize: number,
    fontWeight: 500 | 700,
  ) => string;
  hoveredAnnotationId: string | null;
  isAreaPaintMode: boolean;
  measureLabelRectWidth: (
    text: string,
    fontSize: number,
    fontWeight: 500 | 700,
  ) => number;
  onAnnotationHover: (annotationId: string | null) => void;
  onAnnotationSelect: (annotationId: string, structureId: string) => void;
  onDraftAnchorMove: (point: ViewerAnnotationPoint) => void;
  onDraftLabelMove: (point: ViewerAnnotationPoint) => void;
  overlayOpacity: number;
  resolvePointerPoint: (
    event: ResolvePointerPointInput,
  ) => ViewerAnnotationPoint;
  selectedAnnotationId: string | null;
  setDraggingLabelId: Dispatch<SetStateAction<string | null>>;
  shouldAutoArrangeLabels: boolean;
  showCrossReferences: boolean;
  showDraftPointer: boolean;
  showLabels: boolean;
  structuresById: Map<string, ViewerStructure>;
  viewerLayout: ViewerLayout;
  visibleAnnotations: ViewerAnnotation[];
};

function pointsToSmoothClosedPath(
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
  draftPointerLabel,
  draggingAnchorRef,
  draggingLabelId,
  draggingLabelRef,
  editLockEnabled,
  fitLabelText,
  hoveredAnnotationId,
  isAreaPaintMode,
  measureLabelRectWidth,
  onAnnotationHover,
  onAnnotationSelect,
  onDraftAnchorMove,
  onDraftLabelMove,
  overlayOpacity,
  resolvePointerPoint,
  selectedAnnotationId,
  setDraggingLabelId,
  shouldAutoArrangeLabels,
  showCrossReferences,
  showDraftPointer,
  showLabels,
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
        const isHovered = annotation.id === hoveredAnnotationId;
        const focusOpacity = getAnnotationFocusOpacity({
          annotationId: annotation.id,
          hoveredId: hoveredAnnotationId,
          selectedId: selectedAnnotationId,
        });
        const isInteractionBlocked = editLockEnabled
          ? selectedAnnotationId
            ? !isSelected
            : true
          : false;
        const preferredAnnotationColor = isSelected
          ? annotationForm.colorHex.trim() || structure.colorHex
          : structure.colorHex;
        const color = preferredAnnotationColor || DEFAULT_ANNOTATION_COLOR;
        const anchorX = isSelected
          ? annotationForm.anchorX
          : annotation.anchorX;
        const anchorY = isSelected
          ? annotationForm.anchorY
          : annotation.anchorY;
        const labelX = isSelected ? annotationForm.labelX : annotation.labelX;
        const labelY = isSelected ? annotationForm.labelY : annotation.labelY;
        const rawLabelTextAnchor: "start" | "end" =
          labelX >= 0.5 ? "start" : "end";
        const polygonPoints = isSelected
          ? annotationForm.polygonPoints
          : annotation.polygonPoints;
        const overlayColor = isSelected
          ? annotationForm.overlayColorHex || color
          : color;
        const leaderColor = isSelected
          ? annotationForm.leaderColorHex || color
          : color;
        const polygonOpacity = isSelected
          ? annotationForm.overlayOpacity
          : annotation.overlayOpacity;
        const emphasizedOpacity = clamp(
          polygonOpacity *
            overlayOpacity *
            (isInteractionBlocked
              ? 0.65
              : isSelected
                ? 1.2
                : isHovered
                  ? 1.35
                  : 1),
          0,
          0.92,
        );
        const label = annotation.titleOverride || structure.title;
        const markerVisible = showLabels && !isInteractionBlocked;
        const textVisible = showLabels && !isInteractionBlocked;
        const screenFontSize = viewerLayout.fontSize;
        const fontSize = screenFontSize * canvasUnitsPerScreenPixel;
        const annotationPositionEditingActive =
          canvasMode === "set-anchor" || canvasMode === "set-label";
        const canDragAnchor =
          annotationEditingEnabled &&
          isSelected &&
          !isInteractionBlocked &&
          annotationPositionEditingActive;
        const canDragLabel =
          annotationEditingEnabled &&
          isSelected &&
          !shouldAutoArrangeLabels &&
          !isInteractionBlocked &&
          annotationPositionEditingActive;
        const highlightLabel =
          isSelected || isHovered || draggingLabelId === annotation.id;
        const leaderStrokeWidth =
          (isSelected ? 3.5 : isHovered ? 3 : 2) *
          viewerLayout.labelScale *
          canvasUnitsPerScreenPixel;
        const markerRadius =
          (isSelected ? 8 : isHovered ? 7 : 6) *
          viewerLayout.labelScale *
          canvasUnitsPerScreenPixel;
        const labelFontWeight: 500 | 700 = isSelected ? 700 : 500;
        const displayLabel = fitLabelText(
          label,
          screenFontSize,
          labelFontWeight,
        );
        const shouldRenderCanvasLeaders =
          markerVisible && !shouldAutoArrangeLabels && !isInteractionBlocked;
        const shouldRenderCanvasLabel =
          textVisible && !shouldAutoArrangeLabels && !isInteractionBlocked;
        const labelRectWidth =
          measureLabelRectWidth(
            displayLabel,
            screenFontSize,
            labelFontWeight,
          ) * canvasUnitsPerScreenPixel;
        const labelRectHeight =
          (screenFontSize + viewerLayout.labelBoxHeightPadding) *
          canvasUnitsPerScreenPixel;
        const labelBoxPaddingX =
          viewerLayout.labelBoxPaddingX * canvasUnitsPerScreenPixel;
        const rawLabelTextX = labelX * viewerLayout.coordinateWidth;
        const resolvedLabelTextX =
          rawLabelTextAnchor === "start"
            ? clamp(
                rawLabelTextX,
                labelBoxPaddingX,
                viewerLayout.coordinateWidth -
                  (labelRectWidth - labelBoxPaddingX),
              )
            : clamp(
                rawLabelTextX,
                labelRectWidth - labelBoxPaddingX,
                viewerLayout.coordinateWidth - labelBoxPaddingX,
              );
        const resolvedLabelRectX =
          rawLabelTextAnchor === "start"
            ? resolvedLabelTextX - labelBoxPaddingX
            : resolvedLabelTextX - labelRectWidth + labelBoxPaddingX;

        return (
          <g
            key={annotation.id}
            style={{
              opacity: focusOpacity,
              pointerEvents: isInteractionBlocked ? "none" : undefined,
              transition: "opacity 140ms ease",
            }}
            onMouseEnter={() => {
              if (isInteractionBlocked) {
                return;
              }

              onAnnotationHover(annotation.id);
            }}
            onMouseLeave={() => {
              if (isInteractionBlocked) {
                return;
              }

              onAnnotationHover(null);
            }}
            onClick={(event) => {
              if (isInteractionBlocked) {
                return;
              }

              event.stopPropagation();
              onAnnotationSelect(annotation.id, annotation.structureId);
            }}
          >
            {polygonPoints.length >= 3 &&
            !(areaPaintPreviewActive && isAreaPaintMode && isSelected) ? (
              <path
                d={pointsToSmoothClosedPath(
                  polygonPoints,
                  viewerLayout.coordinateWidth,
                  viewerLayout.coordinateHeight,
                )}
                fill={overlayColor}
                fillOpacity={emphasizedOpacity}
              />
            ) : null}
            {markerVisible ? (
              <>
                {shouldRenderCanvasLeaders ? (
                  <line
                    stroke={leaderColor}
                    strokeLinecap="round"
                    strokeOpacity={highlightLabel ? 1 : 0.86}
                    strokeWidth={leaderStrokeWidth}
                    x1={anchorX * viewerLayout.coordinateWidth}
                    x2={resolvedLabelTextX}
                    y1={anchorY * viewerLayout.coordinateHeight}
                    y2={labelY * viewerLayout.coordinateHeight}
                  />
                ) : null}
                <circle
                  className={canDragAnchor ? "cursor-move" : undefined}
                  cx={anchorX * viewerLayout.coordinateWidth}
                  cy={anchorY * viewerLayout.coordinateHeight}
                  fill={color}
                  opacity={highlightLabel ? 1 : 0.88}
                  r={markerRadius}
                  stroke={isSelected ? "rgba(255,255,255,0.78)" : "transparent"}
                  strokeWidth={isSelected ? 1.4 : 0}
                  onPointerDown={(event) => {
                    if (!canDragAnchor) {
                      return;
                    }

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
              </>
            ) : null}
            {shouldRenderCanvasLabel ? (
              <g>
                {highlightLabel ? (
                  <rect
                    fill={color}
                    height={labelRectHeight}
                    opacity={0.95}
                    rx={6}
                    width={labelRectWidth}
                    x={resolvedLabelRectX}
                    y={
                      labelY * viewerLayout.coordinateHeight -
                      labelRectHeight / 2
                    }
                  />
                ) : null}
                <text
                  className={
                    canDragLabel ? "cursor-pointer select-none" : undefined
                  }
                  dominantBaseline="middle"
                  fill={highlightLabel ? "#ffffff" : color}
                  fontFamily="system-ui"
                  fontSize={fontSize}
                  fontWeight={labelFontWeight}
                  textAnchor={rawLabelTextAnchor}
                  x={resolvedLabelTextX}
                  y={labelY * viewerLayout.coordinateHeight}
                  onPointerDown={(event) => {
                    if (!canDragLabel) {
                      return;
                    }

                    const svg = event.currentTarget.ownerSVGElement;
                    if (!svg) {
                      return;
                    }

                    event.stopPropagation();
                    draggingLabelRef.current = annotation.id;
                    setDraggingLabelId(annotation.id);
                    svg.setPointerCapture(event.pointerId);
                    onDraftLabelMove(
                      resolvePointerPoint({
                        clientX: event.clientX,
                        clientY: event.clientY,
                        currentTarget: svg,
                      }),
                    );
                  }}
                >
                  {displayLabel}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
      {showDraftPointer ? (
        <g>
          <line
            stroke={annotationForm.leaderColorHex || draftPointerColor}
            strokeWidth={2}
            x1={annotationForm.anchorX * viewerLayout.coordinateWidth}
            x2={annotationForm.labelX * viewerLayout.coordinateWidth}
            y1={annotationForm.anchorY * viewerLayout.coordinateHeight}
            y2={annotationForm.labelY * viewerLayout.coordinateHeight}
          />
          <circle
            className={
              annotationEditingEnabled &&
              (canvasMode === "set-anchor" || canvasMode === "set-label")
                ? "cursor-move"
                : undefined
            }
            cx={annotationForm.anchorX * viewerLayout.coordinateWidth}
            cy={annotationForm.anchorY * viewerLayout.coordinateHeight}
            fill={draftPointerColor}
            r={7}
            onPointerDown={(event) => {
              if (
                !annotationEditingEnabled ||
                (canvasMode !== "set-anchor" && canvasMode !== "set-label")
              ) {
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
          {showLabels ? (
            <text
              fill={draftPointerColor}
              fontFamily="system-ui"
              fontSize={viewerLayout.fontSize * canvasUnitsPerScreenPixel}
              fontWeight={600}
              x={annotationForm.labelX * viewerLayout.coordinateWidth}
              y={annotationForm.labelY * viewerLayout.coordinateHeight}
            >
              {draftPointerLabel}
            </text>
          ) : null}
        </g>
      ) : null}
      {overlayPreview ? (
        <path
          d={overlayPreview}
          fill={annotationForm.overlayColorHex}
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
