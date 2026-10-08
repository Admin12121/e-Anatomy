"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import type {
  MprPlane,
  MprViewerSpec,
  ViewerAnnotation,
  ViewerAnnotationPoint,
  ViewerStructure,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import { cn } from "@/lib/utils";

import type {
  AnnotationFormState,
  ViewerCanvasMode,
} from "../modality-viewer.types";
import {
  ViewerCanvas,
  type AreaEditTool,
  type MainInteractionTool,
} from "./viewer-canvas";
import { isViewerAnnotationInteractionTarget } from "./viewer-canvas/helpers";
import type { ViewerAssetImageSource } from "./viewer-data";

const PLANE_LABELS: Record<MprPlane, string> = {
  axial: "Axial",
  coronal: "Coronal",
  sagittal: "Sagittal",
};

const MPR_PLANES: readonly MprPlane[] = ["axial", "coronal", "sagittal"];
const VIEWPORT_IMAGE_CACHE_LIMIT = 10;
const viewportImageCache = new Map<string, HTMLImageElement>();
const viewportImagePromiseCache = new Map<string, Promise<HTMLImageElement | null>>();

type MprSlots = {
  topLeft: MprPlane;
  bottomLeft: MprPlane;
  main: MprPlane;
};

type MprCursor = [number, number, number];

type MprViewerCanvasProps = {
  spec: MprViewerSpec;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  assetsById: ReadonlyMap<string, ZoneModalityAsset>;
  imageSourcesByAssetId: ReadonlyMap<string, ViewerAssetImageSource>;
  visibleAnnotations: ViewerAnnotation[];
  structuresById: Map<string, ViewerStructure>;
  annotationForm: AnnotationFormState;
  activeAssetId: string | null;
  annotationEditingEnabled: boolean;
  areaBrushSize: number;
  areaEditTool: AreaEditTool;
  areaEraserSize: number;
  canvasFlipHorizontal: boolean;
  canvasFlipVertical: boolean;
  canvasMode: ViewerCanvasMode;
  canvasRotationQuarterTurns: number;
  draftDisconnectedPolygons: ViewerAnnotationPoint[][];
  draftPointerPlaced: boolean;
  draftStructureTitle: string;
  hoveredAnnotationId: string | null;
  mainInteractionTool: MainInteractionTool;
  overlayOpacity: number;
  selectedAnnotationId: string | null;
  showCrossReferences: boolean;
  showLabels: boolean;
  showOrientation: boolean;
  onActivateAsset: (assetId: string) => void;
  onAnnotationHover: (annotationId: string | null) => void;
  onAnnotationSelect: (annotationId: string, structureId: string) => void;
  onCanvasClick: (asset: ZoneModalityAsset, point: ViewerAnnotationPoint) => void;
  onDraftAnchorMove: (point: ViewerAnnotationPoint) => void;
  onDraftDisconnectedPolygonsChange: (
    polygons: ViewerAnnotationPoint[][],
  ) => void;
  onDraftPolygonPointMove: (
    index: number,
    point: ViewerAnnotationPoint,
  ) => void;
  onDraftPolygonReplace: (points: ViewerAnnotationPoint[]) => void;
};

