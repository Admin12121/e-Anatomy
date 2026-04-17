"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CircleIcon,
  CrosshairIcon,
  EyeIcon,
  EyeOffIcon,
  FlipHorizontal2 as FlipHorizontal2Icon,
  FlipVertical2 as FlipVertical2Icon,
  GripVertical,
  Layers2Icon,
  LoaderCircleIcon,
  PinIcon,
  PlusIcon,
  RotateCcw,
  RotateCcwIcon,
  RotateCwIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";
import { Input } from "@/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ViewerAccessLevel,
  ViewerAnnotation,
  ViewerStructure,
  ViewerStructureGroup,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_GROUP_COLOR,
  EMPTY_ANNOTATION_FORM,
  type AnnotationFormState,
  type FontScaleMode,
  type GroupFormState,
  type StructureFormState,
  type ViewerCanvasMode,
} from "./modality-viewer.types";
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ProjectRichTextEditor } from "@/components/anatomy/project-rich-text";

type UpdateAnnotationForm = <Key extends keyof AnnotationFormState>(
  key: Key,
  value: AnnotationFormState[Key],
) => void;

type UpdateGroupForm = <Key extends keyof GroupFormState>(
  key: Key,
  value: GroupFormState[Key],
) => void;

type UpdateStructureForm = <Key extends keyof StructureFormState>(
  key: Key,
  value: StructureFormState[Key],
) => void;

