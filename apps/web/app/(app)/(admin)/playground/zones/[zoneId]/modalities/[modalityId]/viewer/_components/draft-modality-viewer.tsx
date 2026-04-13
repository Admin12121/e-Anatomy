"use client"

import Link from "next/link"
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react"
import {
  ArrowLeftIcon,
  CameraIcon,
  CircleIcon,
  CrosshairIcon,
  EyeIcon,
  EyeOffIcon,
  Layers2Icon,
  LoaderCircleIcon,
  PinIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type {
  CreateViewerAnnotationInput,
  CreateViewerStructureGroupInput,
  CreateViewerStructureInput,
  UpdateViewerAnnotationInput,
  UpdateViewerStructureGroupInput,
  UpdateViewerStructureInput,
  ViewerAccessLevel,
  ViewerAnnotation,
  ViewerAnnotationPoint,
  ViewerStructure,
  ViewerStructureGroup,
  ZoneModalityAsset,
} from "@/lib/playground/types"
import {
  useCreateViewerAnnotationMutation,
  useCreateViewerStructureGroupMutation,
  useCreateViewerStructureMutation,
  useGetZoneModalityViewerManifestQuery,
  useUpdateViewerAnnotationMutation,
  useUpdateViewerStructureGroupMutation,
  useUpdateViewerStructureMutation,
} from "@/lib/store/services/playground-api"
import { cn } from "@/lib/utils"

type ViewerCanvasMode =
  | "browse"
  | "create-label"
  | "set-anchor"
  | "set-label"
  | "draw-region"

type FontScaleMode = "auto" | "large"

type StructureFormState = {
  accessLevel: ViewerAccessLevel
  groupId: string
  latinName: string
  learningPoints: string
  longDescription: string
  shortDescription: string
  synonyms: string
  title: string
}

type GroupFormState = {
  colorHex: string
  description: string
  iconName: string
  isDefaultVisible: boolean
  title: string
}

type AnnotationFormState = {
  anchorX: number
  anchorY: number
  colorHex: string
  isPracticeHidden: boolean
  isTargetedDefault: boolean
  isVisibleDefault: boolean
  labelX: number
  labelY: number
  leaderColorHex: string
  note: string
  overlayColorHex: string
  overlayOpacity: number
  polygonPoints: ViewerAnnotationPoint[]
  titleOverride: string
}

type NavigationSource = "button" | "click" | "search" | "weighting" | "wheel"

const DEFAULT_GROUP_COLOR = "#40d6ff"
const DEFAULT_ANNOTATION_COLOR = "#94f8ff"
const IMAGE_PRELOAD_RADIUS = 8
const FILMSTRIP_ITEM_WIDTH = 96
const FILMSTRIP_OVERSCAN = 10
const STACK_PRELOAD_CONCURRENCY = 6
const WHEEL_DELTA_THRESHOLD = 40
const WHEEL_NAVIGATION_COOLDOWN_MS = 18
const EMPTY_GROUP_FORM: GroupFormState = {
  colorHex: DEFAULT_GROUP_COLOR,
  description: "",
  iconName: "",
  isDefaultVisible: true,
  title: "",
}
const EMPTY_STRUCTURE_FORM: StructureFormState = {
  accessLevel: "free",
  groupId: "",
  latinName: "",
  learningPoints: "",
  longDescription: "",
  shortDescription: "",
  synonyms: "",
  title: "",
}
const EMPTY_ANNOTATION_FORM: AnnotationFormState = {
  anchorX: 0.5,
  anchorY: 0.5,
  colorHex: DEFAULT_ANNOTATION_COLOR,
  isPracticeHidden: false,
  isTargetedDefault: false,
  isVisibleDefault: true,
  labelX: 0.65,
  labelY: 0.35,
  leaderColorHex: DEFAULT_ANNOTATION_COLOR,
  note: "",
  overlayColorHex: DEFAULT_ANNOTATION_COLOR,
  overlayOpacity: 0.55,
  polygonPoints: [],
  titleOverride: "",
}

export function DraftModalityViewer({
  modalityId,
  zoneId,
}: {
  modalityId: string
  zoneId: string
}) {
  const { data, error, isFetching, isLoading } = useGetZoneModalityViewerManifestQuery({
    zoneId,
    modalityId,
  })
  const [createGroup, { isLoading: isCreatingGroup }] =
    useCreateViewerStructureGroupMutation()
  const [updateGroup, { isLoading: isUpdatingGroup }] =
    useUpdateViewerStructureGroupMutation()
  const [createStructure, { isLoading: isCreatingStructure }] =
    useCreateViewerStructureMutation()
  const [updateStructure, { isLoading: isUpdatingStructure }] =
    useUpdateViewerStructureMutation()
  const [createAnnotation, { isLoading: isCreatingAnnotation }] =
    useCreateViewerAnnotationMutation()
  const [updateAnnotation, { isLoading: isUpdatingAnnotation }] =
    useUpdateViewerAnnotationMutation()

  const [activeWeighting, setActiveWeighting] = useState<string>("all")
  const [currentAssetId, setCurrentAssetId] = useState<string | null>(null)
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [canvasMode, setCanvasMode] = useState<ViewerCanvasMode>("browse")
  const [showLabels, setShowLabels] = useState(true)
  const [practiceMode, setPracticeMode] = useState(false)
  const [pinsOnly, setPinsOnly] = useState(false)
  const [targetedLabeling, setTargetedLabeling] = useState(false)
  const [showOrientation, setShowOrientation] = useState(true)
  const [showCrossReferences, setShowCrossReferences] = useState(true)
  const [darkMode, setDarkMode] = useState(true)
  const [overlayOpacity, setOverlayOpacity] = useState(0.72)
  const [reverseScroll, setReverseScroll] = useState(false)
  const [pointAnimation, setPointAnimation] = useState(true)
  const [fontScaleMode, setFontScaleMode] = useState<FontScaleMode>("auto")
  const [groupForm, setGroupForm] = useState<GroupFormState>(EMPTY_GROUP_FORM)
  const [structureForm, setStructureForm] =
    useState<StructureFormState>(EMPTY_STRUCTURE_FORM)
  const [annotationForm, setAnnotationForm] =
    useState<AnnotationFormState>(EMPTY_ANNOTATION_FORM)
  const [visibleGroupIds, setVisibleGroupIds] = useState<string[]>([])
  const [readyAssetIds, setReadyAssetIds] = useState<Set<string>>(() => new Set())
  const [loadingIndicatorAssetId, setLoadingIndicatorAssetId] = useState<string | null>(null)
  const [filmstripMetrics, setFilmstripMetrics] = useState({
    clientWidth: 0,
    scrollLeft: 0,
  })

  const stageRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<SVGSVGElement | null>(null)
  const filmstripRef = useRef<HTMLDivElement | null>(null)
  const filmstripFrameRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const wheelCooldownRef = useRef<number | null>(null)
  const imagePreloadCacheRef = useRef<Set<string>>(new Set())
  const pendingImagePreloadCacheRef = useRef<Set<string>>(new Set())
  const imagePreloadPromiseCacheRef = useRef<Map<string, Promise<void>>>(new Map())
  const lastNavigationSourceRef = useRef<NavigationSource>("button")

  const assets = useMemo(() => data?.assets ?? [], [data?.assets])
  const groups = useMemo(() => data?.structureGroups ?? [], [data?.structureGroups])
  const structures = useMemo(() => data?.structures ?? [], [data?.structures])
  const annotations = useMemo(() => data?.annotations ?? [], [data?.annotations])

  const structuresById = useMemo(
    () => new Map(structures.map((structure) => [structure.id, structure])),
    [structures],
  )
  const groupsById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  )
  const annotationsById = useMemo(
    () => new Map(annotations.map((annotation) => [annotation.id, annotation])),
    [annotations],
  )
  const weightings = useMemo(() => {
    const values = Array.from(
      new Set(
        assets.flatMap((asset) => (asset.weightingCode ? [asset.weightingCode] : [])),
      ),
    )

    return ["all", ...values]
  }, [assets])
  const activeAssets = useMemo(() => {
    const sliceAssets = assets
      .filter((asset) => asset.assetKind === "slice")
      .sort((left, right) =>
        left.sortOrder === right.sortOrder
          ? left.createdAt.localeCompare(right.createdAt)
          : left.sortOrder - right.sortOrder,
      )

    if (activeWeighting === "all") {
      return sliceAssets
    }

    const weighted = sliceAssets.filter(
      (asset) => (asset.weightingCode ?? "all") === activeWeighting,
    )

    return weighted.length > 0 ? weighted : sliceAssets
  }, [activeWeighting, assets])
  const referenceAssets = useMemo(() => {
    return assets.filter((asset) => asset.assetKind !== "slice")
  }, [assets])

  const currentAsset = useMemo(() => {
    if (currentAssetId) {
      const exact = activeAssets.find((asset) => asset.id === currentAssetId)

      if (exact) {
        return exact
      }
    }

    return activeAssets[0] ?? null
  }, [activeAssets, currentAssetId])
  const currentAssetIndex = useMemo(
    () =>
      currentAsset ? activeAssets.findIndex((asset) => asset.id === currentAsset.id) : -1,
    [activeAssets, currentAsset],
  )
  const filmstripWindow = useMemo(() => {
    if (activeAssets.length === 0) {
      return {
        endIndex: -1,
        leftSpacerWidth: 0,
        rightSpacerWidth: 0,
        startIndex: 0,
      }
    }

    const maxIndex = activeAssets.length - 1
    const fallbackWidth = FILMSTRIP_ITEM_WIDTH * 8
    const viewportWidth = filmstripMetrics.clientWidth || fallbackWidth
    const visibleCount = Math.max(1, Math.ceil(viewportWidth / FILMSTRIP_ITEM_WIDTH))
    const viewportStartIndex = clamp(
      Math.floor(filmstripMetrics.scrollLeft / FILMSTRIP_ITEM_WIDTH),
      0,
      maxIndex,
    )
    const viewportEndIndex = clamp(viewportStartIndex + visibleCount - 1, 0, maxIndex)
    const isCurrentOutsideViewport =
      currentAssetIndex >= 0 &&
      (currentAssetIndex < viewportStartIndex - FILMSTRIP_OVERSCAN ||
        currentAssetIndex > viewportEndIndex + FILMSTRIP_OVERSCAN)
    const anchorStartIndex = isCurrentOutsideViewport
      ? clamp(currentAssetIndex - Math.floor(visibleCount / 2), 0, maxIndex)
      : viewportStartIndex
    const startIndex = clamp(anchorStartIndex - FILMSTRIP_OVERSCAN, 0, maxIndex)
    const endIndex = clamp(
      anchorStartIndex + visibleCount + FILMSTRIP_OVERSCAN - 1,
      startIndex,
      maxIndex,
    )

    return {
      endIndex,
      leftSpacerWidth: startIndex * FILMSTRIP_ITEM_WIDTH,
      rightSpacerWidth: Math.max(0, activeAssets.length - endIndex - 1) * FILMSTRIP_ITEM_WIDTH,
      startIndex,
    }
  }, [activeAssets.length, currentAssetIndex, filmstripMetrics.clientWidth, filmstripMetrics.scrollLeft])
  const visibleFilmstripAssets = useMemo(() => {
    if (filmstripWindow.endIndex < filmstripWindow.startIndex) {
      return []
    }

    return activeAssets
      .slice(filmstripWindow.startIndex, filmstripWindow.endIndex + 1)
      .map((asset, offset) => ({
        asset,
        assetIndex: filmstripWindow.startIndex + offset,
      }))
  }, [activeAssets, filmstripWindow.endIndex, filmstripWindow.startIndex])
  const currentAnnotations = useMemo(
    () =>
      currentAsset
        ? annotations.filter((annotation) => annotation.assetId === currentAsset.id)
        : [],
    [annotations, currentAsset],
  )

  const markAssetReady = useEffectEvent((asset: ZoneModalityAsset) => {
    imagePreloadCacheRef.current.add(asset.imageUrl)
    pendingImagePreloadCacheRef.current.delete(asset.imageUrl)
    imagePreloadPromiseCacheRef.current.delete(asset.imageUrl)
    setReadyAssetIds((current) => {
      if (current.has(asset.id)) {
        return current
      }

      const next = new Set(current)
      next.add(asset.id)
      return next
    })
  })

  const preloadAsset = useEffectEvent((asset: ZoneModalityAsset) => {
    if (imagePreloadCacheRef.current.has(asset.imageUrl)) {
      markAssetReady(asset)
      return Promise.resolve()
    }

    const existingPromise = imagePreloadPromiseCacheRef.current.get(asset.imageUrl)

    if (existingPromise) {
      return existingPromise
    }

    const promise = new Promise<void>((resolve) => {
      if (typeof window === "undefined") {
        resolve()
        return
      }

      const image = new window.Image()
      image.decoding = "async"
      pendingImagePreloadCacheRef.current.add(asset.imageUrl)

      const finalizeReady = () => {
        markAssetReady(asset)
        resolve()
      }

      image.onload = () => {
        if (typeof image.decode === "function") {
          void image.decode().catch(() => undefined).finally(finalizeReady)
          return
        }

        finalizeReady()
      }

      image.onerror = () => {
        pendingImagePreloadCacheRef.current.delete(asset.imageUrl)
        imagePreloadPromiseCacheRef.current.delete(asset.imageUrl)
        resolve()
      }

      image.src = asset.imageUrl
    })

    imagePreloadPromiseCacheRef.current.set(asset.imageUrl, promise)
    return promise
  })

  const selectedStructure = selectedStructureId
    ? structuresById.get(selectedStructureId) ?? null
    : null
  const selectedGroup =
    selectedStructure?.groupId ? groupsById.get(selectedStructure.groupId) ?? null : null
  const selectedAnnotation = selectedAnnotationId
    ? annotationsById.get(selectedAnnotationId) ?? null
    : null

  const searchHits = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase()

    if (!query) {
      return []
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
          .toLowerCase()

        if (!haystack.includes(query)) {
          return null
        }

        const relatedAnnotation = annotations.find(
          (annotation) => annotation.structureId === structure.id,
        )
        const relatedAsset =
          relatedAnnotation &&
          assets.find((asset) => asset.id === relatedAnnotation.assetId)

        return {
          asset: relatedAsset ?? null,
          structure,
        }
      })
      .filter((value): value is { asset: ZoneModalityAsset | null; structure: ViewerStructure } =>
        Boolean(value),
      )
      .slice(0, 8)
  }, [annotations, assets, deferredSearchQuery, structures])

  useEffect(() => {
    if (!data) {
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleGroupIds((current) =>
      current.length > 0
        ? current
        : groups
            .filter((group) => group.isDefaultVisible)
            .map((group) => group.id),
    )
  }, [data, groups])

  useEffect(() => {
    if (!weightings.includes(activeWeighting)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveWeighting(weightings[0] ?? "all")
    }
  }, [activeWeighting, weightings])

  useEffect(() => {
    if (!currentAsset && activeAssets[0]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentAssetId(activeAssets[0].id)
    }
  }, [activeAssets, currentAsset])

  useEffect(() => {
    if (!selectedGroup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroupForm(EMPTY_GROUP_FORM)
      return
    }

    setGroupForm({
      colorHex: selectedGroup.colorHex,
      description: selectedGroup.description ?? "",
      iconName: selectedGroup.iconName ?? "",
      isDefaultVisible: selectedGroup.isDefaultVisible,
      title: selectedGroup.title,
    })
  }, [selectedGroup])

  useEffect(() => {
    if (!selectedStructure) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStructureForm(EMPTY_STRUCTURE_FORM)
      return
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
    })
  }, [selectedStructure])

  useEffect(() => {
    if (!selectedAnnotation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnnotationForm(EMPTY_ANNOTATION_FORM)
      return
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
    })
  }, [selectedAnnotation])

  useEffect(() => {
    if (!selectedStructureId || !currentAsset) {
      return
    }

    const matchingAnnotation = annotations.find(
      (annotation) =>
        annotation.assetId === currentAsset.id && annotation.structureId === selectedStructureId,
    )

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAnnotationId(matchingAnnotation?.id ?? null)
  }, [annotations, currentAsset, selectedStructureId])

  useEffect(() => {
    if (!currentAssetId) {
      return
    }

    const nextThumbnail = filmstripRef.current?.querySelector<HTMLElement>(
      `[data-asset-id="${currentAssetId}"]`,
    )
    nextThumbnail?.scrollIntoView({
      behavior:
        lastNavigationSourceRef.current === "wheel" || activeAssets.length > 72
          ? "auto"
          : "smooth",
      block: "nearest",
      inline: "center",
    })
  }, [activeAssets.length, currentAssetId])

  useEffect(() => {
    if (typeof window === "undefined" || currentAssetIndex < 0) {
      return
    }

    const startIndex = clamp(currentAssetIndex - IMAGE_PRELOAD_RADIUS, 0, activeAssets.length - 1)
    const endIndex = clamp(currentAssetIndex + IMAGE_PRELOAD_RADIUS, 0, activeAssets.length - 1)

    for (let index = startIndex; index <= endIndex; index += 1) {
      const asset = activeAssets[index]

      if (!asset) {
        continue
      }

      void preloadAsset(asset)
    }
  }, [activeAssets, currentAssetIndex])

  useEffect(() => {
    if (typeof window === "undefined" || activeAssets.length === 0) {
      return
    }

    let cancelled = false
    const warmupOrder = buildStackWarmupOrder(activeAssets, Math.max(currentAssetIndex, 0))
    let cursor = 0

    async function worker() {
      while (!cancelled) {
        const asset = warmupOrder[cursor]
        cursor += 1

        if (!asset) {
          return
        }

        await preloadAsset(asset)
      }
    }

    const workerCount = Math.min(STACK_PRELOAD_CONCURRENCY, warmupOrder.length)

    void Promise.all(Array.from({ length: workerCount }, () => worker()))

    return () => {
      cancelled = true
    }
  }, [activeAssets, currentAssetIndex])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const filmstripElement = filmstripRef.current

    if (!filmstripElement) {
      return
    }

    const syncMetrics = () => {
      const nextClientWidth = filmstripElement.clientWidth
      const nextScrollLeft = filmstripElement.scrollLeft

      setFilmstripMetrics((current) =>
        current.clientWidth === nextClientWidth && current.scrollLeft === nextScrollLeft
          ? current
          : {
              clientWidth: nextClientWidth,
              scrollLeft: nextScrollLeft,
            },
      )
    }

    syncMetrics()

    const resizeObserver = new window.ResizeObserver(syncMetrics)
    resizeObserver.observe(filmstripElement)

    return () => {
      resizeObserver.disconnect()
    }
  }, [activeAssets.length])

  useEffect(() => {
    return () => {
      if (wheelCooldownRef.current !== null) {
        window.clearTimeout(wheelCooldownRef.current)
      }

      if (filmstripFrameRef.current !== null) {
        window.cancelAnimationFrame(filmstripFrameRef.current)
      }
    }
  }, [])

  const visibleAnnotations = useMemo(() => {
    const normalizedSearch = deferredSearchQuery.trim().toLowerCase()

    return currentAnnotations.filter((annotation) => {
      const structure = structuresById.get(annotation.structureId)

      if (!structure) {
        return false
      }

      if (structure.groupId && !visibleGroupIds.includes(structure.groupId)) {
        return false
      }

      if (!showLabels && !pinsOnly) {
        return false
      }

      if (targetedLabeling && selectedStructureId && structure.id !== selectedStructureId) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      return structureMatchesSearch(structure, normalizedSearch)
    })
  }, [
    currentAnnotations,
    deferredSearchQuery,
    pinsOnly,
    selectedStructureId,
    showLabels,
    structuresById,
    targetedLabeling,
    visibleGroupIds,
  ])

  const relatedAssets = useMemo(() => {
    if (!selectedStructure) {
      return []
    }

    return annotations
      .filter((annotation) => annotation.structureId === selectedStructure.id)
      .map((annotation) => {
        const asset = assets.find((candidate) => candidate.id === annotation.assetId)

        if (!asset) {
          return null
        }

        return {
          annotation,
          asset,
        }
      })
      .filter((value): value is { annotation: ViewerAnnotation; asset: ZoneModalityAsset } =>
        Boolean(value),
      )
  }, [annotations, assets, selectedStructure])

  const busy =
    isCreatingAnnotation ||
    isCreatingGroup ||
    isCreatingStructure ||
    isUpdatingAnnotation ||
    isUpdatingGroup ||
    isUpdatingStructure
  const isCurrentImageLoaded = currentAsset ? readyAssetIds.has(currentAsset.id) : false
  const showLoadingIndicator = currentAsset
    ? !isCurrentImageLoaded && loadingIndicatorAssetId === currentAsset.id
    : false

  useEffect(() => {
    if (typeof window === "undefined" || !currentAsset || isCurrentImageLoaded) {
      return
    }

    const assetId = currentAsset.id
    const timeoutId = window.setTimeout(() => {
      setLoadingIndicatorAssetId(assetId)
    }, 140)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentAsset, isCurrentImageLoaded])

  function updateGroupVisibility(groupId: string, nextVisible: boolean) {
    setVisibleGroupIds((current) => {
      const nextSet = new Set(current)

      if (nextVisible) {
        nextSet.add(groupId)
      } else {
        nextSet.delete(groupId)
      }

      return Array.from(nextSet)
    })
  }

  function navigateToAsset(nextIndex: number, source: NavigationSource = "button") {
    const nextAsset = activeAssets[nextIndex]

    if (!nextAsset || nextAsset.id === currentAsset?.id) {
      return
    }

    lastNavigationSourceRef.current = source
    startTransition(() => {
      setCurrentAssetId(nextAsset.id)
    })
  }

  function navigateToAssetId(assetId: string, source: NavigationSource = "click") {
    const nextIndex = activeAssets.findIndex((asset) => asset.id === assetId)

    if (nextIndex >= 0) {
      navigateToAsset(nextIndex, source)
      return
    }

    lastNavigationSourceRef.current = source
    startTransition(() => {
      setCurrentAssetId(assetId)
    })
  }

  function updateAnnotationForm<Key extends keyof AnnotationFormState>(
    key: Key,
    value: AnnotationFormState[Key],
  ) {
    setAnnotationForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function updateStructureForm<Key extends keyof StructureFormState>(
    key: Key,
    value: StructureFormState[Key],
  ) {
    setStructureForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function updateGroupForm<Key extends keyof GroupFormState>(
    key: Key,
    value: GroupFormState[Key],
  ) {
    setGroupForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function handleSaveStructure() {
    if (!structureForm.title.trim()) {
      toast.error("Structure title is required.")
      return
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
    }

    try {
      const structure = selectedStructure
        ? await updateStructure({
            input,
            modalityId,
            structureId: selectedStructure.id,
            zoneId,
          }).unwrap()
        : await createStructure({ input, modalityId, zoneId }).unwrap()

      toast.success(selectedStructure ? "Structure updated." : "Structure created.")
      setSelectedStructureId(structure.id)
    } catch (mutationError) {
      toast.error(readMutationError(mutationError, "Unable to save the structure."))
    }
  }

  async function handleSaveAnnotation() {
    if (!selectedStructure || !currentAsset) {
      toast.error("Choose a structure and slice first.")
      return
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
    }

    try {
      const annotation = selectedAnnotation
        ? await updateAnnotation({
            annotationId: selectedAnnotation.id,
            input,
            modalityId,
            zoneId,
          }).unwrap()
        : await createAnnotation({ input, modalityId, zoneId }).unwrap()

      toast.success(selectedAnnotation ? "Annotation updated." : "Annotation created.")
      setSelectedAnnotationId(annotation.id)
      setCanvasMode("browse")
    } catch (mutationError) {
      toast.error(readMutationError(mutationError, "Unable to save the annotation."))
    }
  }

  async function handleSaveGroup() {
    if (!groupForm.title.trim()) {
      toast.error("Group title is required.")
      return
    }

    const input: CreateViewerStructureGroupInput | UpdateViewerStructureGroupInput = {
      colorHex: groupForm.colorHex.trim() || DEFAULT_GROUP_COLOR,
      description: groupForm.description.trim() || null,
      iconName: groupForm.iconName.trim() || null,
      isDefaultVisible: groupForm.isDefaultVisible,
      title: groupForm.title.trim(),
    }

    try {
      const group = selectedGroup
        ? await updateGroup({
            groupId: selectedGroup.id,
            input,
            modalityId,
            zoneId,
          }).unwrap()
        : await createGroup({ input, modalityId, zoneId }).unwrap()

      toast.success(selectedGroup ? "Group updated." : "Group created.")
      setVisibleGroupIds((current) =>
        group.isDefaultVisible ? Array.from(new Set([...current, group.id])) : current,
      )
    } catch (mutationError) {
      toast.error(readMutationError(mutationError, "Unable to save the group."))
    }
  }

  function jumpToStructure(structureId: string) {
    const nextAnnotation = annotations.find((annotation) => annotation.structureId === structureId)

    setSelectedStructureId(structureId)
    setTargetedLabeling(true)

    if (!nextAnnotation) {
      return
    }

    const nextAsset = assets.find((asset) => asset.id === nextAnnotation.assetId)

    if (!nextAsset) {
      return
    }

    startTransition(() => {
      setSelectedAnnotationId(nextAnnotation.id)
      setCurrentAssetId(nextAsset.id)
      setActiveWeighting(nextAsset.weightingCode ?? "all")
    })
    lastNavigationSourceRef.current = "search"
  }

  function handleWeightingChange(nextWeighting: string) {
    lastNavigationSourceRef.current = "weighting"
    setActiveWeighting(nextWeighting)
    setCurrentAssetId(null)
  }

  function handleCanvasClick(point: ViewerAnnotationPoint) {
    if (!selectedStructure || !currentAsset) {
      return
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
      }

      void createAnnotation({ input: nextInput, modalityId, zoneId })
        .unwrap()
        .then((annotation) => {
          setSelectedAnnotationId(annotation.id)
          setSelectedStructureId(annotation.structureId)
          setCanvasMode("browse")
          toast.success("Annotation created.")
        })
        .catch((mutationError) => {
          toast.error(readMutationError(mutationError, "Unable to create the annotation."))
        })
      return
    }

    if (canvasMode === "set-anchor") {
      updateAnnotationForm("anchorX", point.x)
      updateAnnotationForm("anchorY", point.y)
      setCanvasMode("browse")
      return
    }

    if (canvasMode === "set-label") {
      updateAnnotationForm("labelX", point.x)
      updateAnnotationForm("labelY", point.y)
      setCanvasMode("browse")
      return
    }

    if (canvasMode === "draw-region") {
      updateAnnotationForm("polygonPoints", [...annotationForm.polygonPoints, point])
    }
  }

  function handleCanvasDoubleClick() {
    if (canvasMode !== "draw-region") {
      return
    }

    void handleSaveAnnotation()
  }

  function handleWheelNavigation(deltaY: number) {
    if (activeAssets.length <= 1) {
      return
    }

    wheelDeltaRef.current += reverseScroll ? -deltaY : deltaY

    if (Math.abs(wheelDeltaRef.current) < WHEEL_DELTA_THRESHOLD) {
      return
    }

    if (wheelCooldownRef.current !== null) {
      return
    }

    const direction = Math.sign(wheelDeltaRef.current)
    const stepCount = Math.max(
      1,
      Math.floor(Math.abs(wheelDeltaRef.current) / WHEEL_DELTA_THRESHOLD),
    )
    wheelDeltaRef.current = 0

    if (direction === 0) {
      return
    }

    const nextIndex = clamp(
      currentAssetIndex + direction * stepCount,
      0,
      activeAssets.length - 1,
    )
    navigateToAsset(nextIndex, "wheel")
    wheelCooldownRef.current = window.setTimeout(() => {
      wheelCooldownRef.current = null
    }, WHEEL_NAVIGATION_COOLDOWN_MS)
  }

  function handleFilmstripScroll() {
    if (typeof window === "undefined" || filmstripFrameRef.current !== null) {
      return
    }

    filmstripFrameRef.current = window.requestAnimationFrame(() => {
      filmstripFrameRef.current = null

      const filmstripElement = filmstripRef.current

      if (!filmstripElement) {
        return
      }

      const nextClientWidth = filmstripElement.clientWidth
      const nextScrollLeft = filmstripElement.scrollLeft

      setFilmstripMetrics((current) =>
        current.clientWidth === nextClientWidth && current.scrollLeft === nextScrollLeft
          ? current
          : {
              clientWidth: nextClientWidth,
              scrollLeft: nextScrollLeft,
            },
      )
    })
  }

  async function handleCaptureSnapshot() {
    if (!currentAsset) {
      return
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
      })
      const link = document.createElement("a")
      link.href = dataUrl
      link.download = `${data?.zone.slug ?? "zone"}-${data?.modality.name ?? "viewer"}-${currentAssetIndex + 1}.png`
      link.click()
      toast.success("Snapshot captured.")
    } catch {
      toast.error("Unable to capture the current viewer frame.")
    }
  }

  if (isLoading || isFetching) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center rounded-3xl bg-[#05070a] text-white">
        <div className="flex items-center gap-3 text-sm text-white/80">
          <LoaderCircleIcon className="size-5 animate-spin" />
          Loading draft viewer...
        </div>
      </div>
    )
  }

  if (!data || error) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#05070a] p-8 text-white">
        <div className="text-lg font-semibold">Viewer unavailable</div>
        <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
          This modality does not have a derived study stack yet. Finish the study
          intake first, then return here to configure groups, structures, labels,
          and overlay regions.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "grid min-h-[calc(100vh-7rem)] gap-4 rounded-[2rem] border p-4 shadow-[0_32px_120px_rgba(0,0,0,0.28)]",
        darkMode
          ? "border-white/8 bg-[#040608] text-white"
          : "border-slate-200 bg-slate-50 text-slate-950",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="secondary">
            <Link href="/playground">
              <ArrowLeftIcon className="size-4" />
              Back to playground
            </Link>
          </Button>
          <div>
            <div className="text-sm uppercase tracking-[0.22em] text-white/45">
              {data.zone.name}
            </div>
            <div className="text-xl font-semibold">{data.modality.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{formatWeightingLabel(activeWeighting)}</Badge>
          <Badge variant="outline">
            {activeAssets.length > 0 ? `${currentAssetIndex + 1}/${activeAssets.length}` : "0/0"}
          </Badge>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
        <aside className="min-h-0 space-y-4 overflow-y-auto rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-4">
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
                      <span className="text-xs text-white/45">{asset.label}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {referenceAssets.length > 0 ? (
            <div className="space-y-3">
              {referenceAssets.map((asset, index) => (
                <ReferenceCard
                  key={asset.id}
                  active={asset.id === currentAsset?.id}
                  asset={asset}
                  index={index}
                  onSelect={() => navigateToAssetId(asset.id, "click")}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-white/55">
              The viewer is using the derived study stack directly. Uploading
              manual reference slices is no longer required for normal intake.
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
              Select a label to inspect quick facts, detailed explanations, and
              related slices from this uploaded study.
            </div>
          )}
        </aside>

        <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-4">
          <ViewerCanvas
            annotationForm={annotationForm}
            canvasMode={canvasMode}
            currentAsset={currentAsset}
            currentAssetIndex={currentAssetIndex}
            darkMode={darkMode}
            fontScaleMode={fontScaleMode}
            hoveredAnnotationId={hoveredAnnotationId}
            isCurrentImageLoaded={isCurrentImageLoaded}
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
            stageRef={stageRef}
            structuresById={structuresById}
            visibleAnnotations={visibleAnnotations}
            onAnnotationHover={setHoveredAnnotationId}
            onAnnotationSelect={(annotationId, structureId) => {
              setSelectedAnnotationId(annotationId)
              setSelectedStructureId(structureId)
            }}
            onCanvasClick={handleCanvasClick}
            onCanvasDoubleClick={handleCanvasDoubleClick}
            onCurrentImageLoad={() => {
              if (currentAsset?.imageUrl) {
                imagePreloadCacheRef.current.add(currentAsset.imageUrl)
              }

              if (currentAsset?.id) {
                setReadyAssetIds((current) => {
                  if (current.has(currentAsset.id)) {
                    return current
                  }

                  const next = new Set(current)
                  next.add(currentAsset.id)
                  return next
                })
              }
            }}
            onWheelNavigate={handleWheelNavigation}
          />

          <div
            ref={filmstripRef}
            className="flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-3"
            onScroll={handleFilmstripScroll}
          >
            {filmstripWindow.leftSpacerWidth > 0 ? (
              <div
                aria-hidden="true"
                className="shrink-0"
                style={{ width: `${filmstripWindow.leftSpacerWidth}px` }}
              />
            ) : null}
            {visibleFilmstripAssets.map(({ asset, assetIndex }) => (
              <button
                key={asset.id}
                data-asset-id={asset.id}
                type="button"
                className={cn(
                  "group w-[5.5rem] shrink-0 overflow-hidden rounded-2xl border text-left transition",
                  asset.id === currentAsset?.id
                    ? "border-cyan-400/80 bg-cyan-500/10"
                    : "border-white/8 bg-black/20 hover:bg-white/6",
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
                <div className="px-2 py-2 text-xs text-white/70">{asset.label}</div>
              </button>
            ))}
            {filmstripWindow.rightSpacerWidth > 0 ? (
              <div
                aria-hidden="true"
                className="shrink-0"
                style={{ width: `${filmstripWindow.rightSpacerWidth}px` }}
              />
            ) : null}
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-[1.75rem] border border-white/8 bg-white/[0.03] p-4">
          <ViewerSidebarSection title="Weightings">
            <div className="grid grid-cols-3 gap-2">
              {weightings.map((weighting) => (
                <button
                  key={weighting}
                  type="button"
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm transition",
                    weighting === activeWeighting
                      ? "border-cyan-400 bg-cyan-500/10 text-white"
                      : "border-white/10 text-white/65 hover:bg-white/6",
                  )}
                  onClick={() => handleWeightingChange(weighting)}
                >
                  {formatWeightingLabel(weighting)}
                </button>
              ))}
            </div>
          </ViewerSidebarSection>

          <ViewerSidebarSection title="Anatomical Parts">
            <div className="space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm"
                onClick={() =>
                  setVisibleGroupIds(
                    visibleGroupIds.length === groups.length ? [] : groups.map((group) => group.id),
                  )
                }
              >
                <span>Select all</span>
                <span className="text-xs text-white/45">{visibleGroupIds.length}/{groups.length}</span>
              </button>
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-white/8 px-3 py-2 text-left text-sm"
                  onClick={() =>
                    updateGroupVisibility(group.id, !visibleGroupIds.includes(group.id))
                  }
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: group.colorHex }}
                    />
                    {group.title}
                  </span>
                  {visibleGroupIds.includes(group.id) ? (
                    <EyeIcon className="size-4 text-white/60" />
                  ) : (
                    <EyeOffIcon className="size-4 text-white/35" />
                  )}
                </button>
              ))}
            </div>
          </ViewerSidebarSection>

          <ViewerSidebarSection title="Transformations">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigateToAsset(
                    clamp(currentAssetIndex - 1, 0, activeAssets.length - 1),
                    "button",
                  )
                }
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigateToAsset(
                    clamp(currentAssetIndex + 1, 0, activeAssets.length - 1),
                    "button",
                  )
                }
              >
                Next
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCanvasMode("browse")
                  setAnnotationForm(EMPTY_ANNOTATION_FORM)
                }}
              >
                Reset
              </Button>
              <Button type="button" variant="secondary" onClick={handleCaptureSnapshot}>
                <CameraIcon className="size-4" />
                Snapshot
              </Button>
            </div>
          </ViewerSidebarSection>

          <ViewerSidebarSection title="Labeling">
            <div className="grid grid-cols-2 gap-2">
              <TogglePill active={practiceMode} label="Practice" onToggle={setPracticeMode} />
              <TogglePill active={pinsOnly} label="Pins" onToggle={setPinsOnly} />
              <TogglePill
                active={targetedLabeling}
                label="Targeted"
                onToggle={setTargetedLabeling}
              />
              <TogglePill active={showLabels} label="Labels" onToggle={setShowLabels} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFontScaleMode("auto")}
              >
                Auto
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFontScaleMode("large")}
              >
                Large
              </Button>
            </div>
          </ViewerSidebarSection>

          <ViewerSidebarSection title="Display">
            <div className="space-y-2">
              <ToggleRow active={showOrientation} label="Orientation" onToggle={setShowOrientation} />
              <ToggleRow
                active={showCrossReferences}
                label="Cross references"
                onToggle={setShowCrossReferences}
              />
              <ToggleRow active={darkMode} label="Dark mode" onToggle={setDarkMode} />
              <ToggleRow active={reverseScroll} label="Reverse scroll" onToggle={setReverseScroll} />
              <ToggleRow active={pointAnimation} label="Point animation" onToggle={setPointAnimation} />
            </div>
            <div className="mt-3 space-y-2">
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">Overlay opacity</div>
              <input
                className="w-full accent-cyan-400"
                max={1}
                min={0.1}
                step={0.05}
                type="range"
                value={overlayOpacity}
                onChange={(event) => setOverlayOpacity(Number(event.target.value))}
              />
            </div>
          </ViewerSidebarSection>

          <ViewerSidebarSection title="Authoring">
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Group</div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setGroupForm(EMPTY_GROUP_FORM)}>
                    New
                  </Button>
                </div>
                <Input
                  placeholder="Group title"
                  value={groupForm.title}
                  onChange={(event) => updateGroupForm("title", event.target.value)}
                />
                <Input
                  placeholder="Color hex"
                  value={groupForm.colorHex}
                  onChange={(event) => updateGroupForm("colorHex", event.target.value)}
                />
                <Textarea
                  placeholder="Group description"
                  value={groupForm.description}
                  onChange={(event) => updateGroupForm("description", event.target.value)}
                />
                <Button disabled={busy} type="button" variant="secondary" onClick={handleSaveGroup}>
                  {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <Layers2Icon className="size-4" />}
                  Save group
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Structure</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelectedStructureId(null)
                      setSelectedAnnotationId(null)
                    }}
                  >
                    New
                  </Button>
                </div>
                <Input
                  placeholder="Structure title"
                  value={structureForm.title}
                  onChange={(event) => updateStructureForm("title", event.target.value)}
                />
                <Input
                  placeholder="Latin name"
                  value={structureForm.latinName}
                  onChange={(event) => updateStructureForm("latinName", event.target.value)}
                />
                <select
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  value={structureForm.groupId}
                  onChange={(event) => updateStructureForm("groupId", event.target.value)}
                >
                  <option value="">Ungrouped</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.title}
                    </option>
                  ))}
                </select>
                <Textarea
                  placeholder="Quick info"
                  value={structureForm.shortDescription}
                  onChange={(event) =>
                    updateStructureForm("shortDescription", event.target.value)
                  }
                />
                <Textarea
                  placeholder="Detailed explanation"
                  value={structureForm.longDescription}
                  onChange={(event) =>
                    updateStructureForm("longDescription", event.target.value)
                  }
                />
                <Button disabled={busy} type="button" onClick={handleSaveStructure}>
                  {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
                  Save structure
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Annotation</div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setCanvasMode("create-label")}
                    >
                      <PinIcon className="size-4" />
                      New
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setCanvasMode("draw-region")}
                    >
                      <CrosshairIcon className="size-4" />
                      Region
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" onClick={() => setCanvasMode("set-anchor")}>
                    Set anchor
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setCanvasMode("set-label")}>
                    Set label
                  </Button>
                </div>
                <Input
                  placeholder="Label override"
                  value={annotationForm.titleOverride}
                  onChange={(event) => updateAnnotationForm("titleOverride", event.target.value)}
                />
                <Textarea
                  placeholder="Annotation note"
                  value={annotationForm.note}
                  onChange={(event) => updateAnnotationForm("note", event.target.value)}
                />
                <Button disabled={busy || !selectedStructure} type="button" onClick={handleSaveAnnotation}>
                  {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CircleIcon className="size-4" />}
                  Save annotation
                </Button>
              </div>
            </div>
          </ViewerSidebarSection>
        </aside>
      </div>
    </div>
  )
}

