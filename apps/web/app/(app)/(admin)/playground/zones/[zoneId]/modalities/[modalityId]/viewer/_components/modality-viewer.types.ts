import type { ViewerAnnotationPoint } from "@/lib/playground/types";

export type ViewerCanvasMode =
  | "browse"
  | "create-label"
  | "set-anchor"
  | "set-label"
  | "draw-region";

export type StructureFormState = {
  colorHex: string;
  groupId: string;
  learningPoints: string;
  longDescription: string;
  title: string;
};

export type GroupFormState = {
  thumbnailUrl: string;
  title: string;
};

export type AnnotationFormState = {
  anchorX: number;
  anchorY: number;
  colorHex: string;
  labelX: number;
  labelY: number;
  leaderColorHex: string;
  overlayColorHex: string;
  overlayOpacity: number;
  polygonPoints: ViewerAnnotationPoint[];
};

export const DEFAULT_ANNOTATION_COLOR = "#6468f0";

export const EMPTY_GROUP_FORM: GroupFormState = {
  thumbnailUrl: "",
  title: "",
};

export const EMPTY_STRUCTURE_FORM: StructureFormState = {
  colorHex: DEFAULT_ANNOTATION_COLOR,
  groupId: "",
  learningPoints: "",
  longDescription: "",
  title: "",
};

export const EMPTY_ANNOTATION_FORM: AnnotationFormState = {
  anchorX: 0.5,
  anchorY: 0.5,
  colorHex: DEFAULT_ANNOTATION_COLOR,
  labelX: 0.65,
  labelY: 0.35,
  leaderColorHex: DEFAULT_ANNOTATION_COLOR,
  overlayColorHex: DEFAULT_ANNOTATION_COLOR,
  overlayOpacity: 0.55,
  polygonPoints: [],
};