type RightPanelProps = {
  activeWeighting: string;
  annotationForm: AnnotationFormState;
  busy: boolean;
  canEditAnnotationDetails: boolean;
  canEditPinArea: boolean;
  canvasFlipHorizontal: boolean;
  canvasFlipVertical: boolean;
  canvasMode: ViewerCanvasMode;
  currentAnnotations: ViewerAnnotation[];
  currentAsset: ZoneModalityAsset | null;
  darkMode: boolean;
  fontScaleMode: FontScaleMode;
  groupForm: GroupFormState;
  groups: ViewerStructureGroup[];
  groupsById: Map<string, ViewerStructureGroup>;
  isAuthoringMode: boolean;
  modalityId: string;
  overlayOpacity: number;
  pinsOnly: boolean;
  pointAnimation: boolean;
  practiceMode: boolean;
  reverseScroll: boolean;
  selectedAnnotationId: string | null;
  selectedGroupId: string | null;
  selectedStructure: ViewerStructure | null;
  selectedStructureId: string | null;
  showCrossReferences: boolean;
  showLabels: boolean;
  showOrientation: boolean;
  showStructureAdvanced: boolean;
  structureForm: StructureFormState;
  structures: ViewerStructure[];
  structuresById: Map<string, ViewerStructure>;
  targetedLabeling: boolean;
  visibleGroupIds: string[];
  weightings: string[];
  zoneId: string;
  onAnnotationFormChange: UpdateAnnotationForm;
  onCanvasModeChange: (mode: ViewerCanvasMode) => void;
  onCaptureSnapshot: () => void | Promise<void>;
  onClearPolygonDraft: () => void;
  onDarkModeChange: (value: boolean) => void;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onDeleteGroup: (groupId: string) => void | Promise<void>;
  onDeleteStructure: (structureId: string) => void | Promise<void>;
  onFlipCanvasHorizontal: () => void;
  onFlipCanvasVertical: () => void;
  onFontScaleModeChange: (mode: FontScaleMode) => void;
  onGroupFormChange: UpdateGroupForm;
  onGroupVisibilityChange: (groupId: string, nextVisible: boolean) => void;
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onOverlayOpacityChange: (value: number) => void;
  onPinsOnlyChange: (value: boolean) => void;
  onPointAnimationChange: (value: boolean) => void;
  onPracticeModeChange: (value: boolean) => void;
  onResetGroup: () => void;
  onResetStructure: () => void;
  onReverseScrollChange: (value: boolean) => void;
  onRotateCanvasLeft: () => void;
  onRotateCanvasRight: () => void;
  onSaveAnnotation: (options?: {
    structureId?: string;
  }) => void | Promise<void>;
  onSaveGroup: () => void | Promise<void>;
  onSaveStructure: () =>
    | ViewerStructure
    | null
    | Promise<ViewerStructure | null>;
  onSelectAnnotation: (annotationId: string, structureId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onSelectStructure: (structureId: string, groupId: string | null) => void;
  onShowCrossReferencesChange: (value: boolean) => void;
  onShowLabelsChange: (value: boolean) => void;
  onShowOrientationChange: (value: boolean) => void;
  onStructureAdvancedToggle: () => void;
  onStructureFormChange: UpdateStructureForm;
  onTargetedLabelingChange: (value: boolean) => void;
  onUndoPolygonPoint: () => void;
  onVisibleGroupIdsChange: (groupIds: string[]) => void;
  onWeightingChange: (weighting: string) => void;
  handleReset: () => void;
};

type PartInteractionMode = "pointer" | "area";

const PART_INTERACTION_MARKER = "interaction:";
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

type PartEditorWindowRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

function getPartEditorViewportBounds() {
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

function clampPartEditorRect(rect: PartEditorWindowRect): PartEditorWindowRect {
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

function getMaximizedPartEditorRect(): PartEditorWindowRect {
  const bounds = getPartEditorViewportBounds();

  return {
    height: bounds.maxHeight,
    width: bounds.maxWidth,
    x: PART_EDITOR_VIEWPORT_MARGIN,
    y: PART_EDITOR_VIEWPORT_MARGIN,
  };
}

function getCanvasModeFromPartInteraction(
  mode: PartInteractionMode,
): ViewerCanvasMode {
  return mode === "area" ? "draw-region" : "create-label";
}

function hasPointerPlacementDraft(annotationForm: AnnotationFormState) {
  const epsilon = 0.0005;

  return (
    Math.abs(annotationForm.anchorX - EMPTY_ANNOTATION_FORM.anchorX) >
      epsilon ||
    Math.abs(annotationForm.anchorY - EMPTY_ANNOTATION_FORM.anchorY) >
      epsilon ||
    Math.abs(annotationForm.labelX - EMPTY_ANNOTATION_FORM.labelX) > epsilon ||
    Math.abs(annotationForm.labelY - EMPTY_ANNOTATION_FORM.labelY) > epsilon
  );
}

function hasPartAnnotationDraft(
  mode: PartInteractionMode,
  annotationForm: AnnotationFormState,
) {
  if (mode === "area") {
    return annotationForm.polygonPoints.length >= 3;
  }

  return hasPointerPlacementDraft(annotationForm);
}

export function ModalityViewerRightPanel({
  activeWeighting,
  annotationForm,
  busy,
  canEditAnnotationDetails,
  canEditPinArea,
  canvasFlipHorizontal,
  canvasFlipVertical,
  canvasMode,
  currentAnnotations,
  currentAsset,
  darkMode,
  fontScaleMode,
  groupForm,
  groups,
  groupsById,
  isAuthoringMode,
  modalityId,
  overlayOpacity,
  pinsOnly,
  pointAnimation,
  practiceMode,
  reverseScroll,
  selectedAnnotationId,
  selectedGroupId,
  selectedStructure,
  selectedStructureId,
  showCrossReferences,
  showLabels,
  showOrientation,
  showStructureAdvanced,
  structureForm,
  structures,
  structuresById,
  targetedLabeling,
  visibleGroupIds,
  weightings,
  zoneId,
  onAnnotationFormChange,
  onCanvasModeChange,
  onCaptureSnapshot,
  onClearPolygonDraft,
  onDarkModeChange,
  onDeleteAnnotation,
  onDeleteGroup,
  onDeleteStructure,
  onFlipCanvasHorizontal,
  onFlipCanvasVertical,
  onFontScaleModeChange,
  onGroupFormChange,
  onGroupVisibilityChange,
  onNavigateNext,
  onNavigatePrevious,
  onOverlayOpacityChange,
  onPinsOnlyChange,
  onPointAnimationChange,
  onPracticeModeChange,
  onResetGroup,
  onResetStructure,
  onReverseScrollChange,
  onRotateCanvasLeft,
  onRotateCanvasRight,
  onSaveAnnotation,
  onSaveGroup,
  onSaveStructure,
  onSelectAnnotation,
  onSelectGroup,
  onSelectStructure,
  onShowCrossReferencesChange,
  onShowLabelsChange,
  onShowOrientationChange,
  onStructureAdvancedToggle,
  onStructureFormChange,
  onTargetedLabelingChange,
  onUndoPolygonPoint,
  onVisibleGroupIdsChange,
  onWeightingChange,
  handleReset,
}: RightPanelProps) {
  const [showAnatomicalPartsPanel, setShowAnatomicalPartsPanel] =
    useState(false);
  const [showCreatePartFrame, setShowCreatePartFrame] = useState(false);
  const [showPartEditorWindow, setShowPartEditorWindow] = useState(false);
  const [partEditorInitialContent, setPartEditorInitialContent] = useState("");
  const [partInteractionMode, setPartInteractionMode] =
    useState<PartInteractionMode>("pointer");
  const [selectedAnatomicalPartId, setSelectedAnatomicalPartId] = useState<
    string | null
  >(null);
  const allGroupIds = groups.map((group) => group.id);
  const masterVisible = visibleGroupIds.length > 0;
  const groupColorValue = toColorInputValue(
    groupForm.colorHex,
    DEFAULT_GROUP_COLOR,
  );
  const selectedAnatomicalPart = selectedAnatomicalPartId
    ? (groupsById.get(selectedAnatomicalPartId) ?? null)
    : null;
  const selectedAnatomicalPartRows = selectedAnatomicalPart
    ? structures.filter(
        (structure) => structure.groupId === selectedAnatomicalPart.id,
      )
    : [];

  useEffect(() => {
    if (selectedAnatomicalPartId && !groupsById.has(selectedAnatomicalPartId)) {
      setSelectedAnatomicalPartId(null);
      setShowCreatePartFrame(false);
      setShowPartEditorWindow(false);
    }
  }, [groupsById, selectedAnatomicalPartId]);

  useEffect(() => {
    if (!showCreatePartFrame) {
      setShowPartEditorWindow(false);
    }
  }, [showCreatePartFrame]);

  useEffect(() => {
    if (!showCreatePartFrame || !selectedAnatomicalPart) {
      return;
    }

    if (structureForm.groupId !== selectedAnatomicalPart.id) {
      onStructureFormChange("groupId", selectedAnatomicalPart.id);
    }
  }, [
    onStructureFormChange,
    selectedAnatomicalPart,
    showCreatePartFrame,
    structureForm.groupId,
  ]);

  useEffect(() => {
    if (!showCreatePartFrame) {
      return;
    }

    setPartInteractionMode(
      parsePartInteractionModeFromDraft(structureForm.learningPoints),
    );
  }, [showCreatePartFrame, structureForm.learningPoints]);

  useEffect(() => {
    if (
      !showCreatePartFrame ||
      !selectedAnatomicalPart ||
      selectedStructureId
    ) {
      return;
    }

    const areaColorHex = toColorInputValue(
      selectedAnatomicalPart.colorHex,
      DEFAULT_GROUP_COLOR,
    );

    onAnnotationFormChange("colorHex", areaColorHex);
    onAnnotationFormChange("leaderColorHex", areaColorHex);
    onAnnotationFormChange("overlayColorHex", areaColorHex);
  }, [
    onAnnotationFormChange,
    selectedAnatomicalPart,
    selectedStructureId,
    showCreatePartFrame,
  ]);

  const handleSaveAnatomicalPart = async () => {
    await onSaveGroup();
    onResetGroup();
    setSelectedAnatomicalPartId(null);
  };

  const handleUpdateSelectedAnatomicalArea = async () => {
    if (!selectedAnatomicalPart) {
      return;
    }

    await onSaveGroup();
  };

  const handlePartInteractionModeChange = (nextMode: PartInteractionMode) => {
    setPartInteractionMode(nextMode);
    onStructureFormChange(
      "learningPoints",
      `${PART_INTERACTION_MARKER}${nextMode}`,
    );
    onCanvasModeChange(getCanvasModeFromPartInteraction(nextMode));
  };

  const handleDeleteSelectedPart = async () => {
    if (!selectedStructureId) {
      return;
    }

    await onDeleteStructure(selectedStructureId);
    onResetStructure();
    setShowCreatePartFrame(false);
    setShowPartEditorWindow(false);
    setPartEditorInitialContent("");
    setPartInteractionMode("pointer");
    onClearPolygonDraft();
    onCanvasModeChange("browse");
  };

  const handleSaveStructurePart = async () => {
    if (!selectedAnatomicalPart) {
      return;
    }

    const isCreatingPart = !selectedStructureId;

    if (structureForm.groupId !== selectedAnatomicalPart.id) {
      onStructureFormChange("groupId", selectedAnatomicalPart.id);
    }

    const savedStructure = await onSaveStructure();

    if (!savedStructure) {
      return;
    }

    const shouldSaveDraftAnnotation =
      isCreatingPart &&
      hasPartAnnotationDraft(partInteractionMode, annotationForm);

    onSelectStructure(savedStructure.id, savedStructure.groupId);

    if (shouldSaveDraftAnnotation) {
      await onSaveAnnotation({ structureId: savedStructure.id });
    } else {
      onCanvasModeChange("browse");
    }

    onClearPolygonDraft();
    // Keep the newly created structure selected so pointer/area actions can start immediately.
    setPartInteractionMode("pointer");
    setShowCreatePartFrame(false);
    setShowPartEditorWindow(false);
    setPartEditorInitialContent("");
  };

  return (
    <aside className="min-h-0 overflow-y-auto p-2 space-y-3">
      <Frame>
        <div className="flex items-center justify-between px-3 py-2">Menu</div>
        <FramePanel className="p-3">
          <ViewerSidebarSection title="Weightings">
            <Select
              value={activeWeighting}
              onValueChange={(value) => {
                if (value) {
                  onWeightingChange(value);
                }
              }}
            >
              <SelectTrigger className="w-full rounded-xl text-sm">
                <SelectValue placeholder="Select weighting" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {weightings.map((weighting) => (
                  <SelectItem key={weighting} value={weighting}>
                    {formatWeightingLabel(weighting)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ViewerSidebarSection>

          <ViewerSidebarSection
            title="Anatomical Parts"
            actions={
              <Group className="rounded-md bg-white/6 p-0.5">
                <Button
                  aria-label={showLabels ? "Hide labels" : "Show labels"}
                  type="button"
                  size="icon"
                  variant={showLabels ? "default" : "secondary"}
                  onClick={() => onShowLabelsChange(!showLabels)}
                >
                  {showLabels ? (
                    <EyeIcon className="size-4" />
                  ) : (
                    <EyeOffIcon className="size-4" />
                  )}
                </Button>
                <Button
                  aria-label="Show anatomical parts editor"
                  type="button"
                  size="icon"
                  variant={showAnatomicalPartsPanel ? "default" : "secondary"}
                  onClick={() => {
                    const next = !showAnatomicalPartsPanel;

                    if (next) {
                      // Create-area mode and edit-area mode are mutually exclusive.
                      setSelectedAnatomicalPartId(null);
                      setShowCreatePartFrame(false);
                      setShowPartEditorWindow(false);
                      onResetGroup();
                    }

                    setShowAnatomicalPartsPanel(next);
                  }}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </Group>
            }
          >
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between px-1 py-1.5 text-sm"
                onClick={() =>
                  onVisibleGroupIdsChange(masterVisible ? [] : allGroupIds)
                }
              >
                <span>Select all</span>
                <Switch
                  checked={masterVisible}
                  onCheckedChange={(checked) =>
                    onVisibleGroupIdsChange(checked ? allGroupIds : [])
                  }
                />
              </button>

              <div className="space-y-1">
                {groups.map((group) => {
                  const isVisible = visibleGroupIds.includes(group.id);

                  return (
                    <div
                      key={group.id}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left transition",
                        masterVisible
                          ? "hover:bg-white/3"
                          : "cursor-not-allowed opacity-45",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2.5">
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-md transition"
                          aria-label={`Open ${group.title} details`}
                          onClick={() => {
                            const nextGroupId =
                              selectedAnatomicalPartId === group.id
                                ? null
                                : group.id;

                            setShowAnatomicalPartsPanel(false);
                            setShowCreatePartFrame(false);
                            setShowPartEditorWindow(false);

                            if (nextGroupId) {
                              onSelectGroup(nextGroupId);
                            } else {
                              onResetGroup();
                            }

                            setSelectedAnatomicalPartId(nextGroupId);
                          }}
                        >
                          <GripVertical className="size-4" />
                        </button>
                        {group.iconName?.trim() ? (
                          <span
                            aria-hidden="true"
                            className="inline-flex size-5 items-center justify-center text-sm"
                          >
                            {group.iconName}
                          </span>
                        ) : (
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: group.colorHex }}
                          />
                        )}
                        <span className="truncate text-[15px] leading-5">
                          {group.title}
                        </span>
                      </span>
                      <Switch
                        checked={isVisible}
                        disabled={!masterVisible}
                        onCheckedChange={(checked) => {
                          onGroupVisibilityChange(group.id, checked);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </ViewerSidebarSection>

          <ViewerSidebarSection title="Transformations" className="pb-0">
            <div className="space-y-2">
              <Group
                aria-label="Transformations"
                className="rounded-md bg-white/6 p-0.5"
              >
                <Button
                  aria-label="Rotate canvas left"
                  type="button"
                  size="icon-lg"
                  variant="secondary"
                  disabled={!currentAsset}
                  onClick={onRotateCanvasLeft}
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
                <Button
                  aria-label="Rotate canvas right"
                  type="button"
                  size="icon-lg"
                  variant="secondary"
                  disabled={!currentAsset}
                  onClick={onRotateCanvasRight}
                >
                  <RotateCwIcon className="size-4" />
                </Button>
                <Button
                  aria-label="Flip canvas left to right"
                  type="button"
                  size="icon-lg"
                  variant={canvasFlipHorizontal ? "default" : "secondary"}
                  disabled={!currentAsset}
                  onClick={onFlipCanvasHorizontal}
                >
                  <FlipHorizontal2Icon className="size-4" />
                </Button>
                <Button
                  aria-label="Flip canvas top to bottom"
                  type="button"
                  size="icon-lg"
                  variant={canvasFlipVertical ? "default" : "secondary"}
                  disabled={!currentAsset}
                  onClick={onFlipCanvasVertical}
                >
                  <FlipVertical2Icon className="size-4" />
                </Button>
                <Button
                  aria-label="Reset transformations"
                  type="button"
                  size="icon-lg"
                  variant={"secondary"}
                  onClick={handleReset}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </Group>
            </div>
          </ViewerSidebarSection>
        </FramePanel>
      </Frame>
      {showAnatomicalPartsPanel ? (
        <Frame>
          <div className="flex items-center justify-between px-3 py-2">
            Anatomical Area
            <Button
              disabled={busy || !groupForm.title.trim()}
              type="button"
              onClick={() => void handleSaveAnatomicalPart()}
            >
              Save
              {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
            </Button>
          </div>
          <FramePanel className="p-3">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Area Name</div>
                <Input
                  placeholder="Ex: Frontal Lobe"
                  value={groupForm.title}
                  onChange={(event) =>
                    onGroupFormChange("title", event.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium">Color</div>
                <AnatomicalAreaColorPicker
                  colorHex={groupColorValue}
                  onColorChange={(value) =>
                    onGroupFormChange("colorHex", value)
                  }
                />
              </div>
            </div>
          </FramePanel>
        </Frame>
      ) : null}

      {selectedAnatomicalPart ? (
        <>
          <Frame>
            <div className="flex items-center justify-between px-3 py-2">
              {selectedAnatomicalPart.title}

              <Button
                type="button"
                disabled={busy || !groupForm.title.trim()}
                onClick={() => void handleUpdateSelectedAnatomicalArea()}
              >
                Save
                {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
              </Button>
            </div>
            <FramePanel className="p-3">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Area Name</div>
                  <Input
                    placeholder="Ex: Frontal Lobe"
                    value={groupForm.title}
                    onChange={(event) =>
                      onGroupFormChange("title", event.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Color</div>
                  <AnatomicalAreaColorPicker
                    colorHex={groupColorValue}
                    onColorChange={(value) =>
                      onGroupFormChange("colorHex", value)
                    }
                  />
                </div>
              </div>
            </FramePanel>
          </Frame>

          <div className="p-1">
            <Frame className="shrink-0 outline-offset-2 outline outline-border/50 rounded-lg p-0">
              <FrameHeader className="py-1 px-2 flex items-center justify-between flex-row">
                <FrameTitle className="text-lg">Anatomical Part</FrameTitle>
                <Button
                  type="button"
                  size="icon"
                  onClick={() => {
                    const next = !showCreatePartFrame;

                    if (next) {
                      onResetStructure();
                      onStructureFormChange(
                        "groupId",
                        selectedAnatomicalPart.id,
                      );
                      onStructureFormChange(
                        "learningPoints",
                        `${PART_INTERACTION_MARKER}pointer`,
                      );
                      setPartInteractionMode("pointer");
                      setPartEditorInitialContent("");
                      setShowPartEditorWindow(false);
                      onClearPolygonDraft();
                      onCanvasModeChange("browse");
                    } else {
                      setShowPartEditorWindow(false);
                      onCanvasModeChange("browse");
                    }

                    setShowCreatePartFrame(next);
                  }}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </FrameHeader>
            </Frame>
          </div>

          {showCreatePartFrame ? (
            <Frame>
              <div className="flex items-center justify-between px-3 py-2">
                {selectedStructureId
                  ? "Edit Anatomical Part"
                  : "New Anatomical Part"}
                <div className="flex items-center gap-2">
                  <Button
                    disabled={busy || !structureForm.title.trim()}
                    type="button"
                    onClick={() => void handleSaveStructurePart()}
                  >
                    Save
                    {busy && (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    )}
                  </Button>
                  {selectedStructureId ? (
                    <Button
                      disabled={busy}
                      type="button"
                      variant="destructive"
                      onClick={() => void handleDeleteSelectedPart()}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <FramePanel className="p-3">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-white/70">
                      Part Name
                    </div>
                    <Input
                      placeholder="Ex: Superior Frontal Gyrus"
                      value={structureForm.title}
                      onChange={(event) =>
                        onStructureFormChange("title", event.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-white/70">
                      Placement Type
                    </div>
                    <Group className="rounded-md bg-white/6 p-0.5">
                      <Button
                        type="button"
                        variant={
                          partInteractionMode === "pointer"
                            ? "default"
                            : "secondary"
                        }
                        onClick={() =>
                          handlePartInteractionModeChange("pointer")
                        }
                      >
                        <PinIcon className="size-4" />
                        Pointer
                      </Button>
                      <Button
                        type="button"
                        variant={
                          partInteractionMode === "area"
                            ? "default"
                            : "secondary"
                        }
                        onClick={() => handlePartInteractionModeChange("area")}
                      >
                        <CrosshairIcon className="size-4" />
                        Area
                      </Button>
                    </Group>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-white/70">
                      Description and Full Explanation
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setPartEditorInitialContent(
                            structureForm.longDescription,
                          );
                          setShowPartEditorWindow(true);
                        }}
                      >
                        Open Editor
                      </Button>
                      <span className="truncate text-[11px] text-white/50">
                        {structureForm.shortDescription.trim()
                          ? "Description draft ready"
                          : "No description draft yet"}
                      </span>
                    </div>
                  </div>
                </div>
              </FramePanel>
            </Frame>
          ) : null}

          <Frame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedAnatomicalPartRows.length > 0 ? (
                  selectedAnatomicalPartRows.map((structure, index) => {
                    const interactionMode =
                      parsePartInteractionModeFromStructure(structure);

                    return (
                      <TableRow key={structure.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{structure.title}</span>
                            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/65">
                              {interactionMode}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              onSelectStructure(
                                structure.id,
                                selectedAnatomicalPart.id,
                              );
                              setShowCreatePartFrame(true);
                              setShowPartEditorWindow(false);
                              setPartEditorInitialContent(
                                structure.longDescription ?? "",
                              );
                              setPartInteractionMode(interactionMode);
                              onCanvasModeChange("browse");
                            }}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-white/60">
                      No anatomical parts yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Frame>

          {showPartEditorWindow ? (
            <AnatomicalPartEditorWindow
              initialContent={partEditorInitialContent}
              partTitle={structureForm.title}
              onClose={() => setShowPartEditorWindow(false)}
              onLongDescriptionChange={(value) =>
                onStructureFormChange("longDescription", value)
              }
            />
          ) : null}
        </>
      ) : null}
    </aside>
  );
}

function parsePartInteractionModeFromDraft(
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

function parsePartInteractionModeFromStructure(
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

function AnatomicalPartEditorWindow({
  initialContent,
  partTitle,
  onClose,
  onLongDescriptionChange,
}: {
  initialContent: string;
  partTitle: string;
  onClose: () => void;
  onLongDescriptionChange: (value: string) => void;
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowRect, setWindowRect] = useState<PartEditorWindowRect>(() => {
    if (typeof window === "undefined") {
      return PART_EDITOR_DEFAULT_RECT;
    }

    return clampPartEditorRect(PART_EDITOR_DEFAULT_RECT);
  });
  const previousWindowRectRef = useRef<PartEditorWindowRect>(
    PART_EDITOR_DEFAULT_RECT,
  );
  const dragStateRef = useRef<{
    originX: number;
    originY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeStateRef = useRef<{
    height: number;
    pointerId: number;
    startX: number;
    startY: number;
    width: number;
  } | null>(null);
  const [editorDraft, setEditorDraft] = useState(initialContent);

  useEffect(() => {
    setEditorDraft(initialContent);
  }, [initialContent]);

  const persistEditorDraft = () => {
    onLongDescriptionChange(editorDraft.trim());
  };

  useEffect(() => {
    const syncWindowRectToViewport = () => {
      setWindowRect((current) =>
        isMaximized
          ? getMaximizedPartEditorRect()
          : clampPartEditorRect(current),
      );
    };

    syncWindowRectToViewport();
    window.addEventListener("resize", syncWindowRectToViewport);

    return () => {
      window.removeEventListener("resize", syncWindowRectToViewport);
    };
  }, [isMaximized]);

  const handleWindowClose = () => {
    persistEditorDraft();
    onClose();
  };

  const handleWindowMinimize = () => {
    persistEditorDraft();
    setIsMinimized(true);
  };

  const handleWindowMaximizeToggle = () => {
    if (isMaximized) {
      setWindowRect(clampPartEditorRect(previousWindowRectRef.current));
      setIsMaximized(false);
      return;
    }

    previousWindowRectRef.current = windowRect;
    setIsMaximized(true);
  };

  if (isMinimized) {
    return (
      <div className="pointer-events-auto fixed bottom-4 right-4 z-90">
        <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/85 p-2 shadow-2xl backdrop-blur-md">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsMinimized(false)}
          >
            Restore Editor
          </Button>
          <div className="max-w-52 truncate text-xs text-white/70">
            {partTitle.trim() || "New Anatomical Part"}
          </div>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={handleWindowClose}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-90">
      <div
        className="pointer-events-auto absolute"
        style={{
          height: windowRect.height,
          left: windowRect.x,
          top: windowRect.y,
          width: windowRect.width,
        }}
      >
        <div className="relative flex h-full min-h-0 flex-col overflow-visible rounded-xl bg-[#1f1f1f]">
          <div
            className={cn(
              "flex h-8 shrink-0 select-none items-center gap-3 bg-[#151515] px-3 rounded-tl-xl rounded-tr-xl",
              isMaximized ? "cursor-default" : "cursor-move",
            )}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragStateRef.current = null;
            }}
            onPointerDown={(event) => {
              if (isMaximized) {
                return;
              }

              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragStateRef.current = {
                originX: windowRect.x,
                originY: windowRect.y,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
              };
            }}
            onPointerMove={(event) => {
              const dragState = dragStateRef.current;

              if (!dragState || dragState.pointerId !== event.pointerId) {
                return;
              }

              const deltaX = event.clientX - dragState.startX;
              const deltaY = event.clientY - dragState.startY;
              const maxX = Math.max(
                PART_EDITOR_VIEWPORT_MARGIN,
                window.innerWidth -
                  windowRect.width -
                  PART_EDITOR_VIEWPORT_MARGIN,
              );
              const maxY = Math.max(
                PART_EDITOR_VIEWPORT_MARGIN,
                window.innerHeight -
                  windowRect.height -
                  PART_EDITOR_VIEWPORT_MARGIN,
              );

              setWindowRect((current) => ({
                ...current,
                x: clampNumber(
                  dragState.originX + deltaX,
                  PART_EDITOR_VIEWPORT_MARGIN,
                  maxX,
                ),
                y: clampNumber(
                  dragState.originY + deltaY,
                  PART_EDITOR_VIEWPORT_MARGIN,
                  maxY,
                ),
              }));
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              dragStateRef.current = null;
            }}
          >
            <div className="flex shrink-0 items-center gap-2">
              <button
                aria-label="Close editor"
                type="button"
                className="size-3 rounded-full border border-black/25 bg-[#ff5f57] transition hover:brightness-95 cursor-pointer"
                onClick={handleWindowClose}
                onPointerDown={(event) => event.stopPropagation()}
              />
              <button
                aria-label="Minimize editor"
                type="button"
                className="size-3 rounded-full border border-black/25 bg-[#febc2e] transition hover:brightness-95 cursor-pointer"
                onClick={handleWindowMinimize}
                onPointerDown={(event) => event.stopPropagation()}
              />
              <button
                aria-label={isMaximized ? "Restore editor" : "Maximize editor"}
                type="button"
                className="size-3 rounded-full border border-black/25 bg-[#28c840] transition hover:brightness-95 cursor-pointer"
                onClick={handleWindowMaximizeToggle}
                onPointerDown={(event) => event.stopPropagation()}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="mx-auto max-w-lg rounded-md border border-white/10 bg-black/30 px-3 py-1 text-center">
                <span className="block truncate text-[11px] text-white/65">
                  {partTitle.trim() || "New Anatomical Part"}
                </span>
              </div>
            </div>

            <div className="h-3 w-13 shrink-0" />
          </div>

          <section className="project-rich-text min-h-0 bg-black/20">
            <ProjectRichTextEditor
              className="h-full"
              variant="workspace"
              title={partTitle.trim() || "New Anatomical Part"}
              value={editorDraft}
              onChange={(value: string) => {
                setEditorDraft(value);
                onLongDescriptionChange(value);
              }}
            />
          </section>
        </div>

        {!isMaximized ? (
          <div
            className="absolute bottom-2 right-2 z-30 size-4 cursor-se-resize rounded-sm border border-white/35 bg-black/40"
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              resizeStateRef.current = null;
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              resizeStateRef.current = {
                height: windowRect.height,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                width: windowRect.width,
              };
            }}
            onPointerMove={(event) => {
              const resizeState = resizeStateRef.current;

              if (!resizeState || resizeState.pointerId !== event.pointerId) {
                return;
              }

              const widthDelta = event.clientX - resizeState.startX;
              const heightDelta = event.clientY - resizeState.startY;
              const bounds = getPartEditorViewportBounds();
              const maxWidth = Math.max(
                bounds.minWidth,
                window.innerWidth - windowRect.x - PART_EDITOR_VIEWPORT_MARGIN,
              );
              const maxHeight = Math.max(
                bounds.minHeight,
                window.innerHeight - windowRect.y - PART_EDITOR_VIEWPORT_MARGIN,
              );

              setWindowRect((current) => ({
                ...current,
                width: clampNumber(
                  resizeState.width + widthDelta,
                  bounds.minWidth,
                  maxWidth,
                ),
                height: clampNumber(
                  resizeState.height + heightDelta,
                  bounds.minHeight,
                  maxHeight,
                ),
              }));
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              resizeStateRef.current = null;
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

type HsvColor = {
  h: number;
  s: number;
  v: number;
};

function AnatomicalAreaColorPicker({
  colorHex,
  onColorChange,
}: {
  colorHex: string;
  onColorChange: (value: string) => void;
}) {
  const [hsvColor, setHsvColor] = useState<HsvColor>(() => hexToHsv(colorHex));
  const hsvColorRef = useRef(hsvColor);
  const saturationRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    hsvColorRef.current = hsvColor;
  }, [hsvColor]);

  useEffect(() => {
    const nextHsvColor = hexToHsv(colorHex);

    setHsvColor((current) => {
      const hueDelta = Math.abs(
        normalizeHue(current.h) - normalizeHue(nextHsvColor.h),
      );
      const isCloseHue = Math.min(hueDelta, 360 - hueDelta) < 0.25;
      const isCloseSaturation = Math.abs(current.s - nextHsvColor.s) < 0.002;
      const isCloseValue = Math.abs(current.v - nextHsvColor.v) < 0.002;

      if (isCloseHue && isCloseSaturation && isCloseValue) {
        return current;
      }

      return nextHsvColor;
    });
  }, [colorHex]);

  const commitColor = (next: HsvColor) => {
    const normalized = normalizeHsv(next);
    const nextHex = hsvToHex(normalized);

    hsvColorRef.current = normalized;
    setHsvColor(normalized);

    if (nextHex.toLowerCase() !== colorHex.toLowerCase()) {
      onColorChange(nextHex);
    }
  };

  const updateSaturationValue = (clientX: number, clientY: number) => {
    const element = saturationRef.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const nextSaturation = clampNumber(
      (clientX - rect.left) / rect.width,
      0,
      1,
    );
    const nextValue = clampNumber(1 - (clientY - rect.top) / rect.height, 0, 1);
    const current = hsvColorRef.current;

    commitColor({
      h: current.h,
      s: nextSaturation,
      v: nextValue,
    });
  };

  const updateHue = (clientX: number) => {
    const element = hueRef.current;

    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const ratio = clampNumber((clientX - rect.left) / rect.width, 0, 1);
    const current = hsvColorRef.current;

    commitColor({
      h: ratio * 360,
      s: current.s,
      v: current.v,
    });
  };

  const saturationCursorLeft = `${hsvColor.s * 100}%`;
  const saturationCursorTop = `${(1 - hsvColor.v) * 100}%`;
  const hueCursorLeft = `${(normalizeHue(hsvColor.h) / 360) * 100}%`;
  const hueBaseColor = hsvToHex({ h: hsvColor.h, s: 1, v: 1 });
  const displayHex = hsvToHex(hsvColor);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" className="flex items-center gap-3 text-left" />
        }
      >
        <span
          className="size-5 rounded-full"
          style={{ backgroundColor: displayHex }}
        />
        <span className="text-[14px] font-semibold leading-none">
          Pick a color
        </span>
      </PopoverTrigger>

      <PopoverPopup
        align="start"
        sideOffset={8}
        className="w-60 border-none p-0 shadow-none before:hidden [--viewport-inline-padding:0] rounded-2xl"
        viewport="p-0"
      >
        <div className="p-2">
          <div
            ref={saturationRef}
            role="presentation"
            tabIndex={0}
            className="relative aspect-square w-full cursor-crosshair touch-none overflow-hidden rounded-2xl outline-none"
            style={{ backgroundColor: hueBaseColor }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateSaturationValue(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
              }

              updateSaturationValue(event.clientX, event.clientY);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black to-transparent" />
            <span
              className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
              style={{ left: saturationCursorLeft, top: saturationCursorTop }}
            >
              <span className="absolute inset-1 rounded-full bg-transparent" />
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between px-0.5 text-sm">
            <span>Hue</span>
            <span className="tabular-nums">{hsvColor.h.toFixed(2)}°</span>
          </div>

          <div
            ref={hueRef}
            role="presentation"
            className="relative mt-1 h-5 w-full cursor-ew-resize touch-none overflow-hidden rounded-full border border-white/15"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateHue(event.clientX);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
              }

              updateHue(event.clientX);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)]" />
            <span
              className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{ left: hueCursorLeft }}
            >
              <span className="absolute inset-1 rounded-full bg-transparent" />
            </span>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function normalizeHue(value: number) {
  const normalized = value % 360;

  return normalized < 0 ? normalized + 360 : normalized;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHsv(color: HsvColor): HsvColor {
  return {
    h: normalizeHue(color.h),
    s: clampNumber(color.s, 0, 1),
    v: clampNumber(color.v, 0, 1),
  };
}

function hsvToHex(color: HsvColor) {
  const normalized = normalizeHsv(color);
  const chroma = normalized.v * normalized.s;
  const hueSection = normalized.h / 60;
  const component = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = normalized.v - chroma;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hueSection >= 0 && hueSection < 1) {
    rPrime = chroma;
    gPrime = component;
  } else if (hueSection < 2) {
    rPrime = component;
    gPrime = chroma;
  } else if (hueSection < 3) {
    gPrime = chroma;
    bPrime = component;
  } else if (hueSection < 4) {
    gPrime = component;
    bPrime = chroma;
  } else if (hueSection < 5) {
    rPrime = component;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = component;
  }

  const red = Math.round((rPrime + match) * 255)
    .toString(16)
    .padStart(2, "0");
  const green = Math.round((gPrime + match) * 255)
    .toString(16)
    .padStart(2, "0");
  const blue = Math.round((bPrime + match) * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${red}${green}${blue}`.toUpperCase();
}

function hexToHsv(hex: string): HsvColor {
  const normalizedHex = toColorInputValue(hex, DEFAULT_GROUP_COLOR).slice(1);
  const red = parseInt(normalizedHex.slice(0, 2), 16) / 255;
  const green = parseInt(normalizedHex.slice(2, 4), 16) / 255;
  const blue = parseInt(normalizedHex.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
  }

  const saturation = max === 0 ? 0 : delta / max;

  return normalizeHsv({
    h: hue * 60,
    s: saturation,
    v: max,
  });
}

function formatWeightingLabel(value: string) {
  switch (value) {
    case "all":
      return "All";
    case "t1_gado":
      return "T1 Gado";
    case "t2_star":
      return "T2*";
    default:
      return value.toUpperCase();
  }
}

function getCanvasModeLabel(mode: ViewerCanvasMode) {
  switch (mode) {
    case "create-label":
      return "Place pin";
    case "set-anchor":
      return "Move pin";
    case "set-label":
      return "Move name";
    case "draw-region":
      return "Draw area";
    case "browse":
    default:
      return "Browse";
  }
}

function getCanvasModeDescription(mode: ViewerCanvasMode) {
  switch (mode) {
    case "create-label":
      return "Click once on the image to place a new teaching pin.";
    case "set-anchor":
      return "Click the image to move the pin to a better teaching point.";
    case "set-label":
      return "Click the image to move the visible name to a clearer position.";
    case "draw-region":
      return "Click around the structure to outline the teaching area. Double-click the image when the shape is complete.";
    case "browse":
    default:
      return "Browse the study, select a topic, or start a new pin or area.";
  }
}

function toColorInputValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim() ?? "";

  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

function ViewerSidebarSection({
  actions,
  children,
  title,
  className,
}: {
  actions?: ReactNode;
  children: ReactNode;
  title: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-t dark:border-white/8 py-4 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function TogglePill({
  active,
  label,
  onToggle,
}: {
  active: boolean;
  label: string;
  onToggle: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-xl border px-3 py-2 text-sm transition",
        active
          ? "border-cyan-400 bg-cyan-500/10 text-white"
          : "border-white/10 text-white/60",
      )}
      onClick={() => onToggle(!active)}
    >
      {label}
    </button>
  );
}

function ToggleRow({
  active,
  label,
  onToggle,
}: {
  active: boolean;
  label: string;
  onToggle: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl border border-white/8 px-3 py-2 text-sm"
      onClick={() => onToggle(!active)}
    >
      <span>{label}</span>
      <span
        className={cn(
          "inline-flex h-6 w-11 items-center rounded-full p-1 transition",
          active ? "bg-cyan-500/80" : "bg-white/12",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white transition",
            active ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
