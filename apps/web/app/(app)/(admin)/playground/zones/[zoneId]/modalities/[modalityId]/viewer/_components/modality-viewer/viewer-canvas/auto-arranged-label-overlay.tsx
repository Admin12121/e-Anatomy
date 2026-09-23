import type {
  ViewerAnnotation,
  ViewerStructure,
} from "@/lib/playground/types";

import {
  DEFAULT_ANNOTATION_COLOR,
  type AnnotationFormState,
} from "../../modality-viewer.types";
import type { PlacedAnnotationLabel } from "./annotation-layout";

type ViewerCanvasAutoArrangedLabelOverlayProps = {
  annotationForm: AnnotationFormState;
  editLockEnabled: boolean;
  editorMode: boolean;
  fitLabelText: (
    text: string,
    fontSize: number,
    fontWeight: 500 | 700,
    maxWidth?: number,
  ) => string;
  labelLayout: {
    labels: Map<string, PlacedAnnotationLabel>;
  };
  onAnnotationHover: (annotationId: string | null) => void;
  onAnnotationSelect: (annotationId: string, structureId: string) => void;
  selectedAnnotationId: string | null;
  showLabels: boolean;
  stageSizePx: {
    width: number;
    height: number;
  };
  structuresById: Map<string, ViewerStructure>;
  visibleAnnotations: ViewerAnnotation[];
};

export function ViewerCanvasAutoArrangedLabelOverlay({
  annotationForm,
  editLockEnabled,
  editorMode,
  fitLabelText,
  labelLayout,
  onAnnotationHover,
  onAnnotationSelect,
  selectedAnnotationId,
  showLabels,
  stageSizePx,
  structuresById,
  visibleAnnotations,
}: ViewerCanvasAutoArrangedLabelOverlayProps) {
  if (!showLabels) {
    return null;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      viewBox={`0 0 ${Math.max(stageSizePx.width, 1)} ${Math.max(stageSizePx.height, 1)}`}
    >
      {visibleAnnotations.map((annotation) => {
        const structure = structuresById.get(annotation.structureId);
        const placed = labelLayout.labels.get(annotation.id);

        if (!structure || !placed) {
          return null;
        }

        const isSelected = annotation.id === selectedAnnotationId;
        const isEditorSelected = editorMode && isSelected;
        // Hover only opens the information card. It must not recolor the
        // anatomical leader or turn the anchor red; those are click/selection
        // affordances so the underlying label remains visually stable.
        const isEmphasized = !editorMode && isSelected;
        const interactionBlocked = editLockEnabled
          ? selectedAnnotationId
            ? !isSelected
            : true
          : false;

        const isRegion =
          (isSelected
            ? annotationForm.polygonPoints
            : annotation.polygonPoints
          ).length >= 3;
        const selectedColor = isRegion
          ? annotationForm.overlayColorHex.trim() ||
            annotationForm.colorHex.trim() ||
            annotation.overlayColorHex ||
            annotation.colorHex ||
            structure.colorHex
          : annotationForm.colorHex.trim() ||
            annotation.colorHex ||
            structure.colorHex;
        const color =
          (isSelected
            ? selectedColor
            : isRegion
              ? annotation.overlayColorHex ||
                annotation.colorHex ||
                structure.colorHex
              : annotation.colorHex || structure.colorHex) ||
          DEFAULT_ANNOTATION_COLOR;
        const configuredLeaderColor = isRegion
          ? color
          : isSelected
            ? annotationForm.leaderColorHex.trim() ||
              annotation.leaderColorHex ||
              color
            : annotation.leaderColorHex || color;
        const leaderColor =
          isEmphasized && !isRegion ? "#f4f7f8" : configuredLeaderColor;
        const label = annotation.titleOverride || structure.title;
        const displayLabel = fitLabelText(
          label,
          placed.fontSize,
          isSelected ? 700 : 500,
          placed.textMaxWidth,
        );
        const lineY = placed.y + placed.height / 2;
        const textColor =
          isEmphasized && !isRegion ? "#f5f7f8" : color;
        const markerFill = isEditorSelected
          ? color
          : isEmphasized
            ? isRegion
              ? color
              : "#ff3232"
            : "#4f5a5d";
        const markerStroke = isEditorSelected
          ? "rgba(255,255,255,0.92)"
          : isEmphasized
            ? isRegion
              ? color
              : "#ff0000"
            : color;
        const leaderWidth = isEditorSelected
          ? 1.8
          : isEmphasized
            ? 2.5
            : 1.5;

        return (
          <g
            key={`rail-label-${annotation.id}`}
            className="pointer-events-auto"
            style={{
              opacity: interactionBlocked ? 0.35 : 1,
              pointerEvents: interactionBlocked ? "none" : undefined,
              transition: "opacity 140ms ease",
            }}
            onMouseEnter={() => onAnnotationHover(annotation.id)}
            onMouseLeave={() => onAnnotationHover(null)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onAnnotationSelect(annotation.id, annotation.structureId);
            }}
          >
            {!isEmphasized ? (
              <line
                stroke={leaderColor}
                strokeWidth={1.5}
                style={{ transition: "stroke 160ms ease, opacity 160ms ease" }}
                x1={placed.tickX}
                x2={placed.tickX}
                y1={placed.y}
                y2={placed.y + placed.height}
              />
            ) : null}

            <line
              stroke={leaderColor}
              strokeWidth={leaderWidth}
              style={{
                transition:
                  "stroke 160ms ease, stroke-width 180ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              x1={placed.tickX}
              x2={placed.thresholdX}
              y1={lineY}
              y2={lineY}
            />
            <line
              stroke={leaderColor}
              strokeWidth={leaderWidth}
              style={{
                transition:
                  "stroke 160ms ease, stroke-width 180ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              x1={placed.thresholdX}
              x2={placed.anchorX}
              y1={lineY}
              y2={placed.anchorY}
            />

            <line
              pointerEvents="stroke"
              stroke="transparent"
              strokeWidth={12}
              x1={placed.tickX}
              x2={placed.anchorX}
              y1={lineY}
              y2={placed.anchorY}
            />

            <circle
              cx={placed.anchorX}
              cy={placed.anchorY}
              fill={markerFill}
              r={isEditorSelected ? 3 : isEmphasized ? 4 : 2.1}
              stroke={markerStroke}
              strokeWidth={isEditorSelected ? 1.2 : isEmphasized ? 1.4 : 1}
              style={{
                transition:
                  "fill 160ms ease, stroke 160ms ease, r 180ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />

            <text
              dominantBaseline="middle"
              fill={textColor}
              fontFamily="'Helvetica Neue', Helvetica, Arial, Verdana, sans-serif"
              fontSize={placed.fontSize}
              fontWeight={isSelected ? 700 : 400}
              textAnchor={placed.textAnchor}
              style={{ transition: "fill 160ms ease" }}
              x={placed.textX}
              y={lineY}
            >
              {displayLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
