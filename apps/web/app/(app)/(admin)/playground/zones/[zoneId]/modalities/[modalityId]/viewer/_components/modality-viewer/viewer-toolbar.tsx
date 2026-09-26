import {
  ArrowLeft,
  ArrowRight,
  Brush,
  CrosshairIcon,
  Eraser,
  Layers2Icon,
  MenuIcon,
  Move,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel } from "@/components/ui/frame";
import { Group } from "@/components/ui/group";
import { Slider } from "@/components/ui/slider";

import type { AreaEditTool, MainInteractionTool } from "./viewer-canvas";
import { ViewerSidebarSection } from "./right-panel/viewer-sidebar-section";

type ViewerToolbarProps = {
  activeAreaToolSize: number;
  areaEditTool: AreaEditTool;
  canvasMode:
    | "browse"
    | "draw-region"
    | "create-label"
    | "set-anchor"
    | "set-label";
  mainInteractionTool: MainInteractionTool;
  showControlPanel: boolean;
  crossReferenceToggleDisabled?: boolean;
  overlayOpacity: number;
  showCrossReferences: boolean;
  showStudyPanel: boolean;
  showStudyPanelToggle?: boolean;
  onAreaBrushSizeChange: (value: number) => void;
  onAreaDraftReset: () => void;
  onAreaEditToolChange: (tool: AreaEditTool) => void;
  onAreaEraserSizeChange: (value: number) => void;
  onMainInteractionToolChange: (tool: MainInteractionTool) => void;
  onOverlayOpacityChange: (value: number) => void;
  onShowControlPanelChange: (value: boolean) => void;
  onShowCrossReferencesChange: (value: boolean) => void;
  onShowStudyPanelChange: (value: boolean) => void;
};

export function ViewerToolbar({
  activeAreaToolSize,
  areaEditTool,
  canvasMode,
  mainInteractionTool,
  showControlPanel,
  crossReferenceToggleDisabled = false,
  overlayOpacity,
  showCrossReferences,
  showStudyPanel,
  showStudyPanelToggle = true,
  onAreaBrushSizeChange,
  onAreaEditToolChange,
  onAreaEraserSizeChange,
  onMainInteractionToolChange,
  onOverlayOpacityChange,
  onShowControlPanelChange,
  onShowCrossReferencesChange,
  onShowStudyPanelChange,
  onAreaDraftReset,
}: ViewerToolbarProps) {
  return (
    <>
      <Group
        aria-label="Viewer controls"
        className="absolute right-3 top-3 z-30 rounded-sm p-0.5 max-[719px]:top-10"
      >
        {showStudyPanelToggle ? (
          <Button
            aria-label={showStudyPanel ? "Hide study panel" : "Show study panel"}
            type="button"
            size="icon-lg"
            variant={!showStudyPanel ? "secondary" : "default"}
            onClick={() => onShowStudyPanelChange(!showStudyPanel)}
          >
            {showStudyPanel ? (
              <ArrowLeft className="size-4" />
            ) : (
              <ArrowRight className="size-4" />
            )}
          </Button>
        ) : null}
        {!crossReferenceToggleDisabled && (
          <Button
            aria-label={
              showCrossReferences ? "Hide crosshair" : "Show crosshair"
            }
            type="button"
            size="icon-lg"
            variant={!showCrossReferences ? "secondary" : "default"}
            disabled={crossReferenceToggleDisabled}
            onClick={
              crossReferenceToggleDisabled
                ? undefined
                : () => onShowCrossReferencesChange(!showCrossReferences)
            }
          >
            <CrosshairIcon className="size-4" />
          </Button>
        )}
        <Button
          aria-label="Layer scrub tool"
          type="button"
          size="icon-lg"
          variant={mainInteractionTool === "layers" ? "default" : "secondary"}
          onClick={() => onMainInteractionToolChange("layers")}
        >
          <Layers2Icon className="size-4" />
        </Button>
        <Button
          aria-label="Pan tool"
          type="button"
          size="icon-lg"
          variant={mainInteractionTool === "pan" ? "default" : "secondary"}
          onClick={() => onMainInteractionToolChange("pan")}
        >
          <Move className="size-4" />
        </Button>
        <Button
          aria-label="Zoom tool"
          type="button"
          size="icon-lg"
          variant={mainInteractionTool === "zoom" ? "default" : "secondary"}
          onClick={() => onMainInteractionToolChange("zoom")}
        >
          <SearchIcon className="size-4" />
        </Button>
        <Button
          aria-label={showControlPanel ? "Hide navigator" : "Show navigator"}
          type="button"
          size="icon-lg"
          variant={!showControlPanel ? "secondary" : "default"}
          onClick={() => onShowControlPanelChange(!showControlPanel)}
        >
          {showControlPanel ? (
            <ArrowRight className="size-4" />
          ) : (
            <>
              <MenuIcon className="size-4 xl:hidden" />
              <ArrowLeft className="hidden size-4 xl:block" />
            </>
          )}
        </Button>
      </Group>

      {canvasMode === "draw-region" ? (
        <Frame
          accordion
          className="absolute right-3 top-[4.1rem] z-30 flex w-55 flex-col"
        >
          <FrameHeader className="px-3 py-2">Tool Bar</FrameHeader>
          <FramePanel className="px-3 py-3">
            <ViewerSidebarSection title="Overlay opacity" border={false} className="p-0 mb-5">
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
            </ViewerSidebarSection>
            <ViewerSidebarSection title="Tool selection" border={false} className="p-0 mb-5">
              <Group
                aria-label="Spatial Adjustments"
                className="rounded-md bg-white/6 p-0.5"
              >
                <Button
                  type="button"
                  size="icon-lg"
                  variant={areaEditTool === "brush" ? "default" : "secondary"}
                  onClick={() => onAreaEditToolChange("brush")}
                >
                  <Brush className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-lg"
                  variant={areaEditTool === "erase" ? "default" : "secondary"}
                  onClick={() => onAreaEditToolChange("erase")}
                >
                  <Eraser className="size-4" />
                </Button>
                <Button
                  aria-label="Reset area canvas"
                  title="Reset area canvas"
                  type="button"
                  size="icon-lg"
                  variant="secondary"
                  onClick={onAreaDraftReset}
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
              </Group>
            </ViewerSidebarSection>
            <ViewerSidebarSection
              title={areaEditTool === "brush" ? "Brush size" : "Eraser size"}
              border={false}
              className="p-0 mb-4"
            >
              <Slider
                aria-label="Area tool size"
                className="w-28"
                max={64}
                min={4}
                step={1}
                value={[activeAreaToolSize]}
                onValueChange={(values) => {
                  const nextSize = values[0];

                  if (typeof nextSize !== "number" || Number.isNaN(nextSize)) {
                    return;
                  }

                  if (areaEditTool === "brush") {
                    onAreaBrushSizeChange(nextSize);
                    return;
                  }

                  onAreaEraserSizeChange(nextSize);
                }}
              />
            </ViewerSidebarSection>
          </FramePanel>
        </Frame>
      ) : null}
    </>
  );
}
