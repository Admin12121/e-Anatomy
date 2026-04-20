import {
  ArrowLeft,
  ArrowRight,
  LayoutGrid,
  LoaderCircleIcon,
  Redo2,
  Trash,
  Undo2,
} from "lucide-react";
import NextImage from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ZoneModalityAsset } from "@/lib/playground/types";

import {
  DeleteAllLeftIcon,
  DeleteAllRightIcon,
  FlipSliceOrderIcon,
} from "./icons";

type FilmstripAsset = {
  asset: ZoneModalityAsset;
  assetIndex: number;
};

type SliceFilmstripProps = {
  activeAssetId: string | null;
  activeAssets: ZoneModalityAsset[];
  canDeleteLeftSlices: boolean;
  canDeleteRightSlices: boolean;
  canDeleteSelectedSlice: boolean;
  canFlipSliceTimeline: boolean;
  canRedoSliceTimeline: boolean;
  canUndoSliceTimeline: boolean;
  filmstripAssets: FilmstripAsset[];
  filmstripScrollerRef: MutableRefObject<HTMLDivElement | null>;
  hasPendingSliceTimelineChanges: boolean;
  isApplyingSliceChanges: boolean;
  isAssetLoading: boolean;
  navigationAssetIndex: number;
  pendingDeletedSliceIds: string[];
  pendingSliceSortUpdates: Array<{ asset: ZoneModalityAsset; nextSortOrder: number }>;
  showSliceEditorPanel: boolean;
  sliceEditorScrollerRef: MutableRefObject<HTMLDivElement | null>;
  totalSliceCount: number;
  onApplyChanges: () => void;
  onDeleteLeft: () => void;
  onDeleteRight: () => void;
  onDeleteSelected: () => void;
  onFlipOrder: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSelectAsset: (assetIndex: number) => void;
  onToggleBlockView: () => void;
  onToggleSliceEditorPanel: () => void;
  onUndo: () => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onRedo: () => void;
};

