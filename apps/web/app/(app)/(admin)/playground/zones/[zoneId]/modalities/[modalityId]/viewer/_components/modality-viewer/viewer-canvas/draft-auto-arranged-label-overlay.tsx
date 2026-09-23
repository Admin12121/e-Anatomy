import type { PlacedAnnotationLabel } from "./annotation-layout";

type DraftAutoArrangedLabelOverlayProps = {
  color: string;
  fitLabelText: (
    text: string,
    fontSize: number,
    fontWeight: 500 | 700,
    maxWidth?: number,
  ) => string;
  label: string;
  placed: PlacedAnnotationLabel | null;
  stageSizePx: {
    width: number;
    height: number;
  };
};

export function DraftAutoArrangedLabelOverlay({
  color,
  fitLabelText,
  label,
  placed,
  stageSizePx,
}: DraftAutoArrangedLabelOverlayProps) {
  if (!placed) {
    return null;
  }

  const lineY = placed.y + placed.height / 2;
  const displayLabel = fitLabelText(
    label,
    placed.fontSize,
    700,
    placed.textMaxWidth,
  );

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      viewBox={`0 0 ${Math.max(stageSizePx.width, 1)} ${Math.max(stageSizePx.height, 1)}`}
    >
      <g>
        <line
          stroke={color}
          strokeWidth={1.5}
          x1={placed.tickX}
          x2={placed.tickX}
          y1={placed.y}
          y2={placed.y + placed.height}
        />
        <line
          stroke={color}
          strokeWidth={1.8}
          x1={placed.tickX}
          x2={placed.thresholdX}
          y1={lineY}
          y2={lineY}
        />
        <line
          stroke={color}
          strokeWidth={1.8}
          x1={placed.thresholdX}
          x2={placed.anchorX}
          y1={lineY}
          y2={placed.anchorY}
        />
        <circle
          cx={placed.anchorX}
          cy={placed.anchorY}
          fill={color}
          r={3}
          stroke="rgba(255,255,255,0.92)"
          strokeWidth={1.2}
        />
        <text
          dominantBaseline="middle"
          fill={color}
          fontFamily="'Helvetica Neue', Helvetica, Arial, Verdana, sans-serif"
          fontSize={placed.fontSize}
          fontWeight={700}
          textAnchor={placed.textAnchor}
          x={placed.textX}
          y={lineY}
        >
          {displayLabel}
        </text>
      </g>
    </svg>
  );
}
