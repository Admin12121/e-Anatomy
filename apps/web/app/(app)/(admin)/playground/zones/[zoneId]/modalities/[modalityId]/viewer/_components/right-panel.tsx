"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CameraIcon,
  EyeIcon,
  EyeOffIcon,
  FlipHorizontal2 as FlipHorizontal2Icon,
  FlipVertical2 as FlipVertical2Icon,
  ImageIcon,
  LoaderCircleIcon,
  MousePointer2,
  MoonIcon,
  Pen,
  PenOff,
  PlusIcon,
  RotateCcw,
  RotateCcwIcon,
  RotateCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Group } from "@/components/ui/group";
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ViewerStructure,
  ViewerStructureGroup,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import {
  DEFAULT_ANNOTATION_COLOR,
  EMPTY_ANNOTATION_FORM,
  type AnnotationFormState,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AnimatedThemeToggler } from "@/components/animated-theme-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { uploadThumbnail } from "@/lib/playground/thumbnail-upload";
import { AnatomicalAreaColorPicker } from "./modality-viewer/right-panel/anatomical-area-color-picker";
import { AnatomicalPartEditorWindow } from "./modality-viewer/right-panel/anatomical-part-editor-window";
import {
  type PartInteractionMode,
  PART_INTERACTION_MARKER,
  parsePartInteractionModeFromDraft,
  parsePartInteractionModeFromStructure,
} from "./modality-viewer/right-panel/shared";
import { toColorInputValue } from "./modality-viewer/right-panel/utils";
import { ViewerSidebarSection } from "./modality-viewer/right-panel/viewer-sidebar-section";

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

type WeightingSelectOption = {
  label: string;
  value: string;
};

