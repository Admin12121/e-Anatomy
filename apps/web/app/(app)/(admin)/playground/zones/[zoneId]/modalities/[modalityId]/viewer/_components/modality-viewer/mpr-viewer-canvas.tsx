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
import type { ViewerAssetImageSource } from "./viewer-data";

const PLANE_LABELS: Record<MprPlane, string> = {
  axial: "Axial",
  coronal: "Coronal",
  sagittal: "Sagittal",
};

const MPR_PLANES: readonly MprPlane[] = ["axial", "coronal", "sagittal"];
const VIEWPORT_IMAGE_CACHE_LIMIT = 24;
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

  useEffect(() => {
    const [nx, ny, nz] = spec.volume.dimensions;
    setCursor((current) => {
      const next: MprCursor = [
        clampIndex(current[0], nx),
        clampIndex(current[1], ny),
        clampIndex(current[2], nz),
      ];
      return sameCursor(current, next) ? current : next;
    });
  }, [spec.volume.dimensions]);

  useEffect(() => {
    if (!activeAssetId) return;

    for (const plane of MPR_PLANES) {
      const index = spec.planes[plane].assetIds.indexOf(activeAssetId);
      if (index < 0) continue;
      setCursor((current) => {
        const next: MprCursor = [current[0], current[1], current[2]];
        if (plane === "axial") next[2] = index;
        if (plane === "coronal") next[1] = index;
        if (plane === "sagittal") next[0] = index;
        return sameCursor(current, next) ? current : next;
      });
      setActiveEditPlane((current) => (current === plane ? current : plane));
      break;
    }
  }, [activeAssetId, spec.planes]);

  const assetIdForPlane = (plane: MprPlane, nextCursor = cursor) => {
    const planeSpec = spec.planes[plane];
    const index = planeSliceIndex(plane, nextCursor);
    return planeSpec.assetIds[clampIndex(index, planeSpec.assetIds.length)] ?? null;
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
    const clamped = clampIndex(nextIndex, planeSpec.assetIds.length);
    setCursor((current) => {
      const next: MprCursor = [current[0], current[1], current[2]];
      if (plane === "axial") next[2] = clamped;
      if (plane === "coronal") next[1] = clamped;
      if (plane === "sagittal") next[0] = clamped;
      return sameCursor(current, next) ? current : next;
    });
    const nextAssetId = planeSpec.assetIds[clamped];
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

  const worldCoordinate = useMemo<[number, number, number]>(() => {
    const { origin, spacing } = spec.volume;
    return [
      origin[0] + cursor[0] * spacing[0],
      origin[1] + cursor[1] * spacing[1],
      origin[2] + cursor[2] * spacing[2],
    ];
  }, [cursor, spec.volume]);

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
      <div className="grid h-full min-h-0 grid-cols-[minmax(13rem,0.42fr)_minmax(0,1fr)] grid-rows-2 gap-px bg-border/70">
        {MPR_PLANES.map((plane) => (
          <MprViewport
            key={plane}
            {...sharedViewportProps}
            activeForEditing={activeEditPlane === plane}
            className={slotClassForPlane(plane, slots)}
            plane={plane}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-md border border-white/15 bg-black/70 px-3 py-1.5 font-mono text-[11px] text-white/85 backdrop-blur">
        LPS {worldCoordinate.map((value) => value.toFixed(2)).join(" · ")} mm
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
  className?: string;
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
  const sliceIndex = clampIndex(planeSliceIndex(plane, cursor), planeSpec.assetIds.length);
  const assetId = planeSpec.assetIds[sliceIndex] ?? null;
  const asset = assetId ? assetsById.get(assetId) ?? null : null;
  const imageSource = assetId ? imageSourcesByAssetId.get(assetId) ?? null : null;
  const currentImageElement = useViewportImage(imageSource?.imageUrl ?? null);
  const crosshairPoint = cursorToPlanePoint(plane, cursor, spec.volume.dimensions);
  const annotations = useMemo(
    () =>
      asset
        ? visibleAnnotations.filter((annotation) => annotation.assetId === asset.id)
        : [],
    [asset, visibleAnnotations],
  );

  useEffect(() => {
    for (const neighborIndex of [sliceIndex - 1, sliceIndex + 1]) {
      if (neighborIndex < 0 || neighborIndex >= planeSpec.assetIds.length) continue;
      const neighborAssetId = planeSpec.assetIds[neighborIndex];
      const neighborSource = neighborAssetId
        ? imageSourcesByAssetId.get(neighborAssetId) ?? null
        : null;
      if (neighborSource?.imageUrl) {
        void loadViewportImage(neighborSource.imageUrl);
      }
    }
  }, [imageSourcesByAssetId, planeSpec.assetIds, sliceIndex]);

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
      onPointerDownCapture={() => onActivateAsset(asset.id)}
    >
      <ViewerCanvas
        annotationEditingEnabled={annotationEditingEnabled && activeForEditing}
        areaBrushSize={areaBrushSize}
        areaEditTool={areaEditTool}
        areaEraserSize={areaEraserSize}
        annotationForm={annotationForm}
        canvasFlipHorizontal={canvasFlipHorizontal}
        canvasFlipVertical={canvasFlipVertical}
        canvasMode={activeForEditing ? canvasMode : "browse"}
        canvasRotationQuarterTurns={canvasRotationQuarterTurns}
        compact
        crosshairPoint={crosshairPoint}
        crosshairStroke="rgba(255, 255, 255, 0.94)"
        currentAsset={asset}
        currentAssetIndex={sliceIndex}
        currentAtlasFrame={imageSource?.atlasFrame ?? null}
        currentImageElement={currentImageElement}
        draftStructureTitle={draftStructureTitle}
        draftPointerPlaced={draftPointerPlaced}
        editorMode={annotationEditingEnabled && activeForEditing}
        hoveredAnnotationId={hoveredAnnotationId}
        ingestFailureMessage={null}
        isIngesting={false}
        lockInitialFitScale={false}
        isPreparingInitialAsset={!currentImageElement}
        mainInteractionTool={mainInteractionTool}
        onAnnotationHover={onAnnotationHover}
        onAnnotationSelect={onAnnotationSelect}
        onCanvasClick={(point) => onCanvasClick(plane, asset, point)}
        onDraftAnchorMove={onDraftAnchorMove}
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
        selectedAnnotationId={selectedAnnotationId}
        showCrossReferences={showCrossReferences}
        showLabels={showLabels}
        showOrientation={showOrientation}
        stageRef={stageRef}
        structuresById={structuresById}
        totalSliceCount={planeSpec.assetIds.length}
        viewerTitle={`${PLANE_LABELS[plane]} ${sliceIndex + 1}/${planeSpec.assetIds.length}`}
        visibleAnnotations={annotations}
        draftDisconnectedPolygons={draftDisconnectedPolygons}
      />
    </div>
  );
}

function useViewportImage(imageUrl: string | null) {
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(() =>
    imageUrl ? getCachedViewportImage(imageUrl) : null,
  );

  useEffect(() => {
    if (!imageUrl) {
      setImageElement((current) => (current === null ? current : null));
      return;
    }

    const cached = getCachedViewportImage(imageUrl);
    if (cached) {
      setImageElement((current) => (current === cached ? current : cached));
      return;
    }

    let cancelled = false;
    void loadViewportImage(imageUrl).then((image) => {
      if (!cancelled) {
        setImageElement((current) => (current === image ? current : image));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return imageElement;
}

function loadViewportImage(imageUrl: string) {
  const cached = getCachedViewportImage(imageUrl);
  if (cached) return Promise.resolve(cached);

  const pending = viewportImagePromiseCache.get(imageUrl);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
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
  if (plane === slots.main) return "col-start-2 row-span-2 row-start-1";
  if (plane === slots.topLeft) return "col-start-1 row-start-1";
  return "col-start-1 row-start-2";
}

function sameCursor(left: MprCursor, right: MprCursor) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function planeSliceIndex(plane: MprPlane, cursor: MprCursor) {
  if (plane === "axial") return cursor[2];
  if (plane === "coronal") return cursor[1];
  return cursor[0];
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
