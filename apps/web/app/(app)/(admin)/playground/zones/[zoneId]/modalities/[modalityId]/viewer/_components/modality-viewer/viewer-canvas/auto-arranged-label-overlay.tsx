import type {
  ViewerAnnotation,
  ViewerStructure,
} from "@/lib/playground/types";

import {
  DEFAULT_ANNOTATION_COLOR,
  type AnnotationFormState,
} from "../../modality-viewer.types";
import {
  type ArrangedLabel,
  type ViewerLayout,
  getAnnotationFocusOpacity,
} from "./helpers";

type ViewerCanvasAutoArrangedLabelOverlayProps = {
  annotationForm: AnnotationFormState;
  clampTextXForLabelBox: (
    textX: number,
    textAnchor: "start" | "end",
    labelRectWidth: number,
    viewportWidth: number,
  ) => number;
  draggingLabelId: string | null;
  editLockEnabled: boolean;
  fitLabelText: (
    text: string,
    fontSize: number,
    fontWeight: 500 | 700,
  ) => string;
  hoveredAnnotationId: string | null;
  labelLayout: {
    labels: Map<string, ArrangedLabel>;
  };
  measureLabelRectWidth: (
    text: string,
    fontSize: number,
    fontWeight: 500 | 700,
  ) => number;
  onAnnotationHover: (annotationId: string | null) => void;
  onAnnotationSelect: (annotationId: string, structureId: string) => void;
  selectedAnnotationId: string | null;
  showLabels: boolean;
  stageSizePx: {
    width: number;
    height: number;
  };
  structuresById: Map<string, ViewerStructure>;
  viewerLayout: ViewerLayout;
  visibleAnnotations: ViewerAnnotation[];
};

export function ViewerCanvasAutoArrangedLabelOverlay({
  annotationForm,
  clampTextXForLabelBox,
  draggingLabelId,
  editLockEnabled,
  fitLabelText,
  hoveredAnnotationId,
  labelLayout,
  measureLabelRectWidth,
  onAnnotationHover,
  onAnnotationSelect,
  selectedAnnotationId,
  showLabels,
  stageSizePx,
  structuresById,
  viewerLayout,
  visibleAnnotations,
}: ViewerCanvasAutoArrangedLabelOverlayProps) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      viewBox={`0 0 ${Math.max(stageSizePx.width, 1)} ${Math.max(stageSizePx.height, 1)}`}
    >
      {visibleAnnotations.map((annotation) => {
        const structure = structuresById.get(annotation.structureId);
        const arrangedLabel = labelLayout.labels.get(annotation.id);
        const isSelected = annotation.id === selectedAnnotationId;
        const isInteractionBlocked = editLockEnabled
          ? selectedAnnotationId
            ? !isSelected
            : true
          : false;

        if (!structure || !arrangedLabel || isInteractionBlocked) {
          return null;
        }

        const isHovered = annotation.id === hoveredAnnotationId;
        const focusOpacity = getAnnotationFocusOpacity({
          annotationId: annotation.id,
          hoveredId: hoveredAnnotationId,
          selectedId: selectedAnnotationId,
        });
        const preferredAnnotationColor = isSelected
          ? annotationForm.colorHex.trim() || structure.colorHex
          : structure.colorHex;
        const color = preferredAnnotationColor || DEFAULT_ANNOTATION_COLOR;
        const leaderColor = isSelected
          ? annotationForm.leaderColorHex || color
          : color;
        const label = annotation.titleOverride || structure.title;
        const textVisible = showLabels;
        const fontSize = viewerLayout.fontSize;
        const labelFontWeight: 500 | 700 = isSelected ? 700 : 500;
        const displayLabel = fitLabelText(label, fontSize, labelFontWeight);
        const highlightLabel =
          isSelected || isHovered || draggingLabelId === annotation.id;
        const leaderStrokeWidth = isSelected ? 3.5 : isHovered ? 3 : 2;
        const labelRectWidth = measureLabelRectWidth(
          displayLabel,
          fontSize,
          labelFontWeight,
        );
        const labelRectHeight =
          fontSize + viewerLayout.labelBoxHeightPadding;
        const resolvedLabelTextX = clampTextXForLabelBox(
          arrangedLabel.textX,
          arrangedLabel.textAnchor,
          labelRectWidth,
          Math.max(stageSizePx.width, 1),
        );
        const labelRectX =
          arrangedLabel.textAnchor === "start"
            ? resolvedLabelTextX - viewerLayout.labelBoxPaddingX
            : resolvedLabelTextX -
              labelRectWidth +
              viewerLayout.labelBoxPaddingX;
        const labelRectY = arrangedLabel.y - labelRectHeight / 2;
        const labelTickX =
          arrangedLabel.textAnchor === "start"
            ? resolvedLabelTextX - 6
            : resolvedLabelTextX + 6;
        const leaderStartX = arrangedLabel.anchorX;
        const leaderStartY = arrangedLabel.anchorY;
        const leaderEndX = labelTickX;
        const leaderEndY = arrangedLabel.y;

        return (
          <g
            key={`main-label-${annotation.id}`}
            className="pointer-events-auto"
            style={{
              opacity: focusOpacity,
              transition: "opacity 140ms ease",
            }}
            onMouseEnter={() => {
              onAnnotationHover(annotation.id);
            }}
            onMouseLeave={() => {
              onAnnotationHover(null);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onAnnotationSelect(annotation.id, annotation.structureId);
            }}
          >
            <line
              stroke={leaderColor}
              strokeLinecap="round"
              strokeOpacity={highlightLabel ? 1 : 0.86}
              strokeWidth={leaderStrokeWidth}
              x1={leaderStartX}
              x2={leaderEndX}
              y1={leaderStartY}
              y2={leaderEndY}
            />
            <line
              pointerEvents="stroke"
              stroke="transparent"
              strokeWidth={Math.max(leaderStrokeWidth + 8, 11)}
              x1={leaderStartX}
              x2={leaderEndX}
              y1={leaderStartY}
              y2={leaderEndY}
            />

            {textVisible ? (
              <g>
                {highlightLabel ? (
                  <rect
                    fill={color}
                    height={labelRectHeight}
                    opacity={0.95}
                    rx={6}
                    width={labelRectWidth}
                    x={labelRectX}
                    y={labelRectY}
                  />
                ) : null}
                <text
                  dominantBaseline="middle"
                  fill={highlightLabel ? "#ffffff" : color}
                  fontFamily="system-ui"
                  fontSize={fontSize}
                  fontWeight={labelFontWeight}
                  textAnchor={arrangedLabel.textAnchor}
                  x={resolvedLabelTextX}
                  y={arrangedLabel.y}
                >
                  {displayLabel}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