function readMutationError(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    if ("data" in error && error.data && typeof error.data === "object") {
      const errorBody = error.data as { error?: { message?: string } }
      const message = errorBody.error?.message

      if (message) {
        return message
      }
    }

    if ("message" in error && typeof error.message === "string") {
      return error.message
    }
  }

  return fallback
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitMultilineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function ViewerSidebarSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="border-t border-white/8 py-4 first:border-t-0 first:pt-0">
      <div className="mb-3 text-sm font-semibold text-white">{title}</div>
      {children}
    </section>
  )
}

function TogglePill({
  active,
  label,
  onToggle,
}: {
  active: boolean
  label: string
  onToggle: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-xl border px-3 py-2 text-sm transition",
        active ? "border-cyan-400 bg-cyan-500/10 text-white" : "border-white/10 text-white/60",
      )}
      onClick={() => onToggle(!active)}
    >
      {label}
    </button>
  )
}

function ToggleRow({
  active,
  label,
  onToggle,
}: {
  active: boolean
  label: string
  onToggle: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl border border-white/8 px-3 py-2 text-sm"
      onClick={() => onToggle(!active)}
    >
      <span>{label}</span>
      <span
        className={cn(
          "inline-flex h-6 w-11 items-center rounded-full p-1 transition",
          active ? "bg-cyan-500/80" : "bg-white/12",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white transition",
            active ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  )
}

function ReferenceCard({
  active,
  asset,
  index,
  onSelect,
}: {
  active: boolean
  asset: ZoneModalityAsset
  index: number
  onSelect: () => void
}) {
  const labels = ["Sagittal", "Coronal", "3D"]

  return (
    <button
      type="button"
      className={cn(
        "w-full overflow-hidden rounded-[1.35rem] border text-left transition",
        active ? "border-cyan-400/70 bg-cyan-500/8" : "border-white/8 bg-black/20",
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
  )
}

function StructureDrawer({
  darkMode,
  relatedAssets,
  selectedAnnotation,
  selectedStructure,
  onJumpToAsset,
}: {
  darkMode: boolean
  relatedAssets: Array<{ annotation: ViewerAnnotation; asset: ZoneModalityAsset }>
  selectedAnnotation: ViewerAnnotation | null
  selectedStructure: ViewerStructure
  onJumpToAsset: (assetId: string) => void
}) {
  const isLocked = selectedStructure.accessLevel === "subscription"

  return (
    <div
      className={cn(
        "rounded-[1.5rem] border p-4",
        darkMode ? "border-white/8 bg-white/[0.04]" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">{selectedStructure.title}</div>
          {selectedStructure.latinName ? (
            <div className="mt-1 text-sm text-cyan-300">{selectedStructure.latinName}</div>
          ) : null}
        </div>
        <Badge variant={isLocked ? "outline" : "secondary"}>
          {isLocked ? "Subscription" : "Free"}
        </Badge>
      </div>

      {selectedStructure.shortDescription ? (
        <p className="mt-4 text-sm leading-6 text-white/75">
          {selectedStructure.shortDescription}
        </p>
      ) : null}

      {isLocked ? (
        <div className="mt-4 rounded-2xl border border-lime-400/40 bg-lime-400/8 p-4 text-sm">
          Full detailed explanation is gated in student mode. The admin preview keeps the
          access state visible so premium structures can be reviewed before publish.
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
          <div className="text-xs uppercase tracking-[0.2em] text-white/40">Learning points</div>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {selectedStructure.learningPoints.map((point) => (
              <li key={point} className="rounded-xl border border-white/8 px-3 py-2">
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
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-white/40">In this module</div>
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
                  className="aspect-[4/3] w-full object-cover"
                  decoding="async"
                  fetchPriority="low"
                  loading="lazy"
                  src={asset.thumbnailUrl || asset.imageUrl}
                />
                <div className="px-3 py-2 text-xs text-white/72">{asset.label}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ViewerCanvas({
  annotationForm,
  canvasMode,
  currentAsset,
  currentAssetIndex,
  darkMode,
  fontScaleMode,
  hoveredAnnotationId,
  overlayOpacity,
  overlayRef,
  pinsOnly,
  pointAnimation,
  practiceMode,
  selectedAnnotationId,
  isCurrentImageLoaded,
  showLoadingIndicator,
  showCrossReferences,
  showOrientation,
  showLabels,
  stageRef,
  structuresById,
  visibleAnnotations,
  onAnnotationHover,
  onAnnotationSelect,
  onCanvasClick,
  onCanvasDoubleClick,
  onCurrentImageLoad,
  onWheelNavigate,
}: {
  annotationForm: AnnotationFormState
  canvasMode: ViewerCanvasMode
  currentAsset: ZoneModalityAsset | null
  currentAssetIndex: number
  darkMode: boolean
  fontScaleMode: FontScaleMode
  hoveredAnnotationId: string | null
  overlayOpacity: number
  overlayRef: MutableRefObject<SVGSVGElement | null>
  pinsOnly: boolean
  pointAnimation: boolean
  practiceMode: boolean
  selectedAnnotationId: string | null
  isCurrentImageLoaded: boolean
  showLoadingIndicator: boolean
  showCrossReferences: boolean
  showOrientation: boolean
  showLabels: boolean
  stageRef: MutableRefObject<HTMLDivElement | null>
  structuresById: Map<string, ViewerStructure>
  visibleAnnotations: ViewerAnnotation[]
  onAnnotationHover: (annotationId: string | null) => void
  onAnnotationSelect: (annotationId: string, structureId: string) => void
  onCanvasClick: (point: ViewerAnnotationPoint) => void
  onCanvasDoubleClick: () => void
  onCurrentImageLoad: () => void
  onWheelNavigate: (deltaY: number) => void
}) {
  if (!currentAsset) {
    return (
      <div className="flex min-h-[40rem] items-center justify-center rounded-[1.75rem] border border-dashed border-white/10 bg-black/20 text-white/60">
        This modality does not have any derived slices yet.
      </div>
    )
  }

  const overlayPreview =
    canvasMode !== "browse" ? annotationForm.polygonPoints.map(pointToPercentPair).join(" ") : null
  const previewImageUrl =
    currentAsset.thumbnailUrl && currentAsset.thumbnailUrl !== currentAsset.imageUrl
      ? currentAsset.thumbnailUrl
      : null

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.85rem] border",
        darkMode ? "border-white/8 bg-black" : "border-slate-200 bg-white",
      )}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-4 text-sm">
        <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2">
          {showOrientation ? "Brain - MRI (Axial)" : "Viewer"}
        </div>
        <div className="rounded-full border border-white/10 bg-black/35 px-4 py-2">
          Slice {currentAssetIndex + 1}
        </div>
      </div>

      <div
        ref={stageRef}
        className="flex min-h-[40rem] items-center justify-center p-8"
        onDoubleClick={onCanvasDoubleClick}
        onWheel={(event) => {
          event.preventDefault()
          onWheelNavigate(event.deltaY)
        }}
      >
        <div className="relative inline-block max-h-[78vh] max-w-full">
          {previewImageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                aria-hidden="true"
                className="block max-h-[78vh] max-w-full"
                decoding="async"
                fetchPriority="high"
                loading="eager"
                src={previewImageUrl}
              />
            </>
          ) : null}
          {showLoadingIndicator ? (
            <div className="absolute right-3 top-3 z-20 flex items-center rounded-full border border-white/12 bg-black/60 px-3 py-1.5 text-xs text-white/75 shadow-lg">
              <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
              Loading slice...
            </div>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={currentAsset.id}
            alt={currentAsset.label}
            className={cn(
              previewImageUrl
                ? "absolute inset-0 h-full w-full object-contain transition-opacity duration-100"
                : "block max-h-[78vh] max-w-full transition-opacity duration-100",
              isCurrentImageLoaded ? "opacity-100" : "opacity-0",
            )}
            decoding="async"
            fetchPriority="high"
            loading="eager"
            src={currentAsset.imageUrl}
            onLoad={onCurrentImageLoad}
          />
          <svg
            ref={overlayRef}
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1000 1000"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onCanvasClick({
                x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
                y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
              })
            }}
          >
            {visibleAnnotations.map((annotation) => {
              const structure = structuresById.get(annotation.structureId)
              if (!structure) {
                return null
              }

              const isSelected = annotation.id === selectedAnnotationId
              const isHovered = annotation.id === hoveredAnnotationId
              const color = annotation.colorHex || DEFAULT_ANNOTATION_COLOR
              const label = annotation.titleOverride || structure.title
              const textVisible =
                showLabels && !pinsOnly && (!practiceMode || isSelected || isHovered)
              const fontSize = fontScaleMode === "large" ? 24 : 18

              return (
                <g
                  key={annotation.id}
                  onMouseEnter={() => onAnnotationHover(annotation.id)}
                  onMouseLeave={() => onAnnotationHover(null)}
                  onClick={(event) => {
                    event.stopPropagation()
                    onAnnotationSelect(annotation.id, annotation.structureId)
                  }}
                >
                  {annotation.polygonPoints.length >= 3 ? (
                    <polygon
                      fill={annotation.overlayColorHex || color}
                      fillOpacity={annotation.overlayOpacity * overlayOpacity}
                      points={annotation.polygonPoints.map(pointToSvgPair).join(" ")}
                      stroke={annotation.overlayColorHex || color}
                      strokeOpacity={0.9}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                  ) : null}
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
              )
            })}
            {overlayPreview ? (
              <polygon
                fill={annotationForm.overlayColorHex}
                fillOpacity={annotationForm.overlayOpacity * overlayOpacity * 0.45}
                points={overlayPreview}
                stroke={annotationForm.overlayColorHex}
                strokeDasharray="8 6"
                strokeWidth={2}
              />
            ) : null}
            {showCrossReferences ? (
              <>
                <line stroke="rgba(56,189,248,0.88)" strokeWidth={2} x1={500} x2={500} y1={0} y2={1000} />
                <line stroke="rgba(56,189,248,0.88)" strokeWidth={2} x1={0} x2={1000} y1={500} y2={500} />
              </>
            ) : null}
          </svg>
        </div>
      </div>

      {canvasMode !== "browse" ? (
        <div className="absolute bottom-4 left-4 rounded-full border border-cyan-400/45 bg-black/55 px-4 py-2 text-sm text-cyan-200">
          {canvasMode === "create-label" && "Click in the image to place a new label."}
          {canvasMode === "set-anchor" && "Click in the image to move the anchor."}
          {canvasMode === "set-label" && "Click in the image to move the label text."}
          {canvasMode === "draw-region" &&
            "Click to add polygon points. Double-click anywhere on the image to save."}
        </div>
      ) : null}

      {pointAnimation ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_60%)]" />
      ) : null}
    </div>
  )
}

function formatWeightingLabel(value: string) {
  switch (value) {
    case "all":
      return "All"
    case "t1_gado":
      return "T1 Gado"
    case "t2_star":
      return "T2*"
    default:
      return value.toUpperCase()
  }
}

function structureMatchesSearch(structure: ViewerStructure, query: string) {
  return [structure.title, structure.latinName ?? "", structure.shortDescription ?? "", ...structure.synonyms]
    .join(" ")
    .toLowerCase()
    .includes(query)
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function buildStackWarmupOrder(assets: ZoneModalityAsset[], centerIndex: number) {
  if (assets.length === 0) {
    return []
  }

  const safeCenterIndex = clamp(centerIndex, 0, assets.length - 1)
  const orderedIndices = [safeCenterIndex]

  for (let offset = 1; orderedIndices.length < assets.length; offset += 1) {
    const nextIndex = safeCenterIndex + offset
    const previousIndex = safeCenterIndex - offset

    if (nextIndex < assets.length) {
      orderedIndices.push(nextIndex)
    }

    if (previousIndex >= 0) {
      orderedIndices.push(previousIndex)
    }
  }

  return orderedIndices.map((index) => assets[index]!).filter(Boolean)
}

function createDefaultLabelX(anchorX: number) {
  return anchorX < 0.55 ? clamp(anchorX + 0.24, 0.08, 0.92) : clamp(anchorX - 0.24, 0.08, 0.92)
}

function pointToSvgPair(point: ViewerAnnotationPoint) {
  return `${point.x * 1000},${point.y * 1000}`
}

function pointToPercentPair(point: ViewerAnnotationPoint) {
  return pointToSvgPair(point)
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
  annotations: ViewerAnnotation[]
  asset: ZoneModalityAsset
  groupsById: Map<string, ViewerStructureGroup>
  overlayOpacity: number
  pinsOnly: boolean
  practiceMode: boolean
  selectedStructureId: string | null
  showLabels: boolean
  structuresById: Map<string, ViewerStructure>
}) {
  const image = await loadImage(asset.imageUrl)
  const canvas = document.createElement("canvas")
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Canvas context unavailable")
  }

  context.drawImage(image, 0, 0)

  for (const annotation of annotations) {
    const structure = structuresById.get(annotation.structureId)
    if (!structure) {
      continue
    }

    const group = structure.groupId ? groupsById.get(structure.groupId) : null
    const color = annotation.colorHex || group?.colorHex || DEFAULT_ANNOTATION_COLOR
    const overlayColor = annotation.overlayColorHex || color
    const leaderColor = annotation.leaderColorHex || color

    if (annotation.polygonPoints.length >= 3) {
      context.save()
      context.fillStyle = applyAlpha(overlayColor, annotation.overlayOpacity * overlayOpacity)
      context.strokeStyle = overlayColor
      context.lineWidth = 2
      context.beginPath()
      annotation.polygonPoints.forEach((point, index) => {
        const x = point.x * canvas.width
        const y = point.y * canvas.height
        if (index === 0) {
          context.moveTo(x, y)
        } else {
          context.lineTo(x, y)
        }
      })
      context.closePath()
      context.fill()
      context.stroke()
      context.restore()
    }

    context.save()
    context.strokeStyle = leaderColor
    context.fillStyle = color
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(annotation.anchorX * canvas.width, annotation.anchorY * canvas.height)
    context.lineTo(annotation.labelX * canvas.width, annotation.labelY * canvas.height)
    context.stroke()
    context.beginPath()
    context.arc(annotation.anchorX * canvas.width, annotation.anchorY * canvas.height, 6, 0, Math.PI * 2)
    context.fill()

    if (showLabels && !pinsOnly && (!practiceMode || selectedStructureId === structure.id)) {
      context.font = "24px system-ui"
      context.fillText(
        annotation.titleOverride || structure.title,
        annotation.labelX * canvas.width,
        annotation.labelY * canvas.height,
      )
    }
    context.restore()
  }

  return canvas.toDataURL("image/png")
}

function applyAlpha(color: string, alpha: number) {
  const normalized = color.replace("#", "")
  if (normalized.length !== 6) {
    return color
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}
