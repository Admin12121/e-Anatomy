import type { ViewerStructure } from "@/lib/playground/types";

export type PartInteractionMode = "pointer" | "area";

export const PART_INTERACTION_MARKER = "interaction:";
const PART_EDITOR_MIN_WIDTH = 680;
const PART_EDITOR_MIN_HEIGHT = 440;
const PART_EDITOR_RESPONSIVE_MIN_WIDTH = 360;
const PART_EDITOR_RESPONSIVE_MIN_HEIGHT = 280;
const PART_EDITOR_VIEWPORT_MARGIN = 8;
const PART_EDITOR_DEFAULT_RECT = {
  height: 620,
  width: 980,
  x: 120,
  y: 84,
};

export type PartEditorWindowRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getPartEditorViewportBounds() {
  const maxWidth = Math.max(
    PART_EDITOR_RESPONSIVE_MIN_WIDTH,
    window.innerWidth - PART_EDITOR_VIEWPORT_MARGIN * 2,
  );
  const maxHeight = Math.max(
    PART_EDITOR_RESPONSIVE_MIN_HEIGHT,
    window.innerHeight - PART_EDITOR_VIEWPORT_MARGIN * 2,
  );

  return {
    maxHeight,
    maxWidth,
    minHeight: Math.min(PART_EDITOR_MIN_HEIGHT, maxHeight),
    minWidth: Math.min(PART_EDITOR_MIN_WIDTH, maxWidth),
  };
}

export function clampPartEditorRect(
  rect: PartEditorWindowRect,
): PartEditorWindowRect {
  const bounds = getPartEditorViewportBounds();
  const width = clampNumber(rect.width, bounds.minWidth, bounds.maxWidth);
  const height = clampNumber(rect.height, bounds.minHeight, bounds.maxHeight);
  const x = clampNumber(
    rect.x,
    PART_EDITOR_VIEWPORT_MARGIN,
    Math.max(
      PART_EDITOR_VIEWPORT_MARGIN,
      window.innerWidth - width - PART_EDITOR_VIEWPORT_MARGIN,
    ),
  );
  const y = clampNumber(
    rect.y,
    PART_EDITOR_VIEWPORT_MARGIN,
    Math.max(
      PART_EDITOR_VIEWPORT_MARGIN,
      window.innerHeight - height - PART_EDITOR_VIEWPORT_MARGIN,
    ),
  );

  return {
    height,
    width,
    x,
    y,
  };
}

export function getDefaultPartEditorRect() {
  return PART_EDITOR_DEFAULT_RECT;
}

export function getMaximizedPartEditorRect(): PartEditorWindowRect {
  const bounds = getPartEditorViewportBounds();

  return {
    height: bounds.maxHeight,
    width: bounds.maxWidth,
    x: PART_EDITOR_VIEWPORT_MARGIN,
    y: PART_EDITOR_VIEWPORT_MARGIN,
  };
}

export function parsePartInteractionModeFromDraft(
  learningPointsValue: string | null | undefined,
): PartInteractionMode {
  const marker = learningPointsValue
    ?.split("\n")
    .map((value) => value.trim())
    .find((value) => value.startsWith(PART_INTERACTION_MARKER));

  if (marker?.slice(PART_INTERACTION_MARKER.length).trim() === "area") {
    return "area";
  }

  return "pointer";
}

export function parsePartInteractionModeFromStructure(
  structure: ViewerStructure,
): PartInteractionMode {
  const marker = structure.learningPoints.find((value) =>
    value.startsWith(PART_INTERACTION_MARKER),
  );

  if (marker?.slice(PART_INTERACTION_MARKER.length).trim() === "area") {
    return "area";
  }

  return "pointer";
}
