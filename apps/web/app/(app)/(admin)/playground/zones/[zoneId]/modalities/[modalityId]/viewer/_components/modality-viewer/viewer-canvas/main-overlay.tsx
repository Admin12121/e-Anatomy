import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  ViewerAnnotation,
  ViewerAnnotationPoint,
  ViewerStructure,
} from "@/lib/playground/types";

import {
  DEFAULT_ANNOTATION_COLOR,
  type AnnotationFormState,
  type FontScaleMode,
  type ViewerCanvasMode,
} from "../../modality-viewer.types";
import { clamp } from "../utils";
import { LABEL_BOX_HEIGHT_PADDING, LABEL_BOX_PADDING_X } from "./helpers";

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
  clampTextXForLabelBox: (
    textX: number,
    textAnchor: "start" | "end",
    labelRectWidth: number,
    viewportWidth: number,
  ) => number;
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
  fontScaleMode: FontScaleMode;
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
  pinsOnly: boolean;
  practiceMode: boolean;
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
  visibleAnnotations: ViewerAnnotation[];
};

function pointToSvgPair(point: ViewerAnnotationPoint) {
  return `${point.x * 1000},${point.y * 1000}`;
}

export function ViewerCanvasMainOverlay({
  activeAreaCursorRadius,
  annotationEditingEnabled,
  annotationForm,
  areaPaintPreviewActive,
  areaEditTool,
  areaToolCursorPoint,
  canvasMode,
  clampTextXForLabelBox,
  disconnectedOverlayColor,
  draftDisconnectedPolygons,
  draftPointerColor,
  draftPointerLabel,
  draggingAnchorRef,
  draggingLabelId,
  draggingLabelRef,
  editLockEnabled,
  fitLabelText,
  fontScaleMode,
  hoveredAnnotationId,
  isAreaPaintMode,
  measureLabelRectWidth,
  onAnnotationHover,
  onAnnotationSelect,
  onDraftAnchorMove,
  onDraftLabelMove,
  overlayOpacity,
  pinsOnly,
  practiceMode,
  resolvePointerPoint,
  selectedAnnotationId,
  setDraggingLabelId,
  shouldAutoArrangeLabels,
  showCrossReferences,
  showDraftPointer,
  showLabels,
  structuresById,
  visibleAnnotations,
}: ViewerCanvasMainOverlayProps) {
  const overlayPreview =
    canvasMode !== "browse" && !areaPaintPreviewActive
      ? annotationForm.polygonPoints.map(pointToSvgPair).join(" ")
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
        const markerVisible = (showLabels || pinsOnly) && !isInteractionBlocked;
        const textVisible =
          showLabels &&
          !pinsOnly &&
          !isInteractionBlocked &&
          (!practiceMode || isSelected || isHovered);
        const fontSize = fontScaleMode === "large" ? 24 : 18;
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
        const leaderStrokeWidth = isSelected ? 3.5 : isHovered ? 3 : 2;
        const markerRadius = isSelected ? 8 : isHovered ? 7 : 6;
        const labelFontWeight: 500 | 700 = isSelected ? 700 : 500;
        const displayLabel = fitLabelText(label, fontSize, labelFontWeight);
        const shouldRenderCanvasLeaders =
          markerVisible && !shouldAutoArrangeLabels && !isInteractionBlocked;
        const shouldRenderCanvasLabel =
          textVisible && !shouldAutoArrangeLabels && !isInteractionBlocked;
        const labelRectWidth = measureLabelRectWidth(
          displayLabel,
          fontSize,
          labelFontWeight,
        );
        const labelRectHeight = fontSize + LABEL_BOX_HEIGHT_PADDING;
        const resolvedLabelTextX = clampTextXForLabelBox(
          labelX * 1000,
          rawLabelTextAnchor,
          labelRectWidth,
          1000,
        );
        const resolvedLabelRectX =
          rawLabelTextAnchor === "start"
            ? resolvedLabelTextX - LABEL_BOX_PADDING_X
            : resolvedLabelTextX - labelRectWidth + LABEL_BOX_PADDING_X;

        return (
          <g
            key={annotation.id}
            style={
              isInteractionBlocked
                ? { pointerEvents: "none" }
                : undefined
            }
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
              <polygon
                fill={overlayColor}
                fillOpacity={emphasizedOpacity}
                points={polygonPoints.map(pointToSvgPair).join(" ")}
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
                    x1={anchorX * 1000}
                    x2={resolvedLabelTextX}
                    y1={anchorY * 1000}
                    y2={labelY * 1000}
                  />
                ) : null}
                <circle
                  className={canDragAnchor ? "cursor-move" : undefined}
                  cx={anchorX * 1000}
                  cy={anchorY * 1000}
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
                    y={labelY * 1000 - labelRectHeight / 2}
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
                  y={labelY * 1000}
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
            x1={annotationForm.anchorX * 1000}
            x2={annotationForm.labelX * 1000}
            y1={annotationForm.anchorY * 1000}
            y2={annotationForm.labelY * 1000}
          />
          <circle
            className={
              annotationEditingEnabled &&
              (canvasMode === "set-anchor" || canvasMode === "set-label")
                ? "cursor-move"
                : undefined
            }
            cx={annotationForm.anchorX * 1000}
            cy={annotationForm.anchorY * 1000}
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
          {showLabels && !pinsOnly ? (
            <text
              fill={draftPointerColor}
              fontFamily="system-ui"
              fontSize={fontScaleMode === "large" ? 24 : 18}
              fontWeight={600}
              x={annotationForm.labelX * 1000}
              y={annotationForm.labelY * 1000}
            >
              {draftPointerLabel}
            </text>
          ) : null}
        </g>
      ) : null}
      {overlayPreview ? (
        <polygon
          fill={annotationForm.overlayColorHex}
          fillOpacity={annotationForm.overlayOpacity * overlayOpacity}
          points={overlayPreview}
        />
      ) : null}
      {canvasMode === "draw-region" && !areaPaintPreviewActive
        ? draftDisconnectedPolygons.map((polygonPoints, polygonIndex) => {
            if (polygonPoints.length < 3) {
              return null;
            }

            return (
              <polygon
                key={`draft-disconnected-${polygonIndex}`}
                fill={disconnectedOverlayColor}
                fillOpacity={annotationForm.overlayOpacity * overlayOpacity}
                points={polygonPoints.map(pointToSvgPair).join(" ")}
              />
            );
          })
        : null}
      {isAreaPaintMode && areaToolCursorPoint ? (
        <circle
          cx={areaToolCursorPoint.x * 1000}
          cy={areaToolCursorPoint.y * 1000}
          fill={
            areaEditTool === "erase"
              ? "rgba(248,113,113,0.14)"
              : "rgba(34,211,238,0.14)"
          }
          pointerEvents="none"
          r={activeAreaCursorRadius * 1000}
        />
      ) : null}
      {showCrossReferences ? (
        <>
          <line
            stroke="rgba(56,189,248,0.88)"
            strokeWidth={2}
            x1={500}
            x2={500}
            y1={0}
            y2={1000}
          />
          <line
            stroke="rgba(56,189,248,0.88)"
            strokeWidth={2}
            x1={0}
            x2={1000}
            y1={500}
            y2={500}
          />
        </>
      ) : null}
    </>
  );
}
