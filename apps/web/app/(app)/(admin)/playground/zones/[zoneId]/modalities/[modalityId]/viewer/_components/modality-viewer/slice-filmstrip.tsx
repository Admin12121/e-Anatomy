import {
  ArrowLeft,
  ArrowRight,
  LayoutGrid,
  LoaderCircleIcon,
  MousePointerClick,
  Redo2,
  TicketMinus,
  Trash,
  Tickets,
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
import { Checkbox } from "@/components/ui/checkbox";
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

const COMPACT_ITEM_WIDTH_PX = 36;
const EDITOR_ITEM_WIDTH_PX = 128;

function buildAtlasThumbnailStyle(
  atlasPage: ZoneModalityAtlasPage,
  atlasFrame: ZoneModalityAtlasFrame,
  thumbnailSizePx: number,
  fit: "cover" | "contain" = "cover",
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

  const scale =
    fit === "contain"
      ? Math.min(
          thumbnailSizePx / atlasFrame.width,
          thumbnailSizePx / atlasFrame.height,
        )
      : Math.max(
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

function LazyAtlasThumbnail({
  eager,
  scrollerRef,
  style,
}: {
  eager: boolean;
  scrollerRef: MutableRefObject<HTMLDivElement | null>;
  style: CSSProperties;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    if (eager) {
      setVisible(true);
      return;
    }

    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisible(true);
        observer.disconnect();
      },
      {
        root: scrollerRef.current,
        rootMargin: "160px",
      },
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, [eager, scrollerRef]);

  return (
    <div ref={hostRef} className="h-full w-full">
      {visible ? <div className="h-full w-full" style={style} /> : null}
    </div>
  );
}

type SliceFilmstripProps = {
  activeAssetId: string | null;
  allowEditing: boolean;
  allowTimelineChanges?: boolean;
  timelineControlMode?: "full" | "synchronized-delete";
  thumbnailFit?: "cover" | "contain";
  lazyAtlasThumbnails?: boolean;
  mobileCompactNavigation?: boolean;
  canDeleteLeftSlices: boolean;
  canDeleteEvenSlices: boolean;
  canDeleteMultiSelectedSlices: boolean;
  canDeleteOddSlices: boolean;
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
  navigationDisabled: boolean;
  pendingDeletedSliceIds: string[];
  pendingSliceSortUpdates: Array<{
    asset: ZoneModalityAsset;
    nextSortOrder: number;
  }>;
  multiSelectEnabled: boolean;
  multiSelectedSliceIds: string[];
  showSliceEditorPanel: boolean;
  sliceEditorScrollerRef: MutableRefObject<HTMLDivElement | null>;
  totalSliceCount: number;
  onDeleteEven: () => void;
  onApplyChanges: () => void;
  onDeleteLeft: () => void;
  onDeleteMultiSelected: () => void;
  onDeleteOdd: () => void;
  onDeleteRight: () => void;
  onDeleteSelected: () => void;
  onFlipOrder: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSelectAsset: (assetIndex: number) => void;
  onToggleBlockView: () => void;
  onToggleMultiSelect: () => void;
  onToggleMultiSelectedAsset: (assetId: string) => void;
  onToggleSliceEditorPanel: () => void;
  onUndo: () => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onRedo: () => void;
};

export function SliceFilmstrip({
  activeAssetId,
  allowEditing,
  allowTimelineChanges = true,
  timelineControlMode = "full",
  thumbnailFit = "cover",
  lazyAtlasThumbnails = false,
  mobileCompactNavigation = false,
  canDeleteLeftSlices,
  canDeleteEvenSlices,
  canDeleteMultiSelectedSlices,
  canDeleteOddSlices,
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
  navigationDisabled,
  pendingDeletedSliceIds,
  pendingSliceSortUpdates,
  multiSelectEnabled,
  multiSelectedSliceIds,
  showSliceEditorPanel,
  sliceEditorScrollerRef,
  totalSliceCount,
  onDeleteEven,
  onApplyChanges,
  onDeleteLeft,
  onDeleteMultiSelected,
  onDeleteOdd,
  onDeleteRight,
  onDeleteSelected,
  onFlipOrder,
  onNext,
  onPrevious,
  onSelectAsset,
  onToggleBlockView,
  onToggleMultiSelect,
  onToggleMultiSelectedAsset,
  onToggleSliceEditorPanel,
  onUndo,
  onWheel,
  onRedo,
}: SliceFilmstripProps) {
  const onSelectAssetRef = useRef(onSelectAsset);
  const multiSelectedSliceIdSet = useMemo(
    () => new Set(multiSelectedSliceIds),
    [multiSelectedSliceIds],
  );

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
  const handleToggleMultiSelectedAsset = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const assetId = event.currentTarget.dataset.assetId;

      if (!assetId) {
        return;
      }

      onToggleMultiSelectedAsset(assetId);
    },
    [onToggleMultiSelectedAsset],
  );

  const navigationLabel =
    navigationAssetIndex >= 0
      ? `${navigationAssetIndex + 1}/${totalSliceCount}`
      : `0/${totalSliceCount}`;

  const createSliceButton = useCallback(
    (sliceItem: SliceItem, variant: "compact" | "editor") => {
      const {
        asset,
        assetId,
        assetIndex,
        atlasFrame,
        atlasPage,
        thumbnailSrc,
      } = sliceItem;
      const isActive = assetId === activeAssetId;
      const isMultiSelected = multiSelectedSliceIdSet.has(assetId);
      const thumbnailSizePx =
        variant === "compact" ? COMPACT_ITEM_WIDTH_PX : EDITOR_ITEM_WIDTH_PX;
      const atlasThumbnailStyle =
        atlasFrame && atlasPage
          ? buildAtlasThumbnailStyle(
              atlasPage,
              atlasFrame,
              thumbnailSizePx,
              thumbnailFit,
            )
          : null;

      const button = (
        <button
          key={variant === "compact" ? assetId : undefined}
          aria-label={asset.label}
          data-asset-id={assetId}
          data-asset-index={assetIndex}
          type="button"
          className={cn(
            variant === "compact"
              ? "group relative w-9 shrink-0 overflow-hidden rounded-sm border border-transparent text-left transition"
              : "relative w-full overflow-hidden rounded-md border text-left transition",
            variant === "compact"
              ? isActive
                ? "bg-indigo-500/20 opacity-100"
                : "bg-black/20 opacity-60 hover:bg-white/6 hover:opacity-100"
              : isActive
                ? "border-indigo-600"
                : isMultiSelected
                  ? "border-primary"
                  : "hover:border-white/45",
            navigationDisabled && "cursor-not-allowed opacity-60",
          )}
          disabled={navigationDisabled}
          onClick={
            variant === "editor" && allowTimelineChanges && multiSelectEnabled
              ? handleToggleMultiSelectedAsset
              : handleSelectAsset
          }
        >
          <div
            className={cn(
              "relative aspect-square overflow-hidden",
              variant === "compact" ? "bg-black/40" : "bg-black/50",
            )}
          >
            {atlasThumbnailStyle ? (
              lazyAtlasThumbnails ? (
                <LazyAtlasThumbnail
                  eager={isActive}
                  scrollerRef={
                    variant === "compact"
                      ? filmstripScrollerRef
                      : sliceEditorScrollerRef
                  }
                  style={atlasThumbnailStyle}
                />
              ) : (
                <div className="h-full w-full" style={atlasThumbnailStyle} />
              )
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={asset.label}
                className={cn(
                  "h-full w-full",
                  thumbnailFit === "contain" ? "object-contain" : "object-cover",
                )}
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

      if (variant === "compact") {
        return button;
      }

      return (
        <div
          key={`editor-${assetId}`}
          className="relative w-32 shrink-0 overflow-hidden rounded-md"
        >
          {button}
          {allowTimelineChanges && multiSelectEnabled ? (
            <Checkbox
              aria-label={`Select ${asset.label}`}
              checked={isMultiSelected}
              className="absolute right-1.5 top-1.5 z-10 size-4 cursor-pointer"
              data-asset-id={assetId}
              disabled={navigationDisabled}
              onCheckedChange={() => onToggleMultiSelectedAsset(assetId)}
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
        </div>
      );
    },
    [
      activeAssetId,
      allowTimelineChanges,
      handleSelectAsset,
      filmstripScrollerRef,
      handleToggleMultiSelectedAsset,
      lazyAtlasThumbnails,
      multiSelectEnabled,
      multiSelectedSliceIdSet,
      navigationDisabled,
      onToggleMultiSelectedAsset,
      sliceEditorScrollerRef,
      thumbnailFit,
    ],
  );

  const filmstripButtons = useMemo(
    () => sliceItems.map((sliceItem) => createSliceButton(sliceItem, "compact")),
    [createSliceButton, sliceItems],
  );

  const editorButtons = useMemo(
    () => sliceItems.map((sliceItem) => createSliceButton(sliceItem, "editor")),
    [createSliceButton, sliceItems],
  );

  return (
    <div className="absolute bottom-0 left-0 w-full px-2 max-[719px]:px-1">
      <div
        className={cn(
          "rounded-sm bg-white/3 backdrop-blur-sm transition-all",
          allowEditing && showSliceEditorPanel && "pb-2",
        )}
      >
        <div className="mx-auto grid w-full max-w-[calc(100%-0.5rem)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-1 max-[719px]:max-w-full max-[719px]:gap-1">
          <button
            type="button"
            aria-expanded={allowEditing && showSliceEditorPanel}
            aria-label={
              allowEditing
                ? showSliceEditorPanel
                  ? "Collapse slice editing panel"
                  : "Expand slice editing panel"
                : "Slice editing unavailable"
            }
            className={cn(
              "flex size-9 items-center justify-center rounded-md border border-transparent bg-black/35 transition",
              allowEditing && "hover:border-white/30",
              allowEditing && showSliceEditorPanel && "border-indigo-600/70",
            )}
            disabled={!allowEditing || navigationDisabled}
            onClick={onToggleSliceEditorPanel}
          >
            <NextImage
              src="/logo.webp"
              alt="Anatomy"
              height={34}
              width={34}
              className="rounded-md dark:rounded-none"
            />
          </button>

          <div className="relative ml-1 min-w-0">
            <div className="pointer-events-none absolute inset-y-1 left-1/2 z-20 w-px -translate-x-1/2 bg-primary" />
            <div
              ref={filmstripScrollerRef}
              className="no-scrollbar mx-auto h-11 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-sm bg-[#f4f4f5] p-1 dark:bg-[#121212]"
              onWheel={onWheel}
            >
              <div className="flex w-max items-end gap-1">
                {filmstripButtons}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 max-[719px]:gap-1">
            <Button
              size="icon"
              className={cn(mobileCompactNavigation && "max-[719px]:hidden")}
              disabled={navigationDisabled}
              onClick={onToggleBlockView}
            >
              <LayoutGrid />
            </Button>
            <Button
              size="icon"
              disabled={navigationDisabled}
              onClick={onPrevious}
            >
              <ArrowLeft />
            </Button>
            <p
              className={cn(
                "w-24 pr-1 text-center text-sm font-semibold tabular-nums dark:text-white/85",
                mobileCompactNavigation && "max-[719px]:hidden",
              )}
            >
              {isAssetLoading ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <LoaderCircleIcon className="size-3 animate-spin" />
                  {navigationLabel}
                </span>
              ) : (
                navigationLabel
              )}
            </p>
            <Button size="icon" disabled={navigationDisabled} onClick={onNext}>
              <ArrowRight />
            </Button>
          </div>
        </div>

        {allowEditing && showSliceEditorPanel ? (
          <div className="mx-auto h-50 w-full max-w-[calc(100%-0.5rem)] rounded-md border border-white/12 bg-black/60 p-2 max-[719px]:h-40 max-[719px]:max-w-full">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {timelineControlMode === "full" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={multiSelectEnabled ? "default" : "ghost"}
                    title={
                      multiSelectEnabled
                        ? "Disable multi-select"
                        : "Enable multi-select"
                    }
                    disabled={navigationDisabled || !allowTimelineChanges}
                    onClick={onToggleMultiSelect}
                  >
                    <MousePointerClick className="size-4" />
                  </Button>
                  {multiSelectedSliceIds.length > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title={`Delete ${multiSelectedSliceIds.length} selected slices`}
                      disabled={navigationDisabled || !allowTimelineChanges || !canDeleteMultiSelectedSlices}
                      onClick={onDeleteMultiSelected}
                    >
                      <Trash className="size-4" />
                    </Button>
                  ) : null}
                </>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Undo"
                disabled={navigationDisabled || !allowTimelineChanges || !canUndoSliceTimeline}
                onClick={onUndo}
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Redo"
                disabled={navigationDisabled || !allowTimelineChanges || !canRedoSliceTimeline}
                onClick={onRedo}
              >
                <Redo2 className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Delete all left from selected"
                disabled={navigationDisabled || !allowTimelineChanges || !canDeleteLeftSlices}
                onClick={onDeleteLeft}
              >
                <DeleteAllLeftIcon className="size-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Delete all right from selected"
                disabled={navigationDisabled || !allowTimelineChanges || !canDeleteRightSlices}
                onClick={onDeleteRight}
              >
                <DeleteAllRightIcon className="size-4" />
              </Button>
              {timelineControlMode === "full" ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title="Delete odd-numbered slices"
                    disabled={navigationDisabled || !allowTimelineChanges || !canDeleteOddSlices}
                    onClick={onDeleteOdd}
                  >
                    <TicketMinus className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title="Delete even-numbered slices"
                    disabled={navigationDisabled || !allowTimelineChanges || !canDeleteEvenSlices}
                    onClick={onDeleteEven}
                  >
                    <Tickets className="size-4" />
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                title="Delete selected slice"
                disabled={navigationDisabled || !allowTimelineChanges || !canDeleteSelectedSlice}
                onClick={onDeleteSelected}
              >
                <Trash className="size-4" />
              </Button>
              {timelineControlMode === "full" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  title="Flip slice order"
                  disabled={navigationDisabled || !allowTimelineChanges || !canFlipSliceTimeline}
                  onClick={onFlipOrder}
                >
                  <FlipSliceOrderIcon className="size-4" />
                </Button>
              ) : null}
              <span className="ml-auto text-xs text-white/75 max-[719px]:hidden">
                {hasPendingSliceTimelineChanges
                  ? timelineControlMode === "synchronized-delete"
                    ? `Pending ${pendingDeletedSliceIds.length} synchronized deletes`
                    : `Pending ${pendingDeletedSliceIds.length} delete / ${pendingSliceSortUpdates.length} reorder`
                  : navigationAssetIndex >= 0
                    ? `Selected ${navigationAssetIndex + 1}/${totalSliceCount}`
                    : `Selected 0/${totalSliceCount}`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={
                  navigationDisabled ||
                  !allowTimelineChanges ||
                  !hasPendingSliceTimelineChanges ||
                  isApplyingSliceChanges
                }
                onClick={onApplyChanges}
              >
                {isApplyingSliceChanges ? "Applying..." : "Apply changes"}
              </Button>
            </div>

            <div
              ref={sliceEditorScrollerRef}
              className="no-scrollbar h-36.25 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-md bg-black/35 p-2 max-[719px]:h-24"
              onWheel={navigationDisabled ? undefined : onWheel}
            >
              <div className="flex w-max items-start gap-2">
                {editorButtons}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
