import type {
  ViewerAccessLevel,
  ViewerAnnotationPoint,
} from "@/lib/playground/types";

export type ViewerCanvasMode =
  | "browse"
  | "create-label"
  | "set-anchor"
  | "set-label"
  | "draw-region";

export type FontScaleMode = "auto" | "large";

export type StructureFormState = {
  accessLevel: ViewerAccessLevel;
  groupId: string;
  latinName: string;
  learningPoints: string;
  longDescription: string;
  shortDescription: string;
  synonyms: string;
  title: string;
};

export type GroupFormState = {
  colorHex: string;
  description: string;
  iconName: string;
  isDefaultVisible: boolean;
  title: string;
};

export type AnnotationFormState = {
  anchorX: number;
  anchorY: number;
  colorHex: string;
  isPracticeHidden: boolean;
  isTargetedDefault: boolean;
  isVisibleDefault: boolean;
  labelX: number;
  labelY: number;
  leaderColorHex: string;
  note: string;
  overlayColorHex: string;
  overlayOpacity: number;
  polygonPoints: ViewerAnnotationPoint[];
  titleOverride: string;
};

export const DEFAULT_GROUP_COLOR = "#40d6ff";
export const DEFAULT_ANNOTATION_COLOR = "#94f8ff";

export const EMPTY_GROUP_FORM: GroupFormState = {
  colorHex: DEFAULT_GROUP_COLOR,
  description: "",
  iconName: "",
  isDefaultVisible: true,
  title: "",
};

export const EMPTY_STRUCTURE_FORM: StructureFormState = {
  accessLevel: "free",
  groupId: "",
  latinName: "",
  learningPoints: "",
  longDescription: "",
  shortDescription: "",
  synonyms: "",
  title: "",
};

export const EMPTY_ANNOTATION_FORM: AnnotationFormState = {
  anchorX: 0.5,
  anchorY: 0.5,
  colorHex: DEFAULT_ANNOTATION_COLOR,
  isPracticeHidden: false,
  isTargetedDefault: false,
  isVisibleDefault: true,
  labelX: 0.65,
  labelY: 0.35,
  leaderColorHex: DEFAULT_ANNOTATION_COLOR,
  note: "",
  overlayColorHex: DEFAULT_ANNOTATION_COLOR,
  overlayOpacity: 0.55,
  polygonPoints: [],
  titleOverride: "",
};
