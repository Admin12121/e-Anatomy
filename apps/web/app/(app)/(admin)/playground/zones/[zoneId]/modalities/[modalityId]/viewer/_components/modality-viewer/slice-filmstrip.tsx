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
  useState,
  type CSSProperties,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ZoneModalityAsset,
  ZoneModalityAtlasFrame,
  ZoneModalityAtlasPage,
} from "@/lib/playground/types";

import {
  DeleteAllLeftIcon,
  DeleteAllRightIcon,
  FlipSliceOrderIcon,
} from "./icons";

type SliceItem = {
  asset: ZoneModalityAsset;
  assetId: string;
  assetIndex: number;
  atlasFrame: ZoneModalityAtlasFrame | null;
  atlasPage: ZoneModalityAtlasPage | null;
  thumbnailSrc: string;
};

type VirtualSliceWindow = {
  leftPadPx: number;
  rightPadPx: number;
  visibleItems: SliceItem[];
};

const COMPACT_ITEM_WIDTH_PX = 36;
const COMPACT_GAP_PX = 4;
const COMPACT_OVERSCAN = 14;
const EDITOR_ITEM_WIDTH_PX = 128;
const EDITOR_GAP_PX = 8;
const EDITOR_OVERSCAN = 8;

function buildAtlasThumbnailStyle(
  atlasPage: ZoneModalityAtlasPage,
  atlasFrame: ZoneModalityAtlasFrame,
  thumbnailSizePx: number,
): CSSProperties | null {
  if (
    atlasPage.width <= 0 ||
    atlasPage.height <= 0 ||
    atlasFrame.width <= 0 ||
    atlasFrame.height <= 0 ||
    thumbnailSizePx <= 0
  ) {
    return null;
  }

  const scale = Math.max(
    thumbnailSizePx / atlasFrame.width,
    thumbnailSizePx / atlasFrame.height,
  );
  const atlasScaledWidth = atlasPage.width * scale;
  const atlasScaledHeight = atlasPage.height * scale;
  const frameScaledWidth = atlasFrame.width * scale;
  const frameScaledHeight = atlasFrame.height * scale;
  const offsetX =
    -(atlasFrame.x * scale) - (frameScaledWidth - thumbnailSizePx) / 2;
  const offsetY =
    -(atlasFrame.y * scale) - (frameScaledHeight - thumbnailSizePx) / 2;

  return {
    backgroundImage: `url(${atlasPage.imageUrl})`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${atlasScaledWidth}px ${atlasScaledHeight}px`,
  };
}

function buildVirtualSliceWindow({
  activeIndex,
  gapPx,
  itemWidthPx,
  overscan,
  scrollLeft,
  sliceItems,
  viewportWidth,
}: {
  activeIndex: number;
  gapPx: number;
  itemWidthPx: number;
  overscan: number;
  scrollLeft: number;
  sliceItems: SliceItem[];
  viewportWidth: number;
}): VirtualSliceWindow {
  if (sliceItems.length === 0) {
    return {
      leftPadPx: 0,
      rightPadPx: 0,
      visibleItems: [],
    };
  }

  const itemSpanPx = itemWidthPx + gapPx;
  const clampedActiveIndex =
    activeIndex >= 0 ? Math.min(activeIndex, sliceItems.length - 1) : 0;

  let startIndex = 0;
  let endIndex = sliceItems.length;

  if (viewportWidth > 0) {
    const visibleCount = Math.max(1, Math.ceil(viewportWidth / itemSpanPx));
    startIndex = Math.max(0, Math.floor(scrollLeft / itemSpanPx) - overscan);
    endIndex = Math.min(
      sliceItems.length,
      startIndex + visibleCount + overscan * 2,
    );
  } else {
    startIndex = Math.max(0, clampedActiveIndex - overscan);
    endIndex = Math.min(sliceItems.length, clampedActiveIndex + overscan + 1);
  }

  if (clampedActiveIndex < startIndex || clampedActiveIndex >= endIndex) {
    const targetVisibleCount = Math.max(1, endIndex - startIndex);
    startIndex = Math.max(
      0,
      clampedActiveIndex - Math.floor(targetVisibleCount / 2),
    );
    endIndex = Math.min(sliceItems.length, startIndex + targetVisibleCount);
  }

  const leftPadPx = startIndex * itemSpanPx;
  const rightPadPx = (sliceItems.length - endIndex) * itemSpanPx;

  return {
    leftPadPx,
    rightPadPx,
    visibleItems: sliceItems.slice(startIndex, endIndex),
  };
}

type SliceFilmstripProps = {
  activeAssetId: string | null;
  canDeleteLeftSlices: boolean;
  canDeleteRightSlices: boolean;
  canDeleteSelectedSlice: boolean;
  canFlipSliceTimeline: boolean;
  canRedoSliceTimeline: boolean;
  canUndoSliceTimeline: boolean;
  sliceItems: SliceItem[];
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
  canDeleteLeftSlices,
  canDeleteRightSlices,
  canDeleteSelectedSlice,
  canFlipSliceTimeline,
  canRedoSliceTimeline,
  canUndoSliceTimeline,
  sliceItems,
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
  const [compactViewport, setCompactViewport] = useState({
    scrollLeft: 0,
    width: 0,
  });
  const [editorViewport, setEditorViewport] = useState({
    scrollLeft: 0,
    width: 0,
  });

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

  const activeSliceIndex = useMemo(
    () =>
      activeAssetId
        ? sliceItems.findIndex((sliceItem) => sliceItem.assetId === activeAssetId)
        : -1,
    [activeAssetId, sliceItems],
  );

  useEffect(() => {
    const scroller = filmstripScrollerRef.current;

    if (!scroller) {
      return;
    }

    let rafId: number | null = null;

    const updateViewport = () => {
      rafId = null;

      const nextState = {
        // Round sub-pixel scroll values to avoid feedback loops from tiny tween deltas.
        scrollLeft: Math.round(scroller.scrollLeft),
        width: scroller.clientWidth,
      };

      setCompactViewport((current) =>
        current.scrollLeft === nextState.scrollLeft &&
        current.width === nextState.width
          ? current
          : nextState,
      );
    };

    const scheduleViewportUpdate = () => {
      if (rafId !== null) {
        return;
      }

      rafId = window.requestAnimationFrame(updateViewport);
    };

    scheduleViewportUpdate();
    scroller.addEventListener("scroll", scheduleViewportUpdate, {
      passive: true,
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleViewportUpdate();
      });
      resizeObserver.observe(scroller);
    }

    return () => {
      scroller.removeEventListener("scroll", scheduleViewportUpdate);
      resizeObserver?.disconnect();

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [filmstripScrollerRef, sliceItems.length]);

  useEffect(() => {
    if (!showSliceEditorPanel) {
      return;
    }

    const scroller = sliceEditorScrollerRef.current;

    if (!scroller) {
      return;
    }

    let rafId: number | null = null;

    const updateViewport = () => {
      rafId = null;

      const nextState = {
        // Round sub-pixel scroll values to avoid feedback loops from tiny tween deltas.
        scrollLeft: Math.round(scroller.scrollLeft),
        width: scroller.clientWidth,
      };

      setEditorViewport((current) =>
        current.scrollLeft === nextState.scrollLeft &&
        current.width === nextState.width
          ? current
          : nextState,
      );
    };

    const scheduleViewportUpdate = () => {
      if (rafId !== null) {
        return;
      }

      rafId = window.requestAnimationFrame(updateViewport);
    };

    scheduleViewportUpdate();
    scroller.addEventListener("scroll", scheduleViewportUpdate, {
      passive: true,
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        scheduleViewportUpdate();
      });
      resizeObserver.observe(scroller);
    }

    return () => {
      scroller.removeEventListener("scroll", scheduleViewportUpdate);
      resizeObserver?.disconnect();

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [showSliceEditorPanel, sliceEditorScrollerRef, sliceItems.length]);

  const compactWindow = useMemo(
    () =>
      buildVirtualSliceWindow({
        activeIndex: activeSliceIndex,
        gapPx: COMPACT_GAP_PX,
        itemWidthPx: COMPACT_ITEM_WIDTH_PX,
        overscan: COMPACT_OVERSCAN,
        scrollLeft: compactViewport.scrollLeft,
        sliceItems,
        viewportWidth: compactViewport.width,
      }),
    [activeSliceIndex, compactViewport.scrollLeft, compactViewport.width, sliceItems],
  );

  const editorWindow = useMemo(
    () =>
      buildVirtualSliceWindow({
        activeIndex: activeSliceIndex,
        gapPx: EDITOR_GAP_PX,
        itemWidthPx: EDITOR_ITEM_WIDTH_PX,
        overscan: EDITOR_OVERSCAN,
        scrollLeft: editorViewport.scrollLeft,
        sliceItems,
        viewportWidth: editorViewport.width,
      }),
    [activeSliceIndex, editorViewport.scrollLeft, editorViewport.width, sliceItems],
  );

  const navigationLabel =
    navigationAssetIndex >= 0
      ? `${navigationAssetIndex + 1}/${totalSliceCount}`
      : `0/${totalSliceCount}`;

  const createSliceButton = useCallback(
    (sliceItem: SliceItem, variant: "compact" | "editor") => {
      const { asset, assetId, assetIndex, atlasFrame, atlasPage, thumbnailSrc } =
        sliceItem;
      const isActive = assetId === activeAssetId;
      const thumbnailSizePx =
        variant === "compact" ? COMPACT_ITEM_WIDTH_PX : EDITOR_ITEM_WIDTH_PX;
      const atlasThumbnailStyle =
        atlasFrame && atlasPage
          ? buildAtlasThumbnailStyle(atlasPage, atlasFrame, thumbnailSizePx)
          : null;

      return (
        <button
          key={variant === "compact" ? assetId : `editor-${assetId}`}
          aria-label={asset.label}
          data-asset-id={assetId}
          data-asset-index={assetIndex}
          type="button"
          className={cn(
            variant === "compact"
              ? "group relative w-9 shrink-0 overflow-hidden rounded-sm border border-transparent text-left transition"
              : "relative w-32 shrink-0 overflow-hidden rounded-md border text-left transition",
            variant === "compact"
              ? isActive
                ? "bg-indigo-500/20 opacity-100"
                : "bg-black/20 opacity-60 hover:bg-white/6 hover:opacity-100"
              : isActive
                ? "border-indigo-600"
                : "hover:border-white/45",
          )}
          onClick={handleSelectAsset}
        >
          <div
            className={cn(
              "aspect-square",
              variant === "compact" ? "bg-black/40" : "bg-black/50",
            )}
          >
            {atlasThumbnailStyle ? (
              <div className="h-full w-full" style={atlasThumbnailStyle} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={asset.label}
                className="h-full w-full object-cover"
                decoding="async"
                fetchPriority={isActive ? "high" : "low"}
                loading={isActive ? "eager" : "lazy"}
                src={thumbnailSrc}
              />
            )}
          </div>
          {variant === "editor" ? (
            <div className="absolute top-0 px-1.5 py-1 text-[10px] font-semibold">
              {assetIndex + 1}
            </div>
          ) : null}
        </button>
      );
    },
    [activeAssetId, handleSelectAsset],
  );

  const filmstripButtons = useMemo(
    () =>
      compactWindow.visibleItems.map((sliceItem) =>
        createSliceButton(sliceItem, "compact"),
      ),
    [compactWindow.visibleItems, createSliceButton],
  );

  const editorButtons = useMemo(
    () =>
      editorWindow.visibleItems.map((sliceItem) =>
        createSliceButton(sliceItem, "editor"),
      ),
    [createSliceButton, editorWindow.visibleItems],
  );

  return (
    <div className="absolute bottom-0 left-0 w-full px-2">
      <div
        className={cn(
          "rounded-sm bg-white/3 backdrop-blur-sm transition-all",
          showSliceEditorPanel && "pb-2",
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
              <div
                className="flex w-max items-end gap-1"
                style={{
                  paddingLeft: `${compactWindow.leftPadPx}px`,
                  paddingRight: `${compactWindow.rightPadPx}px`,
                }}
              >
                {filmstripButtons}
              </div>
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
                    ? `Selected ${navigationAssetIndex + 1}/${totalSliceCount}`
                    : `Selected 0/${totalSliceCount}`}
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
              <div
                className="flex w-max items-start gap-2"
                style={{
                  paddingLeft: `${editorWindow.leftPadPx}px`,
                  paddingRight: `${editorWindow.rightPadPx}px`,
                }}
              >
                {editorButtons}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
