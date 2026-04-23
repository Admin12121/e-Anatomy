import {
  ArrowLeft,
  ArrowRight,
  CrosshairIcon,
  Layers2Icon,
  Move,
  SearchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";

import type { AreaEditTool, MainInteractionTool } from "./viewer-canvas";

type ViewerToolbarProps = {
  activeAreaToolSize: number;
  areaEditTool: AreaEditTool;
  canvasMode: "browse" | "draw-region" | "create-label" | "set-anchor" | "set-label";
  mainInteractionTool: MainInteractionTool;
  showControlPanel: boolean;
  crossReferenceToggleDisabled?: boolean;
  showCrossReferences: boolean;
  showStudyPanel: boolean;
  onAreaBrushSizeChange: (value: number) => void;
  onAreaEditToolChange: (tool: AreaEditTool) => void;
  onAreaEraserSizeChange: (value: number) => void;
  onMainInteractionToolChange: (tool: MainInteractionTool) => void;
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
  showCrossReferences,
  showStudyPanel,
  onAreaBrushSizeChange,
  onAreaEditToolChange,
  onAreaEraserSizeChange,
  onMainInteractionToolChange,
  onShowControlPanelChange,
  onShowCrossReferencesChange,
  onShowStudyPanelChange,
}: ViewerToolbarProps) {
  return (
    <>
      <Group
        aria-label="Viewer controls"
        className="absolute right-3 top-3 z-30 rounded-sm p-0.5"
      >
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
        {!crossReferenceToggleDisabled && <Button
          aria-label={showCrossReferences ? "Hide crosshair" : "Show crosshair"}
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
        </Button>}
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
          aria-label={showControlPanel ? "Hide menu" : "Show menu"}
          type="button"
          size="icon-lg"
          variant={!showControlPanel ? "secondary" : "default"}
          onClick={() => onShowControlPanelChange(!showControlPanel)}
        >
          {showControlPanel ? (
            <ArrowRight className="size-4" />
          ) : (
            <ArrowLeft className="size-4" />
          )}
        </Button>
      </Group>

      {canvasMode === "draw-region" ? (
        <Group
          aria-label="Area editing tools"
          className="absolute right-3 top-[4.1rem] z-30 rounded-sm p-0.5"
        >
          <Button
            type="button"
            size="sm"
            variant={areaEditTool === "brush" ? "default" : "secondary"}
            onClick={() => onAreaEditToolChange("brush")}
          >
            Brush
          </Button>
          <Button
            type="button"
            size="sm"
            variant={areaEditTool === "erase" ? "default" : "secondary"}
            onClick={() => onAreaEditToolChange("erase")}
          >
            Erase
          </Button>
          <div className="flex flex-col gap-1 rounded-md bg-black/75 px-2 py-1 text-xs text-white/90">
            <span>{areaEditTool === "brush" ? "Brush size" : "Eraser size"}</span>
            <input
              aria-label="Area tool size"
              className="h-1.5 w-28 accent-indigo-300"
              max={64}
              min={4}
              step={1}
              type="range"
              value={activeAreaToolSize}
              onChange={(event) => {
                const nextSize = Number(event.target.value);

                if (Number.isNaN(nextSize)) {
                  return;
                }

                if (areaEditTool === "brush") {
                  onAreaBrushSizeChange(nextSize);
                  return;
                }

                onAreaEraserSizeChange(nextSize);
              }}
            />
            <span className="text-right tabular-nums">{activeAreaToolSize}</span>
          </div>
        </Group>
      ) : null}
    </>
  );
}