export function SliceFilmstrip({
  activeAssetId,
  activeAssets,
  canDeleteLeftSlices,
  canDeleteRightSlices,
  canDeleteSelectedSlice,
  canFlipSliceTimeline,
  canRedoSliceTimeline,
  canUndoSliceTimeline,
  filmstripAssets,
  filmstripScrollerRef,
  hasPendingSliceTimelineChanges,
  isApplyingSliceChanges,
  isAssetLoading,
  navigationAssetIndex,
  pendingDeletedSliceIds,
  pendingSliceSortUpdates,
  showSliceEditorPanel,
  sliceEditorScrollerRef,
  totalSliceCount,
  onApplyChanges,
  onDeleteLeft,
  onDeleteRight,
  onDeleteSelected,
  onFlipOrder,
  onNext,
  onPrevious,
  onSelectAsset,
  onToggleBlockView,
  onToggleSliceEditorPanel,
  onUndo,
  onWheel,
  onRedo,
}: SliceFilmstripProps) {
  const onSelectAssetRef = useRef(onSelectAsset);

  useEffect(() => {
    onSelectAssetRef.current = onSelectAsset;
  }, [onSelectAsset]);

  const handleSelectAsset = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const assetIndex = Number(event.currentTarget.dataset.assetIndex);

      if (Number.isNaN(assetIndex)) {
        return;
      }

      onSelectAssetRef.current(assetIndex);
    },
    [],
  );

  const navigationLabel =
    navigationAssetIndex >= 0
      ? `${navigationAssetIndex + 1}/${totalSliceCount}`
      : `0/${totalSliceCount}`;

  const filmstripButtons = useMemo(
    () =>
      filmstripAssets.map(({ asset, assetIndex }) => (
        <button
          key={asset.id}
          data-asset-id={asset.id}
          data-asset-index={assetIndex}
          type="button"
          className={cn(
            "group relative w-9 shrink-0 overflow-hidden rounded-sm border border-transparent text-left transition",
            asset.id === activeAssetId
              ? "bg-indigo-500/20 opacity-100"
              : "bg-black/20 opacity-60 hover:bg-white/6 hover:opacity-100",
          )}
          onClick={handleSelectAsset}
        >
          <div className="aspect-square bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={asset.label}
              className="h-full w-full object-cover"
              decoding="async"
              fetchPriority="low"
              loading="lazy"
              src={asset.thumbnailUrl || asset.imageUrl}
            />
          </div>
        </button>
      )),
    [activeAssetId, filmstripAssets, handleSelectAsset],
  );

  const editorButtons = useMemo(
    () =>
      filmstripAssets.map(({ asset, assetIndex }) => (
        <button
          key={`editor-${asset.id}`}
          data-asset-id={asset.id}
          data-asset-index={assetIndex}
          type="button"
          className={cn(
            "relative w-32 shrink-0 overflow-hidden rounded-md border text-left transition",
            asset.id === activeAssetId
              ? "border-indigo-600"
              : "hover:border-white/45",
          )}
          onClick={handleSelectAsset}
        >
          <div className="aspect-square bg-black/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={asset.label}
              className="h-full w-full object-cover"
              decoding="async"
              fetchPriority="low"
              loading="lazy"
              src={asset.thumbnailUrl || asset.imageUrl}
            />
          </div>
          <div className="absolute top-0 px-1.5 py-1 text-[10px] font-semibold">
            {assetIndex + 1}
          </div>
        </button>
      )),
    [activeAssetId, filmstripAssets, handleSelectAsset],
  );

  return (
    <div className="absolute bottom-1 left-0 w-full px-1">
      <div
        className={cn(
          "rounded-sm bg-white/3 backdrop-blur-sm transition-all",
          showSliceEditorPanel && "pb-1",
        )}
      >
        <div className="mx-auto grid w-full max-w-[calc(100%-0.5rem)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-1">
          <button
            type="button"
            aria-expanded={showSliceEditorPanel}
            aria-label={
              showSliceEditorPanel
                ? "Collapse slice editing panel"
                : "Expand slice editing panel"
            }
            className={cn(
              "flex size-7 items-center justify-center rounded-md border border-transparent bg-black/35 transition hover:border-white/30",
              showSliceEditorPanel && "border-indigo-600/70",
            )}
            onClick={onToggleSliceEditorPanel}
          >
            <NextImage src="/logo.png" alt="Anatomy" height={24} width={24} />
          </button>

          <div className="relative ml-23.75 min-w-0">
            <div className="pointer-events-none absolute inset-y-1 left-1/2 z-20 w-px -translate-x-1/2 bg-primary" />
            <div
              ref={filmstripScrollerRef}
              className="no-scrollbar mx-auto max-w-full overflow-x-auto rounded-sm bg-[#f4f4f5] p-1 dark:bg-[#121212]"
              onWheel={onWheel}
            >
              <div className="flex w-max items-end gap-1">{filmstripButtons}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="icon" onClick={onToggleBlockView}>
              <LayoutGrid />
            </Button>
            <Button size="icon" onClick={onPrevious}>
              <ArrowLeft />
            </Button>
            <p className="w-24 pr-1 text-center text-sm font-semibold tabular-nums dark:text-white/85">
              {isAssetLoading ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <LoaderCircleIcon className="size-3 animate-spin" />
                  {navigationLabel}
                </span>
              ) : (
                navigationLabel
              )}
            </p>
            <Button size="icon" onClick={onNext}>
              <ArrowRight />
            </Button>
          </div>
        </div>

        {showSliceEditorPanel ? (
          <div className="mx-auto h-50 w-full max-w-[calc(100%-0.5rem)] rounded-md border border-white/12 bg-black/60 p-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Undo"
                disabled={!canUndoSliceTimeline}
                onClick={onUndo}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Redo"
                disabled={!canRedoSliceTimeline}
                onClick={onRedo}
              >
                <Redo2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Delete all left from selected"
                disabled={!canDeleteLeftSlices}
                onClick={onDeleteLeft}
              >
                <DeleteAllLeftIcon className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Delete all right from selected"
                disabled={!canDeleteRightSlices}
                onClick={onDeleteRight}
              >
                <DeleteAllRightIcon className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Delete selected slice"
                disabled={!canDeleteSelectedSlice}
                onClick={onDeleteSelected}
              >
                <Trash className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Flip slice order"
                disabled={!canFlipSliceTimeline}
                onClick={onFlipOrder}
              >
                <FlipSliceOrderIcon className="size-4" />
              </Button>
              <span className="ml-auto text-xs text-white/75">
                {hasPendingSliceTimelineChanges
                  ? `Pending ${pendingDeletedSliceIds.length} delete / ${pendingSliceSortUpdates.length} reorder`
                  : navigationAssetIndex >= 0
                    ? `Selected ${navigationAssetIndex + 1}/${activeAssets.length}`
                    : `Selected 0/${activeAssets.length}`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={!hasPendingSliceTimelineChanges || isApplyingSliceChanges}
                onClick={onApplyChanges}
              >
                {isApplyingSliceChanges ? "Applying..." : "Apply changes"}
              </Button>
            </div>

            <div
              ref={sliceEditorScrollerRef}
              className="no-scrollbar h-36.25 overflow-x-auto rounded-md bg-black/35 p-2"
              onWheel={onWheel}
            >
              <div className="flex w-max items-start gap-2">{editorButtons}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
