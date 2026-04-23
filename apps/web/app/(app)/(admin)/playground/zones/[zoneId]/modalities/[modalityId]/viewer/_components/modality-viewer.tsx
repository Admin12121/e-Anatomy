"use client";

import { skipToken } from "@reduxjs/toolkit/query";
import {
  useCallback,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import gsap from "gsap";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type {
  CreateViewerAnnotationInput,
  CreateViewerStructureGroupInput,
  CreateViewerStructureInput,
  UpdateViewerAnnotationInput,
  UpdateViewerStructureGroupInput,
  UpdateViewerStructureInput,
  ViewerAnnotation,
  ViewerAnnotationPoint,
  ViewerStructure,
  ZoneModalityAtlasFrame,
  ZoneModalityAtlasPage,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import { useGetPublicZoneModalityViewerManifestQuery } from "@/lib/store/services/public-playground-api";
import {
  useCreateViewerAnnotationMutation,
  useCreateViewerStructureGroupMutation,
  useCreateViewerStructureMutation,
  useDeleteZoneModalityAssetsBulkMutation,
  useDeleteViewerStructureGroupMutation,
  useDeleteViewerStructureMutation,
  useGetZoneModalityViewerManifestQuery,
  useRebuildZoneModalityAtlasesMutation,
  useUpdateViewerAnnotationMutation,
  useUpdateViewerStructureGroupMutation,
  useUpdateViewerStructureMutation,
  useUpdateZoneModalityAssetMutation,
} from "@/lib/store/services/playground-api";
import { cn } from "@/lib/utils";
import Loader from "@/components/ui/loader";
import { ModalityViewerRightPanel } from "./right-panel";
import {
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_GROUP_COLOR,
  EMPTY_ANNOTATION_FORM,
  EMPTY_GROUP_FORM,
  EMPTY_STRUCTURE_FORM,
  type AnnotationFormState,
  type FontScaleMode,
  type GroupFormState,
  type StructureFormState,
  type ViewerCanvasMode,
} from "./modality-viewer.types";
import EmptyParticle from "./empty";
import { ViewerBlockView } from "./modality-viewer/block-view";
import { SliceFilmstrip } from "./modality-viewer/slice-filmstrip";
import { StudyPanel } from "./modality-viewer/study-panel";
import { ViewerToolbar } from "./modality-viewer/viewer-toolbar";
import {
  ViewerCanvas,
  type AreaEditTool,
  type MainInteractionTool,
} from "./modality-viewer/viewer-canvas";
import {
  buildImmediatePreloadOrder,
  buildStackWarmupOrder,
  clamp,
  createDefaultLabelX,
  formatModalityTypeLabel,
  formatOrientationLabel,
  isSliceAsset,
  readMutationError,
  splitMultilineList,
  structureMatchesSearch,
} from "./modality-viewer/utils";

type NavigationSource =
  | "button"
  | "click"
  | "scrub"
  | "search"
  | "weighting"
  | "wheel";
type PreloadPriority = "high" | "low";

type ViewerSliceItem = {
  asset: ZoneModalityAsset;
  assetId: string;
  assetIndex: number;
  atlasFrame: ZoneModalityAtlasFrame | null;
  atlasPage: ZoneModalityAtlasPage | null;
  thumbnailSrc: string;
};

type PreloadQueueItem = {
  asset: ZoneModalityAsset;
  cacheKey: string;
  imageUrl: string;
  order: number;
  priority: PreloadPriority;
  resolve: () => void;
};

const ACTIVE_INGEST_STATUSES = new Set([
  "queued",
  "uploaded",
  "validating",
  "needs_review",
  "deriving",
]);

const TERMINAL_INGEST_STATUSES = new Set([
  "failed",
  "ready_for_edit",
  "cancelled",
]);

const IMAGE_PRELOAD_RADIUS = 16;
const IMMEDIATE_PRELOAD_BURST = 6;
const STACK_PRELOAD_CONCURRENCY = 4;
const STACK_WARMUP_MAX_ASSET_COUNT = 48;
const PRELOAD_MAX_IN_FLIGHT = 6;
const PRELOAD_MAX_LOW_IN_FLIGHT = 2;
const PRELOAD_HIGH_PRIORITY_RESERVED_SLOTS = 2;
const FILMSTRIP_SCROLL_DURATION_SECONDS = 0.26;
const FILMSTRIP_SCROLL_JUMP_THRESHOLD_PX = 1600;
const LOADING_INDICATOR_DELAY_MS = 260;
const WHEEL_LOADING_INDICATOR_DELAY_MS = 700;
const SCRUB_LOADING_INDICATOR_DELAY_MS = 1400;
const WHEEL_DELTA_THRESHOLD = 120;
const WHEEL_NAVIGATION_COOLDOWN_MS = 110;
const SCRUB_PREVIEW_CACHE_MAX_ASSET_COUNT = 240;

function areAssetIdOrdersEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function preloadPriorityRank(priority: PreloadPriority) {
  return priority === "high" ? 0 : 1;
}

function sortPreloadQueue(queue: PreloadQueueItem[]) {
  queue.sort((left, right) => {
    const priorityDiff =
      preloadPriorityRank(left.priority) - preloadPriorityRank(right.priority);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return left.order - right.order;
  });
}

type DraftModalityViewerProps = {
  modalityId: string;
  zoneId: string;
};

type PublicModalityViewerProps = {
  modalitySlug: string;
  zoneSlug: string;
};

type ModalityViewerShellProps = {
  modalityId: string;
  modalitySlug: string;
  mode: "admin" | "public";
  zoneId: string;
  zoneSlug: string;
};

export function DraftModalityViewer({
  modalityId,
  zoneId,
}: DraftModalityViewerProps) {
  return (
    <ModalityViewerShell
      modalityId={modalityId}
      modalitySlug=""
      mode="admin"
      zoneId={zoneId}
      zoneSlug=""
    />
  );
}

export function PublicModalityViewer({
  modalitySlug,
  zoneSlug,
}: PublicModalityViewerProps) {
  return (
    <ModalityViewerShell
      modalityId=""
      modalitySlug={modalitySlug}
      mode="public"
      zoneId=""
      zoneSlug={zoneSlug}
    />
  );
}

function ModalityViewerShell({
  modalityId,
  modalitySlug,
  mode,
  zoneId,
  zoneSlug,
}: ModalityViewerShellProps) {
  const readOnly = mode === "public";
  const [viewerPollingIntervalMs, setViewerPollingIntervalMs] = useState(0);

  const adminViewerQuery = useGetZoneModalityViewerManifestQuery(
    readOnly
      ? skipToken
      : {
          zoneId,
          modalityId,
        },
    {
      pollingInterval: viewerPollingIntervalMs,
      refetchOnFocus: true,
      refetchOnMountOrArgChange: true,
      refetchOnReconnect: true,
    },
  );
  const publicViewerQuery = useGetPublicZoneModalityViewerManifestQuery(
    readOnly
      ? {
          modalitySlug,
          zoneSlug,
        }
      : skipToken,
    {
      pollingInterval: viewerPollingIntervalMs,
      refetchOnFocus: true,
      refetchOnMountOrArgChange: true,
      refetchOnReconnect: true,
    },
  );

  const {
    data,
    error,
    isLoading,
    refetch: refetchViewerManifest,
  } = readOnly ? publicViewerQuery : adminViewerQuery;
  const [createGroup, { isLoading: isCreatingGroup }] =
    useCreateViewerStructureGroupMutation();
  const [updateGroup, { isLoading: isUpdatingGroup }] =
    useUpdateViewerStructureGroupMutation();
  const [createStructure, { isLoading: isCreatingStructure }] =
    useCreateViewerStructureMutation();
  const [updateStructure, { isLoading: isUpdatingStructure }] =
    useUpdateViewerStructureMutation();
  const [createAnnotation, { isLoading: isCreatingAnnotation }] =
    useCreateViewerAnnotationMutation();
  const [updateAnnotation, { isLoading: isUpdatingAnnotation }] =
    useUpdateViewerAnnotationMutation();
  const [deleteGroup, { isLoading: isDeletingGroup }] =
    useDeleteViewerStructureGroupMutation();
  const [deleteStructure, { isLoading: isDeletingStructure }] =
    useDeleteViewerStructureMutation();
  const [updateModalityAsset] = useUpdateZoneModalityAssetMutation();
  const [deleteModalityAssetsBulk] = useDeleteZoneModalityAssetsBulkMutation();
  const [rebuildZoneModalityAtlases] = useRebuildZoneModalityAtlasesMutation();

  const [activeWeighting, setActiveWeighting] = useState<string>("all");
  const [currentAssetId, setCurrentAssetId] = useState<string | null>(null);
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(
    null,
  );
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [canvasMode, setCanvasMode] = useState<ViewerCanvasMode>("browse");
  const [showLabels, setShowLabels] = useState(true);
  const practiceMode = false;
  const pinsOnly = false;
  const [targetedLabeling, setTargetedLabeling] = useState(false);
  const showOrientation = true;
  const [showCrossReferences, setShowCrossReferences] = useState(true);
  const darkMode = true;
  const overlayOpacity = 0.72;
  const reverseScroll = false;
  const pointAnimation = true;
  const fontScaleMode: FontScaleMode = "auto";
  const [groupForm, setGroupForm] = useState<GroupFormState>(EMPTY_GROUP_FORM);
  const [structureForm, setStructureForm] =
    useState<StructureFormState>(EMPTY_STRUCTURE_FORM);
  const [annotationForm, setAnnotationForm] = useState<AnnotationFormState>(
    EMPTY_ANNOTATION_FORM,
  );
  const [visibleGroupIds, setVisibleGroupIds] = useState<string[]>([]);
  const [readyAssetIds, setReadyAssetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingIndicatorAssetId, setLoadingIndicatorAssetId] = useState<
    string | null
  >(null);
  const [currentImageElement, setCurrentImageElement] =
    useState<HTMLImageElement | null>(null);
  const [showBlockView, setShowBlockView] = useState(false);
  const [showSliceEditorPanel, setShowSliceEditorPanel] = useState(false);
  const [mainInteractionTool, setMainInteractionTool] =
    useState<MainInteractionTool>("layers");
  const effectiveShowCrossReferences = readOnly ? false : showCrossReferences;
  const [showStudyPanel, setShowStudyPanel] = useState(true);
  const [showControlPanel, setShowControlPanel] = useState(true);
  const [canvasRotationQuarterTurns, setCanvasRotationQuarterTurns] =
    useState(0);
  const [canvasFlipHorizontal, setCanvasFlipHorizontal] = useState(false);
  const [canvasFlipVertical, setCanvasFlipVertical] = useState(false);
  const [areaEditTool, setAreaEditTool] = useState<AreaEditTool>("brush");
  const [areaBrushSize, setAreaBrushSize] = useState(20);
  const [areaEraserSize, setAreaEraserSize] = useState(28);
  const [draftDisconnectedPolygons, setDraftDisconnectedPolygons] = useState<
    ViewerAnnotationPoint[][]
  >([]);
  const [sliceTimelineIds, setSliceTimelineIds] = useState<string[]>([]);
  const [sliceTimelineUndoStack, setSliceTimelineUndoStack] = useState<
    string[][]
  >([]);
  const [sliceTimelineRedoStack, setSliceTimelineRedoStack] = useState<
    string[][]
  >([]);
  const [isApplyingSliceChanges, setIsApplyingSliceChanges] = useState(false);

  const filmstripScrollerRef = useRef<HTMLDivElement | null>(null);
  const sliceEditorScrollerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const wheelDeltaRef = useRef(0);
  const wheelCooldownRef = useRef<number | null>(null);
  const lastNavigationDirectionRef = useRef<-1 | 0 | 1>(0);
  const readyAssetIdCacheRef = useRef<Set<string>>(new Set());
  const imageElementCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const previewImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pendingImagePreloadCacheRef = useRef<Set<string>>(new Set());
  const imagePreloadPromiseCacheRef = useRef<Map<string, Promise<void>>>(
    new Map(),
  );
  const preloadQueueRef = useRef<PreloadQueueItem[]>([]);
  const pumpPreloadQueueRef = useRef<(() => void) | null>(null);
  const queuedPreloadByAssetIdRef = useRef<Map<string, PreloadQueueItem>>(
    new Map(),
  );
  const preloadQueueOrderRef = useRef(0);
  const preloadInFlightCountRef = useRef(0);
  const preloadLowInFlightCountRef = useRef(0);
  const currentAssetIdRef = useRef<string | null>(null);
  const pendingAssetIdRef = useRef<string | null>(null);
  const previewImagePromiseCacheRef = useRef<
    Map<string, Promise<HTMLImageElement | null>>
  >(new Map());
  const queuedNavigationAssetIdRef = useRef<string | null>(null);
  const queuedNavigationSourceRef = useRef<NavigationSource>("wheel");
  const navigationRequestIdRef = useRef(0);
  const lastNavigationSourceRef = useRef<NavigationSource>("button");

  const assets = useMemo(() => data?.assets ?? [], [data?.assets]);
  const ingestStatus = data?.ingestJob?.status;
  const hasSliceAssets = useMemo(() => assets.some(isSliceAsset), [assets]);
  const shouldPollViewerData = useMemo(() => {
    if (!data || error) {
      return false;
    }

    if (ingestStatus && ACTIVE_INGEST_STATUSES.has(ingestStatus)) {
      return true;
    }

    if (!hasSliceAssets && data.modality.processingStatus === "processing") {
      return !ingestStatus || !TERMINAL_INGEST_STATUSES.has(ingestStatus);
    }

    return false;
  }, [data, error, hasSliceAssets, ingestStatus]);
  const ingestFailureMessage = useMemo(() => {
    if (!data || data.ingestJob?.status !== "failed") {
      return null;
    }

    return (
      data.ingestJob.errorMessage ??
      "Study intake failed before any slices were produced."
    );
  }, [data]);
  const groups = useMemo(
    () => data?.structureGroups ?? [],
    [data?.structureGroups],
  );
  const structures = useMemo(() => data?.structures ?? [], [data?.structures]);
  const annotations = useMemo(
    () => data?.annotations ?? [],
    [data?.annotations],
  );

  const structuresById = useMemo(
    () => new Map(structures.map((structure) => [structure.id, structure])),
    [structures],
  );
  const groupsById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );
  const annotationsById = useMemo(
    () => new Map(annotations.map((annotation) => [annotation.id, annotation])),
    [annotations],
  );
  const baseSliceAssets = useMemo(
    () =>
      assets
        .filter((asset) => isSliceAsset(asset))
        .sort((left, right) =>
          left.sortOrder === right.sortOrder
            ? left.createdAt.localeCompare(right.createdAt)
            : left.sortOrder - right.sortOrder,
        ),
    [assets],
  );
  const baseSliceAssetIds = useMemo(
    () => baseSliceAssets.map((asset) => asset.id),
    [baseSliceAssets],
  );
  const baseSliceAssetIdSet = useMemo(
    () => new Set(baseSliceAssetIds),
    [baseSliceAssetIds],
  );
  const sliceAssetById = useMemo(
    () => new Map(baseSliceAssets.map((asset) => [asset.id, asset])),
    [baseSliceAssets],
  );
  const assetById = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const atlasPageById = useMemo(
    () => new Map((data?.atlases ?? []).map((atlas) => [atlas.id, atlas])),
    [data?.atlases],
  );
  const atlasFrameByAssetId = useMemo(
    () =>
      new Map((data?.atlasFrames ?? []).map((frame) => [frame.assetId, frame])),
    [data?.atlasFrames],
  );
  const assetImageSourceById = useMemo(
    () =>
      new Map(
        assets.map((asset) => {
          const atlasFrame = atlasFrameByAssetId.get(asset.id) ?? null;
          const atlasPage = atlasFrame
            ? (atlasPageById.get(atlasFrame.atlasId) ?? null)
            : null;

          return [
            asset.id,
            {
              atlasFrame,
              atlasPage,
              cacheKey: atlasPage?.id ?? asset.id,
              imageUrl: atlasPage?.imageUrl ?? asset.imageUrl,
            },
          ];
        }),
      ),
    [assets, atlasFrameByAssetId, atlasPageById],
  );
  const normalizedSliceTimelineIds =
    sliceTimelineIds.length > 0 ? sliceTimelineIds : baseSliceAssetIds;
  const orderedSliceAssets = useMemo(
    () =>
      normalizedSliceTimelineIds
        .map((assetId) => sliceAssetById.get(assetId))
        .filter((asset): asset is ZoneModalityAsset => Boolean(asset)),
    [normalizedSliceTimelineIds, sliceAssetById],
  );
  const weightings = useMemo<string[]>(() => {
    const specificValues = Array.from(
      new Set(
        orderedSliceAssets.flatMap((asset) =>
          asset.weightingCode ? [asset.weightingCode] : [],
        ),
      ),
    );

    if (specificValues.length === 0) {
      return ["all"];
    }

    return ["all", ...specificValues];
  }, [orderedSliceAssets]);
  const activeAssets = useMemo(() => {
    if (activeWeighting === "all") {
      return orderedSliceAssets;
    }

    const weighted = orderedSliceAssets.filter(
      (asset) => (asset.weightingCode ?? "all") === activeWeighting,
    );

    return weighted.length > 0 ? weighted : orderedSliceAssets;
  }, [activeWeighting, orderedSliceAssets]);
  const viewerSliceItems = useMemo<ViewerSliceItem[]>(
    () =>
      activeAssets.map((asset, assetIndex) => {
        const source = assetImageSourceById.get(asset.id) ?? {
          atlasFrame: null,
          atlasPage: null,
          cacheKey: asset.id,
          imageUrl: asset.thumbnailUrl || asset.imageUrl,
        };

        return {
          asset,
          assetId: asset.id,
          assetIndex,
          atlasFrame: source.atlasFrame,
          atlasPage: source.atlasPage,
          thumbnailSrc: source.imageUrl,
        };
      }),
    [activeAssets, assetImageSourceById],
  );
  const activeSliceAssetById = useMemo(
    () => new Map(viewerSliceItems.map((item) => [item.assetId, item.asset])),
    [viewerSliceItems],
  );
  const activeSliceAssetIndexById = useMemo(
    () =>
      new Map(viewerSliceItems.map((item) => [item.assetId, item.assetIndex])),
    [viewerSliceItems],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSliceTimelineIds((current) => {
      const preserved = current.filter((assetId) =>
        baseSliceAssetIdSet.has(assetId),
      );
      const preservedSet = new Set(preserved);
      const appended = baseSliceAssetIds.filter(
        (assetId) => !preservedSet.has(assetId),
      );
      const next = [...preserved, ...appended];

      return areAssetIdOrdersEqual(current, next) ? current : next;
    });
  }, [baseSliceAssetIdSet, baseSliceAssetIds]);
  const referenceAssets = useMemo(() => {
    return assets.filter((asset) => !isSliceAsset(asset));
  }, [assets]);
  const triViewAssets = useMemo(
    () => referenceAssets.slice(0, 3),
    [referenceAssets],
  );

  const currentAsset = useMemo(() => {
    if (!currentAssetId) {
      return null;
    }

    return (
      activeSliceAssetById.get(currentAssetId) ??
      assetById.get(currentAssetId) ??
      null
    );
  }, [activeSliceAssetById, assetById, currentAssetId]);
  const pendingAsset = pendingAssetId
    ? (activeSliceAssetById.get(pendingAssetId) ??
      assetById.get(pendingAssetId) ??
      null)
    : null;
  const currentImageSource = currentAsset
    ? (assetImageSourceById.get(currentAsset.id) ?? null)
    : null;
  const pendingImageSource = pendingAsset
    ? (assetImageSourceById.get(pendingAsset.id) ?? null)
    : null;
  const currentAtlasFrame = currentImageSource?.atlasFrame ?? null;
  const navigationAssetIndex = useMemo(() => {
    const asset = pendingAsset ?? currentAsset;

    if (!asset) {
      return -1;
    }

    return activeSliceAssetIndexById.get(asset.id) ?? -1;
  }, [activeSliceAssetIndexById, currentAsset, pendingAsset]);
  const activeViewerAssetId = pendingAsset?.id ?? currentAsset?.id ?? null;
  const filmstripAssetOrderSignature = useMemo(
    () => viewerSliceItems.map((item) => item.assetId).join("|"),
    [viewerSliceItems],
  );

  useEffect(() => {
    currentAssetIdRef.current = currentAssetId;
  }, [currentAssetId]);

  useEffect(() => {
    pendingAssetIdRef.current = pendingAssetId;
  }, [pendingAssetId]);

  const commitCurrentAssetId = useCallback((assetId: string | null) => {
    currentAssetIdRef.current = assetId;
    setCurrentAssetId(assetId);
  }, []);

  const commitPendingAssetId = useCallback((assetId: string | null) => {
    pendingAssetIdRef.current = assetId;
    setPendingAssetId(assetId);
  }, []);
  const currentAnnotations = useMemo(
    () =>
      currentAsset
        ? annotations.filter(
            (annotation) => annotation.assetId === currentAsset.id,
          )
        : [],
    [annotations, currentAsset],
  );

  const markAssetReady = useCallback(
    (asset: ZoneModalityAsset, imageElement?: HTMLImageElement) => {
      const source = assetImageSourceById.get(asset.id);
      const cacheKey = source?.cacheKey ?? asset.id;

      if (imageElement) {
        imageElementCacheRef.current.set(cacheKey, imageElement);
      }

      const wasReady = readyAssetIdCacheRef.current.has(cacheKey);
      readyAssetIdCacheRef.current.add(cacheKey);
      pendingImagePreloadCacheRef.current.delete(cacheKey);
      imagePreloadPromiseCacheRef.current.delete(cacheKey);

      if (wasReady) {
        return;
      }

      setReadyAssetIds((current) => {
        if (current.has(cacheKey)) {
          return current;
        }

        const next = new Set(current);
        next.add(cacheKey);
        return next;
      });
    },
    [assetImageSourceById],
  );

  const cachePreviewImage = useCallback(
    (cacheKey: string, imageElement: HTMLImageElement) => {
      const cache = previewImageCacheRef.current;

      if (cache.has(cacheKey)) {
        cache.delete(cacheKey);
      }

      cache.set(cacheKey, imageElement);

      while (cache.size > SCRUB_PREVIEW_CACHE_MAX_ASSET_COUNT) {
        const oldestCacheKey = cache.keys().next().value;

        if (!oldestCacheKey) {
          break;
        }

        cache.delete(oldestCacheKey);
      }
    },
    [],
  );

  const preloadAssetPreview = useCallback(
    (asset: ZoneModalityAsset) => {
      const source = assetImageSourceById.get(asset.id) ?? {
        cacheKey: asset.id,
        imageUrl: asset.thumbnailUrl || asset.imageUrl,
      };
      const { cacheKey, imageUrl } = source;
      const fullImage = imageElementCacheRef.current.get(cacheKey);

      if (fullImage) {
        return Promise.resolve(fullImage);
      }

      const cachedPreview = previewImageCacheRef.current.get(cacheKey);

      if (cachedPreview) {
        return Promise.resolve(cachedPreview);
      }

      const existingPreviewPromise =
        previewImagePromiseCacheRef.current.get(cacheKey);

      if (existingPreviewPromise) {
        return existingPreviewPromise;
      }

      if (!imageUrl) {
        return Promise.resolve(null);
      }

      const previewPromise = new Promise<HTMLImageElement | null>((resolve) => {
        if (typeof window === "undefined") {
          resolve(null);
          return;
        }

        const image = new window.Image();
        image.decoding = "async";
        image.fetchPriority = "low";

        const finalize = (imageElement: HTMLImageElement | null) => {
          if (imageElement) {
            cachePreviewImage(cacheKey, imageElement);
          }

          const cachedPromise =
            previewImagePromiseCacheRef.current.get(cacheKey);

          if (cachedPromise === previewPromise) {
            previewImagePromiseCacheRef.current.delete(cacheKey);
          }

          resolve(imageElement);
        };

        image.onload = () => {
          if (typeof image.decode === "function") {
            void image
              .decode()
              .catch(() => undefined)
              .finally(() => finalize(image));
            return;
          }

          finalize(image);
        };

        image.onerror = () => {
          finalize(null);
        };

        image.src = imageUrl;
      });

      previewImagePromiseCacheRef.current.set(cacheKey, previewPromise);
      return previewPromise;
    },
    [assetImageSourceById, cachePreviewImage],
  );

  const pumpPreloadQueue = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    while (
      preloadInFlightCountRef.current < PRELOAD_MAX_IN_FLIGHT &&
      preloadQueueRef.current.length > 0
    ) {
      const hasHighPriorityQueued = preloadQueueRef.current.some(
        (task) => task.priority === "high",
      );
      const nextTaskIndex = preloadQueueRef.current.findIndex((task) => {
        if (task.priority === "high") {
          return true;
        }

        if (preloadLowInFlightCountRef.current >= PRELOAD_MAX_LOW_IN_FLIGHT) {
          return false;
        }

        if (!hasHighPriorityQueued) {
          return true;
        }

        return (
          preloadInFlightCountRef.current <
          PRELOAD_MAX_IN_FLIGHT - PRELOAD_HIGH_PRIORITY_RESERVED_SLOTS
        );
      });

      if (nextTaskIndex < 0) {
        return;
      }

      const nextTask = preloadQueueRef.current.splice(nextTaskIndex, 1)[0];

      if (!nextTask) {
        return;
      }

      queuedPreloadByAssetIdRef.current.delete(nextTask.cacheKey);

      if (
        readyAssetIdCacheRef.current.has(nextTask.cacheKey) &&
        imageElementCacheRef.current.has(nextTask.cacheKey)
      ) {
        imagePreloadPromiseCacheRef.current.delete(nextTask.cacheKey);
        pendingImagePreloadCacheRef.current.delete(nextTask.cacheKey);
        nextTask.resolve();
        continue;
      }

      const { asset, cacheKey, imageUrl, priority } = nextTask;
      preloadInFlightCountRef.current += 1;
      if (priority === "low") {
        preloadLowInFlightCountRef.current += 1;
      }

      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = priority;
      pendingImagePreloadCacheRef.current.add(cacheKey);

      const releaseSlot = () => {
        preloadInFlightCountRef.current = Math.max(
          0,
          preloadInFlightCountRef.current - 1,
        );

        if (priority === "low") {
          preloadLowInFlightCountRef.current = Math.max(
            0,
            preloadLowInFlightCountRef.current - 1,
          );
        }

        pumpPreloadQueueRef.current?.();
      };

      const finalize = () => {
        imagePreloadPromiseCacheRef.current.delete(cacheKey);
        nextTask.resolve();
        releaseSlot();
      };

      const finalizeReady = () => {
        markAssetReady(asset, image);
        finalize();
      };

      image.onload = () => {
        if (typeof image.decode === "function") {
          void image
            .decode()
            .catch(() => undefined)
            .finally(finalizeReady);
          return;
        }

        finalizeReady();
      };

      image.onerror = () => {
        pendingImagePreloadCacheRef.current.delete(cacheKey);
        finalize();
      };

      image.src = imageUrl;
    }
  }, [markAssetReady]);

  useEffect(() => {
    pumpPreloadQueueRef.current = pumpPreloadQueue;

    return () => {
      pumpPreloadQueueRef.current = null;
    };
  }, [pumpPreloadQueue]);

  const preloadAsset = useCallback(
    (asset: ZoneModalityAsset, priority: PreloadPriority = "low") => {
      if (typeof window === "undefined") {
        return Promise.resolve();
      }

      const source = assetImageSourceById.get(asset.id) ?? {
        cacheKey: asset.id,
        imageUrl: asset.thumbnailUrl || asset.imageUrl,
      };
      const { cacheKey, imageUrl } = source;

      if (
        readyAssetIdCacheRef.current.has(cacheKey) &&
        imageElementCacheRef.current.has(cacheKey)
      ) {
        return Promise.resolve();
      }

      const existingPromise = imagePreloadPromiseCacheRef.current.get(cacheKey);

      if (existingPromise) {
        if (priority === "high") {
          const queuedTask = queuedPreloadByAssetIdRef.current.get(cacheKey);

          if (queuedTask && queuedTask.priority !== "high") {
            queuedTask.priority = "high";
            sortPreloadQueue(preloadQueueRef.current);
            pumpPreloadQueue();
          }
        }

        return existingPromise;
      }

      const promise = new Promise<void>((resolve) => {
        const queuedTask: PreloadQueueItem = {
          asset,
          cacheKey,
          imageUrl,
          order: preloadQueueOrderRef.current,
          priority,
          resolve,
        };

        preloadQueueOrderRef.current += 1;
        queuedPreloadByAssetIdRef.current.set(cacheKey, queuedTask);
        preloadQueueRef.current.push(queuedTask);
        sortPreloadQueue(preloadQueueRef.current);
        pumpPreloadQueue();
      });

      imagePreloadPromiseCacheRef.current.set(cacheKey, promise);
      return promise;
    },
    [assetImageSourceById, pumpPreloadQueue],
  );

  const requestAssetNavigation = useCallback(
    (asset: ZoneModalityAsset, source: NavigationSource) => {
      const activeCurrentAssetId = currentAssetIdRef.current;
      const activePendingAssetId = pendingAssetIdRef.current;
      const sourceImage = assetImageSourceById.get(asset.id) ?? {
        cacheKey: asset.id,
        imageUrl: asset.thumbnailUrl || asset.imageUrl,
      };
      const cacheKey = sourceImage.cacheKey;

      if (activePendingAssetId && activePendingAssetId !== asset.id) {
        if (source === "scrub") {
          queuedNavigationAssetIdRef.current = null;
        } else {
          queuedNavigationAssetIdRef.current = asset.id;
          queuedNavigationSourceRef.current = source;
          return;
        }
      }

      queuedNavigationAssetIdRef.current = null;

      if (activePendingAssetId === asset.id) {
        return;
      }

      if (activeCurrentAssetId === asset.id) {
        navigationRequestIdRef.current += 1;
        setLoadingIndicatorAssetId(null);
        commitPendingAssetId(null);
        return;
      }

      lastNavigationSourceRef.current = source;

      if (readyAssetIdCacheRef.current.has(cacheKey)) {
        const cachedImage = imageElementCacheRef.current.get(cacheKey) ?? null;
        navigationRequestIdRef.current += 1;
        setLoadingIndicatorAssetId(null);
        commitPendingAssetId(null);
        commitCurrentAssetId(asset.id);
        setCurrentImageElement(cachedImage);
        return;
      }

      if (source === "scrub") {
        const requestId = navigationRequestIdRef.current + 1;
        navigationRequestIdRef.current = requestId;
        setLoadingIndicatorAssetId(null);
        commitPendingAssetId(null);
        commitCurrentAssetId(asset.id);

        const cachedPreviewImage = previewImageCacheRef.current.get(cacheKey);

        if (cachedPreviewImage) {
          setCurrentImageElement(cachedPreviewImage);
          return;
        }

        void preloadAssetPreview(asset).then((previewImage) => {
          if (navigationRequestIdRef.current !== requestId) {
            return;
          }

          if (!previewImage || readyAssetIdCacheRef.current.has(cacheKey)) {
            return;
          }

          setCurrentImageElement(previewImage);
        });

        return;
      }

      const requestId = navigationRequestIdRef.current + 1;
      navigationRequestIdRef.current = requestId;
      setLoadingIndicatorAssetId(null);
      commitPendingAssetId(asset.id);

      void preloadAsset(asset, "high").then(() => {
        if (navigationRequestIdRef.current !== requestId) {
          return;
        }

        if (!readyAssetIdCacheRef.current.has(cacheKey)) {
          setLoadingIndicatorAssetId(null);
          commitPendingAssetId(null);
          return;
        }

        const cachedImage = imageElementCacheRef.current.get(cacheKey) ?? null;
        commitCurrentAssetId(asset.id);
        setCurrentImageElement(cachedImage);
        setLoadingIndicatorAssetId(null);
        commitPendingAssetId(null);
      });
    },
    [
      assetImageSourceById,
      commitCurrentAssetId,
      commitPendingAssetId,
      preloadAsset,
      preloadAssetPreview,
    ],
  );

  useEffect(() => {
    if (pendingAssetId) {
      return;
    }

    const queuedAssetId = queuedNavigationAssetIdRef.current;

    if (!queuedAssetId) {
      return;
    }
    const queuedSource = queuedNavigationSourceRef.current;

    const queuedAsset = assetById.get(queuedAssetId);
    queuedNavigationAssetIdRef.current = null;

    if (!queuedAsset || queuedAsset.id === currentAsset?.id) {
      return;
    }

    void requestAssetNavigation(queuedAsset, queuedSource);
  }, [assetById, currentAsset?.id, pendingAssetId, requestAssetNavigation]);

  useEffect(() => {
    const activeCacheKeys = new Set(
      assets.map(
        (asset) => assetImageSourceById.get(asset.id)?.cacheKey ?? asset.id,
      ),
    );

    for (const cacheKey of previewImageCacheRef.current.keys()) {
      if (!activeCacheKeys.has(cacheKey)) {
        previewImageCacheRef.current.delete(cacheKey);
      }
    }

    for (const cacheKey of previewImagePromiseCacheRef.current.keys()) {
      if (!activeCacheKeys.has(cacheKey)) {
        previewImagePromiseCacheRef.current.delete(cacheKey);
      }
    }

    for (const cacheKey of imageElementCacheRef.current.keys()) {
      if (!activeCacheKeys.has(cacheKey)) {
        imageElementCacheRef.current.delete(cacheKey);
      }
    }

    for (const cacheKey of readyAssetIdCacheRef.current.values()) {
      if (!activeCacheKeys.has(cacheKey)) {
        readyAssetIdCacheRef.current.delete(cacheKey);
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadyAssetIds((current) => {
      let changed = false;
      const next = new Set<string>();

      for (const cacheKey of current.values()) {
        if (activeCacheKeys.has(cacheKey)) {
          next.add(cacheKey);
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });

    preloadQueueRef.current = preloadQueueRef.current.filter((task) => {
      if (activeCacheKeys.has(task.cacheKey)) {
        return true;
      }

      queuedPreloadByAssetIdRef.current.delete(task.cacheKey);
      pendingImagePreloadCacheRef.current.delete(task.cacheKey);
      imagePreloadPromiseCacheRef.current.delete(task.cacheKey);
      task.resolve();
      return false;
    });

    for (const cacheKey of queuedPreloadByAssetIdRef.current.keys()) {
      if (!activeCacheKeys.has(cacheKey)) {
        queuedPreloadByAssetIdRef.current.delete(cacheKey);
      }
    }

    for (const cacheKey of pendingImagePreloadCacheRef.current.values()) {
      if (!activeCacheKeys.has(cacheKey)) {
        pendingImagePreloadCacheRef.current.delete(cacheKey);
      }
    }

    for (const cacheKey of imagePreloadPromiseCacheRef.current.keys()) {
      if (
        !activeCacheKeys.has(cacheKey) &&
        !pendingImagePreloadCacheRef.current.has(cacheKey)
      ) {
        imagePreloadPromiseCacheRef.current.delete(cacheKey);
      }
    }
  }, [assets, assetImageSourceById]);

  useEffect(() => {
    const currentSourceKey = currentImageSource?.cacheKey ?? currentAssetId;

    if (!currentSourceKey || !readyAssetIds.has(currentSourceKey)) {
      return;
    }

    const cachedImage =
      imageElementCacheRef.current.get(currentSourceKey) ?? null;

    if (!cachedImage) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentImageElement((current) =>
      current === cachedImage ? current : cachedImage,
    );
  }, [currentAssetId, currentImageSource?.cacheKey, readyAssetIds]);

  const selectedStructure = selectedStructureId
    ? (structuresById.get(selectedStructureId) ?? null)
    : null;
  const selectedGroup = selectedGroupId
    ? (groupsById.get(selectedGroupId) ?? null)
    : null;
  const selectedAnnotation = selectedAnnotationId
    ? (annotationsById.get(selectedAnnotationId) ?? null)
    : null;

  const searchHits = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return structures
      .map((structure) => {
        const haystack = [
          structure.title,
          structure.latinName ?? "",
          structure.shortDescription ?? "",
          ...structure.synonyms,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(query)) {
          return null;
        }

        const relatedAnnotation = annotations.find(
          (annotation) => annotation.structureId === structure.id,
        );
        const relatedAsset =
          relatedAnnotation && assetById.get(relatedAnnotation.assetId);

        return {
          asset: relatedAsset ?? null,
          structure,
        };
      })
      .filter(
        (
          value,
        ): value is {
          asset: ZoneModalityAsset | null;
          structure: ViewerStructure;
        } => Boolean(value),
      )
      .slice(0, 8);
  }, [annotations, assetById, deferredSearchQuery, structures]);

  useEffect(() => {
    const nextInterval = shouldPollViewerData ? 2500 : 0;

    const timeoutId = window.setTimeout(() => {
      setViewerPollingIntervalMs((current) =>
        current === nextInterval ? current : nextInterval,
      );
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [shouldPollViewerData]);

  useEffect(() => {
    if (!data) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleGroupIds((current) =>
      current.length > 0
        ? current
        : groups
            .filter((group) => group.isDefaultVisible)
            .map((group) => group.id),
    );
  }, [data, groups]);

  useEffect(() => {
    if (selectedGroupId && groupsById.has(selectedGroupId)) {
      return;
    }

    if (
      selectedStructure?.groupId &&
      groupsById.has(selectedStructure.groupId)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedGroupId(selectedStructure.groupId);
      return;
    }

    if (selectedGroupId) {
      setSelectedGroupId(null);
    }
  }, [groupsById, selectedGroupId, selectedStructure?.groupId]);

  useEffect(() => {
    if (!weightings.includes(activeWeighting)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveWeighting(weightings[0] ?? "all");
    }
  }, [activeWeighting, weightings]);

  useEffect(() => {
    if (activeAssets.length === 0) {
      return;
    }

    const selectedAsset = currentAssetId
      ? (assetById.get(currentAssetId) ?? null)
      : null;

    if (selectedAsset && !isSliceAsset(selectedAsset)) {
      return;
    }

    if (
      selectedAsset &&
      activeAssets.some((asset) => asset.id === selectedAsset.id)
    ) {
      return;
    }

    const fallbackAsset = activeAssets[0];

    if (!fallbackAsset) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void requestAssetNavigation(
        fallbackAsset,
        lastNavigationSourceRef.current,
      );
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeAssets, assetById, currentAssetId, requestAssetNavigation]);

  useEffect(() => {
    if (!selectedGroup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroupForm(EMPTY_GROUP_FORM);
      return;
    }

    setGroupForm({
      title: selectedGroup.title,
    });
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedStructure) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStructureForm(EMPTY_STRUCTURE_FORM);
      return;
    }

    setStructureForm({
      groupId: selectedStructure.groupId ?? "",
      learningPoints: selectedStructure.learningPoints.join("\n"),
      longDescription: selectedStructure.longDescription ?? "",
      title: selectedStructure.title,
    });
  }, [selectedStructure]);

  useEffect(() => {
    if (!selectedAnnotation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnnotationForm((current) => {
        const structure = selectedStructureId
          ? (structuresById.get(selectedStructureId) ?? null)
          : null;
        const group = structure?.groupId
          ? groupsById.get(structure.groupId)
          : null;
        const resolvedColor =
          current.colorHex.trim() ||
          group?.colorHex ||
          DEFAULT_ANNOTATION_COLOR;

        return {
          ...EMPTY_ANNOTATION_FORM,
          colorHex: resolvedColor,
          leaderColorHex: current.leaderColorHex.trim() || resolvedColor,
          overlayColorHex: current.overlayColorHex.trim() || resolvedColor,
          overlayOpacity: current.overlayOpacity,
        };
      });
      setDraftDisconnectedPolygons([]);
      return;
    }

    const structure = structuresById.get(selectedAnnotation.structureId);
    const group = structure?.groupId ? groupsById.get(structure.groupId) : null;
    const resolvedColor =
      selectedAnnotation.colorHex ??
      group?.colorHex ??
      DEFAULT_ANNOTATION_COLOR;

    setAnnotationForm({
      anchorX: selectedAnnotation.anchorX,
      anchorY: selectedAnnotation.anchorY,
      colorHex: resolvedColor,
      labelX: selectedAnnotation.labelX,
      labelY: selectedAnnotation.labelY,
      leaderColorHex: selectedAnnotation.leaderColorHex ?? resolvedColor,
      overlayColorHex: selectedAnnotation.overlayColorHex ?? resolvedColor,
      overlayOpacity: selectedAnnotation.overlayOpacity,
      polygonPoints: selectedAnnotation.polygonPoints,
    });
    setDraftDisconnectedPolygons([]);
  }, [groupsById, selectedAnnotation, selectedStructureId, structuresById]);

  useEffect(() => {
    if (!currentAsset || !selectedAnnotationId) {
      return;
    }

    const activeAnnotation = annotationsById.get(selectedAnnotationId) ?? null;

    if (!activeAnnotation || activeAnnotation.assetId === currentAsset.id) {
      return;
    }

    // Slice-specific annotation selection should not leak across slices while
    // the same anatomical part stays selected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAnnotationId(null);
  }, [annotationsById, currentAsset, selectedAnnotationId]);

  useEffect(() => {
    if (
      !selectedStructureId ||
      !currentAsset ||
      pendingAsset ||
      canvasMode !== "browse"
    ) {
      return;
    }

    const currentSelectedAnnotation = selectedAnnotationId
      ? (annotationsById.get(selectedAnnotationId) ?? null)
      : null;

    if (
      currentSelectedAnnotation &&
      currentSelectedAnnotation.assetId === currentAsset.id &&
      currentSelectedAnnotation.structureId === selectedStructureId
    ) {
      return;
    }

    const matchingAnnotation = annotations.find(
      (annotation) =>
        annotation.assetId === currentAsset.id &&
        annotation.structureId === selectedStructureId,
    );

    const nextSelectedAnnotationId = matchingAnnotation?.id ?? null;

    if (nextSelectedAnnotationId !== selectedAnnotationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAnnotationId(nextSelectedAnnotationId);
    }
  }, [
    annotations,
    annotationsById,
    canvasMode,
    currentAsset,
    pendingAsset,
    selectedAnnotationId,
    selectedStructureId,
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      navigationAssetIndex < 0 ||
      pendingAsset
    ) {
      return;
    }

    const immediateAssets = buildImmediatePreloadOrder(
      activeAssets,
      navigationAssetIndex,
      lastNavigationDirectionRef.current,
      Math.max(IMAGE_PRELOAD_RADIUS, IMMEDIATE_PRELOAD_BURST),
    ).filter((asset) => asset.id !== currentAsset?.id);

    if (immediateAssets.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const nearAssets = immediateAssets.slice(0, IMMEDIATE_PRELOAD_BURST);
      const farAssets = immediateAssets.slice(IMMEDIATE_PRELOAD_BURST);

      for (const asset of nearAssets) {
        void preloadAsset(asset, "high");
      }

      for (const asset of farAssets) {
        void preloadAsset(asset, "low");
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeAssets,
    currentAsset?.id,
    navigationAssetIndex,
    pendingAsset,
    preloadAsset,
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      activeAssets.length === 0 ||
      pendingAsset
    ) {
      return;
    }

    let cancelled = false;
    const warmupOrder = buildStackWarmupOrder(
      activeAssets,
      Math.max(navigationAssetIndex, 0),
      lastNavigationDirectionRef.current,
    )
      .filter((asset) => asset.id !== currentAsset?.id)
      .slice(0, STACK_WARMUP_MAX_ASSET_COUNT);

    if (warmupOrder.length === 0) {
      return;
    }

    let cursor = 0;

    async function worker() {
      while (!cancelled) {
        const asset = warmupOrder[cursor];
        cursor += 1;

        if (!asset) {
          return;
        }

        await preloadAsset(asset);
      }
    }

    const workerCount = Math.min(STACK_PRELOAD_CONCURRENCY, warmupOrder.length);

    void Promise.all(Array.from({ length: workerCount }, () => worker()));

    return () => {
      cancelled = true;
    };
  }, [
    activeAssets,
    currentAsset?.id,
    navigationAssetIndex,
    pendingAsset,
    preloadAsset,
  ]);

  useEffect(() => {
    const preloadQueue = preloadQueueRef.current;
    const queuedPreloadByAssetId = queuedPreloadByAssetIdRef.current;
    const imagePreloadPromiseCache = imagePreloadPromiseCacheRef.current;
    const previewImagePromiseCache = previewImagePromiseCacheRef.current;

    return () => {
      for (const queuedTask of preloadQueue) {
        queuedTask.resolve();
      }

      preloadQueue.length = 0;
      queuedPreloadByAssetId.clear();
      imagePreloadPromiseCache.clear();
      previewImagePromiseCache.clear();

      if (wheelCooldownRef.current !== null) {
        window.clearTimeout(wheelCooldownRef.current);
      }
    };
  }, []);

  const visibleAnnotations = useMemo(() => {
    const normalizedSearch = deferredSearchQuery.trim().toLowerCase();

    return currentAnnotations.filter((annotation) => {
      const structure = structuresById.get(annotation.structureId);

      if (!structure) {
        return false;
      }

      if (structure.groupId && !visibleGroupIds.includes(structure.groupId)) {
        return false;
      }

      if (
        targetedLabeling &&
        selectedStructureId &&
        structure.id !== selectedStructureId
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return structureMatchesSearch(structure, normalizedSearch);
    });
  }, [
    currentAnnotations,
    deferredSearchQuery,
    selectedStructureId,
    structuresById,
    targetedLabeling,
    visibleGroupIds,
  ]);

  const relatedAssets = useMemo(() => {
    if (!selectedStructure) {
      return [];
    }

    return annotations
      .filter((annotation) => annotation.structureId === selectedStructure.id)
      .map((annotation) => {
        const asset = assetById.get(annotation.assetId);

        if (!asset) {
          return null;
        }

        return {
          annotation,
          asset,
        };
      })
      .filter(
        (
          value,
        ): value is {
          annotation: ViewerAnnotation;
          asset: ZoneModalityAsset;
        } => Boolean(value),
      );
  }, [annotations, assetById, selectedStructure]);

  const busy =
    isCreatingAnnotation ||
    isCreatingGroup ||
    isCreatingStructure ||
    isDeletingGroup ||
    isDeletingStructure ||
    isApplyingSliceChanges ||
    isUpdatingAnnotation ||
    isUpdatingGroup ||
    isUpdatingStructure;
  const lockedPreviewStructure =
    selectedStructure?.accessLevel === "subscription"
      ? selectedStructure
      : null;
  const shellGridClass = cn(
    "grid min-h-0 flex-1 gap-2",
    readOnly
      ? "h-[calc(100dvh-55px)] max-h-[calc(100dvh-55px)] overflow-hidden"
      : showSliceEditorPanel
        ? "max-h-[calc(100vh-310px)]"
        : "max-h-[calc(100vh-101px)]",
    showStudyPanel &&
      showControlPanel &&
      "xl:grid-cols-[22rem_minmax(0,1fr)_22rem]",
    showStudyPanel && !showControlPanel && "xl:grid-cols-[22rem_minmax(0,1fr)]",
    !showStudyPanel && showControlPanel && "xl:grid-cols-[minmax(0,1fr)_22rem]",
    !showStudyPanel && !showControlPanel && "xl:grid-cols-[minmax(0,1fr)]",
  );
  const viewerTitle = useMemo(() => {
    if (!showOrientation) {
      return "Viewer";
    }

    const modalityName = data?.modality.name?.trim() || "Viewer";
    const modalityType = formatModalityTypeLabel(data?.modality.modalityType);
    const orientation = formatOrientationLabel(currentAsset?.orientationCode);
    const base = modalityType
      ? `${modalityName} - ${modalityType}`
      : modalityName;

    return orientation ? `${base} (${orientation})` : base;
  }, [
    currentAsset?.orientationCode,
    data?.modality.modalityType,
    data?.modality.name,
    showOrientation,
  ]);
  const showLoadingIndicator = pendingAsset
    ? !readyAssetIds.has(pendingImageSource?.cacheKey ?? pendingAsset.id) &&
      loadingIndicatorAssetId === pendingAsset.id
    : false;
  const isAssetLoading = pendingAsset
    ? !readyAssetIds.has(pendingImageSource?.cacheKey ?? pendingAsset.id)
    : false;
  const activeFilmstripAssetId = currentAsset?.id ?? pendingAsset?.id ?? null;
  const isPreparingInitialAsset = activeAssets.length > 0 && !currentAsset;
  const activeAreaToolSize =
    areaEditTool === "erase" ? areaEraserSize : areaBrushSize;
  const canUndoSliceTimeline = sliceTimelineUndoStack.length > 0;
  const canRedoSliceTimeline = sliceTimelineRedoStack.length > 0;
  const canDeleteSelectedSlice =
    activeAssets.length > 1 && navigationAssetIndex >= 0;
  const canDeleteLeftSlices = navigationAssetIndex > 0;
  const canDeleteRightSlices =
    navigationAssetIndex >= 0 && navigationAssetIndex < activeAssets.length - 1;
  const canFlipSliceTimeline = activeAssets.length > 1;
  const pendingDeletedSliceIds = useMemo(() => {
    const nextOrderSet = new Set(normalizedSliceTimelineIds);

    return baseSliceAssetIds.filter((assetId) => !nextOrderSet.has(assetId));
  }, [baseSliceAssetIds, normalizedSliceTimelineIds]);
  const pendingSliceSortUpdates = useMemo(() => {
    const sortStart = baseSliceAssets.reduce(
      (minimum, asset) => Math.min(minimum, asset.sortOrder),
      Number.POSITIVE_INFINITY,
    );
    const startSortOrder = Number.isFinite(sortStart) ? sortStart : 0;

    return normalizedSliceTimelineIds
      .map((assetId, index) => {
        const asset = sliceAssetById.get(assetId);

        if (!asset) {
          return null;
        }

        const nextSortOrder = startSortOrder + index;

        if (asset.sortOrder === nextSortOrder) {
          return null;
        }

        return {
          asset,
          nextSortOrder,
        };
      })
      .filter(
        (
          value,
        ): value is {
          asset: ZoneModalityAsset;
          nextSortOrder: number;
        } => Boolean(value),
      );
  }, [baseSliceAssets, normalizedSliceTimelineIds, sliceAssetById]);
  const hasPendingSliceTimelineChanges =
    pendingDeletedSliceIds.length > 0 || pendingSliceSortUpdates.length > 0;

  useEffect(() => {
    if (canvasMode !== "draw-region") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftDisconnectedPolygons([]);
    }
  }, [canvasMode]);

  useEffect(() => {
    if (!currentAsset) {
      const timeoutId = window.setTimeout(() => {
        setCurrentImageElement(null);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [currentAsset]);

  useEffect(() => {
    if (typeof window === "undefined" || !pendingAsset) {
      return;
    }

    if (readyAssetIds.has(pendingImageSource?.cacheKey ?? pendingAsset.id)) {
      return;
    }

    const assetId = pendingAsset.id;
    const delayMs =
      lastNavigationSourceRef.current === "wheel"
        ? WHEEL_LOADING_INDICATOR_DELAY_MS
        : lastNavigationSourceRef.current === "scrub"
          ? SCRUB_LOADING_INDICATOR_DELAY_MS
          : LOADING_INDICATOR_DELAY_MS;
    const timeoutId = window.setTimeout(() => {
      setLoadingIndicatorAssetId(assetId);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingAsset, pendingImageSource?.cacheKey, readyAssetIds]);

  const centerActiveFilmstripItem = useCallback(
    (scroller: HTMLDivElement | null) => {
      if (!scroller || !activeFilmstripAssetId) {
        return;
      }

      const activeButton = scroller.querySelector<HTMLElement>(
        `[data-asset-id="${activeFilmstripAssetId}"]`,
      );

      if (!activeButton) {
        return;
      }

      const maxScrollLeft = Math.max(
        0,
        scroller.scrollWidth - scroller.clientWidth,
      );
      const targetScrollLeft = clamp(
        activeButton.offsetLeft -
          scroller.clientWidth / 2 +
          activeButton.clientWidth / 2,
        0,
        maxScrollLeft,
      );
      const travelDistance = Math.abs(scroller.scrollLeft - targetScrollLeft);

      gsap.killTweensOf(scroller);

      if (travelDistance > FILMSTRIP_SCROLL_JUMP_THRESHOLD_PX) {
        scroller.scrollLeft = targetScrollLeft;
        return;
      }

      gsap.to(scroller, {
        duration: FILMSTRIP_SCROLL_DURATION_SECONDS,
        ease: "power3.out",
        overwrite: "auto",
        scrollLeft: targetScrollLeft,
      });
    },
    [activeFilmstripAssetId],
  );

  useEffect(() => {
    const filmstripScroller = filmstripScrollerRef.current;
    const sliceEditorScroller = sliceEditorScrollerRef.current;

    centerActiveFilmstripItem(filmstripScroller);

    if (showSliceEditorPanel) {
      centerActiveFilmstripItem(sliceEditorScroller);
    }

    return () => {
      if (filmstripScroller) {
        gsap.killTweensOf(filmstripScroller);
      }

      if (sliceEditorScroller) {
        gsap.killTweensOf(sliceEditorScroller);
      }
    };
  }, [
    centerActiveFilmstripItem,
    filmstripAssetOrderSignature,
    showSliceEditorPanel,
  ]);

  function updateGroupVisibility(groupId: string, nextVisible: boolean) {
    setVisibleGroupIds((current) => {
      const nextSet = new Set(current);

      if (nextVisible) {
        nextSet.add(groupId);
      } else {
        nextSet.delete(groupId);
      }

      return Array.from(nextSet);
    });
  }

  function navigateToAsset(
    nextIndex: number,
    source: NavigationSource = "button",
  ) {
    const nextAsset = activeAssets[nextIndex];

    if (!nextAsset || nextAsset.id === currentAsset?.id) {
      return;
    }

    lastNavigationDirectionRef.current = clamp(
      Math.sign(nextIndex - Math.max(navigationAssetIndex, 0)),
      -1,
      1,
    ) as -1 | 0 | 1;
    void requestAssetNavigation(nextAsset, source);
  }

  function navigateToAssetId(
    assetId: string,
    source: NavigationSource = "click",
  ) {
    const nextIndex = activeAssets.findIndex((asset) => asset.id === assetId);

    if (nextIndex >= 0) {
      navigateToAsset(nextIndex, source);
      return;
    }

    const nextAsset = assetById.get(assetId);

    if (!nextAsset) {
      return;
    }

    void requestAssetNavigation(nextAsset, source);
  }

  const updateAnnotationForm = useCallback(function updateAnnotationForm<
    Key extends keyof AnnotationFormState,
  >(key: Key, value: AnnotationFormState[Key]) {
    setAnnotationForm((current) =>
      Object.is(current[key], value)
        ? current
        : {
            ...current,
            [key]: value,
          },
    );
  }, []);

  const updateStructureForm = useCallback(function updateStructureForm<
    Key extends keyof StructureFormState,
  >(key: Key, value: StructureFormState[Key]) {
    setStructureForm((current) =>
      Object.is(current[key], value)
        ? current
        : {
            ...current,
            [key]: value,
          },
    );
  }, []);

  const updateGroupForm = useCallback(function updateGroupForm<
    Key extends keyof GroupFormState,
  >(key: Key, value: GroupFormState[Key]) {
    setGroupForm((current) =>
      Object.is(current[key], value)
        ? current
        : {
            ...current,
            [key]: value,
          },
    );
  }, []);

  function clearPolygonDraft() {
    if (readOnly) {
      return;
    }

    setDraftDisconnectedPolygons([]);
    updateAnnotationForm("polygonPoints", []);
  }

  async function handleSaveStructure(): Promise<ViewerStructure | null> {
    if (readOnly) {
      return null;
    }

    if (!structureForm.title.trim()) {
      toast.error("Structure title is required.");
      return null;
    }

    const preservedStructure = selectedStructure;
    const input: CreateViewerStructureInput | UpdateViewerStructureInput = {
      accessLevel: preservedStructure?.accessLevel ?? "free",
      groupId: structureForm.groupId || null,
      isPinnedDefault: preservedStructure?.isPinnedDefault ?? true,
      latinName: preservedStructure?.latinName ?? null,
      learningPoints: splitMultilineList(structureForm.learningPoints),
      longDescription: structureForm.longDescription.trim() || null,
      shortDescription: preservedStructure?.shortDescription ?? null,
      sortOrder: preservedStructure?.sortOrder ?? 0,
      synonyms: preservedStructure?.synonyms ?? [],
      title: structureForm.title.trim(),
    };

    try {
      const structure = selectedStructure
        ? await updateStructure({
            input,
            modalityId,
            structureId: selectedStructure.id,
            zoneId,
          }).unwrap()
        : await createStructure({ input, modalityId, zoneId }).unwrap();

      toast.success(
        selectedStructure ? "Structure updated." : "Structure created.",
      );
      setSelectedStructureId(structure.id);
      setSelectedGroupId(structure.groupId ?? null);
      return structure;
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to save the structure."),
      );
      return null;
    }
  }

  async function handleSaveAnnotation(options?: { structureId?: string }) {
    if (readOnly) {
      return;
    }

    const activeStructureId =
      options?.structureId ?? selectedStructure?.id ?? selectedStructureId;

    if (!activeStructureId || !currentAsset) {
      toast.error("Choose a structure and slice first.");
      return;
    }

    const editableAnnotation =
      selectedAnnotation &&
      selectedAnnotation.assetId === currentAsset.id &&
      selectedAnnotation.structureId === activeStructureId
        ? selectedAnnotation
        : null;
    const annotationDefaults = {
      isPracticeHidden: editableAnnotation?.isPracticeHidden ?? false,
      isTargetedDefault: editableAnnotation?.isTargetedDefault ?? false,
      isVisibleDefault: editableAnnotation?.isVisibleDefault ?? true,
      note: editableAnnotation?.note ?? null,
      titleOverride: editableAnnotation?.titleOverride ?? null,
    };

    const input: CreateViewerAnnotationInput | UpdateViewerAnnotationInput = {
      anchorX: annotationForm.anchorX,
      anchorY: annotationForm.anchorY,
      assetId: currentAsset.id,
      colorHex: annotationForm.colorHex.trim() || null,
      isPracticeHidden: annotationDefaults.isPracticeHidden,
      isTargetedDefault: annotationDefaults.isTargetedDefault,
      isVisibleDefault: annotationDefaults.isVisibleDefault,
      labelX: annotationForm.labelX,
      labelY: annotationForm.labelY,
      leaderColorHex: annotationForm.leaderColorHex.trim() || null,
      note: annotationDefaults.note,
      overlayColorHex: annotationForm.overlayColorHex.trim() || null,
      overlayOpacity: annotationForm.overlayOpacity,
      polygonPoints: annotationForm.polygonPoints,
      structureId: activeStructureId,
      titleOverride: annotationDefaults.titleOverride,
    };
    const detachedPolygonsForSave = draftDisconnectedPolygons.filter(
      (polygonPoints) => polygonPoints.length >= 3,
    );

    const buildDetachedAreaInput = (
      polygonPoints: ViewerAnnotationPoint[],
    ): CreateViewerAnnotationInput => {
      const { sumX, sumY } = polygonPoints.reduce(
        (accumulator, point) => ({
          sumX: accumulator.sumX + point.x,
          sumY: accumulator.sumY + point.y,
        }),
        { sumX: 0, sumY: 0 },
      );
      const anchorX = clamp(sumX / polygonPoints.length, 0.03, 0.97);
      const anchorY = clamp(sumY / polygonPoints.length, 0.03, 0.97);

      return {
        anchorX,
        anchorY,
        assetId: currentAsset.id,
        colorHex: annotationForm.colorHex.trim() || null,
        isPracticeHidden: annotationDefaults.isPracticeHidden,
        isTargetedDefault: annotationDefaults.isTargetedDefault,
        isVisibleDefault: annotationDefaults.isVisibleDefault,
        labelX: createDefaultLabelX(anchorX),
        labelY: clamp(anchorY, 0.08, 0.92),
        leaderColorHex: annotationForm.leaderColorHex.trim() || null,
        note: annotationDefaults.note,
        overlayColorHex: annotationForm.overlayColorHex.trim() || null,
        overlayOpacity: annotationForm.overlayOpacity,
        polygonPoints,
        structureId: activeStructureId,
        titleOverride: annotationDefaults.titleOverride,
      };
    };

    try {
      const annotation = editableAnnotation
        ? await updateAnnotation({
            annotationId: editableAnnotation.id,
            input,
            modalityId,
            zoneId,
          }).unwrap()
        : await createAnnotation({ input, modalityId, zoneId }).unwrap();

      let createdDetachedCount = 0;
      let failedDetachedCount = 0;

      for (const polygonPoints of detachedPolygonsForSave) {
        try {
          await createAnnotation({
            input: buildDetachedAreaInput(polygonPoints),
            modalityId,
            zoneId,
          }).unwrap();
          createdDetachedCount += 1;
        } catch {
          failedDetachedCount += 1;
        }
      }

      if (createdDetachedCount > 0 && failedDetachedCount === 0) {
        toast.success(
          `${editableAnnotation ? "Annotation updated" : "Annotation created"} with ${createdDetachedCount + 1} separate areas.`,
        );
      } else if (failedDetachedCount > 0) {
        toast.warning(
          `Main area saved, ${createdDetachedCount} extra area(s) created, ${failedDetachedCount} failed.`,
        );
      } else {
        toast.success(
          editableAnnotation ? "Annotation updated." : "Annotation created.",
        );
      }

      setDraftDisconnectedPolygons([]);
      setSelectedAnnotationId(annotation.id);
      setCanvasMode("browse");
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to save the annotation."),
      );
    }
  }

  async function handleSaveGroup() {
    if (readOnly) {
      return;
    }

    if (!groupForm.title.trim()) {
      toast.error("Group title is required.");
      return;
    }

    const input:
      | CreateViewerStructureGroupInput
      | UpdateViewerStructureGroupInput = {
      colorHex: selectedGroup?.colorHex ?? DEFAULT_GROUP_COLOR,
      description: selectedGroup?.description ?? null,
      iconName: selectedGroup?.iconName ?? null,
      isDefaultVisible: selectedGroup?.isDefaultVisible ?? true,
      sortOrder: selectedGroup?.sortOrder ?? 0,
      title: groupForm.title.trim(),
    };

    try {
      const group = selectedGroup
        ? await updateGroup({
            groupId: selectedGroup.id,
            input,
            modalityId,
            zoneId,
          }).unwrap()
        : await createGroup({ input, modalityId, zoneId }).unwrap();

      toast.success(selectedGroup ? "Group updated." : "Group created.");
      setSelectedGroupId(group.id);
      setVisibleGroupIds((current) =>
        group.isDefaultVisible
          ? Array.from(new Set([...current, group.id]))
          : current,
      );
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to save the group."),
      );
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (readOnly) {
      return;
    }

    const group = groupsById.get(groupId);

    if (!group) {
      return;
    }

    if (
      !window.confirm(
        `Delete group "${group.title}"? Topics in this group stay available but become ungrouped.`,
      )
    ) {
      return;
    }

    try {
      await deleteGroup({ groupId, modalityId, zoneId }).unwrap();
      if (selectedGroupId === groupId) {
        setSelectedGroupId(null);
      }
      if (structureForm.groupId === groupId) {
        updateStructureForm("groupId", "");
      }
      toast.success("Group deleted.");
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to delete the group."),
      );
    }
  }

  async function handleDeleteStructure(structureId: string) {
    if (readOnly) {
      return;
    }

    const structure = structuresById.get(structureId);

    if (!structure) {
      return;
    }

    if (
      !window.confirm(
        `Delete topic "${structure.title}"? All linked pins and areas will be removed.`,
      )
    ) {
      return;
    }

    try {
      await deleteStructure({ modalityId, structureId, zoneId }).unwrap();
      if (selectedStructureId === structureId) {
        setSelectedStructureId(null);
        setSelectedAnnotationId(null);
      }
      toast.success("Topic deleted.");
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to delete the topic."),
      );
    }
  }

  function jumpToStructure(structureId: string) {
    const structure = structuresById.get(structureId);
    const nextAnnotation = annotations.find(
      (annotation) => annotation.structureId === structureId,
    );

    setSelectedStructureId(structureId);
    setSelectedGroupId(structure?.groupId ?? null);
    setTargetedLabeling(true);

    if (!nextAnnotation) {
      return;
    }

    const nextAsset = assetById.get(nextAnnotation.assetId);

    if (!nextAsset) {
      return;
    }

    startTransition(() => {
      setSelectedAnnotationId(nextAnnotation.id);
      setActiveWeighting(nextAsset.weightingCode ?? "all");
    });
    lastNavigationDirectionRef.current = 0;
    void requestAssetNavigation(nextAsset, "search");
  }

  function handleWeightingChange(nextWeighting: string) {
    lastNavigationSourceRef.current = "weighting";
    lastNavigationDirectionRef.current = 0;
    setActiveWeighting(nextWeighting);
  }

  function handleMainInteractionToolChange(nextTool: MainInteractionTool) {
    if (canvasMode !== "browse") {
      setCanvasMode("browse");
    }

    setMainInteractionTool(nextTool);
  }

  function handleCanvasClick(point: ViewerAnnotationPoint) {
    if (readOnly) {
      return;
    }

    if (!currentAsset) {
      return;
    }

    const activeStructureId = selectedStructure?.id ?? selectedStructureId;

    if (canvasMode === "create-label") {
      const nextLabelX = createDefaultLabelX(point.x);
      const nextLabelY = clamp(point.y - 0.08, 0.08, 0.92);

      updateAnnotationForm("anchorX", point.x);
      updateAnnotationForm("anchorY", point.y);
      updateAnnotationForm("labelX", nextLabelX);
      updateAnnotationForm("labelY", nextLabelY);
      updateAnnotationForm("polygonPoints", []);

      if (!activeStructureId) {
        setCanvasMode("browse");
        return;
      }

      const nextInput: CreateViewerAnnotationInput = {
        anchorX: point.x,
        anchorY: point.y,
        assetId: currentAsset.id,
        colorHex: annotationForm.colorHex.trim() || null,
        isPracticeHidden: false,
        isTargetedDefault: false,
        isVisibleDefault: true,
        labelX: nextLabelX,
        labelY: nextLabelY,
        leaderColorHex: annotationForm.leaderColorHex.trim() || null,
        note: null,
        overlayColorHex: annotationForm.overlayColorHex.trim() || null,
        overlayOpacity: annotationForm.overlayOpacity,
        polygonPoints: [],
        structureId: activeStructureId,
        titleOverride: null,
      };

      void createAnnotation({ input: nextInput, modalityId, zoneId })
        .unwrap()
        .then((annotation) => {
          setSelectedAnnotationId(annotation.id);
          setSelectedStructureId(annotation.structureId);
          setCanvasMode("browse");
          toast.success("Annotation created.");
        })
        .catch((mutationError) => {
          toast.error(
            readMutationError(
              mutationError,
              "Unable to create the annotation.",
            ),
          );
        });
      return;
    }

    if (canvasMode === "draw-region") {
      setAnnotationForm((current) => ({
        ...current,
        polygonPoints: [...current.polygonPoints, point],
      }));
      return;
    }

    if (!activeStructureId) {
      return;
    }

    if (canvasMode === "set-anchor") {
      updateAnnotationForm("anchorX", point.x);
      updateAnnotationForm("anchorY", point.y);
      setCanvasMode("browse");
      return;
    }

    if (canvasMode === "set-label") {
      updateAnnotationForm("labelX", point.x);
      updateAnnotationForm("labelY", point.y);
      setCanvasMode("browse");
    }
  }

  function handleDraftLabelMove(point: ViewerAnnotationPoint) {
    if (readOnly) {
      return;
    }

    if (!selectedAnnotationId || canvasMode === "create-label") {
      return;
    }

    updateAnnotationForm("labelX", point.x);
    updateAnnotationForm("labelY", point.y);
  }

  function handleDraftAnchorMove(point: ViewerAnnotationPoint) {
    if (readOnly) {
      return;
    }

    if (canvasMode === "create-label") {
      return;
    }

    updateAnnotationForm("anchorX", point.x);
    updateAnnotationForm("anchorY", point.y);
  }

  function handleDraftPolygonPointMove(
    index: number,
    point: ViewerAnnotationPoint,
  ) {
    if (readOnly) {
      return;
    }

    if (index < 0) {
      return;
    }

    setAnnotationForm((current) => {
      if (index >= current.polygonPoints.length) {
        return current;
      }

      const nextPolygonPoints = [...current.polygonPoints];
      nextPolygonPoints[index] = point;

      return {
        ...current,
        polygonPoints: nextPolygonPoints,
      };
    });
  }

  function handleDraftPolygonReplace(points: ViewerAnnotationPoint[]) {
    if (readOnly) {
      return;
    }

    setAnnotationForm((current) => {
      if (points.length < 3 || selectedAnnotationId) {
        return {
          ...current,
          polygonPoints: points,
        };
      }

      const { sumX, sumY } = points.reduce(
        (accumulator, point) => ({
          sumX: accumulator.sumX + point.x,
          sumY: accumulator.sumY + point.y,
        }),
        { sumX: 0, sumY: 0 },
      );
      const nextAnchorX = clamp(sumX / points.length, 0.03, 0.97);
      const nextAnchorY = clamp(sumY / points.length, 0.03, 0.97);

      return {
        ...current,
        anchorX: nextAnchorX,
        anchorY: nextAnchorY,
        labelX: createDefaultLabelX(nextAnchorX),
        labelY: clamp(nextAnchorY, 0.08, 0.92),
        polygonPoints: points,
      };
    });
  }

  function handleDraftDisconnectedPolygonsChange(
    polygons: ViewerAnnotationPoint[][],
  ) {
    if (readOnly) {
      return;
    }

    setDraftDisconnectedPolygons(polygons);
  }

  function handleCanvasDoubleClick() {
    if (readOnly) {
      return;
    }

    if (canvasMode !== "draw-region") {
      return;
    }

    const activeStructureId = selectedStructure?.id ?? selectedStructureId;

    if (!activeStructureId) {
      setCanvasMode("browse");
      return;
    }

    void handleSaveAnnotation();
  }

  function handleWheelNavigation(deltaY: number) {
    if (activeAssets.length <= 1) {
      return;
    }

    wheelDeltaRef.current += reverseScroll ? -deltaY : deltaY;

    if (Math.abs(wheelDeltaRef.current) < WHEEL_DELTA_THRESHOLD) {
      return;
    }

    if (wheelCooldownRef.current !== null) {
      return;
    }

    const direction = Math.sign(wheelDeltaRef.current);
    const stepCount = 1;
    wheelDeltaRef.current = 0;

    if (direction === 0) {
      return;
    }

    const nextIndex = clamp(
      navigationAssetIndex + direction * stepCount,
      0,
      activeAssets.length - 1,
    );
    navigateToAsset(nextIndex, "wheel");
    wheelCooldownRef.current = window.setTimeout(() => {
      wheelCooldownRef.current = null;
    }, WHEEL_NAVIGATION_COOLDOWN_MS);
  }

  function handleLayerScrubNavigate(nextIndex: number) {
    if (nextIndex === navigationAssetIndex) {
      return;
    }

    navigateToAsset(nextIndex, "scrub");
  }

  function handleFilmstripHorizontalWheel(event: WheelEvent<HTMLDivElement>) {
    const scroller = event.currentTarget;
    const horizontalDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

    if (horizontalDelta === 0) {
      return;
    }

    scroller.scrollLeft += horizontalDelta;
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePreviousAsset() {
    navigateToAsset(
      clamp(navigationAssetIndex - 1, 0, activeAssets.length - 1),
      "button",
    );
  }

  function handleNextAsset() {
    navigateToAsset(
      clamp(navigationAssetIndex + 1, 0, activeAssets.length - 1),
      "button",
    );
  }

  function handleRotateCanvasLeft() {
    setCanvasRotationQuarterTurns((current) => (current + 3) % 4);
  }

  function handleRotateCanvasRight() {
    setCanvasRotationQuarterTurns((current) => (current + 1) % 4);
  }

  function handleFlipCanvasHorizontal() {
    setCanvasFlipHorizontal((current) => !current);
  }

  function handleFlipCanvasVertical() {
    setCanvasFlipVertical((current) => !current);
  }

  function handleReset() {
    setCanvasRotationQuarterTurns(0);
    setCanvasFlipHorizontal(false);
    setCanvasFlipVertical(false);
    navigateToAsset(0, "button");
  }

  function handleResetGroupDraft() {
    setSelectedGroupId(null);
    setGroupForm(EMPTY_GROUP_FORM);
  }

  function handleResetStructureDraft() {
    setSelectedStructureId(null);
    setSelectedAnnotationId(null);
    setStructureForm({
      ...EMPTY_STRUCTURE_FORM,
      groupId: selectedGroupId ?? groups[0]?.id ?? "",
    });
  }

  function handleSelectGroupFromPanel(groupId: string) {
    setSelectedGroupId(groupId);
    updateStructureForm("groupId", groupId);
  }

  function handleSelectStructureFromPanel(
    structureId: string,
    groupId: string | null,
  ) {
    setSelectedStructureId(structureId);
    setSelectedGroupId(groupId);
    setSelectedAnnotationId(null);
  }

  function commitSliceTimeline(nextOrder: string[]) {
    if (readOnly) {
      return;
    }

    if (nextOrder.length === 0) {
      toast.error("At least one slice must remain.");
      return;
    }

    if (areAssetIdOrdersEqual(normalizedSliceTimelineIds, nextOrder)) {
      return;
    }

    setSliceTimelineUndoStack((history) => [
      ...history,
      normalizedSliceTimelineIds,
    ]);
    setSliceTimelineRedoStack([]);
    setSliceTimelineIds(nextOrder);
  }

  function handleDeleteLeftSlicesFromSelection() {
    if (readOnly) {
      return;
    }

    if (!canDeleteLeftSlices) {
      return;
    }

    const leftSliceIds = new Set(
      activeAssets.slice(0, navigationAssetIndex).map((asset) => asset.id),
    );

    if (leftSliceIds.size === 0) {
      return;
    }

    commitSliceTimeline(
      normalizedSliceTimelineIds.filter(
        (assetId) => !leftSliceIds.has(assetId),
      ),
    );
  }

  function handleDeleteRightSlicesFromSelection() {
    if (readOnly) {
      return;
    }

    if (!canDeleteRightSlices) {
      return;
    }

    const rightSliceIds = new Set(
      activeAssets.slice(navigationAssetIndex + 1).map((asset) => asset.id),
    );

    if (rightSliceIds.size === 0) {
      return;
    }

    commitSliceTimeline(
      normalizedSliceTimelineIds.filter(
        (assetId) => !rightSliceIds.has(assetId),
      ),
    );
  }

  function handleDeleteSelectedSlice() {
    if (readOnly) {
      return;
    }

    if (!activeViewerAssetId || !canDeleteSelectedSlice) {
      return;
    }

    commitSliceTimeline(
      normalizedSliceTimelineIds.filter(
        (assetId) => assetId !== activeViewerAssetId,
      ),
    );
  }

  function handleFlipSliceTimeline() {
    if (readOnly) {
      return;
    }

    if (!canFlipSliceTimeline) {
      return;
    }

    commitSliceTimeline([...normalizedSliceTimelineIds].reverse());
  }

  function handleUndoSliceTimeline() {
    if (readOnly) {
      return;
    }

    const previousOrder =
      sliceTimelineUndoStack[sliceTimelineUndoStack.length - 1];

    if (!previousOrder) {
      return;
    }

    const filteredPrevious = previousOrder.filter((assetId) =>
      baseSliceAssetIdSet.has(assetId),
    );

    if (filteredPrevious.length === 0) {
      return;
    }

    setSliceTimelineUndoStack((history) => history.slice(0, -1));
    setSliceTimelineRedoStack((history) => [
      ...history,
      normalizedSliceTimelineIds,
    ]);
    setSliceTimelineIds(filteredPrevious);
  }

  function handleRedoSliceTimeline() {
    if (readOnly) {
      return;
    }

    const nextOrder = sliceTimelineRedoStack[sliceTimelineRedoStack.length - 1];

    if (!nextOrder) {
      return;
    }

    const filteredNext = nextOrder.filter((assetId) =>
      baseSliceAssetIdSet.has(assetId),
    );

    if (filteredNext.length === 0) {
      return;
    }

    setSliceTimelineRedoStack((history) => history.slice(0, -1));
    setSliceTimelineUndoStack((history) => [
      ...history,
      normalizedSliceTimelineIds,
    ]);
    setSliceTimelineIds(filteredNext);
  }

  async function handleApplySliceTimelineChanges() {
    if (readOnly) {
      return;
    }

    if (isApplyingSliceChanges || !hasPendingSliceTimelineChanges) {
      return;
    }

    setIsApplyingSliceChanges(true);

    let deletedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    if (pendingDeletedSliceIds.length > 0) {
      try {
        const deleteSummary = await deleteModalityAssetsBulk({
          modalityId,
          zoneId,
          input: {
            assetIds: pendingDeletedSliceIds,
          },
        }).unwrap();

        deletedCount += deleteSummary.deletedCount;
        failedCount += Math.max(
          0,
          deleteSummary.requestedCount - deleteSummary.deletedCount,
        );
      } catch {
        failedCount += pendingDeletedSliceIds.length;
      }
    }

    for (const { asset, nextSortOrder } of pendingSliceSortUpdates) {
      try {
        await updateModalityAsset({
          assetId: asset.id,
          input: {
            assetKind: asset.assetKind,
            imageUrl: asset.imageUrl,
            label: asset.label,
            notes: asset.notes,
            sortOrder: nextSortOrder,
            thumbnailUrl: asset.thumbnailUrl,
            weightingCode: asset.weightingCode,
          },
          modalityId,
          zoneId,
        }).unwrap();
        updatedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    try {
      await rebuildZoneModalityAtlases({ modalityId, zoneId }).unwrap();
      await refetchViewerManifest();
    } catch {
      // No-op: refetch failures are surfaced by next query cycle.
    }

    setSliceTimelineIds([]);
    setSliceTimelineUndoStack([]);
    setSliceTimelineRedoStack([]);
    setIsApplyingSliceChanges(false);

    if (failedCount === 0) {
      toast.success(
        `Applied slice changes (${deletedCount} deleted, ${updatedCount} reordered).`,
      );
      return;
    }

    toast.warning(
      `Slice changes partially applied (${deletedCount} deleted, ${updatedCount} reordered, ${failedCount} failed).`,
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[70vh] h-full items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!data || error) {
    return <EmptyParticle />;
  }

  return (
    <div className={shellGridClass}>
      {showStudyPanel ? (
        <StudyPanel
          activeAssetId={activeViewerAssetId}
          darkMode={darkMode}
          readOnly={readOnly}
          referenceAssets={referenceAssets}
          relatedAssets={relatedAssets}
          searchHits={searchHits}
          searchQuery={searchQuery}
          selectedAnnotation={selectedAnnotation}
          selectedStructure={selectedStructure}
          triViewAssets={triViewAssets}
          onJumpToAsset={(assetId) => navigateToAssetId(assetId, "click")}
          onJumpToStructure={jumpToStructure}
          onSearchQueryChange={setSearchQuery}
        />
      ) : null}

      <main className="relative grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
        <ViewerCanvas
          annotationEditingEnabled={!readOnly}
          areaBrushSize={areaBrushSize}
          areaEditTool={areaEditTool}
          areaEraserSize={areaEraserSize}
          annotationForm={annotationForm}
          canvasFlipHorizontal={canvasFlipHorizontal}
          canvasFlipVertical={canvasFlipVertical}
          canvasMode={canvasMode}
          canvasRotationQuarterTurns={canvasRotationQuarterTurns}
          currentAsset={currentAsset}
          currentAtlasFrame={currentAtlasFrame}
          currentImageElement={currentImageElement}
          darkMode={darkMode}
          fontScaleMode={fontScaleMode}
          hoveredAnnotationId={hoveredAnnotationId}
          ingestFailureMessage={ingestFailureMessage}
          isIngesting={shouldPollViewerData && !hasSliceAssets}
          isPreparingInitialAsset={isPreparingInitialAsset}
          showLoadingIndicator={showLoadingIndicator}
          overlayOpacity={overlayOpacity}
          overlayRef={overlayRef}
          pinsOnly={pinsOnly}
          pointAnimation={pointAnimation}
          practiceMode={practiceMode}
          selectedAnnotationId={selectedAnnotationId}
          draftStructureTitle={selectedStructure?.title ?? structureForm.title}
          showCrossReferences={effectiveShowCrossReferences}
          showOrientation={showOrientation}
          showLabels={showLabels}
          viewerTitle={viewerTitle}
          stageRef={stageRef}
          mainInteractionTool={mainInteractionTool}
          currentAssetIndex={navigationAssetIndex}
          totalSliceCount={activeAssets.length}
          groupsById={groupsById}
          structuresById={structuresById}
          visibleAnnotations={visibleAnnotations}
          draftDisconnectedPolygons={draftDisconnectedPolygons}
          onAnnotationHover={setHoveredAnnotationId}
          onAnnotationSelect={(annotationId, structureId) => {
            setSelectedAnnotationId(annotationId);
            setSelectedStructureId(structureId);
            setShowStudyPanel(true);
            const structure = structuresById.get(structureId);
            setSelectedGroupId(structure?.groupId ?? null);
          }}
          onCanvasClick={handleCanvasClick}
          onCanvasDoubleClick={handleCanvasDoubleClick}
          onDraftAnchorMove={handleDraftAnchorMove}
          onDraftDisconnectedPolygonsChange={
            handleDraftDisconnectedPolygonsChange
          }
          onDraftLabelMove={handleDraftLabelMove}
          onDraftPolygonPointMove={handleDraftPolygonPointMove}
          onDraftPolygonReplace={handleDraftPolygonReplace}
          onLayerScrubNavigate={handleLayerScrubNavigate}
          onWheelNavigate={handleWheelNavigation}
        />

        <ViewerToolbar
          activeAreaToolSize={activeAreaToolSize}
          areaEditTool={areaEditTool}
          canvasMode={canvasMode}
          mainInteractionTool={mainInteractionTool}
          showControlPanel={showControlPanel}
          crossReferenceToggleDisabled={readOnly}
          showCrossReferences={effectiveShowCrossReferences}
          showStudyPanel={showStudyPanel}
          onAreaBrushSizeChange={setAreaBrushSize}
          onAreaEditToolChange={setAreaEditTool}
          onAreaEraserSizeChange={setAreaEraserSize}
          onMainInteractionToolChange={handleMainInteractionToolChange}
          onShowControlPanelChange={setShowControlPanel}
          onShowCrossReferencesChange={setShowCrossReferences}
          onShowStudyPanelChange={setShowStudyPanel}
        />

        {lockedPreviewStructure ? (
          <div className="absolute right-4 top-20 z-30 w-72 rounded-xl border border-lime-300/55 bg-[#20242b]/95 p-3 shadow-xl backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="truncate text-sm font-semibold text-lime-100">
                {lockedPreviewStructure.title}
              </div>
              <span className="rounded bg-lime-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-lime-200">
                Locked
              </span>
            </div>
            <p className="text-xs text-lime-200/80">
              {readOnly
                ? "A subscription is required to unlock this lesson card."
                : "Learners need a subscription to open this lesson card in full mode."}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                type="button"
                onClick={() =>
                  toast.info(
                    readOnly
                      ? "Subscription access is required for this lesson."
                      : "Subscription preview card shown in admin mode.",
                  )
                }
              >
                Subscribe
              </Button>
              <button
                type="button"
                className="text-xs text-indigo-200 underline underline-offset-2"
                onClick={() =>
                  toast.info(
                    readOnly
                      ? "Sign-in and subscription access are handled in the learner app."
                      : "Learner sign-in flow is handled in the learner app.",
                  )
                }
              >
                Already subscribed? Sign in
              </button>
            </div>
          </div>
        ) : null}

        {showBlockView ? (
          <ViewerBlockView
            activeAssetId={activeViewerAssetId}
            assets={activeAssets}
            onClose={() => setShowBlockView(false)}
            onSelectAsset={(assetIndex) => {
              navigateToAsset(assetIndex, "click");
              setShowBlockView(false);
            }}
          />
        ) : null}
      </main>

      <SliceFilmstrip
        activeAssetId={activeFilmstripAssetId}
        allowEditing={!readOnly}
        canDeleteLeftSlices={canDeleteLeftSlices}
        canDeleteRightSlices={canDeleteRightSlices}
        canDeleteSelectedSlice={canDeleteSelectedSlice}
        canFlipSliceTimeline={canFlipSliceTimeline}
        canRedoSliceTimeline={canRedoSliceTimeline}
        canUndoSliceTimeline={canUndoSliceTimeline}
        sliceItems={viewerSliceItems}
        filmstripScrollerRef={filmstripScrollerRef}
        hasPendingSliceTimelineChanges={hasPendingSliceTimelineChanges}
        isApplyingSliceChanges={isApplyingSliceChanges}
        isAssetLoading={isAssetLoading}
        navigationAssetIndex={navigationAssetIndex}
        pendingDeletedSliceIds={pendingDeletedSliceIds}
        pendingSliceSortUpdates={pendingSliceSortUpdates}
        showSliceEditorPanel={showSliceEditorPanel}
        sliceEditorScrollerRef={sliceEditorScrollerRef}
        totalSliceCount={activeAssets.length}
        onApplyChanges={handleApplySliceTimelineChanges}
        onDeleteLeft={handleDeleteLeftSlicesFromSelection}
        onDeleteRight={handleDeleteRightSlicesFromSelection}
        onDeleteSelected={handleDeleteSelectedSlice}
        onFlipOrder={handleFlipSliceTimeline}
        onNext={handleNextAsset}
        onPrevious={handlePreviousAsset}
        onRedo={handleRedoSliceTimeline}
        onSelectAsset={(assetIndex) => navigateToAsset(assetIndex, "click")}
        onToggleBlockView={() => setShowBlockView((current) => !current)}
        onToggleSliceEditorPanel={() =>
          setShowSliceEditorPanel((current) => !current)
        }
        onUndo={handleUndoSliceTimeline}
        onWheel={handleFilmstripHorizontalWheel}
      />

      {showControlPanel ? (
        <ModalityViewerRightPanel
          activeWeighting={activeWeighting}
          annotationForm={annotationForm}
          busy={busy}
          canvasFlipHorizontal={canvasFlipHorizontal}
          canvasFlipVertical={canvasFlipVertical}
          currentAsset={currentAsset}
          groupForm={groupForm}
          groups={groups}
          groupsById={groupsById}
          readOnly={readOnly}
          selectedAnnotationId={selectedAnnotationId}
          selectedStructureId={selectedStructureId}
          showLabels={showLabels}
          structureForm={structureForm}
          structures={structures}
          visibleGroupIds={visibleGroupIds}
          weightings={weightings}
          handleReset={handleReset}
          onAnnotationFormChange={updateAnnotationForm}
          onCanvasModeChange={setCanvasMode}
          onClearPolygonDraft={clearPolygonDraft}
          onDeleteGroup={handleDeleteGroup}
          onDeleteStructure={handleDeleteStructure}
          onFlipCanvasHorizontal={handleFlipCanvasHorizontal}
          onFlipCanvasVertical={handleFlipCanvasVertical}
          onGroupFormChange={updateGroupForm}
          onGroupVisibilityChange={updateGroupVisibility}
          onResetGroup={handleResetGroupDraft}
          onResetStructure={handleResetStructureDraft}
          onRotateCanvasLeft={handleRotateCanvasLeft}
          onRotateCanvasRight={handleRotateCanvasRight}
          onSaveAnnotation={handleSaveAnnotation}
          onSaveGroup={handleSaveGroup}
          onSaveStructure={handleSaveStructure}
          onSelectGroup={handleSelectGroupFromPanel}
          onSelectStructure={handleSelectStructureFromPanel}
          onShowLabelsChange={setShowLabels}
          onStructureFormChange={updateStructureForm}
          onVisibleGroupIdsChange={setVisibleGroupIds}
          onWeightingChange={handleWeightingChange}
        />
      ) : null}
    </div>
  );
}