export function MprViewerCanvas({
  spec,
  stageRef,
  assetsById,
  imageSourcesByAssetId,
  visibleAnnotations,
  structuresById,
  annotationForm,
  activeAssetId,
  annotationEditingEnabled,
  areaBrushSize,
  areaEditTool,
  areaEraserSize,
  canvasFlipHorizontal,
  canvasFlipVertical,
  canvasMode,
  canvasRotationQuarterTurns,
  draftDisconnectedPolygons,
  draftPointerPlaced,
  draftStructureTitle,
  hoveredAnnotationId,
  mainInteractionTool,
  overlayOpacity,
  selectedAnnotationId,
  showCrossReferences,
  showLabels,
  showOrientation,
  onActivateAsset,
  onAnnotationHover,
  onAnnotationSelect,
  onCanvasClick,
  onDraftAnchorMove,
  onDraftDisconnectedPolygonsChange,
  onDraftPolygonPointMove,
  onDraftPolygonReplace,
}: MprViewerCanvasProps) {
  const [slots, setSlots] = useState<MprSlots>({
    topLeft: "sagittal",
    bottomLeft: "coronal",
    main: "axial",
  });
  const [cursor, setCursor] = useState<MprCursor>(() => [
    Math.floor(spec.volume.dimensions[0] / 2),
    Math.floor(spec.volume.dimensions[1] / 2),
    Math.floor(spec.volume.dimensions[2] / 2),
  ]);
  const [activeEditPlane, setActiveEditPlane] = useState<MprPlane>("axial");
  const [syncedDimensions, setSyncedDimensions] = useState(spec.volume.dimensions);
  const [syncedActive, setSyncedActive] = useState<{
    assetId: string | null;
    assetsById: typeof assetsById;
    planes: typeof spec.planes;
    dimensions: typeof spec.volume.dimensions;
  } | null>(null);

  if (syncedDimensions !== spec.volume.dimensions) {
    setSyncedDimensions(spec.volume.dimensions);
    const [nx, ny, nz] = spec.volume.dimensions;
    setCursor((current) => {
      const next: MprCursor = [
        clampIndex(current[0], nx),
        clampIndex(current[1], ny),
        clampIndex(current[2], nz),
      ];
      return sameCursor(current, next) ? current : next;
    });
  }

  if (
    syncedActive?.assetId !== activeAssetId ||
    syncedActive.assetsById !== assetsById ||
    syncedActive.planes !== spec.planes ||
    syncedActive.dimensions !== spec.volume.dimensions
  ) {
    setSyncedActive({
      assetId: activeAssetId,
      assetsById,
      planes: spec.planes,
      dimensions: spec.volume.dimensions,
    });
    syncCursorToActiveAsset();
  }

  function syncCursorToActiveAsset() {
    if (!activeAssetId) return;

    for (const plane of MPR_PLANES) {
      const displayIndex = spec.planes[plane].assetIds.indexOf(activeAssetId);
      if (displayIndex < 0) continue;
      const activeAsset = assetsById.get(activeAssetId) ?? null;
      const sourceIndex = sourceIndexForPlaneAsset(
        plane,
        activeAsset,
        displayIndex,
        spec.volume.dimensions,
      );
      setCursor((current) => {
        const next: MprCursor = [current[0], current[1], current[2]];
        if (plane === "axial") next[2] = sourceIndex;
        if (plane === "coronal") next[1] = sourceIndex;
        if (plane === "sagittal") next[0] = sourceIndex;
        return sameCursor(current, next) ? current : next;
      });
      setActiveEditPlane((current) => (current === plane ? current : plane));
      break;
    }
  }

  const assetIdForPlane = (plane: MprPlane, nextCursor = cursor) => {
    const selection = findNearestPlaneAsset(
      plane,
      spec.planes[plane].assetIds,
      assetsById,
      planeSliceIndex(plane, nextCursor),
      spec.volume.dimensions,
    );
    return selection?.assetId ?? null;
  };

  function updateCursorFromPoint(
    plane: MprPlane,
    point: ViewerAnnotationPoint,
  ) {
    const [nx, ny, nz] = spec.volume.dimensions;
    setCursor((current) => {
      const next: MprCursor = [current[0], current[1], current[2]];
      if (plane === "axial") {
        next[0] = normalizedToIndex(point.x, nx);
        next[1] = normalizedToIndex(point.y, ny);
      } else if (plane === "coronal") {
        next[0] = normalizedToIndex(point.x, nx);
        next[2] = nz - 1 - normalizedToIndex(point.y, nz);
      } else {
        next[1] = normalizedToIndex(point.x, ny);
        next[2] = nz - 1 - normalizedToIndex(point.y, nz);
      }
      return sameCursor(current, next) ? current : next;
    });
  }

  function movePlaneToSlice(plane: MprPlane, nextIndex: number) {
    const planeSpec = spec.planes[plane];
    const clampedDisplayIndex = clampIndex(nextIndex, planeSpec.assetIds.length);
    const nextAssetId = planeSpec.assetIds[clampedDisplayIndex];
    const nextAsset = nextAssetId ? assetsById.get(nextAssetId) ?? null : null;
    const sourceIndex = sourceIndexForPlaneAsset(
      plane,
      nextAsset,
      clampedDisplayIndex,
      spec.volume.dimensions,
    );

    setCursor((current) => {
      const next: MprCursor = [current[0], current[1], current[2]];
      if (plane === "axial") next[2] = sourceIndex;
      if (plane === "coronal") next[1] = sourceIndex;
      if (plane === "sagittal") next[0] = sourceIndex;
      return sameCursor(current, next) ? current : next;
    });
    if (nextAssetId) onActivateAsset(nextAssetId);
  }

  function swapWithMain(plane: MprPlane) {
    setSlots((current) => {
      if (plane === current.main) return current;
      if (plane === current.topLeft) {
        return {
          ...current,
          main: current.topLeft,
          topLeft: current.main,
        };
      }
      return {
        ...current,
        main: current.bottomLeft,
        bottomLeft: current.main,
      };
    });
    setActiveEditPlane(plane);
    const assetId = assetIdForPlane(plane);
    if (assetId) onActivateAsset(assetId);
  }

  const sharedViewportProps = {
    annotationForm,
    annotationEditingEnabled,
    areaBrushSize,
    areaEditTool,
    areaEraserSize,
    assetsById,
    canvasFlipHorizontal,
    canvasFlipVertical,
    canvasMode,
    canvasRotationQuarterTurns,
    cursor,
    draftDisconnectedPolygons,
    draftPointerPlaced,
    draftStructureTitle,
    hoveredAnnotationId,
    imageSourcesByAssetId,
    mainInteractionTool,
    overlayOpacity,
    selectedAnnotationId,
    showCrossReferences,
    showLabels,
    showOrientation,
    spec,
    structuresById,
    visibleAnnotations,
    onActivateAsset,
    onAnnotationHover,
    onAnnotationSelect,
    onReviewPointClick: (
      plane: MprPlane,
      asset: ZoneModalityAsset,
      point: ViewerAnnotationPoint,
    ) => {
      setActiveEditPlane(plane);
      onActivateAsset(asset.id);
      updateCursorFromPoint(plane, point);
    },
    onCanvasClick: (plane: MprPlane, asset: ZoneModalityAsset, point: ViewerAnnotationPoint) => {
      setActiveEditPlane(plane);
      onActivateAsset(asset.id);
      updateCursorFromPoint(plane, point);
      onCanvasClick(asset, point);
    },
    onDraftAnchorMove,
    onDraftDisconnectedPolygonsChange,
    onDraftPolygonPointMove,
    onDraftPolygonReplace,
    onMovePlaneToSlice: movePlaneToSlice,
    onSwapWithMain: swapWithMain,
  } as const;

  return (
    <div ref={stageRef} className="relative h-full min-h-0 overflow-hidden bg-black">
      <div className="grid h-full min-h-0 grid-cols-[minmax(13rem,0.42fr)_minmax(0,1fr)] grid-rows-2 gap-px bg-border/70 max-[719px]:grid-cols-2 max-[719px]:grid-rows-[minmax(0,1.45fr)_minmax(0,0.85fr)]">
        {MPR_PLANES.map((plane) => (
          <MprViewport
            key={plane}
            {...sharedViewportProps}
            activeForEditing={activeEditPlane === plane}
            className={slotClassForPlane(plane, slots)}
            isMain={slots.main === plane}
            plane={plane}
          />
        ))}
      </div>

    </div>
  );
}

