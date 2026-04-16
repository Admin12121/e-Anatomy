"use client";

import type { PartialBlock } from "@blocknote/core";
import { BlockNoteViewRaw, useCreateBlockNote } from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/react/style.css";
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
  MinusIcon,
  SquareIcon,
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
import { Safari } from "@/components/ui/safari";
import type {
  ViewerAccessLevel,
  ViewerAnnotation,
  ViewerStructure,
  ViewerStructureGroup,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import { cn } from "@/lib/utils";

import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_GROUP_COLOR,
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
  onSaveAnnotation: () => void | Promise<void>;
  onSaveGroup: () => void | Promise<void>;
  onSaveStructure: () => void | Promise<void>;
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
const PART_EDITOR_DEFAULT_RECT = {
  height: 620,
  width: 980,
  x: 120,
  y: 84,
};
const PART_EDITOR_SCREEN_STYLE: React.CSSProperties = {
  height: "92.9615%",
  left: "0.0831%",
  top: "6.9057%",
  width: "99.7506%",
};

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
  };

  const handleSaveStructurePart = async () => {
    if (!selectedAnatomicalPart) {
      return;
    }

    if (structureForm.groupId !== selectedAnatomicalPart.id) {
      onStructureFormChange("groupId", selectedAnatomicalPart.id);
    }

    await onSaveStructure();
    onCanvasModeChange(partInteractionMode === "area" ? "draw-region" : "create-label");
    onResetStructure();
    onStructureFormChange("groupId", selectedAnatomicalPart.id);
    onStructureFormChange("learningPoints", "");
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
              <SelectTrigger className="w-full rounded-xl border-white/10 bg-white/3 text-sm text-white [&_svg]:text-white/70">
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
                  onClick={() =>
                    setShowAnatomicalPartsPanel((current) => !current)
                  }
                >
                  <PlusIcon className="size-4" />
                </Button>
              </Group>
            }
          >
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between px-1 py-1.5 text-sm text-white/95"
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
                          className="inline-flex size-6 items-center justify-center rounded-md text-white/70 transition hover:bg-white/8 hover:text-white"
                          aria-label={`Open ${group.title} details`}
                          onClick={() => {
                            onSelectGroup(group.id);
                            setSelectedAnatomicalPartId(group.id);
                            setShowCreatePartFrame(false);
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
                        <span className="truncate text-[15px] leading-5 text-white/95">
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

          <ViewerSidebarSection title="Transformations">
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

          {/* {isAuthoringMode ? (
            <>
              <ViewerSidebarSection title="Labeling">
                <div className="grid grid-cols-2 gap-2">
                  <TogglePill
                    active={practiceMode}
                    label="Practice mode"
                    onToggle={onPracticeModeChange}
                  />
                  <TogglePill
                    active={pinsOnly}
                    label="Pins only"
                    onToggle={onPinsOnlyChange}
                  />
                  <TogglePill
                    active={targetedLabeling}
                    label="Focus topic"
                    onToggle={onTargetedLabelingChange}
                  />
                  <TogglePill
                    active={showLabels}
                    label="Show names"
                    onToggle={onShowLabelsChange}
                  />
                </div>
                <div className="mt-3">
                  <div className="mb-2 text-sm text-white/70">Text size</div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={fontScaleMode === "auto" ? "secondary" : "default"}
                      onClick={() => onFontScaleModeChange("auto")}
                    >
                      Auto
                    </Button>
                    <Button
                      type="button"
                      variant={
                        fontScaleMode === "large" ? "secondary" : "default"
                      }
                      onClick={() => onFontScaleModeChange("large")}
                    >
                      Large
                    </Button>
                  </div>
                </div>
              </ViewerSidebarSection>

              <ViewerSidebarSection title="Display mode">
                <div className="space-y-2">
                  <ToggleRow
                    active={showOrientation}
                    label="Orientation title"
                    onToggle={onShowOrientationChange}
                  />
                  <ToggleRow
                    active={showCrossReferences}
                    label="Guide lines"
                    onToggle={onShowCrossReferencesChange}
                  />
                  <ToggleRow
                    active={darkMode}
                    label="Dark background"
                    onToggle={onDarkModeChange}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <div className="text-sm text-white/70">Overlay strength</div>
                  <input
                    className="w-full accent-cyan-400"
                    max={1}
                    min={0.1}
                    step={0.05}
                    type="range"
                    value={overlayOpacity}
                    onChange={(event) =>
                      onOverlayOpacityChange(Number(event.target.value))
                    }
                  />
                </div>
              </ViewerSidebarSection>

              <ViewerSidebarSection title="Advanced settings">
                <div className="space-y-2">
                  <ToggleRow
                    active={reverseScroll}
                    label="Reverse scroll"
                    onToggle={onReverseScrollChange}
                  />
                  <ToggleRow
                    active={pointAnimation}
                    label="Pulse markers"
                    onToggle={onPointAnimationChange}
                  />
                </div>
              </ViewerSidebarSection>
            </>
          ) : (
            <ViewerSidebarSection title="Study controls">
              <div className="grid grid-cols-2 gap-2">
                <TogglePill
                  active={showLabels}
                  label="Show names"
                  onToggle={onShowLabelsChange}
                />
                <TogglePill
                  active={pinsOnly}
                  label="Pins only"
                  onToggle={onPinsOnlyChange}
                />
                <TogglePill
                  active={practiceMode}
                  label="Practice"
                  onToggle={onPracticeModeChange}
                />
                <TogglePill
                  active={darkMode}
                  label="Dark mode"
                  onToggle={onDarkModeChange}
                />
              </div>
              <div className="mt-3 space-y-2">
                <ToggleRow
                  active={showOrientation}
                  label="Orientation title"
                  onToggle={onShowOrientationChange}
                />
                <ToggleRow
                  active={showCrossReferences}
                  label="Guide lines"
                  onToggle={onShowCrossReferencesChange}
                />
              </div>
              <div className="mt-3 space-y-2">
                <div className="text-sm text-white/70">Overlay strength</div>
                <input
                  className="w-full accent-cyan-400"
                  max={1}
                  min={0.1}
                  step={0.05}
                  type="range"
                  value={overlayOpacity}
                  onChange={(event) =>
                    onOverlayOpacityChange(Number(event.target.value))
                  }
                />
              </div>
            </ViewerSidebarSection>
          )}

          {isAuthoringMode ? (
            <>
              <ViewerSidebarSection title="Workflow status">
                <div className="rounded-2xl border border-white/8 bg-white/3 p-3 text-sm text-white/70">
                  Follow this order: group, then topic, then pin/area. Controls
                  only appear when the previous step is ready.
                </div>
                <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 p-3 text-sm text-white/70">
                  <div className="flex items-center justify-between gap-3">
                    <span>Selected topic</span>
                    <span className="text-right text-white">
                      {selectedStructure?.title ?? "No topic selected yet"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span>Current tool</span>
                    <span className="text-right text-white">
                      {getCanvasModeLabel(canvasMode)}
                    </span>
                  </div>
                </div>
              </ViewerSidebarSection>

              <ViewerSidebarSection title="Authoring workflow">
                <div className="space-y-4">
                  <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-white">
                        Step 1: Group
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={onResetGroup}
                      >
                        New
                      </Button>
                    </div>
                    {groups.length > 0 ? (
                      <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-1.5">
                        {groups.map((group) => (
                          <div
                            key={group.id}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                              selectedGroupId === group.id
                                ? "border-cyan-400/65 bg-cyan-500/10"
                                : "border-transparent",
                            )}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                              onClick={() => onSelectGroup(group.id)}
                            >
                              <span
                                className="size-2.5 rounded-full"
                                style={{ backgroundColor: group.colorHex }}
                              />
                              <span className="truncate">{group.title}</span>
                            </button>
                            <button
                              type="button"
                              className="rounded-md p-1 text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
                              title="Delete group"
                              onClick={() => void onDeleteGroup(group.id)}
                            >
                              <Trash2Icon className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/15 bg-black/25 p-3 text-sm text-white/60">
                        No groups yet. Create one to unlock topic authoring.
                      </div>
                    )}
                    <Input
                      placeholder="Group title"
                      value={groupForm.title}
                      onChange={(event) =>
                        onGroupFormChange("title", event.target.value)
                      }
                    />
                    <div className="flex items-center gap-2">
                      <input
                        aria-label="Group color"
                        className="h-10 w-14 rounded-xl border border-white/15 bg-transparent p-1"
                        type="color"
                        value={toColorInputValue(
                          groupForm.colorHex,
                          DEFAULT_GROUP_COLOR,
                        )}
                        onChange={(event) =>
                          onGroupFormChange("colorHex", event.target.value)
                        }
                      />
                      <Input
                        placeholder="Color value"
                        value={groupForm.colorHex}
                        onChange={(event) =>
                          onGroupFormChange("colorHex", event.target.value)
                        }
                      />
                    </div>
                    <ToggleRow
                      active={groupForm.isDefaultVisible}
                      label="Visible by default"
                      onToggle={(value) =>
                        onGroupFormChange("isDefaultVisible", value)
                      }
                    />
                    <Button
                      disabled={busy}
                      type="button"
                      variant="secondary"
                      onClick={() => void onSaveGroup()}
                    >
                      {busy ? (
                        <LoaderCircleIcon className="size-4 animate-spin" />
                      ) : (
                        <Layers2Icon className="size-4" />
                      )}
                      Save group
                    </Button>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-white">
                        Step 2: Topic
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedStructureId ? (
                          <Button asChild size="sm" variant="secondary">
                            <Link
                              href={`/playground/zones/${zoneId}/modalities/${modalityId}/viewer/structures/${selectedStructureId}`}
                            >
                              Write details
                            </Link>
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={onResetStructure}
                        >
                          New
                        </Button>
                      </div>
                    </div>
                    {groups.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/15 bg-black/25 p-3 text-sm text-white/60">
                        Save at least one group first. Topic controls appear right
                        after that.
                      </div>
                    ) : (
                      <>
                        {structures.length > 0 ? (
                          <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-1.5">
                            {structures.map((structure) => {
                              const group = structure.groupId
                                ? groupsById.get(structure.groupId)
                                : null;

                              return (
                                <div
                                  key={structure.id}
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                                    selectedStructureId === structure.id
                                      ? "border-cyan-400/65 bg-cyan-500/10"
                                      : "border-transparent",
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 text-left"
                                    onClick={() =>
                                      onSelectStructure(
                                        structure.id,
                                        structure.groupId ?? null,
                                      )
                                    }
                                  >
                                    <div className="truncate text-sm text-white">
                                      {structure.title}
                                    </div>
                                    <div className="truncate text-[11px] text-white/45">
                                      {group?.title ?? "Ungrouped"}
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md p-1 text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
                                    title="Delete topic"
                                    onClick={() =>
                                      void onDeleteStructure(structure.id)
                                    }
                                  >
                                    <Trash2Icon className="size-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        <Input
                          placeholder="Topic title"
                          value={structureForm.title}
                          onChange={(event) =>
                            onStructureFormChange("title", event.target.value)
                          }
                        />
                        <select
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                          value={structureForm.groupId}
                          onChange={(event) =>
                            onStructureFormChange("groupId", event.target.value)
                          }
                        >
                          <option value="">No group yet</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.title}
                            </option>
                          ))}
                        </select>
                        <select
                          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                          value={structureForm.accessLevel}
                          onChange={(event) =>
                            onStructureFormChange(
                              "accessLevel",
                              event.target.value as ViewerAccessLevel,
                            )
                          }
                        >
                          <option value="free">Open to all learners</option>
                          <option value="subscription">Subscriber lesson</option>
                        </select>
                        <Textarea
                          placeholder="Short explanation shown first"
                          value={structureForm.shortDescription}
                          onChange={(event) =>
                            onStructureFormChange(
                              "shortDescription",
                              event.target.value,
                            )
                          }
                        />
                        <button
                          type="button"
                          className="text-left text-xs text-cyan-300 underline underline-offset-2"
                          onClick={onStructureAdvancedToggle}
                        >
                          {showStructureAdvanced
                            ? "Hide advanced topic fields"
                            : "Show advanced topic fields"}
                        </button>
                        {showStructureAdvanced ? (
                          <>
                            <Input
                              placeholder="Latin name"
                              value={structureForm.latinName}
                              onChange={(event) =>
                                onStructureFormChange(
                                  "latinName",
                                  event.target.value,
                                )
                              }
                            />
                            <Textarea
                              placeholder="Detailed teaching explanation"
                              value={structureForm.longDescription}
                              onChange={(event) =>
                                onStructureFormChange(
                                  "longDescription",
                                  event.target.value,
                                )
                              }
                            />
                            <Textarea
                              placeholder="Key learning points, one line per point"
                              value={structureForm.learningPoints}
                              onChange={(event) =>
                                onStructureFormChange(
                                  "learningPoints",
                                  event.target.value,
                                )
                              }
                            />
                            <Textarea
                              placeholder="Other names, separated by commas"
                              value={structureForm.synonyms}
                              onChange={(event) =>
                                onStructureFormChange(
                                  "synonyms",
                                  event.target.value,
                                )
                              }
                            />
                          </>
                        ) : null}
                        <Button
                          disabled={busy}
                          type="button"
                          onClick={() => void onSaveStructure()}
                        >
                          {busy ? (
                            <LoaderCircleIcon className="size-4 animate-spin" />
                          ) : (
                            <SparklesIcon className="size-4" />
                          )}
                          Save topic
                        </Button>
                      </>
                    )}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-3">
                    <div className="text-sm font-medium text-white">
                      Step 3: Pin and area
                    </div>
                    {!canEditPinArea ? (
                      <div className="rounded-xl border border-dashed border-white/15 bg-black/25 p-3 text-sm text-white/60">
                        Save or select a topic first. Pin and area tools unlock
                        automatically after that.
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => onCanvasModeChange("create-label")}
                          >
                            <PinIcon className="size-4" />
                            Place pin
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => onCanvasModeChange("draw-region")}
                          >
                            <CrosshairIcon className="size-4" />
                            Brush area
                          </Button>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-black/25 p-3 text-sm text-white/70">
                          {getCanvasModeDescription(canvasMode)}
                        </div>

                        {currentAnnotations.length > 0 ? (
                          <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/20 p-1.5">
                            {currentAnnotations.map((annotation) => {
                              const structure = structuresById.get(
                                annotation.structureId,
                              );

                              return (
                                <div
                                  key={annotation.id}
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                                    selectedAnnotationId === annotation.id
                                      ? "border-cyan-400/65 bg-cyan-500/10"
                                      : "border-transparent",
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 truncate text-left text-sm"
                                    onClick={() =>
                                      onSelectAnnotation(
                                        annotation.id,
                                        annotation.structureId,
                                      )
                                    }
                                  >
                                    {annotation.titleOverride ||
                                      structure?.title ||
                                      "Untitled annotation"}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md p-1 text-red-300 transition hover:bg-red-500/20 hover:text-red-200"
                                    title="Delete annotation"
                                    onClick={() =>
                                      void onDeleteAnnotation(annotation.id)
                                    }
                                  >
                                    <Trash2Icon className="size-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {canEditAnnotationDetails ? (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => onCanvasModeChange("set-anchor")}
                              >
                                Move pin
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => onCanvasModeChange("set-label")}
                              >
                                Move name
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                disabled={
                                  annotationForm.polygonPoints.length === 0
                                }
                                type="button"
                                variant="secondary"
                                onClick={onUndoPolygonPoint}
                              >
                                <Undo2Icon className="size-4" />
                                Undo point
                              </Button>
                              <Button
                                disabled={
                                  annotationForm.polygonPoints.length === 0
                                }
                                type="button"
                                variant="secondary"
                                onClick={onClearPolygonDraft}
                              >
                                <RotateCcwIcon className="size-4" />
                                Clear area
                              </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="space-y-1 text-xs text-white/70">
                                <span>Pin</span>
                                <input
                                  aria-label="Pin color"
                                  className="h-9 w-full rounded-lg border border-white/15 bg-transparent p-1"
                                  type="color"
                                  value={toColorInputValue(
                                    annotationForm.colorHex,
                                    DEFAULT_ANNOTATION_COLOR,
                                  )}
                                  onChange={(event) => {
                                    onAnnotationFormChange(
                                      "colorHex",
                                      event.target.value,
                                    );
                                    onAnnotationFormChange(
                                      "leaderColorHex",
                                      event.target.value,
                                    );
                                  }}
                                />
                              </label>
                              <label className="space-y-1 text-xs text-white/70">
                                <span>Line</span>
                                <input
                                  aria-label="Leader color"
                                  className="h-9 w-full rounded-lg border border-white/15 bg-transparent p-1"
                                  type="color"
                                  value={toColorInputValue(
                                    annotationForm.leaderColorHex,
                                    DEFAULT_ANNOTATION_COLOR,
                                  )}
                                  onChange={(event) =>
                                    onAnnotationFormChange(
                                      "leaderColorHex",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                              <label className="space-y-1 text-xs text-white/70">
                                <span>Area</span>
                                <input
                                  aria-label="Overlay color"
                                  className="h-9 w-full rounded-lg border border-white/15 bg-transparent p-1"
                                  type="color"
                                  value={toColorInputValue(
                                    annotationForm.overlayColorHex,
                                    DEFAULT_ANNOTATION_COLOR,
                                  )}
                                  onChange={(event) =>
                                    onAnnotationFormChange(
                                      "overlayColorHex",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                            </div>
                            <Input
                              placeholder="Name shown on the image"
                              value={annotationForm.titleOverride}
                              onChange={(event) =>
                                onAnnotationFormChange(
                                  "titleOverride",
                                  event.target.value,
                                )
                              }
                            />
                            <Textarea
                              placeholder="Teaching note"
                              value={annotationForm.note}
                              onChange={(event) =>
                                onAnnotationFormChange("note", event.target.value)
                              }
                            />
                            <Button
                              disabled={busy || !selectedStructure}
                              type="button"
                              onClick={() => void onSaveAnnotation()}
                            >
                              {busy ? (
                                <LoaderCircleIcon className="size-4 animate-spin" />
                              ) : (
                                <CircleIcon className="size-4" />
                              )}
                              Save annotation
                            </Button>
                          </>
                        ) : (
                          <div className="rounded-xl border border-dashed border-white/15 bg-black/25 p-3 text-sm text-white/60">
                            Place one pin or start brushing an area to unlock
                            annotation details.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </ViewerSidebarSection>
            </>
          ) : (
            <ViewerSidebarSection title="Learner preview">
              <div className="rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                Learner mode keeps only study controls and topic exploration.
                Authoring steps are hidden to avoid accidental editing.
              </div>
            </ViewerSidebarSection>
          )} */}
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
                <div className="text-xs font-medium text-white/70">
                  Area Name
                </div>
                <Input
                  placeholder="Ex: Frontal Lobe"
                  value={groupForm.title}
                  onChange={(event) =>
                    onGroupFormChange("title", event.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-white/70">Color</div>
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
                  <div className="text-xs font-medium text-white/70">
                    Area Name
                  </div>
                  <Input
                    placeholder="Ex: Frontal Lobe"
                    value={groupForm.title}
                    onChange={(event) =>
                      onGroupFormChange("title", event.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-white/70">Color</div>
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
                    setShowCreatePartFrame((current) => {
                      const next = !current;

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
                      } else {
                        setShowPartEditorWindow(false);
                      }

                      return next;
                    });
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
                New Anatomical Part
                <Button
                  disabled={busy || !structureForm.title.trim()}
                  type="button"
                  onClick={() => void handleSaveStructurePart()}
                >
                  Save
                  {busy && <LoaderCircleIcon className="size-4 animate-spin" />}
                </Button>
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
                        onClick={() => handlePartInteractionModeChange("pointer")}
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
                    <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/70">
                      <p>
                        Use the editor window to write the short description and
                        full rich explanation. Draft content is preserved on
                        minimize and close.
                      </p>
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
                          Open Editor Window
                        </Button>
                        <span className="truncate text-[11px] text-white/50">
                          {structureForm.shortDescription.trim()
                            ? "Description draft ready"
                            : "No description draft yet"}
                        </span>
                      </div>
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
                  <TableHead>Previous Title</TableHead>
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
                            onCanvasModeChange(
                              interactionMode === "area"
                                ? "draw-region"
                                : "create-label",
                            );
                          }}
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  )})
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
              shortDescription={structureForm.shortDescription}
              onClose={() => setShowPartEditorWindow(false)}
              onLongDescriptionChange={(value) =>
                onStructureFormChange("longDescription", value)
              }
              onShortDescriptionChange={(value) =>
                onStructureFormChange("shortDescription", value)
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

function toEditorBlocks(value: string | null | undefined): PartialBlock[] {
  const normalized = value?.trim();

  if (!normalized) {
    return [{ type: "paragraph", content: "" }];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [{ type: "paragraph", content: normalized }];
  }

  return paragraphs.map((paragraph) => ({
    type: "paragraph",
    content: paragraph,
  }));
}

function AnatomicalPartEditorWindow({
  initialContent,
  partTitle,
  shortDescription,
  onClose,
  onLongDescriptionChange,
  onShortDescriptionChange,
}: {
  initialContent: string;
  partTitle: string;
  shortDescription: string;
  onClose: () => void;
  onLongDescriptionChange: (value: string) => void;
  onShortDescriptionChange: (value: string) => void;
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [windowRect, setWindowRect] = useState(PART_EDITOR_DEFAULT_RECT);
  const previousWindowRectRef = useRef(PART_EDITOR_DEFAULT_RECT);
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

  const editor = useCreateBlockNote(
    {
      initialContent: toEditorBlocks(initialContent),
    },
    [initialContent],
  );

  const persistEditorDraft = () => {
    const nextMarkdown = editor.blocksToMarkdownLossy(editor.document).trim();
    onLongDescriptionChange(nextMarkdown);
  };

  useEffect(() => {
    if (!isMaximized) {
      return;
    }

    const applyMaximizedRect = () => {
      setWindowRect({
        x: 20,
        y: 20,
        width: Math.max(PART_EDITOR_MIN_WIDTH, window.innerWidth - 40),
        height: Math.max(PART_EDITOR_MIN_HEIGHT, window.innerHeight - 40),
      });
    };

    applyMaximizedRect();
    window.addEventListener("resize", applyMaximizedRect);

    return () => {
      window.removeEventListener("resize", applyMaximizedRect);
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
      setWindowRect(previousWindowRectRef.current);
      setIsMaximized(false);
      return;
    }

    previousWindowRectRef.current = windowRect;
    setIsMaximized(true);
  };

  if (isMinimized) {
    return (
      <div className="pointer-events-auto fixed bottom-4 right-4 z-[90]">
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
    <div className="pointer-events-none fixed inset-0 z-[90]">
      <div
        className="pointer-events-auto absolute"
        style={{
          height: windowRect.height,
          left: windowRect.x,
          top: windowRect.y,
          width: windowRect.width,
        }}
      >
        <Safari
          className="pointer-events-none h-full w-full rounded-2xl shadow-2xl"
          mode="simple"
          style={{
            aspectRatio: "auto",
            height: "100%",
            width: "100%",
          }}
          url={partTitle.trim() || "New Anatomical Part"}
        />

        <div className="absolute z-20" style={PART_EDITOR_SCREEN_STYLE}>
          <div className="flex h-full flex-col overflow-hidden rounded-b-xl border border-white/10 bg-[#0b0d10]/95">
            <div
              className={cn(
                "flex select-none items-center justify-between border-b border-white/10 px-3 py-2",
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
                const maxX = Math.max(8, window.innerWidth - windowRect.width - 8);
                const maxY = Math.max(
                  8,
                  window.innerHeight - windowRect.height - 8,
                );

                setWindowRect((current) => ({
                  ...current,
                  x: clampNumber(dragState.originX + deltaX, 8, maxX),
                  y: clampNumber(dragState.originY + deltaY, 8, maxY),
                }));
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                dragStateRef.current = null;
              }}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {partTitle.trim() || "New Anatomical Part"}
                </div>
                <div className="text-[11px] text-white/55">
                  Rich editor auto-saves on minimize and close.
                </div>
              </div>

              <Group className="rounded-md bg-white/7 p-0.5">
                <Button
                  aria-label="Minimize"
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={handleWindowMinimize}
                >
                  <MinusIcon className="size-4" />
                </Button>
                <Button
                  aria-label={isMaximized ? "Restore window" : "Maximize window"}
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={handleWindowMaximizeToggle}
                >
                  <SquareIcon className="size-4" />
                </Button>
                <Button
                  aria-label="Close editor"
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={handleWindowClose}
                >
                  <XIcon className="size-4" />
                </Button>
              </Group>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <aside className="space-y-2 overflow-y-auto border-b border-white/10 p-3 lg:border-b-0 lg:border-r">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/65">
                  Description
                </div>
                <Textarea
                  className="min-h-28"
                  placeholder="Short summary for this anatomical part"
                  value={shortDescription}
                  onChange={(event) =>
                    onShortDescriptionChange(event.target.value)
                  }
                />
                <p className="text-[11px] leading-5 text-white/55">
                  Full explanation is written in the rich editor panel.
                </p>
              </aside>

              <section className="project-rich-text min-h-0 border-white/10 bg-black/20">
                <BlockNoteViewRaw
                  className="h-full"
                  editor={editor}
                  sideMenu={true}
                  theme="dark"
                  onChange={persistEditorDraft}
                />
              </section>
            </div>
          </div>
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
              const maxWidth = Math.max(
                PART_EDITOR_MIN_WIDTH,
                window.innerWidth - windowRect.x - 8,
              );
              const maxHeight = Math.max(
                PART_EDITOR_MIN_HEIGHT,
                window.innerHeight - windowRect.y - 8,
              );

              setWindowRect((current) => ({
                ...current,
                width: clampNumber(
                  resizeState.width + widthDelta,
                  PART_EDITOR_MIN_WIDTH,
                  maxWidth,
                ),
                height: clampNumber(
                  resizeState.height + heightDelta,
                  PART_EDITOR_MIN_HEIGHT,
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
        className="w-[15rem] border-none p-0 shadow-none before:hidden [--viewport-inline-padding:0] rounded-2xl"
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
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black to-transparent" />
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
}: {
  actions?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="border-t border-white/8 py-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-white">{title}</div>
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
