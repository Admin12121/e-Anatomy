"use client";

import {
  useCallback,
  startTransition,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import gsap from "gsap";
import {
  ArrowLeft,
  ArrowRight,
  CrosshairIcon,
  Layers2Icon,
  LayoutGrid,
  LoaderCircleIcon,
  PinIcon,
  SearchIcon,
  Snowflake,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Group, GroupSeparator } from "@/components/ui/group";
import { Input } from "@/components/ui/input";
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
  ViewerStructureGroup,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import {
  useCreateViewerAnnotationMutation,
  useCreateViewerStructureGroupMutation,
  useCreateViewerStructureMutation,
  useDeleteViewerAnnotationMutation,
  useDeleteViewerStructureGroupMutation,
  useDeleteViewerStructureMutation,
  useDeleteZoneModalityAssetMutation,
  useGetZoneModalityViewerManifestQuery,
  useUpdateViewerAnnotationMutation,
  useUpdateViewerStructureGroupMutation,
  useUpdateViewerStructureMutation,
} from "@/lib/store/services/playground-api";
import { cn } from "@/lib/utils";
import NextImage from "next/image";
import { Frame } from "@/components/ui/frame";
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
const BRUSH_POINT_STEP = 0.006;

export function DraftModalityViewer({
  modalityId,
  zoneId,
}: {
  modalityId: string;
  zoneId: string;
}) {
  const [viewerPollingIntervalMs, setViewerPollingIntervalMs] = useState(2500);

  const { data, error, isLoading } = useGetZoneModalityViewerManifestQuery(
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
  const [deleteAnnotation, { isLoading: isDeletingAnnotation }] =
    useDeleteViewerAnnotationMutation();
  const [deleteAsset, { isLoading: isDeletingAsset }] =
    useDeleteZoneModalityAssetMutation();

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
  const [practiceMode, setPracticeMode] = useState(false);
  const [pinsOnly, setPinsOnly] = useState(false);
  const [targetedLabeling, setTargetedLabeling] = useState(false);
  const [showOrientation, setShowOrientation] = useState(true);
  const [showCrossReferences, setShowCrossReferences] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.72);
  const [reverseScroll, setReverseScroll] = useState(false);
  const [pointAnimation, setPointAnimation] = useState(true);
  const [fontScaleMode, setFontScaleMode] = useState<FontScaleMode>("auto");
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
  const [viewerMode, setViewerMode] = useState<"learner" | "authoring">(
    "authoring",
  );
  const [showStructureAdvanced, setShowStructureAdvanced] = useState(false);
  const [showStudyPanel, setShowStudyPanel] = useState(true);
  const [showControlPanel, setShowControlPanel] = useState(true);
  const [pinControlPanel, setPinControlPanel] = useState(false);
  const [canvasRotationQuarterTurns, setCanvasRotationQuarterTurns] =
    useState(0);
  const [canvasFlipHorizontal, setCanvasFlipHorizontal] = useState(false);
  const [canvasFlipVertical, setCanvasFlipVertical] = useState(false);

  const filmstripScrollerRef = useRef<HTMLDivElement | null>(null);
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
  const activeAssets = useMemo(() => {
    const sliceAssets = assets
      .filter((asset) => isSliceAsset(asset))
      .sort((left, right) =>
        left.sortOrder === right.sortOrder
          ? left.createdAt.localeCompare(right.createdAt)
          : left.sortOrder - right.sortOrder,
      );

    if (activeWeighting === "all") {
      return sliceAssets;
    }

    const weighted = sliceAssets.filter(
      (asset) => (asset.weightingCode ?? "all") === activeWeighting,
    );

    return weighted.length > 0 ? weighted : sliceAssets;
  }, [activeWeighting, assets]);
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
  const currentAssetIndex = useMemo(
    () =>
      currentAsset
        ? activeAssets.findIndex((asset) => asset.id === currentAsset.id)
        : -1,
    [activeAssets, currentAsset],
  );
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

      readyAssetIdCacheRef.current.add(asset.id);
      pendingImagePreloadCacheRef.current.delete(asset.id);
      imagePreloadPromiseCacheRef.current.delete(asset.id);
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
        markAssetReady(asset);
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
      return;
    }

    setAnnotationForm({
      anchorX: selectedAnnotation.anchorX,
      anchorY: selectedAnnotation.anchorY,
      colorHex: selectedAnnotation.colorHex ?? DEFAULT_ANNOTATION_COLOR,
      isPracticeHidden: selectedAnnotation.isPracticeHidden,
      isTargetedDefault: selectedAnnotation.isTargetedDefault,
      isVisibleDefault: selectedAnnotation.isVisibleDefault,
      labelX: selectedAnnotation.labelX,
      labelY: selectedAnnotation.labelY,
      leaderColorHex:
        selectedAnnotation.leaderColorHex ??
        selectedAnnotation.colorHex ??
        DEFAULT_ANNOTATION_COLOR,
      note: selectedAnnotation.note ?? "",
      overlayColorHex:
        selectedAnnotation.overlayColorHex ??
        selectedAnnotation.colorHex ??
        DEFAULT_ANNOTATION_COLOR,
      overlayOpacity: selectedAnnotation.overlayOpacity,
      polygonPoints: selectedAnnotation.polygonPoints,
      titleOverride: selectedAnnotation.titleOverride ?? "",
    });
  }, [selectedAnnotation]);

  useEffect(() => {
    if (!selectedStructureId || !currentAsset || pendingAsset) {
      return;
    }

    const matchingAnnotation = annotations.find(
      (annotation) =>
        annotation.assetId === currentAsset.id &&
        annotation.structureId === selectedStructureId,
    );

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAnnotationId(matchingAnnotation?.id ?? null);
  }, [annotations, currentAsset, pendingAsset, selectedStructureId]);

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
    pinsOnly,
    selectedStructureId,
    showLabels,
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
    isDeletingAnnotation ||
    isDeletingAsset ||
    isDeletingGroup ||
    isDeletingStructure ||
    isUpdatingAnnotation ||
    isUpdatingGroup ||
    isUpdatingStructure;
  const hasSelectedStructure = Boolean(selectedStructure);
  const canEditPinArea = hasSelectedStructure;
  const canEditAnnotationDetails =
    Boolean(selectedAnnotation) ||
    annotationForm.polygonPoints.length > 0 ||
    canvasMode !== "browse";
  const isAuthoringMode = viewerMode === "authoring";
  const lockedPreviewStructure =
    selectedStructure?.accessLevel === "subscription"
      ? selectedStructure
      : null;
  const shellGridClass = cn(
    "grid max-h-[calc(100vh-101px)] flex-1 gap-2",
    showStudyPanel &&
      showControlPanel &&
      "xl:grid-cols-[16rem_minmax(0,1fr)_22rem]",
    showStudyPanel && !showControlPanel && "xl:grid-cols-[16rem_minmax(0,1fr)]",
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
    if (pinControlPanel && !showControlPanel) {
      setShowControlPanel(true);
    }
  }, [pinControlPanel, showControlPanel]);

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

  useEffect(() => {
    const scroller = filmstripScrollerRef.current;

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

    return () => {
      gsap.killTweensOf(scroller);
    };
  }, [activeViewerAssetId, filmstripAssets.length]);

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
    updateAnnotationForm("polygonPoints", []);
  }

  function removeLastPolygonPoint() {
    updateAnnotationForm(
      "polygonPoints",
      annotationForm.polygonPoints.slice(0, -1),
    );
  }

  async function handleSaveStructure() {
    if (!structureForm.title.trim()) {
      toast.error("Structure title is required.");
      return;
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
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to save the structure."),
      );
    }
  }

  async function handleSaveAnnotation() {
    if (!selectedStructure || !currentAsset) {
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
      structureId: selectedStructure.id,
      titleOverride: annotationForm.titleOverride.trim() || null,
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

      toast.success(
        selectedAnnotation ? "Annotation updated." : "Annotation created.",
      );
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

  async function handleDeleteAnnotation(annotationId: string) {
    const annotation = annotationsById.get(annotationId);

    if (!annotation) {
      return;
    }

    if (!window.confirm("Delete this pin and area from the slice?")) {
      return;
    }

    try {
      await deleteAnnotation({ annotationId, modalityId, zoneId }).unwrap();
      if (selectedAnnotationId === annotationId) {
        setSelectedAnnotationId(null);
        setCanvasMode("browse");
      }
      toast.success("Annotation deleted.");
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to delete the annotation."),
      );
    }
  }

  async function handleDeleteCurrentSlice() {
    if (!currentAsset) {
      toast.error("Select a slice first.");
      return;
    }

    const warning =
      activeAssets.length <= 1
        ? "This is the last available slice. Delete it anyway?"
        : `Delete slice "${currentAsset.label}"?`;

    if (!window.confirm(warning)) {
      return;
    }

    try {
      await deleteAsset({
        zoneId,
        modalityId,
        assetId: currentAsset.id,
      }).unwrap();
      setSelectedAnnotationId(null);
      toast.success("Slice removed.");
    } catch (mutationError) {
      toast.error(
        readMutationError(mutationError, "Unable to delete the slice."),
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

  function handleCanvasClick(point: ViewerAnnotationPoint) {
    if (!selectedStructure || !currentAsset) {
      return;
    }

    if (canvasMode === "create-label") {
      const nextInput: CreateViewerAnnotationInput = {
        anchorX: point.x,
        anchorY: point.y,
        assetId: currentAsset.id,
        colorHex: annotationForm.colorHex.trim() || null,
        isPracticeHidden: annotationForm.isPracticeHidden,
        isTargetedDefault: annotationForm.isTargetedDefault,
        isVisibleDefault: annotationForm.isVisibleDefault,
        labelX: createDefaultLabelX(point.x),
        labelY: clamp(point.y - 0.08, 0.08, 0.92),
        leaderColorHex: annotationForm.leaderColorHex.trim() || null,
        note: annotationForm.note.trim() || null,
        overlayColorHex: annotationForm.overlayColorHex.trim() || null,
        overlayOpacity: annotationForm.overlayOpacity,
        polygonPoints: annotationForm.polygonPoints,
        structureId: selectedStructure.id,
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
      return;
    }

    if (canvasMode === "draw-region") {
      updateAnnotationForm("polygonPoints", [
        ...annotationForm.polygonPoints,
        point,
      ]);
    }
  }

  function handleCanvasDoubleClick() {
    if (canvasMode !== "draw-region") {
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

  async function handleCaptureSnapshot() {
    if (!currentAsset) {
      return;
    }

    try {
      const dataUrl = await captureViewerSnapshot({
        annotations: visibleAnnotations,
        asset: currentAsset,
        groupsById,
        overlayOpacity,
        pinsOnly,
        practiceMode,
        selectedStructureId,
        showLabels,
        structuresById,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${data?.zone.slug ?? "zone"}-${data?.modality.name ?? "viewer"}-${currentAssetIndex + 1}.png`;
      link.click();
      toast.success("Snapshot captured.");
    } catch {
      toast.error("Unable to capture the current viewer frame.");
    }
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

  function handleReset(){
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

  function handleSelectAnnotationFromPanel(
    annotationId: string,
    structureId: string,
  ) {
    setSelectedAnnotationId(annotationId);
    setSelectedStructureId(structureId);
  }

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[70vh] h-full items-center justify-center rounded-3xl bg-[#05070a] text-white">
        <div className="flex items-center gap-3 text-sm text-white/80">
          <LoaderCircleIcon className="size-5 animate-spin" />
          Loading draft viewer...
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#05070a] p-8 text-white">
        <div className="text-lg font-semibold">Viewer unavailable</div>
        <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
          This study is not ready for teaching review yet. Finish preparing the
          slices first, then return here to add groups, topics, pins, and
          teaching areas.
        </p>
      </div>
    );
  }

  return (
    <div className={shellGridClass}>
      {showStudyPanel ? (
        <aside className="space-y-4 overflow-y-auto p-2">
          <div className="space-y-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
              <Input
                className="border-white/10 bg-black/30 pl-9 text-white placeholder:text-white/35"
                placeholder="Search in this module"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            {searchHits.length > 0 ? (
              <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-3">
                {searchHits.map(({ asset, structure }) => (
                  <button
                    key={structure.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-white/6"
                    onClick={() => jumpToStructure(structure.id)}
                  >
                    <span>{structure.title}</span>
                    {asset ? (
                      <span className="text-xs text-white/45">
                        {asset.label}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {referenceAssets.length > 0 ? (
            <div className="space-y-3">
              <TriViewStudyPanel
                activeAssetId={activeViewerAssetId}
                assets={triViewAssets}
                onSelectAsset={(assetId) => navigateToAssetId(assetId, "click")}
              />

              {referenceAssets.slice(3).map((asset, index) => (
                <ReferenceCard
                  key={asset.id}
                  active={asset.id === activeViewerAssetId}
                  asset={asset}
                  index={index + 3}
                  onSelect={() => navigateToAssetId(asset.id, "click")}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/55">
              Review the teaching slice set here. Use the tools on the right to
              add pins, teaching areas, and learner-friendly notes.
            </div>
          )}

          {selectedStructure ? (
            <StructureDrawer
              darkMode={darkMode}
              relatedAssets={relatedAssets}
              selectedAnnotation={selectedAnnotation}
              selectedStructure={selectedStructure}
              onJumpToAsset={(assetId) => navigateToAssetId(assetId, "click")}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/55">
              Select a topic on the image to review its summary, full teaching
              notes, and related slices.
            </div>
          )}
        </aside>
      ) : null}

      <main className="relative grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
        <ViewerCanvas
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
          showCrossReferences={showCrossReferences}
          showOrientation={showOrientation}
          showLabels={showLabels}
          viewerTitle={viewerTitle}
          stageRef={stageRef}
          structuresById={structuresById}
          visibleAnnotations={visibleAnnotations}
          onAnnotationHover={setHoveredAnnotationId}
          onAnnotationSelect={(annotationId, structureId) => {
            setSelectedAnnotationId(annotationId);
            setSelectedStructureId(structureId);
            const structure = structuresById.get(structureId);
            setSelectedGroupId(structure?.groupId ?? null);
          }}
          onCanvasClick={handleCanvasClick}
          onCanvasDoubleClick={handleCanvasDoubleClick}
          onWheelNavigate={handleWheelNavigation}
        />

        <Group
          aria-label="Viewer controls"
          className="absolute right-3 top-3 z-30 rounded-sm bg-white/6 p-0.5"
        >
          <Button
            aria-label={
              showStudyPanel ? "Hide study panel" : "Show study panel"
            }
            type="button"
            size="icon-lg"
            variant={!showStudyPanel ? "secondary" : "default"}
            onClick={() => setShowStudyPanel((current) => !current)}
          >
            {showStudyPanel ? (
              <ArrowLeft className="size-4" />
            ) : (
              <ArrowRight className="size-4" />
            )}
          </Button>
          <Button
            aria-label={
              showCrossReferences ? "Hide crosshair" : "Show crosshair"
            }
            type="button"
            size="icon-lg"
            variant={!showCrossReferences ? "secondary" : "default"}
            onClick={() => setShowCrossReferences((current) => !current)}
          >
            <CrosshairIcon className="size-4" />
          </Button>
          <Button
            aria-label={
              pinControlPanel ? "Unpin control panel" : "Pin control panel"
            }
            type="button"
            size="icon-lg"
            variant={!pinControlPanel ? "secondary" : "default"}
            onClick={() => setPinControlPanel((current) => !current)}
          >
            <PinIcon className="size-4" />
          </Button>
          <Button
            aria-label={showControlPanel ? "Hide menu" : "Show menu"}
            type="button"
            size="icon-lg"
            variant={!showControlPanel ? "secondary" : "default"}
            onClick={() =>
              setShowControlPanel((current) =>
                pinControlPanel ? true : !current,
              )
            }
          >
            {showControlPanel ? (
              <ArrowRight className="size-4" />
            ) : (
              <ArrowLeft className="size-4" />
            )}
          </Button>
          {showControlPanel ? (
              <Button
                aria-label={
                  isAuthoringMode
                    ? "Switch to learner mode"
                    : "Switch to authoring mode"
                }
                type="button"
                size="icon-lg"
                variant={!isAuthoringMode ? "secondary" : "default"}
                onClick={() =>
                  setViewerMode((current) =>
                    current === "authoring" ? "learner" : "authoring",
                  )
                }
              >
                <Snowflake className="size-4" />
              </Button>
          ) : null}
          <Button
            aria-label="Delete current slice"
            type="button"
            size="icon-lg"
            variant="secondary"
            disabled={!currentAsset || busy}
            onClick={() => void handleDeleteCurrentSlice()}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </Group>

        {!showStudyPanel ? (
          <button
            type="button"
            className="absolute left-3 top-3 z-30 rounded-md border border-white/15 bg-black/45 px-2 py-1 text-xs text-white/80 backdrop-blur transition hover:bg-white/10"
            onClick={() => setShowStudyPanel(true)}
          >
            Show study panel
          </button>
        ) : null}

        {!showControlPanel ? (
          <button
            type="button"
            className="absolute right-3 top-14 z-30 rounded-md border border-white/15 bg-black/45 px-2 py-1 text-xs text-white/80 backdrop-blur transition hover:bg-white/10"
            onClick={() => setShowControlPanel(true)}
          >
            Show menu
          </button>
        ) : null}

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
                className="text-xs text-cyan-200 underline underline-offset-2"
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
          <div className="absolute inset-0 z-40 bg-black/80 p-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold text-white">
                All series - {activeAssets.length} images
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowBlockView(false)}
              >
                Close
              </Button>
            </div>
            <div className="grid max-h-[calc(100vh-49px)] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
              {activeAssets.map((asset, assetIndex) => (
                <button
                  key={`block-${asset.id}`}
                  type="button"
                  className={cn(
                    "overflow-hidden rounded-sm border bg-black/40 transition",
                    asset.id === activeViewerAssetId
                      ? "border-cyan-300 ring-1 ring-cyan-300/70"
                      : "border-white/10 hover:border-white/30",
                  )}
                  onClick={() => {
                    navigateToAsset(assetIndex, "click");
                    setShowBlockView(false);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={asset.label}
                    className="aspect-square w-full object-cover"
                    decoding="async"
                    fetchPriority="low"
                    loading="lazy"
                    src={asset.thumbnailUrl || asset.imageUrl}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </main>

      <div className="absolute px-2 bottom-0 w-full left-0 bg-white/3">
        <div className="mx-auto grid w-full max-w-[calc(100%-0.5rem)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-sm  p-1">
          <div className="flex size-6 items-center justify-center rounded-md">
            <NextImage src="/logo.png" alt="Anatomy" height={24} width={24} />
          </div>

          <div className="relative min-w-0 ml-23.75">
            <div className="pointer-events-none absolute inset-y-1 left-1/2 z-20 w-px -translate-x-1/2 bg-primary shadow-[0_0_10px_rgba(34,211,238,0.85)]" />
            <div
              ref={filmstripScrollerRef}
              className="no-scrollbar mx-auto max-w-full overflow-x-auto rounded-sm bg-white/3 p-1"
            >
              <div className="flex w-max items-end gap-1">
                {filmstripAssets.map(({ asset, assetIndex }) => (
                  <button
                    key={asset.id}
                    data-asset-id={asset.id}
                    type="button"
                    className={cn(
                      "group relative w-9 shrink-0 overflow-hidden rounded-sm border border-transparent text-left transition",
                      asset.id === activeViewerAssetId
                        ? "bg-cyan-500/20 opacity-100"
                        : "bg-black/20 opacity-60 hover:bg-white/6 hover:opacity-100",
                    )}
                    onClick={() => navigateToAsset(assetIndex, "click")}
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
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <Button size={"icon"} onClick={() => setShowBlockView(true)}>
              <LayoutGrid />
            </Button>
            <Button size={"icon"} onClick={handlePreviousAsset}>
              <ArrowLeft />
            </Button>
            <p className="pr-1 text-sm font-semibold tabular-nums text-white/85 w-24 text-center">
              {navigationAssetIndex >= 0
                ? `${navigationAssetIndex + 1}/${activeAssets.length}`
                : `0/${activeAssets.length}`}
            </p>
            <Button size={"icon"} onClick={handleNextAsset}>
              <ArrowRight />
            </Button>
          </div>
        </div>
      </div>

      {showControlPanel ? (
        <ModalityViewerRightPanel
          activeWeighting={activeWeighting}
          annotationForm={annotationForm}
          busy={busy}
          canEditAnnotationDetails={canEditAnnotationDetails}
          canEditPinArea={canEditPinArea}
          canvasFlipHorizontal={canvasFlipHorizontal}
          canvasFlipVertical={canvasFlipVertical}
          canvasMode={canvasMode}
          currentAnnotations={currentAnnotations}
          currentAsset={currentAsset}
          darkMode={darkMode}
          fontScaleMode={fontScaleMode}
          groupForm={groupForm}
          groups={groups}
          groupsById={groupsById}
          isAuthoringMode={isAuthoringMode}
          modalityId={modalityId}
          overlayOpacity={overlayOpacity}
          pinsOnly={pinsOnly}
          pointAnimation={pointAnimation}
          practiceMode={practiceMode}
          reverseScroll={reverseScroll}
          selectedAnnotationId={selectedAnnotationId}
          selectedGroupId={selectedGroupId}
          selectedStructure={selectedStructure}
          selectedStructureId={selectedStructureId}
          showCrossReferences={showCrossReferences}
          showLabels={showLabels}
          showOrientation={showOrientation}
          showStructureAdvanced={showStructureAdvanced}
          structureForm={structureForm}
          structures={structures}
          structuresById={structuresById}
          targetedLabeling={targetedLabeling}
          visibleGroupIds={visibleGroupIds}
          weightings={weightings}
          zoneId={zoneId}
          handleReset={handleReset}
          onAnnotationFormChange={updateAnnotationForm}
          onCanvasModeChange={setCanvasMode}
          onCaptureSnapshot={handleCaptureSnapshot}
          onClearPolygonDraft={clearPolygonDraft}
          onDarkModeChange={setDarkMode}
          onDeleteAnnotation={handleDeleteAnnotation}
          onDeleteGroup={handleDeleteGroup}
          onDeleteStructure={handleDeleteStructure}
          onFlipCanvasHorizontal={handleFlipCanvasHorizontal}
          onFlipCanvasVertical={handleFlipCanvasVertical}
          onFontScaleModeChange={setFontScaleMode}
          onGroupFormChange={updateGroupForm}
          onGroupVisibilityChange={updateGroupVisibility}
          onNavigateNext={handleNextAsset}
          onNavigatePrevious={handlePreviousAsset}
          onOverlayOpacityChange={setOverlayOpacity}
          onPinsOnlyChange={setPinsOnly}
          onPointAnimationChange={setPointAnimation}
          onPracticeModeChange={setPracticeMode}
          onResetGroup={handleResetGroupDraft}
          onResetStructure={handleResetStructureDraft}
          onReverseScrollChange={setReverseScroll}
          onRotateCanvasLeft={handleRotateCanvasLeft}
          onRotateCanvasRight={handleRotateCanvasRight}
          onSaveAnnotation={handleSaveAnnotation}
          onSaveGroup={handleSaveGroup}
          onSaveStructure={handleSaveStructure}
          onSelectAnnotation={handleSelectAnnotationFromPanel}
          onSelectGroup={handleSelectGroupFromPanel}
          onSelectStructure={handleSelectStructureFromPanel}
          onShowCrossReferencesChange={setShowCrossReferences}
          onShowLabelsChange={setShowLabels}
          onShowOrientationChange={setShowOrientation}
          onStructureAdvancedToggle={() =>
            setShowStructureAdvanced((current) => !current)
          }
          onStructureFormChange={updateStructureForm}
          onTargetedLabelingChange={setTargetedLabeling}
          onUndoPolygonPoint={removeLastPolygonPoint}
          onVisibleGroupIdsChange={setVisibleGroupIds}
          onWeightingChange={handleWeightingChange}
        />
      ) : null}
    </div>
  );
}

function readMutationError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    if ("data" in error && error.data && typeof error.data === "object") {
      const errorBody = error.data as { error?: { message?: string } };
      const message = errorBody.error?.message;

      if (message) {
        return message;
      }
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return fallback;
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitMultilineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ReferenceCard({
  active,
  asset,
  index,
  onSelect,
}: {
  active: boolean;
  asset: ZoneModalityAsset;
  index: number;
  onSelect: () => void;
}) {
  const labels = ["Sagittal", "Coronal", "3D"];

  return (
    <button
      type="button"
      className={cn(
        "w-full overflow-hidden rounded-[1.35rem] border text-left transition",
        active
          ? "border-cyan-400/70 bg-cyan-500/8"
          : "border-white/8 bg-black/20",
      )}
      onClick={onSelect}
    >
      <div className="px-4 pt-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
        {labels[index] ?? `Ref ${index + 1}`}
      </div>
      <div className="p-4 pt-2">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={asset.label}
            className="h-40 w-full object-cover"
            decoding="async"
            fetchPriority="low"
            loading="lazy"
            src={asset.imageUrl}
          />
        </div>
      </div>
    </button>
  );
}

function TriViewStudyPanel({
  activeAssetId,
  assets,
  onSelectAsset,
}: {
  activeAssetId: string | null;
  assets: ZoneModalityAsset[];
  onSelectAsset: (assetId: string) => void;
}) {
  const labels = ["SAGITTAL", "CORONAL", "3D"];

  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/8 bg-black/25 p-3">
      {assets.map((asset, index) => (
        <button
          key={`tri-${asset.id}`}
          type="button"
          className={cn(
            "w-full rounded-xl border p-2 text-left transition",
            asset.id === activeAssetId
              ? "border-cyan-300/70 bg-cyan-500/10"
              : "border-white/8 bg-black/20 hover:bg-white/5",
          )}
          onClick={() => onSelectAsset(asset.id)}
        >
          <div className="mb-2 text-xs font-semibold tracking-[0.18em] text-cyan-300">
            {labels[index] ?? `REF ${index + 1}`}
          </div>
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/35">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={asset.label}
              className="h-28 w-full object-cover"
              decoding="async"
              fetchPriority="low"
              loading="lazy"
              src={asset.thumbnailUrl || asset.imageUrl}
            />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-cyan-300/75" />
          </div>
        </button>
      ))}
    </div>
  );
}

function StructureDrawer({
  darkMode,
  relatedAssets,
  selectedAnnotation,
  selectedStructure,
  onJumpToAsset,
}: {
  darkMode: boolean;
  relatedAssets: Array<{
    annotation: ViewerAnnotation;
    asset: ZoneModalityAsset;
  }>;
  selectedAnnotation: ViewerAnnotation | null;
  selectedStructure: ViewerStructure;
  onJumpToAsset: (assetId: string) => void;
}) {
  const isLocked = selectedStructure.accessLevel === "subscription";

  return (
    <div
      className={cn(
        "rounded-3xl border p-4",
        darkMode ? "border-white/8 bg-white/4" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">
            {selectedStructure.title}
          </div>
          {selectedStructure.latinName ? (
            <div className="mt-1 text-sm text-cyan-300">
              {selectedStructure.latinName}
            </div>
          ) : null}
        </div>
        <Badge variant={isLocked ? "outline" : "secondary"}>
          {isLocked ? "Subscriber lesson" : "Open lesson"}
        </Badge>
      </div>

      {selectedStructure.shortDescription ? (
        <p className="mt-4 text-sm leading-6 text-white/75">
          {selectedStructure.shortDescription}
        </p>
      ) : null}

      {isLocked ? (
        <div className="mt-4 rounded-2xl border border-lime-400/40 bg-lime-400/8 p-4 text-sm">
          Learners will only see the subscriber version of this topic until you
          publish broader access.
        </div>
      ) : selectedStructure.longDescription ? (
        <div className="mt-4 space-y-3 text-sm leading-6 text-white/72">
          {selectedStructure.longDescription.split("\n").map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      ) : null}

      {selectedStructure.learningPoints.length > 0 ? (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.2em] text-white/40">
            Learning points
          </div>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {selectedStructure.learningPoints.map((point) => (
              <li
                key={point}
                className="rounded-xl border border-white/8 px-3 py-2"
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedAnnotation?.note ? (
        <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/65">
          {selectedAnnotation.note}
        </div>
      ) : null}

      {relatedAssets.length > 0 ? (
        <div className="mt-5">
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-white/40">
            In this module
          </div>
          <div className="grid grid-cols-2 gap-2">
            {relatedAssets.slice(0, 8).map(({ asset, annotation }) => (
              <button
                key={annotation.id}
                type="button"
                className="overflow-hidden rounded-2xl border border-white/8 bg-black/20 text-left"
                onClick={() => onJumpToAsset(asset.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={asset.label}
                  className="aspect-4/3 w-full object-cover"
                  decoding="async"
                  fetchPriority="low"
                  loading="lazy"
                  src={asset.thumbnailUrl || asset.imageUrl}
                />
                <div className="px-3 py-2 text-xs text-white/72">
                  {asset.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ViewerCanvas({
  annotationForm,
  canvasFlipHorizontal,
  canvasFlipVertical,
  canvasMode,
  canvasRotationQuarterTurns,
  currentAsset,
  currentImageElement,
  darkMode,
  fontScaleMode,
  hoveredAnnotationId,
  ingestFailureMessage,
  isIngesting,
  isPreparingInitialAsset,
  overlayOpacity,
  overlayRef,
  pinsOnly,
  pointAnimation,
  practiceMode,
  selectedAnnotationId,
  showLoadingIndicator,
  showCrossReferences,
  showOrientation,
  showLabels,
  viewerTitle,
  stageRef,
  structuresById,
  visibleAnnotations,
  onAnnotationHover,
  onAnnotationSelect,
  onCanvasClick,
  onCanvasDoubleClick,
  onWheelNavigate,
}: {
  annotationForm: AnnotationFormState;
  canvasFlipHorizontal: boolean;
  canvasFlipVertical: boolean;
  canvasMode: ViewerCanvasMode;
  canvasRotationQuarterTurns: number;
  currentAsset: ZoneModalityAsset | null;
  currentImageElement: HTMLImageElement | null;
  darkMode: boolean;
  fontScaleMode: FontScaleMode;
  hoveredAnnotationId: string | null;
  ingestFailureMessage: string | null;
  isIngesting: boolean;
  isPreparingInitialAsset: boolean;
  overlayOpacity: number;
  overlayRef: MutableRefObject<SVGSVGElement | null>;
  pinsOnly: boolean;
  pointAnimation: boolean;
  practiceMode: boolean;
  selectedAnnotationId: string | null;
  showLoadingIndicator: boolean;
  showCrossReferences: boolean;
  showOrientation: boolean;
  showLabels: boolean;
  viewerTitle: string;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  structuresById: Map<string, ViewerStructure>;
  visibleAnnotations: ViewerAnnotation[];
  onAnnotationHover: (annotationId: string | null) => void;
  onAnnotationSelect: (annotationId: string, structureId: string) => void;
  onCanvasClick: (point: ViewerAnnotationPoint) => void;
  onCanvasDoubleClick: () => void;
  onWheelNavigate: (deltaY: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushingRef = useRef(false);
  const lastBrushPointRef = useRef<ViewerAnnotationPoint | null>(null);
  const normalizedCanvasRotation = ((canvasRotationQuarterTurns % 4) + 4) % 4;
  const canvasSurfaceTransform = `rotate(${normalizedCanvasRotation * 90}deg) scaleX(${canvasFlipHorizontal ? -1 : 1}) scaleY(${canvasFlipVertical ? -1 : 1})`;

  const resolvePointerPoint = useCallback(
    (event: {
      clientX: number;
      clientY: number;
      currentTarget: SVGSVGElement;
    }) => {
      const rect = event.currentTarget.getBoundingClientRect();
      let x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      let y = clamp((event.clientY - rect.top) / rect.height, 0, 1);

      switch (normalizedCanvasRotation) {
        case 1:
          [x, y] = [y, 1 - x];
          break;
        case 2:
          [x, y] = [1 - x, 1 - y];
          break;
        case 3:
          [x, y] = [1 - y, x];
          break;
        default:
          break;
      }

      if (canvasFlipHorizontal) {
        x = 1 - x;
      }

      if (canvasFlipVertical) {
        y = 1 - y;
      }

      return {
        x: clamp(x, 0, 1),
        y: clamp(y, 0, 1),
      };
    },
    [canvasFlipHorizontal, canvasFlipVertical, normalizedCanvasRotation],
  );

  const commitBrushPoint = useCallback(
    (point: ViewerAnnotationPoint, force = false) => {
      const previousPoint = lastBrushPointRef.current;

      if (!previousPoint) {
        lastBrushPointRef.current = point;
        onCanvasClick(point);
        return;
      }

      const deltaX = point.x - previousPoint.x;
      const deltaY = point.y - previousPoint.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (!force && distance < BRUSH_POINT_STEP) {
        return;
      }

      const segments = Math.max(1, Math.ceil(distance / BRUSH_POINT_STEP));

      for (let segmentIndex = 1; segmentIndex <= segments; segmentIndex += 1) {
        const factor = segmentIndex / segments;
        const interpolatedPoint = {
          x: clamp(previousPoint.x + deltaX * factor, 0, 1),
          y: clamp(previousPoint.y + deltaY * factor, 0, 1),
        };

        lastBrushPointRef.current = interpolatedPoint;
        onCanvasClick(interpolatedPoint);
      }
    },
    [onCanvasClick],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !currentImageElement) {
      return;
    }

    const width =
      currentAsset?.width ??
      currentImageElement.naturalWidth ??
      currentImageElement.width;
    const height =
      currentAsset?.height ??
      currentImageElement.naturalHeight ??
      currentImageElement.height;
    const context = canvas.getContext("2d");

    if (!context || width <= 0 || height <= 0) {
      return;
    }

    if (canvas.width !== width) {
      canvas.width = width;
    }

    if (canvas.height !== height) {
      canvas.height = height;
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(currentImageElement, 0, 0, width, height);
  }, [
    currentAsset?.height,
    currentAsset?.id,
    currentAsset?.width,
    currentImageElement,
  ]);

  if (!currentAsset) {
    if (isPreparingInitialAsset || isIngesting) {
      return (
        <div className="flex min-h-160 flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/10 bg-black/20 px-6 text-center text-white/70">
          <Loader />
        </div>
      );
    }

    if (ingestFailureMessage) {
      return (
        <div className="flex min-h-160 items-center justify-center rounded-[1.75rem] border border-dashed border-red-500/30 bg-red-500/5 px-6 text-center text-red-100">
          <p className="max-w-lg text-sm leading-6">{ingestFailureMessage}</p>
        </div>
      );
    }

    return (
      <div className="flex min-h-160 items-center justify-center rounded-[1.75rem] border border-dashed border-white/10 bg-black/20 text-white/60">
        This modality does not have any derived slices yet.
      </div>
    );
  }

  const overlayPreview =
    canvasMode !== "browse"
      ? annotationForm.polygonPoints.map(pointToPercentPair).join(" ")
      : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        darkMode ? "bg-black" : "bg-white",
      )}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center px-6 py-4 text-sm">
        {showOrientation ? viewerTitle : "Viewer"}
      </div>

      <div
        ref={stageRef}
        className="flex min-h-160 h-full items-center justify-center p-8"
        onDoubleClick={onCanvasDoubleClick}
        onWheel={(event) => {
          event.preventDefault();
          onWheelNavigate(event.deltaY);
        }}
      >
        <div
          className="relative inline-block max-w-full transition-transform duration-200 ease-out"
          style={{ transform: canvasSurfaceTransform }}
        >
          {showLoadingIndicator ? (
            <div className="absolute right-3 top-3 z-20 flex items-center rounded-full border border-white/12 bg-black/60 px-3 py-1.5 text-xs text-white/75 shadow-lg">
              <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
              Loading slice...
            </div>
          ) : null}
          <canvas
            ref={canvasRef}
            aria-label={currentAsset.label}
            className="block max-h-[84vh] w-[min(82vh,82vw)] max-w-full object-contain"
          />
          <svg
            ref={overlayRef}
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1000 1000"
            onClick={(event) => {
              if (canvasMode === "draw-region") {
                return;
              }

              onCanvasClick(resolvePointerPoint(event));
            }}
            onPointerDown={(event) => {
              if (canvasMode !== "draw-region") {
                return;
              }

              brushingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              commitBrushPoint(resolvePointerPoint(event), true);
            }}
            onPointerMove={(event) => {
              if (canvasMode !== "draw-region" || !brushingRef.current) {
                return;
              }

              commitBrushPoint(resolvePointerPoint(event));
            }}
            onPointerUp={(event) => {
              if (canvasMode !== "draw-region") {
                return;
              }

              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }

              brushingRef.current = false;
              lastBrushPointRef.current = null;
            }}
            onPointerLeave={() => {
              if (canvasMode !== "draw-region") {
                return;
              }

              brushingRef.current = false;
              lastBrushPointRef.current = null;
            }}
          >
            {visibleAnnotations.map((annotation) => {
              const structure = structuresById.get(annotation.structureId);
              if (!structure) {
                return null;
              }

              const isSelected = annotation.id === selectedAnnotationId;
              const isHovered = annotation.id === hoveredAnnotationId;
              const color = annotation.colorHex || DEFAULT_ANNOTATION_COLOR;
              const label = annotation.titleOverride || structure.title;
              const markerVisible = showLabels || pinsOnly;
              const textVisible =
                showLabels &&
                !pinsOnly &&
                (!practiceMode || isSelected || isHovered);
              const fontSize = fontScaleMode === "large" ? 24 : 18;

              return (
                <g
                  key={annotation.id}
                  onMouseEnter={() => onAnnotationHover(annotation.id)}
                  onMouseLeave={() => onAnnotationHover(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAnnotationSelect(annotation.id, annotation.structureId);
                  }}
                >
                  {annotation.polygonPoints.length >= 3 ? (
                    <polygon
                      fill={annotation.overlayColorHex || color}
                      fillOpacity={annotation.overlayOpacity * overlayOpacity}
                      points={annotation.polygonPoints
                        .map(pointToSvgPair)
                        .join(" ")}
                      stroke={annotation.overlayColorHex || color}
                      strokeOpacity={0.9}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                  ) : null}
                  {markerVisible ? (
                    <>
                      <line
                        stroke={annotation.leaderColorHex || color}
                        strokeWidth={isSelected ? 3 : 2}
                        x1={annotation.anchorX * 1000}
                        x2={annotation.labelX * 1000}
                        y1={annotation.anchorY * 1000}
                        y2={annotation.labelY * 1000}
                      />
                      <circle
                        cx={annotation.anchorX * 1000}
                        cy={annotation.anchorY * 1000}
                        fill={color}
                        r={isSelected ? 8 : 6}
                      />
                    </>
                  ) : null}
                  {textVisible ? (
                    <text
                      fill={color}
                      fontFamily="system-ui"
                      fontSize={fontSize}
                      fontWeight={isSelected ? 700 : 500}
                      x={annotation.labelX * 1000}
                      y={annotation.labelY * 1000}
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {overlayPreview ? (
              <polygon
                fill={annotationForm.overlayColorHex}
                fillOpacity={
                  annotationForm.overlayOpacity * overlayOpacity * 0.45
                }
                points={overlayPreview}
                stroke={annotationForm.overlayColorHex}
                strokeDasharray="8 6"
                strokeWidth={2}
              />
            ) : null}
            {showCrossReferences ? (
              <>
                <line
                  stroke="rgba(56,189,248,0.88)"
                  strokeWidth={2}
                  x1={500}
                  x2={500}
                  y1={0}
                  y2={1000}
                />
                <line
                  stroke="rgba(56,189,248,0.88)"
                  strokeWidth={2}
                  x1={0}
                  x2={1000}
                  y1={500}
                  y2={500}
                />
              </>
            ) : null}
          </svg>
        </div>
      </div>

      {canvasMode !== "browse" ? (
        <div className="absolute bottom-4 left-4 rounded-full border border-cyan-400/45 bg-black/55 px-4 py-2 text-sm text-cyan-200">
          {canvasMode === "create-label" &&
            "Click in the image to place a new label."}
          {canvasMode === "set-anchor" &&
            "Click in the image to move the anchor."}
          {canvasMode === "set-label" &&
            "Click in the image to move the label text."}
          {canvasMode === "draw-region" &&
            "Click to add polygon points. Double-click anywhere on the image to save."}
        </div>
      ) : null}

      {pointAnimation ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_60%)]" />
      ) : null}
    </div>
  );
}

function isSliceAsset(asset: ZoneModalityAsset) {
  return asset.assetKind === "slice" || asset.assetKind === "derived_slice";
}

function formatModalityTypeLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  switch (value.toLowerCase()) {
    case "mri":
      return "MRI";
    case "ct":
      return "CT";
    case "mra":
      return "MRA";
    case "mrv":
      return "MRV";
    case "cbct":
      return "CBCT";
    default:
      return value.toUpperCase();
  }
}

function formatOrientationLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  switch (value.toLowerCase()) {
    case "axial":
      return "Axial";
    case "sagittal":
      return "Sagittal";
    case "coronal":
      return "Coronal";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

function structureMatchesSearch(structure: ViewerStructure, query: string) {
  return [
    structure.title,
    structure.latinName ?? "",
    structure.shortDescription ?? "",
    ...structure.synonyms,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildStackWarmupOrder(
  assets: ZoneModalityAsset[],
  centerIndex: number,
  preferredDirection: -1 | 0 | 1 = 0,
) {
  if (assets.length === 0) {
    return [];
  }

  const safeCenterIndex = clamp(centerIndex, 0, assets.length - 1);
  const orderedIndices = [safeCenterIndex];

  for (let offset = 1; orderedIndices.length < assets.length; offset += 1) {
    const nextIndex = safeCenterIndex + offset;
    const previousIndex = safeCenterIndex - offset;

    const directionalIndices =
      preferredDirection >= 0
        ? [nextIndex, previousIndex]
        : [previousIndex, nextIndex];

    for (const index of directionalIndices) {
      if (index >= 0 && index < assets.length) {
        orderedIndices.push(index);
      }
    }
  }

  return orderedIndices.map((index) => assets[index]!).filter(Boolean);
}

function buildImmediatePreloadOrder(
  assets: ZoneModalityAsset[],
  centerIndex: number,
  preferredDirection: -1 | 0 | 1,
  radius: number,
) {
  if (assets.length === 0) {
    return [];
  }

  const safeCenterIndex = clamp(centerIndex, 0, assets.length - 1);
  const orderedAssets: ZoneModalityAsset[] = [];

  for (const asset of buildStackWarmupOrder(
    assets,
    safeCenterIndex,
    preferredDirection,
  )) {
    if (orderedAssets.length >= radius) {
      break;
    }

    orderedAssets.push(asset);
  }

  return orderedAssets;
}

function createDefaultLabelX(anchorX: number) {
  return anchorX < 0.55
    ? clamp(anchorX + 0.24, 0.08, 0.92)
    : clamp(anchorX - 0.24, 0.08, 0.92);
}

function pointToSvgPair(point: ViewerAnnotationPoint) {
  return `${point.x * 1000},${point.y * 1000}`;
}

function pointToPercentPair(point: ViewerAnnotationPoint) {
  return pointToSvgPair(point);
}

async function captureViewerSnapshot({
  annotations,
  asset,
  groupsById,
  overlayOpacity,
  pinsOnly,
  practiceMode,
  selectedStructureId,
  showLabels,
  structuresById,
}: {
  annotations: ViewerAnnotation[];
  asset: ZoneModalityAsset;
  groupsById: Map<string, ViewerStructureGroup>;
  overlayOpacity: number;
  pinsOnly: boolean;
  practiceMode: boolean;
  selectedStructureId: string | null;
  showLabels: boolean;
  structuresById: Map<string, ViewerStructure>;
}) {
  const image = await loadImage(asset.imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas context unavailable");
  }

  context.drawImage(image, 0, 0);

  for (const annotation of annotations) {
    const structure = structuresById.get(annotation.structureId);
    if (!structure) {
      continue;
    }

    const group = structure.groupId ? groupsById.get(structure.groupId) : null;
    const color =
      annotation.colorHex || group?.colorHex || DEFAULT_ANNOTATION_COLOR;
    const overlayColor = annotation.overlayColorHex || color;
    const leaderColor = annotation.leaderColorHex || color;

    if (annotation.polygonPoints.length >= 3) {
      context.save();
      context.fillStyle = applyAlpha(
        overlayColor,
        annotation.overlayOpacity * overlayOpacity,
      );
      context.strokeStyle = overlayColor;
      context.lineWidth = 2;
      context.beginPath();
      annotation.polygonPoints.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();
    }

    context.save();
    context.strokeStyle = leaderColor;
    context.fillStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(
      annotation.anchorX * canvas.width,
      annotation.anchorY * canvas.height,
    );
    context.lineTo(
      annotation.labelX * canvas.width,
      annotation.labelY * canvas.height,
    );
    context.stroke();
    context.beginPath();
    context.arc(
      annotation.anchorX * canvas.width,
      annotation.anchorY * canvas.height,
      6,
      0,
      Math.PI * 2,
    );
    context.fill();

    if (
      showLabels &&
      !pinsOnly &&
      (!practiceMode || selectedStructureId === structure.id)
    ) {
      context.font = "24px system-ui";
      context.fillText(
        annotation.titleOverride || structure.title,
        annotation.labelX * canvas.width,
        annotation.labelY * canvas.height,
      );
    }
    context.restore();
  }

  return canvas.toDataURL("image/png");
}

function applyAlpha(color: string, alpha: number) {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) {
    return color;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