type RightPanelProps = {
  activeWeighting: string;
  annotationForm: AnnotationFormState;
  busy: boolean;
  canvasMode: ViewerCanvasMode;
  canvasFlipHorizontal: boolean;
  canvasFlipVertical: boolean;
  currentAsset: ZoneModalityAsset | null;
  groupForm: GroupFormState;
  groups: ViewerStructureGroup[];
  groupsById: Map<string, ViewerStructureGroup>;
  readOnly: boolean;
  selectedAnnotationId: string | null;
  selectedStructureId: string | null;
  overlayOpacity: number;
  showLabels: boolean;
  showOrientation: boolean;
  showStudyPanel: boolean;
  structureForm: StructureFormState;
  structures: ViewerStructure[];
  visibleGroupIds: string[];
  weightingBusy: boolean;
  weightingDisabled: boolean;
  weightingOptions: WeightingSelectOption[];
  onAnnotationFormChange: UpdateAnnotationForm;
  onCanvasModeChange: (mode: ViewerCanvasMode) => void;
  onCancelAnnotationEdit: () => void;
  onClearPolygonDraft: () => void;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onDeleteStructure: (structureId: string) => Promise<void>;
  onFlipCanvasHorizontal: () => void;
  onFlipCanvasVertical: () => void;
  onGroupFormChange: UpdateGroupForm;
  onGroupVisibilityChange: (groupId: string, nextVisible: boolean) => void;
  onOverlayOpacityChange: (value: number) => void;
  onResetGroup: () => void;
  onResetStructure: () => void;
  onRotateCanvasLeft: () => void;
  onRotateCanvasRight: () => void;
  onSaveAnnotation: (options?: {
    structureId?: string;
  }) => void | Promise<void>;
  onSaveGroup: () => Promise<ViewerStructureGroup | null>;
  onSaveStructure: (options?: {
    groupId?: string | null;
  }) => Promise<ViewerStructure | null>;
  onSelectGroup: (groupId: string) => void;
  onSelectStructure: (structureId: string, groupId: string | null) => void;
  onShowLabelsChange: (value: boolean) => void;
  onShowOrientationChange: (value: boolean) => void;
  onShowStudyPanelChange: (value: boolean) => void;
  onStructureFormChange: UpdateStructureForm;
  onTakeScreenshot: () => void | Promise<void>;
  onVisibleGroupIdsChange: (groupIds: string[]) => void;
  onWeightingChange: (weighting: string) => void;
  onClose?: () => void;
  handleReset: () => void;
};

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
  canvasMode,
  canvasFlipHorizontal,
  canvasFlipVertical,
  currentAsset,
  groupForm,
  groups,
  groupsById,
  readOnly,
  selectedAnnotationId,
  selectedStructureId,
  overlayOpacity,
  showLabels,
  showStudyPanel,
  structureForm,
  structures,
  visibleGroupIds,
  weightingBusy,
  weightingDisabled,
  weightingOptions,
  onAnnotationFormChange,
  onCanvasModeChange,
  onCancelAnnotationEdit,
  onClearPolygonDraft,
  onDeleteGroup,
  onDeleteStructure,
  onFlipCanvasHorizontal,
  onFlipCanvasVertical,
  onGroupFormChange,
  onGroupVisibilityChange,
  onOverlayOpacityChange,
  onResetGroup,
  onResetStructure,
  onRotateCanvasLeft,
  onRotateCanvasRight,
  onSaveAnnotation,
  onSaveGroup,
  onSaveStructure,
  onSelectGroup,
  onSelectStructure,
  onShowLabelsChange,
  onShowStudyPanelChange,
  onStructureFormChange,
  onTakeScreenshot,
  onVisibleGroupIdsChange,
  onWeightingChange,
  onClose,
  handleReset,
}: RightPanelProps) {
  const [showAnatomicalPartsPanel, setShowAnatomicalPartsPanel] =
    useState(false);
  const [showCreatePartFrame, setShowCreatePartFrame] = useState(false);
  const [showPartEditorWindow, setShowPartEditorWindow] = useState(false);
  const [isUploadingGroupThumbnail, setIsUploadingGroupThumbnail] =
    useState(false);
  const [partEditorInitialContent, setPartEditorInitialContent] = useState("");
  const [partInteractionMode, setPartInteractionMode] =
    useState<PartInteractionMode>("pointer");
  const [selectedAnatomicalPartId, setSelectedAnatomicalPartId] = useState<
    string | null
  >(null);
  const activeWeightingLabel =
    weightingOptions.find((option) => option.value === activeWeighting)
      ?.label ?? activeWeighting;
  const allGroupIds = groups.map((group) => group.id);
  const allGroupsVisible =
    allGroupIds.length > 0 && visibleGroupIds.length === allGroupIds.length;
  const selectedAnatomicalPart = selectedAnatomicalPartId
    ? (groupsById.get(selectedAnatomicalPartId) ?? null)
    : null;
  const selectedAnatomicalPartRows = selectedAnatomicalPart
    ? structures.filter(
        (structure) => structure.groupId === selectedAnatomicalPart.id,
      )
    : [];
  const annotationColorValue = toColorInputValue(
    annotationForm.colorHex,
    structureForm.colorHex || DEFAULT_ANNOTATION_COLOR,
  );
  const areaEditingActive = canvasMode === "draw-region";
  const pointerPlacementEditingActive =
    canvasMode === "create-label" ||
    canvasMode === "set-anchor" ||
    canvasMode === "set-label";
  const placementTypeLocked = Boolean(selectedStructureId);
  const hasPointerDraft = hasPointerPlacementDraft(annotationForm);

  const resetPartEditorState = useCallback(() => {
    setShowPartEditorWindow(false);
    setPartEditorInitialContent("");
    setPartInteractionMode("pointer");
    onClearPolygonDraft();
    onCanvasModeChange("browse");
  }, [onCanvasModeChange, onClearPolygonDraft]);

  const handlePartColorChange = useCallback(
    (value: string) => {
      onStructureFormChange("colorHex", value);
      onAnnotationFormChange("colorHex", value);
      onAnnotationFormChange("leaderColorHex", value);
      onAnnotationFormChange("overlayColorHex", value);
    },
    [onAnnotationFormChange, onStructureFormChange],
  );

  useEffect(() => {
    if (selectedAnatomicalPartId && !groupsById.has(selectedAnatomicalPartId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAnatomicalPartId(null);
      setShowCreatePartFrame(false);
      resetPartEditorState();
    }
  }, [groupsById, resetPartEditorState, selectedAnatomicalPartId]);

  useEffect(() => {
    if (!showCreatePartFrame) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPartInteractionMode(
      parsePartInteractionModeFromDraft(structureForm.learningPoints),
    );
  }, [showCreatePartFrame, structureForm.learningPoints]);

  const handleSaveAnatomicalPart = async () => {
    const savedGroup = await onSaveGroup();

    if (!savedGroup) {
      return;
    }

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
    onCancelAnnotationEdit();
  };

  const handleEnablePointerPlacementEditing = () => {
    onCanvasModeChange("set-anchor");
  };

  const handlePlacementToolToggle = (nextValues: string[]) => {
    const nextTool = nextValues[0];

    if (!nextTool) {
      onCancelAnnotationEdit();
      return;
    }

    if (nextTool === "area-edit") {
      onCanvasModeChange("draw-region");
      return;
    }

    handleEnablePointerPlacementEditing();
  };

  const handleDeleteSelectedPart = async () => {
    if (!selectedStructureId) {
      return;
    }

    await onDeleteStructure(selectedStructureId);
    onResetStructure();
    setShowCreatePartFrame(false);
    resetPartEditorState();
  };

  const handleDeleteSelectedAnatomicalArea = async () => {
    if (!selectedAnatomicalPart) {
      return;
    }

    await onDeleteGroup(selectedAnatomicalPart.id);
    onResetGroup();
    setSelectedAnatomicalPartId(null);
    setShowCreatePartFrame(false);
    resetPartEditorState();
  };

  const handleSaveStructurePart = async () => {
    if (!selectedAnatomicalPart) {
      return;
    }

    const savedStructure = await onSaveStructure({
      groupId: selectedAnatomicalPart.id,
    });

    if (!savedStructure) {
      return;
    }

    const shouldSaveDraftAnnotation =
      selectedAnnotationId !== null ||
      hasPartAnnotationDraft(partInteractionMode, annotationForm);

    if (shouldSaveDraftAnnotation) {
      await onSaveAnnotation({ structureId: savedStructure.id });
    }

    onCanvasModeChange("browse");
  };

  const handleGroupThumbnailSelection = (file: File) => {
    setIsUploadingGroupThumbnail(true);
    uploadThumbnail(file)
      .then((url) => onGroupFormChange("thumbnailUrl", url))
      .catch(() => toast.error("Unable to upload thumbnail."))
      .finally(() => setIsUploadingGroupThumbnail(false));
  };

  return (
    <aside className="min-h-0 space-y-3 overflow-y-auto p-2 max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-50 max-xl:w-[min(22rem,calc(100vw-2rem))] max-xl:border-l max-xl:border-border/70 max-xl:bg-background max-xl:shadow-2xl">
      <Frame>
        <div className="flex items-center justify-between px-3 py-2">
          <span>Navigator</span>
          {onClose ? (
            <Button
              aria-label="Close navigator"
              className="xl:hidden"
              type="button"
              size="icon"
              variant="secondary"
              onClick={onClose}
            >
              <XIcon className="size-4" />
            </Button>
          ) : null}
        </div>
        <FramePanel className="p-3">
          {weightingOptions.length > 0 ? (
                <ViewerSidebarSection title="Signal Mode">
              <Select
                disabled={weightingDisabled}
                value={activeWeighting}
                onValueChange={(value) => {
                  if (value) {
                    onWeightingChange(value);
                  }
                }}
              >
                <SelectTrigger className="w-full rounded-xl text-sm">
                  <SelectValue placeholder="Filter slices">
                    {activeWeightingLabel}
                  </SelectValue>
                  {weightingBusy ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin text-white/65" />
                  ) : null}
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {weightingOptions.map((weighting) => (
                    <SelectItem key={weighting.value} value={weighting.value}>
                      {weighting.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ViewerSidebarSection>
          ) : null}

          <ViewerSidebarSection
            title="Anatomic Zones"
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
                {!readOnly ? (
                    <Button
                      aria-label="Show anatomic zones editor"
                    type="button"
                    size="icon"
                    variant={showAnatomicalPartsPanel ? "default" : "secondary"}
                    onClick={() => {
                      const next = !showAnatomicalPartsPanel;

                      setShowCreatePartFrame(false);
                      resetPartEditorState();

                      if (next) {
                        // Create-area mode and edit-area mode are mutually exclusive.
                        setSelectedAnatomicalPartId(null);
                        onResetGroup();
                      }

                      setShowAnatomicalPartsPanel(next);
                    }}
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                ) : null}
              </Group>
            }
          >
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between px-1 py-1.5 text-sm"
                onClick={() =>
                  onVisibleGroupIdsChange(allGroupsVisible ? [] : allGroupIds)
                }
              >
                <span>Mark all</span>
                <Switch
                  checked={allGroupsVisible}
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
                        "hover:bg-white/3",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2.5">
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-md transition"
                          disabled={readOnly}
                          aria-label={`Open ${group.title} details`}
                          onClick={() => {
                            if (readOnly) {
                              return;
                            }

                            const nextGroupId =
                              selectedAnatomicalPartId === group.id
                                ? null
                                : group.id;

                            setShowAnatomicalPartsPanel(false);
                            setShowCreatePartFrame(false);
                            resetPartEditorState();

                            if (nextGroupId) {
                              onSelectGroup(nextGroupId);
                            } else {
                              onResetGroup();
                            }

                            setSelectedAnatomicalPartId(nextGroupId);
                          }}
                        >
                          {group.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt=""
                              className="size-6 rounded object-cover"
                              src={group.thumbnailUrl}
                            />
                          ) : (
                            <ImageIcon className="size-4" />
                          )}
                        </button>
                        <span className="truncate text-[15px] leading-5">
                          {group.title}
                        </span>
                      </span>
                      <Switch
                        checked={isVisible}
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

          <ViewerSidebarSection title="Spatial Adjustments" className="pb-0">
            <div className="space-y-2">
              <Group
                aria-label="Spatial adjustments"
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
                  aria-label="Reset spatial adjustments"
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
      {!readOnly && showAnatomicalPartsPanel ? (
        <Frame>
          <div className="flex items-center justify-between px-3 py-2">
            Anatomic Zone
            <Button
              disabled={
                busy ||
                isUploadingGroupThumbnail ||
                !groupForm.title.trim() ||
                !groupForm.thumbnailUrl.trim()
              }
              type="button"
              onClick={() => void handleSaveAnatomicalPart()}
            >
              Save
              {(busy || isUploadingGroupThumbnail) && (
                <LoaderCircleIcon className="size-4 animate-spin" />
              )}
            </Button>
          </div>
          <FramePanel className="p-3">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Zone Name</div>
                <Input
                  placeholder="Ex: Frontal Lobe"
                  value={groupForm.title}
                  onChange={(event) =>
                    onGroupFormChange("title", event.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Thumbnail Image</div>
                  <ImageUploadDropzone
                  disabled={isUploadingGroupThumbnail}
                  emptyTitle="Drop thumbnail image here"
                  onClear={() => onGroupFormChange("thumbnailUrl", "")}
                  onFileAccepted={handleGroupThumbnailSelection}
                  previewAlt="Anatomic zone thumbnail"
                  value={groupForm.thumbnailUrl}
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
              {!readOnly ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    disabled={
                      busy ||
                      isUploadingGroupThumbnail ||
                      !groupForm.title.trim() ||
                      !groupForm.thumbnailUrl.trim()
                    }
                    onClick={() => void handleUpdateSelectedAnatomicalArea()}
                  >
                    Save
                    {(busy || isUploadingGroupThumbnail) && (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    )}
                  </Button>
                  <DeleteConfirmationDialog
                    confirmationLabel="Zone name"
                    confirmationValue={selectedAnatomicalPart.title}
                    descriptionPrefix="Delete this anatomic zone and ungroup its linked topics. To confirm, enter the"
                    disabled={busy}
                    onConfirm={handleDeleteSelectedAnatomicalArea}
                    placeholder={selectedAnatomicalPart.title}
                    title="Delete anatomic zone"
                    trigger={
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </div>
            <FramePanel className="p-3">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Zone Name</div>
                  {readOnly ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                      {selectedAnatomicalPart.title}
                    </div>
                  ) : (
                    <Input
                      placeholder="Ex: Frontal Lobe"
                      value={groupForm.title}
                      onChange={(event) =>
                        onGroupFormChange("title", event.target.value)
                      }
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium">Thumbnail Image</div>
                  {readOnly ? (
                    selectedAnatomicalPart.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={selectedAnatomicalPart.title}
                        className="h-24 w-32 rounded-md object-cover"
                        src={selectedAnatomicalPart.thumbnailUrl}
                      />
                    ) : null
                  ) : (
                    <ImageUploadDropzone
                      disabled={isUploadingGroupThumbnail}
                      emptyTitle="Drop thumbnail image here"
                      onClear={() => onGroupFormChange("thumbnailUrl", "")}
                      onFileAccepted={handleGroupThumbnailSelection}
                      previewAlt="Anatomic zone thumbnail"
                      value={groupForm.thumbnailUrl}
                    />
                  )}
                </div>
              </div>
            </FramePanel>
          </Frame>

          {!readOnly ? (
            <div className="p-1">
              <Frame className="shrink-0 outline-offset-2 outline outline-border/50 rounded-lg p-0">
                <FrameHeader className="py-1 px-2 flex items-center justify-between flex-row">
                  <FrameTitle className="text-lg">Anatomic Structure</FrameTitle>
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
                        resetPartEditorState();
                      }

                      setShowCreatePartFrame(next);
                    }}
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                </FrameHeader>
              </Frame>
            </div>
          ) : null}

          <Frame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Part Name</TableHead>
                  <TableHead className="text-right">
                    {readOnly ? "View" : "Action"}
                  </TableHead>
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
                              resetPartEditorState();

                              if (readOnly) {
                                return;
                              }

                              setShowCreatePartFrame(true);
                              setPartEditorInitialContent(
                                structure.longDescription ?? "",
                              );
                              setPartInteractionMode(interactionMode);
                              onCanvasModeChange("browse");
                            }}
                          >
                            {readOnly ? "Open" : "Edit"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-white/60">
                      No anatomic structures yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Frame>

          {!readOnly && showCreatePartFrame ? (
            <Frame>
              <div className="flex items-center justify-between px-3 py-2">
                {selectedStructureId
                  ? "Edit Anatomic Structure"
                  : "New Anatomic Structure"}
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
                    <DeleteConfirmationDialog
                      confirmationLabel="Structure name"
                      confirmationValue={structureForm.title.trim()}
                      descriptionPrefix="Delete this anatomic structure and all linked pins and zones. To confirm, enter the"
                      disabled={busy || !structureForm.title.trim()}
                      onConfirm={handleDeleteSelectedPart}
                      placeholder={structureForm.title.trim()}
                      title="Delete anatomic structure"
                      trigger={
                        <Button
                          disabled={busy}
                          type="button"
                          variant="destructive"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      }
                    />
                  ) : null}
                </div>
              </div>
              <FramePanel className="p-3">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-white/70">
                      Structure Name
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
                      Part Color
                    </div>
                    <AnatomicalAreaColorPicker
                      colorHex={annotationColorValue}
                      onColorChange={handlePartColorChange}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-white/70">
                      Placement Type
                    </div>
                    <Select
                      disabled={placementTypeLocked}
                      value={partInteractionMode}
                      onValueChange={(value) => {
                        if (value === "pointer" || value === "area") {
                          handlePartInteractionModeChange(value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full rounded-xl text-sm">
                        <SelectValue placeholder="Select placement type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pointer">Pointer</SelectItem>
                        <SelectItem value="area">Area</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <ToggleGroup
                        value={
                          areaEditingActive
                            ? ["area-edit"]
                            : pointerPlacementEditingActive
                              ? ["pointer-edit"]
                              : []
                        }
                        onValueChange={handlePlacementToolToggle}
                      >
                        {partInteractionMode === "area" ? (
                          <ToggleGroupItem
                            aria-label="Toggle area editing"
                            className="gap-2"
                            value="area-edit"
                          >
                            {areaEditingActive ? (
                              <PenOff className="size-4" />
                            ) : (
                              <Pen className="size-4" />
                            )}
                            {areaEditingActive ? "Cancel area" : "Edit area"}
                          </ToggleGroupItem>
                        ) : null}
                        <ToggleGroupItem
                          aria-label="Toggle pointer placement editing"
                          className="gap-2"
                          value="pointer-edit"
                        >
                          {pointerPlacementEditingActive ? (
                            <PenOff className="size-4" />
                          ) : (
                            <MousePointer2 className="size-4" />
                          )}
                          {pointerPlacementEditingActive
                            ? "Cancel pointer"
                            : hasPointerDraft || selectedAnnotationId
                              ? "Fix pointer"
                              : "Place pointer"}
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-medium">Explanation</div>

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
                    </div>
                  </div>
                </div>
              </FramePanel>
            </Frame>
          ) : null}

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
      
      {readOnly ? (
        <Frame>
          <FrameHeader className="px-3 py-2 text-sm font-semibold">
            Viewing Mode
          </FrameHeader>
          <FramePanel className="space-y-3 p-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <svg
                    data-v-25379b65=""
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    fill="none"
                  >
                    <path
                      fill="currentColor"
                      d="m8.725 1.977.151.036 5.404 1.646c.736.225 1.24.905 1.24 1.675v2.319l6.473 4.115c.989.629.646 2.151-.517 2.296l-5.956.735v5.777c0 1.173-1.47 1.7-2.216.794l-4.701-5.716-2.201.273a1.75 1.75 0 0 1-1.793-.981l-2.173-4.541a1.25 1.25 0 0 1 .981-1.782l3.844-.45V3.207a1.25 1.25 0 0 1 1.464-1.231m1.642 13.459 3.653 4.443v-4.894zm-6.428-5.363 2.022 4.225a.25.25 0 0 0 .257.14l2.61-.322 3.749-.464-4.992-4.007zm11.581 3.215 5.08-.628-5.08-3.23zM8.761 8.664l5.259 4.222V5.334a.25.25 0 0 0-.178-.239l-5.08-1.55z"
                    ></path>
                  </svg>
                  <span className="truncate">Show/hide cross references</span>
                </span>
                <Switch
                  aria-label="Toggle cross references"
                  checked={showStudyPanel}
                  onCheckedChange={onShowStudyPanelChange}
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <MoonIcon className="size-4 shrink-0 opacity-80" />
                  <span className="truncate">Dark mode</span>
                </span>
                <AnimatedThemeToggler aria-label="Toggle dark mode" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Overlay opacity</div>
              <Slider
                aria-label="Overlay opacity"
                className="w-full"
                max={1}
                min={0.1}
                step={0.05}
                value={[overlayOpacity]}
                onValueChange={(values) => {
                  const nextOpacity = values[0];

                  if (
                    typeof nextOpacity !== "number" ||
                    Number.isNaN(nextOpacity)
                  ) {
                    return;
                  }

                  onOverlayOpacityChange(nextOpacity);
                }}
              />
            </div>

            <Button
              className="w-full"
              type="button"
              variant="secondary"
              onClick={() => void onTakeScreenshot()}
            >
              <CameraIcon className="size-4" />
              Take a screenshot
            </Button>
          </FramePanel>
        </Frame>
      ) : null}
    </aside>
  );
}
