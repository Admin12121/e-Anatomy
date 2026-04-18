"use client";

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
  ZoneModalityAsset,
} from "@/lib/playground/types";
import {
  useCreateViewerAnnotationMutation,
  useCreateViewerStructureGroupMutation,
  useCreateViewerStructureMutation,
  useDeleteViewerStructureGroupMutation,
  useDeleteViewerStructureMutation,
  useDeleteZoneModalityAssetMutation,
  useGetZoneModalityViewerManifestQuery,
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
  splitCommaList,
  splitMultilineList,
  structureMatchesSearch,
} from "./modality-viewer/utils";

type NavigationSource = "button" | "click" | "search" | "weighting" | "wheel";
type PreloadPriority = "high" | "low";

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
const IMMEDIATE_PRELOAD_BURST = 10;
const STACK_PRELOAD_CONCURRENCY = 12;
const FILMSTRIP_SCROLL_DURATION_SECONDS = 0.26;
const LOADING_INDICATOR_DELAY_MS = 260;
const WHEEL_LOADING_INDICATOR_DELAY_MS = 700;
const WHEEL_DELTA_THRESHOLD = 120;
const WHEEL_NAVIGATION_COOLDOWN_MS = 110;

function areAssetIdOrdersEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function DraftModalityViewer({
  modalityId,
  zoneId,
}: {
  modalityId: string;
  zoneId: string;
}) {
  const [viewerPollingIntervalMs, setViewerPollingIntervalMs] = useState(2500);

  const {
    data,
    error,
    isLoading,
    refetch: refetchViewerManifest,
  } = useGetZoneModalityViewerManifestQuery(
    {
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
  const [deleteModalityAsset] = useDeleteZoneModalityAssetMutation();

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
  const pendingImagePreloadCacheRef = useRef<Set<string>>(new Set());
  const imagePreloadPromiseCacheRef = useRef<Map<string, Promise<void>>>(
    new Map(),
  );
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
  const weightings = useMemo(() => {
    const values = Array.from(
      new Set(
        assets.flatMap((asset) =>
          asset.weightingCode ? [asset.weightingCode] : [],
        ),
      ),
    );

    return ["all", ...values];
  }, [assets]);
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
  const normalizedSliceTimelineIds =
    sliceTimelineIds.length > 0 ? sliceTimelineIds : baseSliceAssetIds;
  const orderedSliceAssets = useMemo(
    () =>
      normalizedSliceTimelineIds
        .map((assetId) => sliceAssetById.get(assetId))
        .filter((asset): asset is ZoneModalityAsset => Boolean(asset)),
    [normalizedSliceTimelineIds, sliceAssetById],
  );
  const activeAssets = useMemo(() => {
    if (activeWeighting === "all") {
      return orderedSliceAssets;
    }

    const weighted = orderedSliceAssets.filter(
      (asset) => (asset.weightingCode ?? "all") === activeWeighting,
    );

    return weighted.length > 0 ? weighted : orderedSliceAssets;
  }, [activeWeighting, orderedSliceAssets]);

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
      activeAssets.find((asset) => asset.id === currentAssetId) ??
      assets.find((asset) => asset.id === currentAssetId) ??
      null
    );
  }, [activeAssets, assets, currentAssetId]);
  const pendingAsset = pendingAssetId
    ? (assets.find((asset) => asset.id === pendingAssetId) ?? null)
    : null;
  const navigationAssetIndex = useMemo(() => {
    const asset = pendingAsset ?? currentAsset;

    return asset
      ? activeAssets.findIndex((activeAsset) => activeAsset.id === asset.id)
      : -1;
  }, [activeAssets, currentAsset, pendingAsset]);
  const activeViewerAssetId = pendingAsset?.id ?? currentAsset?.id ?? null;
  const filmstripAssets = useMemo(
    () =>
      activeAssets.map((asset, assetIndex) => ({
        asset,
        assetIndex,
      })),
    [activeAssets],
  );
  const filmstripAssetOrderSignature = useMemo(
    () => filmstripAssets.map(({ asset }) => asset.id).join("|"),
    [filmstripAssets],
  );
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
      if (imageElement) {
        imageElementCacheRef.current.set(asset.id, imageElement);
      }

      const wasReady = readyAssetIdCacheRef.current.has(asset.id);
      readyAssetIdCacheRef.current.add(asset.id);
      pendingImagePreloadCacheRef.current.delete(asset.id);
      imagePreloadPromiseCacheRef.current.delete(asset.id);

      if (wasReady) {
        return;
      }

      setReadyAssetIds((current) => {
        if (current.has(asset.id)) {
          return current;
        }

        const next = new Set(current);
        next.add(asset.id);
        return next;
      });
    },
    [],
  );

  const preloadAsset = useCallback(
    (asset: ZoneModalityAsset, priority: PreloadPriority = "low") => {
      if (
        readyAssetIdCacheRef.current.has(asset.id) &&
        imageElementCacheRef.current.has(asset.id)
      ) {
        return Promise.resolve();
      }

      const existingPromise = imagePreloadPromiseCacheRef.current.get(asset.id);

      if (existingPromise) {
        return existingPromise;
      }

      const promise = new Promise<void>((resolve) => {
        if (typeof window === "undefined") {
          resolve();
          return;
        }

        const image = new window.Image();
        image.decoding = "async";
        image.fetchPriority = priority;
        pendingImagePreloadCacheRef.current.add(asset.id);

        const finalizeReady = () => {
          markAssetReady(asset, image);
          resolve();
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
          pendingImagePreloadCacheRef.current.delete(asset.id);
          imagePreloadPromiseCacheRef.current.delete(asset.id);
          resolve();
        };

        image.src = asset.imageUrl;
      });

      imagePreloadPromiseCacheRef.current.set(asset.id, promise);
      return promise;
    },
    [markAssetReady],
  );

  const requestAssetNavigation = useCallback(
    (asset: ZoneModalityAsset, source: NavigationSource) => {
      if (pendingAssetId === asset.id) {
        return;
      }

      if (currentAsset?.id === asset.id) {
        navigationRequestIdRef.current += 1;
        setPendingAssetId(null);
        return;
      }

      lastNavigationSourceRef.current = source;

      if (readyAssetIdCacheRef.current.has(asset.id)) {
        const cachedImage = imageElementCacheRef.current.get(asset.id) ?? null;
        navigationRequestIdRef.current += 1;
        setPendingAssetId(null);
        setCurrentAssetId(asset.id);
        setCurrentImageElement(cachedImage);
        return;
      }

      const requestId = navigationRequestIdRef.current + 1;
      navigationRequestIdRef.current = requestId;
      setPendingAssetId(asset.id);

      const targetIndex = activeAssets.findIndex(
        (activeAsset) => activeAsset.id === asset.id,
      );

      if (targetIndex >= 0) {
        const burstAssets = buildImmediatePreloadOrder(
          activeAssets,
          targetIndex,
          lastNavigationDirectionRef.current,
          IMMEDIATE_PRELOAD_BURST,
        );

        void Promise.all(
          burstAssets.map((burstAsset) => preloadAsset(burstAsset, "high")),
        );
      }

      void preloadAsset(asset, "high").then(() => {
        if (navigationRequestIdRef.current !== requestId) {
          return;
        }

        if (!readyAssetIdCacheRef.current.has(asset.id)) {
          setPendingAssetId(null);
          return;
        }

        const cachedImage = imageElementCacheRef.current.get(asset.id) ?? null;
        setCurrentAssetId(asset.id);
        setCurrentImageElement(cachedImage);
        setPendingAssetId(null);
      });
    },
    [activeAssets, currentAsset?.id, pendingAssetId, preloadAsset],
  );

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
          relatedAnnotation &&
          assets.find((asset) => asset.id === relatedAnnotation.assetId);

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
  }, [annotations, assets, deferredSearchQuery, structures]);

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
      ? (assets.find((asset) => asset.id === currentAssetId) ?? null)
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
  }, [
    activeAssets,
    assets,
    currentAssetId,
    pendingAssetId,
    requestAssetNavigation,
  ]);

  useEffect(() => {
    if (!selectedGroup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroupForm(EMPTY_GROUP_FORM);
      return;
    }

    setGroupForm({
      colorHex: selectedGroup.colorHex,
      description: selectedGroup.description ?? "",
      iconName: selectedGroup.iconName ?? "",
      isDefaultVisible: selectedGroup.isDefaultVisible,
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
      accessLevel: selectedStructure.accessLevel,
      groupId: selectedStructure.groupId ?? "",
      latinName: selectedStructure.latinName ?? "",
      learningPoints: selectedStructure.learningPoints.join("\n"),
      longDescription: selectedStructure.longDescription ?? "",
      shortDescription: selectedStructure.shortDescription ?? "",
      synonyms: selectedStructure.synonyms.join(", "),
      title: selectedStructure.title,
    });
  }, [selectedStructure]);

  useEffect(() => {
    if (!selectedAnnotation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnnotationForm(EMPTY_ANNOTATION_FORM);
      setDraftDisconnectedPolygons([]);
      return;
    }

    const structure = structuresById.get(selectedAnnotation.structureId);
    const group = structure?.groupId
      ? groupsById.get(structure.groupId)
      : null;
    const resolvedColor =
      selectedAnnotation.colorHex ?? group?.colorHex ?? DEFAULT_ANNOTATION_COLOR;

    setAnnotationForm({
      anchorX: selectedAnnotation.anchorX,
      anchorY: selectedAnnotation.anchorY,
      colorHex: resolvedColor,
      isPracticeHidden: selectedAnnotation.isPracticeHidden,
      isTargetedDefault: selectedAnnotation.isTargetedDefault,
      isVisibleDefault: selectedAnnotation.isVisibleDefault,
      labelX: selectedAnnotation.labelX,
      labelY: selectedAnnotation.labelY,
      leaderColorHex: selectedAnnotation.leaderColorHex ?? resolvedColor,
      note: selectedAnnotation.note ?? "",
      overlayColorHex: selectedAnnotation.overlayColorHex ?? resolvedColor,
      overlayOpacity: selectedAnnotation.overlayOpacity,
      polygonPoints: selectedAnnotation.polygonPoints,
      titleOverride: selectedAnnotation.titleOverride ?? "",
    });
    setDraftDisconnectedPolygons([]);
  }, [groupsById, selectedAnnotation, structuresById]);

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
    if (typeof window === "undefined" || navigationAssetIndex < 0) {
      return;
    }

    const immediateAssets = buildImmediatePreloadOrder(
      activeAssets,
      navigationAssetIndex,
      lastNavigationDirectionRef.current,
      Math.max(IMAGE_PRELOAD_RADIUS, IMMEDIATE_PRELOAD_BURST),
    );

    const timeoutId = window.setTimeout(() => {
      void Promise.all(
        immediateAssets.map((asset) => preloadAsset(asset, "high")),
      );
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeAssets, navigationAssetIndex, preloadAsset]);

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
    );
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
  }, [activeAssets, navigationAssetIndex, pendingAsset, preloadAsset]);

  useEffect(() => {
    return () => {
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
        const asset = assets.find(
          (candidate) => candidate.id === annotation.assetId,
        );

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
  }, [annotations, assets, selectedStructure]);

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
    "grid flex-1 gap-2",
    showSliceEditorPanel
      ? "max-h-[calc(100vh-351px)]"
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
    ? !readyAssetIds.has(pendingAsset.id) &&
      loadingIndicatorAssetId === pendingAsset.id
    : false;
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

    if (readyAssetIds.has(pendingAsset.id)) {
      return;
    }

    const assetId = pendingAsset.id;
    const delayMs =
      lastNavigationSourceRef.current === "wheel"
        ? WHEEL_LOADING_INDICATOR_DELAY_MS
        : LOADING_INDICATOR_DELAY_MS;
    const timeoutId = window.setTimeout(() => {
      setLoadingIndicatorAssetId(assetId);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pendingAsset, readyAssetIds]);

  const centerActiveFilmstripItem = useCallback(
    (scroller: HTMLDivElement | null) => {
      if (!scroller || !activeViewerAssetId) {
        return;
      }

      const activeButton = scroller.querySelector<HTMLElement>(
        `[data-asset-id="${activeViewerAssetId}"]`,
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

      gsap.killTweensOf(scroller);
      gsap.to(scroller, {
        duration: FILMSTRIP_SCROLL_DURATION_SECONDS,
        ease: "power3.out",
        overwrite: "auto",
        scrollLeft: targetScrollLeft,
      });
    },
    [activeViewerAssetId],
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
  }, [centerActiveFilmstripItem, filmstripAssetOrderSignature, showSliceEditorPanel]);

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

    const nextAsset = assets.find((asset) => asset.id === assetId);

    if (!nextAsset) {
      return;
    }

    void requestAssetNavigation(nextAsset, source);
  }

  function updateAnnotationForm<Key extends keyof AnnotationFormState>(
    key: Key,
    value: AnnotationFormState[Key],
  ) {
    setAnnotationForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateStructureForm<Key extends keyof StructureFormState>(
    key: Key,
    value: StructureFormState[Key],
  ) {
    setStructureForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateGroupForm<Key extends keyof GroupFormState>(
    key: Key,
    value: GroupFormState[Key],
  ) {
    setGroupForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function clearPolygonDraft() {
    setDraftDisconnectedPolygons([]);
    updateAnnotationForm("polygonPoints", []);
  }

  async function handleSaveStructure(): Promise<ViewerStructure | null> {
    if (!structureForm.title.trim()) {
      toast.error("Structure title is required.");
      return null;
    }

    const input: CreateViewerStructureInput | UpdateViewerStructureInput = {
      accessLevel: structureForm.accessLevel,
      groupId: structureForm.groupId || null,
      isPinnedDefault: true,
      latinName: structureForm.latinName.trim() || null,
      learningPoints: splitMultilineList(structureForm.learningPoints),
      longDescription: structureForm.longDescription.trim() || null,
      shortDescription: structureForm.shortDescription.trim() || null,
      sortOrder: selectedStructure?.sortOrder ?? 0,
      synonyms: splitCommaList(structureForm.synonyms),
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
    const activeStructureId =
      options?.structureId ?? selectedStructure?.id ?? selectedStructureId;

    if (!activeStructureId || !currentAsset) {
      toast.error("Choose a structure and slice first.");
      return;
    }

    const input: CreateViewerAnnotationInput | UpdateViewerAnnotationInput = {
      anchorX: annotationForm.anchorX,
      anchorY: annotationForm.anchorY,
      assetId: currentAsset.id,
      colorHex: annotationForm.colorHex.trim() || null,
      isPracticeHidden: annotationForm.isPracticeHidden,
      isTargetedDefault: annotationForm.isTargetedDefault,
      isVisibleDefault: annotationForm.isVisibleDefault,
      labelX: annotationForm.labelX,
      labelY: annotationForm.labelY,
      leaderColorHex: annotationForm.leaderColorHex.trim() || null,
      note: annotationForm.note.trim() || null,
      overlayColorHex: annotationForm.overlayColorHex.trim() || null,
      overlayOpacity: annotationForm.overlayOpacity,
      polygonPoints: annotationForm.polygonPoints,
      structureId: activeStructureId,
      titleOverride: annotationForm.titleOverride.trim() || null,
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
        isPracticeHidden: annotationForm.isPracticeHidden,
        isTargetedDefault: annotationForm.isTargetedDefault,
        isVisibleDefault: annotationForm.isVisibleDefault,
        labelX: createDefaultLabelX(anchorX),
        labelY: clamp(anchorY, 0.08, 0.92),
        leaderColorHex: annotationForm.leaderColorHex.trim() || null,
        note: annotationForm.note.trim() || null,
        overlayColorHex: annotationForm.overlayColorHex.trim() || null,
        overlayOpacity: annotationForm.overlayOpacity,
        polygonPoints,
        structureId: activeStructureId,
        titleOverride: annotationForm.titleOverride.trim() || null,
      };
    };

    try {
      const annotation = selectedAnnotation
        ? await updateAnnotation({
            annotationId: selectedAnnotation.id,
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
          `${selectedAnnotation ? "Annotation updated" : "Annotation created"} with ${createdDetachedCount + 1} separate areas.`,
        );
      } else if (failedDetachedCount > 0) {
        toast.warning(
          `Main area saved, ${createdDetachedCount} extra area(s) created, ${failedDetachedCount} failed.`,
        );
      } else {
        toast.success(
          selectedAnnotation ? "Annotation updated." : "Annotation created.",
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
    if (!groupForm.title.trim()) {
      toast.error("Group title is required.");
      return;
    }

    const input:
      | CreateViewerStructureGroupInput
      | UpdateViewerStructureGroupInput = {
      colorHex: groupForm.colorHex.trim() || DEFAULT_GROUP_COLOR,
      description: groupForm.description.trim() || null,
      iconName: groupForm.iconName.trim() || null,
      isDefaultVisible: groupForm.isDefaultVisible,
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

    const nextAsset = assets.find(
      (asset) => asset.id === nextAnnotation.assetId,
    );

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
        isPracticeHidden: annotationForm.isPracticeHidden,
        isTargetedDefault: annotationForm.isTargetedDefault,
        isVisibleDefault: annotationForm.isVisibleDefault,
        labelX: nextLabelX,
        labelY: nextLabelY,
        leaderColorHex: annotationForm.leaderColorHex.trim() || null,
        note: annotationForm.note.trim() || null,
        overlayColorHex: annotationForm.overlayColorHex.trim() || null,
        overlayOpacity: annotationForm.overlayOpacity,
        polygonPoints: [],
        structureId: activeStructureId,
        titleOverride: annotationForm.titleOverride.trim() || null,
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
    if (!selectedAnnotationId || canvasMode !== "browse") {
      return;
    }

    updateAnnotationForm("labelX", point.x);
    updateAnnotationForm("labelY", point.y);
  }

  function handleDraftAnchorMove(point: ViewerAnnotationPoint) {
    if (!selectedAnnotationId || canvasMode === "create-label") {
      return;
    }

    updateAnnotationForm("anchorX", point.x);
    updateAnnotationForm("anchorY", point.y);
  }

  function handleDraftPolygonPointMove(
    index: number,
    point: ViewerAnnotationPoint,
  ) {
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
    setDraftDisconnectedPolygons(polygons);
  }

  function handleCanvasDoubleClick() {
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

    navigateToAsset(nextIndex, "wheel");
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
      normalizedSliceTimelineIds.filter((assetId) => !leftSliceIds.has(assetId)),
    );
  }

  function handleDeleteRightSlicesFromSelection() {
    if (!canDeleteRightSlices) {
      return;
    }

    const rightSliceIds = new Set(
      activeAssets
        .slice(navigationAssetIndex + 1)
        .map((asset) => asset.id),
    );

    if (rightSliceIds.size === 0) {
      return;
    }

    commitSliceTimeline(
      normalizedSliceTimelineIds.filter((assetId) => !rightSliceIds.has(assetId)),
    );
  }

  function handleDeleteSelectedSlice() {
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
    if (!canFlipSliceTimeline) {
      return;
    }

    commitSliceTimeline([...normalizedSliceTimelineIds].reverse());
  }

  function handleUndoSliceTimeline() {
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
    if (isApplyingSliceChanges || !hasPendingSliceTimelineChanges) {
      return;
    }

    setIsApplyingSliceChanges(true);

    let deletedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const assetId of pendingDeletedSliceIds) {
      try {
        await deleteModalityAsset({
          assetId,
          modalityId,
          zoneId,
        }).unwrap();
        deletedCount += 1;
      } catch {
        failedCount += 1;
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
          areaBrushSize={areaBrushSize}
          areaEditTool={areaEditTool}
          areaEraserSize={areaEraserSize}
          annotationForm={annotationForm}
          canvasFlipHorizontal={canvasFlipHorizontal}
          canvasFlipVertical={canvasFlipVertical}
          canvasMode={canvasMode}
          canvasRotationQuarterTurns={canvasRotationQuarterTurns}
          currentAsset={currentAsset}
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
          showCrossReferences={showCrossReferences}
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
          onDraftDisconnectedPolygonsChange={handleDraftDisconnectedPolygonsChange}
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
          showCrossReferences={showCrossReferences}
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
              Learners need a subscription to open this lesson card in full
              mode.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                type="button"
                onClick={() =>
                  toast.info("Subscription preview card shown in admin mode.")
                }
              >
                Subscribe
              </Button>
              <button
                type="button"
                className="text-xs text-indigo-200 underline underline-offset-2"
                onClick={() =>
                  toast.info(
                    "Learner sign-in flow is handled in the learner app.",
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
        activeAssetId={activeViewerAssetId}
        activeAssets={activeAssets}
        canDeleteLeftSlices={canDeleteLeftSlices}
        canDeleteRightSlices={canDeleteRightSlices}
        canDeleteSelectedSlice={canDeleteSelectedSlice}
        canFlipSliceTimeline={canFlipSliceTimeline}
        canRedoSliceTimeline={canRedoSliceTimeline}
        canUndoSliceTimeline={canUndoSliceTimeline}
        filmstripAssets={filmstripAssets}
        filmstripScrollerRef={filmstripScrollerRef}
        hasPendingSliceTimelineChanges={hasPendingSliceTimelineChanges}
        isApplyingSliceChanges={isApplyingSliceChanges}
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