type MprViewportProps = Omit<
  MprViewerCanvasProps,
  "spec" | "onCanvasClick" | "activeAssetId" | "stageRef"
> & {
  spec: MprViewerSpec;
  plane: MprPlane;
  cursor: MprCursor;
  activeForEditing: boolean;
  isMain: boolean;
  className?: string;
  onReviewPointClick: (
    plane: MprPlane,
    asset: ZoneModalityAsset,
    point: ViewerAnnotationPoint,
  ) => void;
  onCanvasClick: (
    plane: MprPlane,
    asset: ZoneModalityAsset,
    point: ViewerAnnotationPoint,
  ) => void;
  onMovePlaneToSlice: (plane: MprPlane, nextIndex: number) => void;
  onSwapWithMain: (plane: MprPlane) => void;
};

function MprViewport({
  spec,
  plane,
  cursor,
  activeForEditing,
  isMain,
  className,
  assetsById,
  imageSourcesByAssetId,
  visibleAnnotations,
  structuresById,
  annotationForm,
  annotationEditingEnabled,
  areaBrushSize,
  areaEditTool,
  areaEraserSize,
  canvasFlipHorizontal,
  canvasFlipVertical,
  canvasMode,
  canvasRotationQuarterTurns,
  draftDisconnectedPolygons,
  draftPointerPlaced,
  draftStructureTitle,
  hoveredAnnotationId,
  mainInteractionTool,
  overlayOpacity,
  selectedAnnotationId,
  showCrossReferences,
  showLabels,
  showOrientation,
  onActivateAsset,
  onAnnotationHover,
  onAnnotationSelect,
  onReviewPointClick,
  onCanvasClick,
  onDraftAnchorMove,
  onDraftDisconnectedPolygonsChange,
  onDraftPolygonPointMove,
  onDraftPolygonReplace,
  onMovePlaneToSlice,
  onSwapWithMain,
}: MprViewportProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const planeSpec = spec.planes[plane];
  const sourceSliceIndex = planeSliceIndex(plane, cursor);
  const selection = findNearestPlaneAsset(
    plane,
    planeSpec.assetIds,
    assetsById,
    sourceSliceIndex,
    spec.volume.dimensions,
  );
  const sliceIndex = selection?.displayIndex ?? 0;
  const assetId = selection?.assetId ?? null;
  const asset = assetId ? assetsById.get(assetId) ?? null : null;
  const imageSource = assetId ? imageSourcesByAssetId.get(assetId) ?? null : null;
  // Render the viewport from the atlas page again. One atlas page contains a
  // run of nearby slices, so scrubbing within that run becomes an in-memory
  // crop instead of a new network request for every slice.
  const viewportImageUrl = imageSource?.imageUrl ?? asset?.imageUrl ?? null;
  const currentImageElement = useViewportImage(
    viewportImageUrl,
    isMain ? "high" : "auto",
  );
  const crosshairPoint = cursorToPlanePoint(plane, cursor, spec.volume.dimensions);
  const annotations = useMemo(() => {
    if (!asset || !selection) return [];

    const localAnnotations = visibleAnnotations.filter(
      (annotation) => annotation.assetId === asset.id,
    );
    const localIds = new Set(localAnnotations.map((annotation) => annotation.id));
    const projectedPointers: ViewerAnnotation[] = [];

    for (const annotation of visibleAnnotations) {
      if (localIds.has(annotation.id)) continue;
      if (annotation.polygonPoints.length >= 3) continue;

      const sourceAsset = assetsById.get(annotation.assetId) ?? null;
      const sourcePlane = mprPlaneForAsset(sourceAsset);
      if (!sourceAsset || !sourcePlane) continue;

      const sourceDisplayIndex = spec.planes[sourcePlane].assetIds.indexOf(
        sourceAsset.id,
      );
      if (sourceDisplayIndex < 0) continue;

      const sourceIndex = sourceIndexForPlaneAsset(
        sourcePlane,
        sourceAsset,
        sourceDisplayIndex,
        spec.volume.dimensions,
      );
      const anchor =
        annotation.id === selectedAnnotationId &&
        annotationForm.polygonPoints.length < 3
          ? { x: annotationForm.anchorX, y: annotationForm.anchorY }
          : { x: annotation.anchorX, y: annotation.anchorY };
      const annotationCursor = cursorFromPlanePoint(
        sourcePlane,
        anchor,
        sourceIndex,
        spec.volume.dimensions,
      );
      const projectedSlice = planeSliceIndex(plane, annotationCursor);
      const projectedSelection = findNearestPlaneAsset(
        plane,
        planeSpec.assetIds,
        assetsById,
        projectedSlice,
        spec.volume.dimensions,
      );

      if (projectedSelection?.assetId !== asset.id) continue;

      const projectedPoint = cursorToPlanePoint(
        plane,
        annotationCursor,
        spec.volume.dimensions,
      );
      projectedPointers.push({
        ...annotation,
        anchorX: projectedPoint.x,
        anchorY: projectedPoint.y,
        assetId: asset.id,
        polygonPoints: [],
      });
    }

    return [...localAnnotations, ...projectedPointers];
  }, [
    annotationForm.anchorX,
    annotationForm.anchorY,
    annotationForm.polygonPoints.length,
    asset,
    assetsById,
    plane,
    planeSpec.assetIds,
    selectedAnnotationId,
    selection,
    spec.planes,
    spec.volume.dimensions,
    visibleAnnotations,
  ]);
  const selectedAnnotationSourceAssetId = selectedAnnotationId
    ? visibleAnnotations.find((annotation) => annotation.id === selectedAnnotationId)
        ?.assetId ?? null
    : null;
  const selectedAnnotationIdForViewport =
    asset && selectedAnnotationSourceAssetId === asset.id
      ? selectedAnnotationId
      : null;
  const supplementalPointerMarkers =
    !isMain &&
    !activeForEditing &&
    draftPointerPlaced &&
    annotationForm.polygonPoints.length < 3
      ? [
          {
            color: annotationForm.colorHex.trim() || "#6366f1",
            point: crosshairPoint,
          },
        ]
      : [];

  useEffect(() => {
    // Atlas pages are intentionally prefetched only near a page boundary. This
    // keeps scrubbing smooth without pulling the entire study into memory.
    const urls = new Set<string>();
    for (const neighborIndex of [sliceIndex - 8, sliceIndex + 8]) {
      if (neighborIndex < 0 || neighborIndex >= planeSpec.assetIds.length) continue;
      const neighborAssetId = planeSpec.assetIds[neighborIndex];
      const neighborSource = neighborAssetId
        ? imageSourcesByAssetId.get(neighborAssetId) ?? null
        : null;
      if (
        neighborSource?.imageUrl &&
        neighborSource.imageUrl !== viewportImageUrl
      ) {
        urls.add(neighborSource.imageUrl);
      }
    }

    for (const url of urls) {
      void loadViewportImage(url, "low");
    }
  }, [
    imageSourcesByAssetId,
    planeSpec.assetIds,
    sliceIndex,
    viewportImageUrl,
  ]);

  const effectiveCanvasMode = activeForEditing ? canvasMode : "browse";

  if (!asset) {
    return (
      <div className={cn("flex min-h-0 items-center justify-center bg-black text-xs text-muted-foreground", className)}>
        {PLANE_LABELS[plane]} unavailable
      </div>
    );
  }

  return (
    <div
      className={cn("relative min-h-0 overflow-hidden bg-black", className)}
      onPointerDownCapture={(event) => {
        if (isViewerAnnotationInteractionTarget(event.target)) return;
        onActivateAsset(asset.id);
      }}
    >
      <ViewerCanvas
        annotationEditingEnabled={annotationEditingEnabled && activeForEditing}
        areaBrushSize={areaBrushSize}
        areaEditTool={areaEditTool}
        areaEraserSize={areaEraserSize}
        annotationForm={annotationForm}
        canvasFlipHorizontal={canvasFlipHorizontal}
        canvasFlipVertical={canvasFlipVertical}
        canvasMode={effectiveCanvasMode}
        canvasRotationQuarterTurns={canvasRotationQuarterTurns}
        compact
        crosshairPoint={
          isMain ? (showCrossReferences ? crosshairPoint : null) : crosshairPoint
        }
        crosshairStroke="rgba(255, 255, 255, 0.94)"
        currentAsset={asset}
        currentAssetIndex={sliceIndex}
        currentAtlasFrame={imageSource?.atlasFrame ?? null}
        currentImageElement={currentImageElement}
        draftStructureTitle={draftStructureTitle}
        draftPointerPlaced={draftPointerPlaced}
        editorMode={annotationEditingEnabled && activeForEditing}
        hoveredAnnotationId={hoveredAnnotationId}
        hideViewerTitle
        ingestFailureMessage={null}
        isIngesting={false}
        lockInitialFitScale={false}
        reserveLabelSpace={false}
        isPreparingInitialAsset={!currentImageElement}
        mainInteractionTool={mainInteractionTool}
        onAnnotationHover={onAnnotationHover}
        onAnnotationSelect={onAnnotationSelect}
        onBrowsePointClick={(point) =>
          onReviewPointClick(plane, asset, point)
        }
        onCanvasClick={(point) => {
          if (effectiveCanvasMode === "browse") return;
          onCanvasClick(plane, asset, point);
        }}
        onDraftAnchorMove={(point) => {
          onReviewPointClick(plane, asset, point);
          onDraftAnchorMove(point);
        }}
        onDraftDisconnectedPolygonsChange={onDraftDisconnectedPolygonsChange}
        onDraftPolygonPointMove={onDraftPolygonPointMove}
        onDraftPolygonReplace={onDraftPolygonReplace}
        onLayerScrubNavigate={(nextIndex) => onMovePlaneToSlice(plane, nextIndex)}
        onViewportDoubleClick={() => onSwapWithMain(plane)}
        onWheelNavigate={(deltaY) => {
          const direction = Math.sign(deltaY);
          if (direction !== 0) onMovePlaneToSlice(plane, sliceIndex + direction);
        }}
        overlayOpacity={overlayOpacity}
        overlayRef={overlayRef}
        selectedAnnotationId={selectedAnnotationIdForViewport}
        showCrossReferences={false}
        showLabels={isMain && showLabels}
        showOrientation={showOrientation}
        showPointerMarkers={!isMain}
        supplementalPointerMarkers={supplementalPointerMarkers}
        stageRef={stageRef}
        structuresById={structuresById}
        totalSliceCount={planeSpec.assetIds.length}
        viewerTitle={PLANE_LABELS[plane]}
        visibleAnnotations={annotations}
        draftDisconnectedPolygons={draftDisconnectedPolygons}
      />
      {showOrientation ? (
        <div className="pointer-events-none absolute left-3 top-2 z-30 text-xs font-semibold text-white/90">
          {PLANE_LABELS[plane]}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-2 left-3 z-30 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white/85">
        {sliceIndex + 1}/{planeSpec.assetIds.length}
      </div>
    </div>
  );
}

type ViewportImagePriority = "high" | "auto" | "low";

function useViewportImage(
  imageUrl: string | null,
  priority: ViewportImagePriority = "auto",
) {
  const [loaded, setLoaded] = useState<{
    image: HTMLImageElement;
    url: string;
  } | null>(() => {
    if (!imageUrl) return null;
    const image = getCachedViewportImage(imageUrl);
    return image ? { image, url: imageUrl } : null;
  });

  // Never return an image that belongs to the previous atlas page. The child
  // canvas deliberately keeps its last rendered pixels while the next page is
  // loading, which avoids a flash and prevents a new atlas frame from being
  // cropped out of the old atlas image for one render.
  const cachedForRequestedUrl = imageUrl
    ? getCachedViewportImage(imageUrl)
    : null;
  const imageElement =
    imageUrl && loaded?.url === imageUrl
      ? loaded.image
      : cachedForRequestedUrl;

  // Hold cache hits in state so a later LRU eviction cannot blank the viewport.
  if (!imageUrl && loaded) {
    setLoaded(null);
  } else if (
    imageUrl &&
    cachedForRequestedUrl &&
    (loaded?.url !== imageUrl || loaded.image !== cachedForRequestedUrl)
  ) {
    setLoaded({ image: cachedForRequestedUrl, url: imageUrl });
  }

  useEffect(() => {
    if (!imageUrl || viewportImageCache.has(imageUrl)) return;

    let cancelled = false;
    void loadViewportImage(imageUrl, priority).then((image) => {
      if (!cancelled && image) {
        setLoaded({ image, url: imageUrl });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl, priority]);

  return imageElement;
}

function loadViewportImage(
  imageUrl: string,
  priority: ViewportImagePriority = "auto",
) {
  const cached = getCachedViewportImage(imageUrl);
  if (cached) return Promise.resolve(cached);

  const pending = viewportImagePromiseCache.get(imageUrl);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    image.onload = () => {
      rememberViewportImage(imageUrl, image);
      viewportImagePromiseCache.delete(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      viewportImagePromiseCache.delete(imageUrl);
      resolve(null);
    };
    image.src = imageUrl;
  });

  viewportImagePromiseCache.set(imageUrl, promise);
  return promise;
}

function getCachedViewportImage(imageUrl: string) {
  const cached = viewportImageCache.get(imageUrl) ?? null;
  if (!cached) return null;

  // Refresh insertion order so the small module-level cache behaves as an
  // LRU. The currently displayed image is also retained by React state, so
  // evicting an older cache entry never blanks an on-screen viewport.
  viewportImageCache.delete(imageUrl);
  viewportImageCache.set(imageUrl, cached);
  return cached;
}

function rememberViewportImage(imageUrl: string, image: HTMLImageElement) {
  viewportImageCache.delete(imageUrl);
  viewportImageCache.set(imageUrl, image);

  while (viewportImageCache.size > VIEWPORT_IMAGE_CACHE_LIMIT) {
    const oldestKey = viewportImageCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    viewportImageCache.delete(oldestKey);
  }
}

function slotClassForPlane(plane: MprPlane, slots: MprSlots) {
  if (plane === slots.main) {
    return "col-start-2 row-span-2 row-start-1 max-[719px]:col-span-2 max-[719px]:col-start-1 max-[719px]:row-span-1 max-[719px]:row-start-1";
  }
  if (plane === slots.topLeft) {
    return "col-start-1 row-start-1 max-[719px]:col-start-1 max-[719px]:row-start-2";
  }
  return "col-start-1 row-start-2 max-[719px]:col-start-2 max-[719px]:row-start-2";
}

function sameCursor(left: MprCursor, right: MprCursor) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function planeSliceIndex(plane: MprPlane, cursor: MprCursor) {
  if (plane === "axial") return cursor[2];
  if (plane === "coronal") return cursor[1];
  return cursor[0];
}

function sourceIndexForPlaneAsset(
  plane: MprPlane,
  asset: ZoneModalityAsset | null,
  fallbackDisplayIndex: number,
  dimensions: [number, number, number],
) {
  const dimensionCount = planeDimensionCount(plane, dimensions);
  return clampIndex(asset?.sliceIndex ?? fallbackDisplayIndex, dimensionCount);
}

function findNearestPlaneAsset(
  plane: MprPlane,
  assetIds: readonly string[],
  assetsById: ReadonlyMap<string, ZoneModalityAsset>,
  targetSourceIndex: number,
  dimensions: [number, number, number],
) {
  let best: { assetId: string; displayIndex: number; sourceIndex: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let displayIndex = 0; displayIndex < assetIds.length; displayIndex += 1) {
    const assetId = assetIds[displayIndex];
    if (!assetId) continue;
    const asset = assetsById.get(assetId) ?? null;
    const sourceIndex = sourceIndexForPlaneAsset(
      plane,
      asset,
      displayIndex,
      dimensions,
    );
    const distance = Math.abs(sourceIndex - targetSourceIndex);
    if (distance < bestDistance) {
      best = { assetId, displayIndex, sourceIndex };
      bestDistance = distance;
      if (distance === 0) break;
    }
  }

  return best;
}

function planeDimensionCount(
  plane: MprPlane,
  dimensions: [number, number, number],
) {
  if (plane === "axial") return dimensions[2];
  if (plane === "coronal") return dimensions[1];
  return dimensions[0];
}

function mprPlaneForAsset(
  asset: ZoneModalityAsset | null,
): MprPlane | null {
  const orientation = asset?.orientationCode?.trim().toLowerCase();
  if (orientation === "axial") return "axial";
  if (orientation === "coronal") return "coronal";
  if (orientation === "sagittal") return "sagittal";
  return null;
}

function cursorFromPlanePoint(
  plane: MprPlane,
  point: ViewerAnnotationPoint,
  sourceSliceIndex: number,
  dimensions: [number, number, number],
): MprCursor {
  const [nx, ny, nz] = dimensions;

  if (plane === "axial") {
    return [
      normalizedToIndex(point.x, nx),
      normalizedToIndex(point.y, ny),
      clampIndex(sourceSliceIndex, nz),
    ];
  }

  if (plane === "coronal") {
    return [
      normalizedToIndex(point.x, nx),
      clampIndex(sourceSliceIndex, ny),
      nz - 1 - normalizedToIndex(point.y, nz),
    ];
  }

  return [
    clampIndex(sourceSliceIndex, nx),
    normalizedToIndex(point.x, ny),
    nz - 1 - normalizedToIndex(point.y, nz),
  ];
}

function cursorToPlanePoint(
  plane: MprPlane,
  cursor: MprCursor,
  dimensions: [number, number, number],
): ViewerAnnotationPoint {
  const [nx, ny, nz] = dimensions;
  if (plane === "axial") {
    return {
      x: indexToNormalized(cursor[0], nx),
      y: indexToNormalized(cursor[1], ny),
    };
  }
  if (plane === "coronal") {
    return {
      x: indexToNormalized(cursor[0], nx),
      y: 1 - indexToNormalized(cursor[2], nz),
    };
  }
  return {
    x: indexToNormalized(cursor[1], ny),
    y: 1 - indexToNormalized(cursor[2], nz),
  };
}

function normalizedToIndex(value: number, count: number) {
  if (count <= 1) return 0;
  return clampIndex(Math.round(Math.min(1, Math.max(0, value)) * (count - 1)), count);
}

function indexToNormalized(index: number, count: number) {
  if (count <= 1) return 0.5;
  return clampIndex(index, count) / (count - 1);
}

function clampIndex(index: number, count: number) {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(index)));
}
