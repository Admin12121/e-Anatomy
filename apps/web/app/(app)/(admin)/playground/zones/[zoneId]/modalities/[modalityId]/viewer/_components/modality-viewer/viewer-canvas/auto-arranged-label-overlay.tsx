import type {
  ViewerAnnotation,
  ViewerStructure,
  ViewerStructureGroup,
} from "@/lib/playground/types";

import {
  DEFAULT_ANNOTATION_COLOR,
  type AnnotationFormState,
  type FontScaleMode,
} from "../../modality-viewer.types";
import {
  type ArrangedLabel,
  LABEL_BOX_HEIGHT_PADDING,
  LABEL_BOX_PADDING_X,
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
  fontScaleMode: FontScaleMode;
  groupsById: Map<string, ViewerStructureGroup>;
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
  pinsOnly: boolean;
  practiceMode: boolean;
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
  clampTextXForLabelBox,
  draggingLabelId,
  editLockEnabled,
  fitLabelText,
  fontScaleMode,
  groupsById,
  hoveredAnnotationId,
  labelLayout,
  measureLabelRectWidth,
  onAnnotationHover,
  onAnnotationSelect,
  pinsOnly,
  practiceMode,
  selectedAnnotationId,
  showLabels,
  stageSizePx,
  structuresById,
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

        const group = structure.groupId
          ? groupsById.get(structure.groupId)
          : null;

        const isHovered = annotation.id === hoveredAnnotationId;
        const preferredAnnotationColor = isSelected
          ? annotationForm.colorHex.trim() || annotation.colorHex
          : annotation.colorHex;
        const color =
          preferredAnnotationColor ||
          group?.colorHex ||
          DEFAULT_ANNOTATION_COLOR;
        const leaderColor = isSelected
          ? annotationForm.leaderColorHex || color
          : annotation.leaderColorHex || color;
        const label = annotation.titleOverride || structure.title;
        const textVisible =
          showLabels &&
          !pinsOnly &&
          (!practiceMode || isSelected || isHovered);
        const fontSize = fontScaleMode === "large" ? 24 : 18;
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
        const labelRectHeight = fontSize + LABEL_BOX_HEIGHT_PADDING;
        const resolvedLabelTextX = clampTextXForLabelBox(
          arrangedLabel.textX,
          arrangedLabel.textAnchor,
          labelRectWidth,
          Math.max(stageSizePx.width, 1),
        );
        const labelRectX =
          arrangedLabel.textAnchor === "start"
            ? resolvedLabelTextX - LABEL_BOX_PADDING_X
            : resolvedLabelTextX - labelRectWidth + LABEL_BOX_PADDING_X;
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
            onMouseEnter={() => onAnnotationHover(annotation.id)}
            onMouseLeave={() => onAnnotationHover(null)}
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
