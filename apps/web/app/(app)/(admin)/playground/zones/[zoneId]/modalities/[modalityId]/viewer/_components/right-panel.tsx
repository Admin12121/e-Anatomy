"use client";

import type { ReactNode } from "react";
import {
  CircleIcon,
  CrosshairIcon,
  EyeIcon,
  EyeOffIcon,
  FlipHorizontal2 as FlipHorizontal2Icon,
  FlipVertical2 as FlipVertical2Icon,
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
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { Frame, FramePanel } from "@/components/ui/frame";

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
  const allGroupIds = groups.map((group) => group.id);
  const defaultVisibleGroupIds = groups
    .filter((group) => group.isDefaultVisible)
    .map((group) => group.id);
  const allVisible =
    groups.length > 0 && visibleGroupIds.length === groups.length;
  const defaultPresetActive = areSameIds(
    visibleGroupIds,
    defaultVisibleGroupIds,
  );
  const visibilityPreset = allVisible
    ? "all"
    : defaultPresetActive
      ? "defaults"
      : "none";

  return (
    <aside className="min-h-0 overflow-y-auto p-2">
      <Frame>
        <div className="flex items-center justify-between px-3 py-2">
          Menu
        </div>
        <FramePanel>
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
              <ToggleGroup
                aria-label="Anatomical part visibility presets"
                className="rounded-lg bg-white/6 p-0.5"
                value={[visibilityPreset]}
                variant="outline"
                onValueChange={(nextValues) => {
                  const nextValue = nextValues[0] ?? "none";

                  if (nextValue === "all") {
                    onVisibleGroupIdsChange(allGroupIds);
                    return;
                  }

                  if (nextValue === "defaults") {
                    onVisibleGroupIdsChange(defaultVisibleGroupIds);
                    return;
                  }

                  onVisibleGroupIdsChange([]);
                }}
              >
                <ToggleGroupItem
                  aria-label={
                    allVisible
                      ? "Hide all anatomical parts"
                      : "Show all anatomical parts"
                  }
                  size="sm"
                  value="all"
                  className={"border-none"}
                >
                  {visibilityPreset === "none" ? (
                    <EyeOffIcon className="size-4" />
                  ) : (
                    <EyeIcon className="size-4" />
                  )}
                </ToggleGroupItem>
                <ToggleGroupItem
                  aria-label="Show default anatomical parts"
                  size="sm"
                  value="defaults"
                  className={"border-none"}
                >
                  <PlusIcon className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            }
          >
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between px-1 py-1.5 text-sm text-white/95"
                onClick={() =>
                  onVisibleGroupIdsChange(allVisible ? [] : allGroupIds)
                }
              >
                <span>Select all</span>
                <VisibilitySwitch active={allVisible} />
              </button>

              <div className="space-y-1">
                {groups.map((group) => {
                  const isVisible = visibleGroupIds.includes(group.id);

                  return (
                    <button
                      key={group.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left transition hover:bg-white/3"
                      onClick={() =>
                        onGroupVisibilityChange(group.id, !isVisible)
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
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
                      <VisibilitySwitch active={isVisible} />
                    </button>
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
    </aside>
  );
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

function areSameIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);

  return left.every((value) => rightSet.has(value));
}

function VisibilitySwitch({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-11 items-center rounded-full p-1 transition",
        active ? "bg-cyan-500/80" : "bg-white/20",
      )}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition",
          active ? "translate-x-5" : "translate-x-0",
        )}
      />
    </span>
  );
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
