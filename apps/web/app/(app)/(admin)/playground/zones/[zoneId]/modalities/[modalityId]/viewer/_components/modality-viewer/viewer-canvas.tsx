import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

import Loader from "@/components/ui/loader";
import type {
  ZoneModalityAtlasFrame,
  ViewerAnnotation,
  ViewerAnnotationPoint,
  ViewerStructure,
  ZoneModalityAsset,
} from "@/lib/playground/types";
import { cn } from "@/lib/utils";

import {
  DEFAULT_ANNOTATION_COLOR,
  type AnnotationFormState,
  type ViewerCanvasMode,
} from "../modality-viewer.types";
import { clamp } from "./utils";
import {
  findRegionInteriorAnchor,
  getAnnotationDisplayAnchor,
  layoutAnnotationLabels,
  type AnnotationLabelCandidate,
  type PlacedAnnotationLabel,
} from "./viewer-canvas/annotation-layout";
import { AnnotationNoteCard } from "./viewer-canvas/annotation-note-card";
import { ViewerCanvasAutoArrangedLabelOverlay } from "./viewer-canvas/auto-arranged-label-overlay";
import { DraftAutoArrangedLabelOverlay } from "./viewer-canvas/draft-auto-arranged-label-overlay";
import {
  AREA_MASK_RESOLUTION,
  MAX_AREA_RADIUS,
  MAX_AREA_STROKE_STEP,
  MAX_ZOOM_SCALE,
  MIN_AREA_RADIUS,
  MIN_AREA_STROKE_STEP,
  MIN_ZOOM_SCALE,
  calculateViewerLayout,
  extractPolygonsFromMask,
  resolveViewerImageDimensions,
} from "./viewer-canvas/helpers";
import { ViewerCanvasMainOverlay } from "./viewer-canvas/main-overlay";
import { ViewerRegionOverlayCanvas } from "./viewer-canvas/region-overlay-canvas";

export type MainInteractionTool = "layers" | "pan" | "zoom";
export type AreaEditTool = "brush" | "erase";

type LabelTextWidthMeasurer = (
  text: string,
  fontSize: number,
  fontWeight: 500 | 700,
) => number;

type ViewerCanvasProps = {
  annotationEditingEnabled: boolean;
  areaBrushSize: number;
  areaEditTool: AreaEditTool;
  areaEraserSize: number;
  annotationForm: AnnotationFormState;
  canvasFlipHorizontal: boolean;
  canvasFlipVertical: boolean;
  canvasMode: ViewerCanvasMode;
  canvasRotationQuarterTurns: number;
  currentAsset: ZoneModalityAsset | null;
  currentAssetIndex: number;
  compact?: boolean;
  lockInitialFitScale?: boolean;
  crosshairPoint?: ViewerAnnotationPoint | null;
  crosshairStroke?: string;
  currentAtlasFrame: ZoneModalityAtlasFrame | null;
  currentImageElement: HTMLImageElement | null;
  draftStructureTitle: string;
  draftPointerPlaced: boolean;
  editorMode: boolean;
  hoveredAnnotationId: string | null;
  ingestFailureMessage: string | null;
  isIngesting: boolean;
  isPreparingInitialAsset: boolean;
  mainInteractionTool: MainInteractionTool;
  onAnnotationHover: (annotationId: string | null) => void;
  onViewportDoubleClick?: () => void;
  onAnnotationSelect: (annotationId: string, structureId: string) => void;
  onCanvasClick: (point: ViewerAnnotationPoint) => void;
  onDraftAnchorMove: (point: ViewerAnnotationPoint) => void;
  onDraftDisconnectedPolygonsChange: (
    polygons: ViewerAnnotationPoint[][],
  ) => void;
  onDraftPolygonPointMove: (
    index: number,
    point: ViewerAnnotationPoint,
  ) => void;
  onDraftPolygonReplace: (points: ViewerAnnotationPoint[]) => void;
  onLayerScrubNavigate: (nextIndex: number) => void;
  onWheelNavigate: (deltaY: number) => void;
  overlayOpacity: number;
  overlayRef: MutableRefObject<SVGSVGElement | null>;
  selectedAnnotationId: string | null;
  showCrossReferences: boolean;
  showLabels: boolean;
  showOrientation: boolean;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  structuresById: Map<string, ViewerStructure>;
  totalSliceCount: number;
  viewerTitle: string;
  visibleAnnotations: ViewerAnnotation[];
  draftDisconnectedPolygons: ViewerAnnotationPoint[][];
};

export function ViewerCanvas({
  annotationEditingEnabled,
  areaBrushSize,
  areaEditTool,
  areaEraserSize,
  annotationForm,
  canvasFlipHorizontal,
  canvasFlipVertical,
  canvasMode,
  canvasRotationQuarterTurns,
  currentAsset,
  currentAssetIndex,
  compact = false,
  lockInitialFitScale = true,
  crosshairPoint = null,
  crosshairStroke = "rgba(56, 189, 248, 0.9)",
  currentAtlasFrame,
  currentImageElement,
  draftStructureTitle,
  draftPointerPlaced,
  editorMode,
  hoveredAnnotationId,
  ingestFailureMessage,
  isIngesting,
  isPreparingInitialAsset,
  mainInteractionTool,
  onAnnotationHover,
  onViewportDoubleClick,
  onAnnotationSelect,
  onCanvasClick,
  onDraftAnchorMove,
  onDraftDisconnectedPolygonsChange,
  onDraftPolygonPointMove,
  onDraftPolygonReplace,
  onLayerScrubNavigate,
  onWheelNavigate,
  overlayOpacity,
  overlayRef,
  selectedAnnotationId,
  showCrossReferences,
  showLabels,
  showOrientation,
  stageRef,
  structuresById,
  totalSliceCount,
  viewerTitle,
  visibleAnnotations,
  draftDisconnectedPolygons,
}: ViewerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const areaMaskPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const brushingRef = useRef(false);
  const lastBrushPointRef = useRef<ViewerAnnotationPoint | null>(null);
  const draggingAnchorRef = useRef<{
    annotationId: string;
    pointerId: number;
  } | null>(null);
  const draggingPolygonPointRef = useRef<{
    annotationId: string;
    pointIndex: number;
    pointerId: number;
  } | null>(null);
  const layerScrubDragRef = useRef<{
    pointerId: number;
    startIndex: number;
    startY: number;
  } | null>(null);
  const layerScrubFrameRef = useRef<number | null>(null);
  const layerScrubQueuedIndexRef = useRef<number | null>(null);
  const panDragRef = useRef<{
    pointerId: number;
    startPanX: number;
    startPanY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const zoomDragRef = useRef<{
    pointerId: number;
    startScale: number;
    startY: number;
  } | null>(null);
  const [areaToolCursorPoint, setAreaToolCursorPoint] =
    useState<ViewerAnnotationPoint | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState(1);
  const areaMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const areaMaskContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const pendingMaskPreviewFrameRef = useRef<number | null>(null);
  const skipMaskSyncRef = useRef(false);
  const [isAreaBrushActive, setIsAreaBrushActive] = useState(false);
  const hoverClearTimerRef = useRef<number | null>(null);
  const popupHideTimerRef = useRef<number | null>(null);
  const popupShowFrameRef = useRef<number | null>(null);
  const [popupRenderId, setPopupRenderId] = useState<string | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [stageSizePx, setStageSizePx] = useState({ width: 0, height: 0 });
  const initialFitScaleCapRef = useRef<number | null>(null);
  const [measureLabelTextWidth, setMeasureLabelTextWidth] =
    useState<LabelTextWidthMeasurer>(
      () => (text: string, fontSize: number) =>
        Math.ceil(text.length * fontSize * 0.6),
    );
  const normalizedCanvasRotation = ((canvasRotationQuarterTurns % 4) + 4) % 4;
  const shouldAutoArrangeLabels =
    showLabels && (!compact || visibleAnnotations.length > 0);
  const sourceDimensions = resolveViewerImageDimensions([
    {
      height: currentAtlasFrame?.height,
      width: currentAtlasFrame?.width,
    },
    {
      height: currentImageElement?.naturalHeight,
      width: currentImageElement?.naturalWidth,
    },
    {
      height: currentAsset?.height,
      width: currentAsset?.width,
    },
    {
      height: currentImageElement?.height,
      width: currentImageElement?.width,
    },
  ]) ?? { height: 1, width: 1 };
  const sourceImageHeight = sourceDimensions.height;
  const sourceImageWidth = sourceDimensions.width;
  const uncappedViewerLayout = useMemo(
    () =>
      calculateViewerLayout({
        imageHeight: sourceImageHeight,
        imageWidth: sourceImageWidth,
        reserveLabelSpace: shouldAutoArrangeLabels,
        rotationQuarterTurns: normalizedCanvasRotation,
        stageHeight: Math.max(stageSizePx.height, 1),
        stageWidth: Math.max(stageSizePx.width, 1),
      }),
    [
      normalizedCanvasRotation,
      shouldAutoArrangeLabels,
      sourceImageHeight,
      sourceImageWidth,
      stageSizePx.height,
      stageSizePx.width,
    ],
  );

  const viewerLayout = useMemo(
    () =>
      calculateViewerLayout({
        fitScaleCap: lockInitialFitScale ? initialFitScaleCapRef.current : null,
        imageHeight: sourceImageHeight,
        imageWidth: sourceImageWidth,
        reserveLabelSpace: shouldAutoArrangeLabels,
        rotationQuarterTurns: normalizedCanvasRotation,
        stageHeight: Math.max(stageSizePx.height, 1),
        stageWidth: Math.max(stageSizePx.width, 1),
      }),
    [
      lockInitialFitScale,
      normalizedCanvasRotation,
      shouldAutoArrangeLabels,
      sourceImageHeight,
      sourceImageWidth,
      stageSizePx.height,
      stageSizePx.width,
    ],
  );

  // Lock the first settled desktop/mobile fit as the maximum automatic image
  // scale. This runs after the parent has applied its responsive side-panel
  // defaults, so later opening/closing those panels does not look like zooming.
  useEffect(() => {
    if (
      !lockInitialFitScale ||
      initialFitScaleCapRef.current !== null ||
      stageSizePx.width < 240 ||
      stageSizePx.height < 240 ||
      sourceImageWidth <= 1 ||
      sourceImageHeight <= 1
    ) {
      return;
    }

    initialFitScaleCapRef.current =
      uncappedViewerLayout.surfaceWidth / sourceImageWidth;
  }, [
    lockInitialFitScale,
    sourceImageHeight,
    sourceImageWidth,
    stageSizePx.height,
    stageSizePx.width,
    uncappedViewerLayout.surfaceWidth,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const measurementCanvas = document.createElement("canvas");
    const measurementContext = measurementCanvas.getContext("2d");

    if (!measurementContext) {
      return;
    }

    // The measurer is initialized once after mount so server and client start
    // from the same fallback widths and avoid hydration drift.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeasureLabelTextWidth(
      () => (text: string, fontSize: number, fontWeight: 500 | 700) => {
        measurementContext.font = `${fontWeight} ${fontSize}px 'Helvetica Neue', Helvetica, Arial, sans-serif`;

        return Math.ceil(measurementContext.measureText(text).width);
      },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (
        typeof window !== "undefined" &&
        layerScrubFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(layerScrubFrameRef.current);
      }
    };
  }, []);

  const fitLabelText = useCallback(
    (
      text: string,
      fontSize: number,
      fontWeight: 500 | 700,
      requestedMaxWidth?: number,
    ) => {
      const maxTextWidth = Math.max(
        24,
        requestedMaxWidth ??
          viewerLayout.labelBoxMaxWidth - viewerLayout.labelBoxPaddingX * 2,
      );
      const normalized = text.trim();

      if (!normalized) {
        return normalized;
      }

      const fullWidth = measureLabelTextWidth(normalized, fontSize, fontWeight);
      if (fullWidth <= maxTextWidth) {
        return normalized;
      }

      const ellipsis = "...";
      const ellipsisWidth = measureLabelTextWidth(
        ellipsis,
        fontSize,
        fontWeight,
      );

      if (ellipsisWidth >= maxTextWidth) {
        return ellipsis;
      }

      let low = 1;
      let high = normalized.length;
      let best = ellipsis;

      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = `${normalized.slice(0, middle)}${ellipsis}`;
        const candidateWidth = measureLabelTextWidth(
          candidate,
          fontSize,
          fontWeight,
        );

        if (candidateWidth <= maxTextWidth) {
          best = candidate;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }

      return best;
    },
    [measureLabelTextWidth, viewerLayout],
  );

  const activeAreaToolSize =
    areaEditTool === "erase" ? areaEraserSize : areaBrushSize;
  const activeAreaStrokeStep = clamp(
    (activeAreaToolSize / 1000) * 0.5,
    MIN_AREA_STROKE_STEP,
    MAX_AREA_STROKE_STEP,
  );
  const activeAreaCursorRadius = clamp(
    activeAreaToolSize / 1000,
    MIN_AREA_RADIUS,
    MAX_AREA_RADIUS,
  );
  const isAreaPaintMode = canvasMode === "draw-region";
  const editLockEnabled = canvasMode !== "browse";

  const showDraftPointer =
    annotationEditingEnabled &&
    !selectedAnnotationId &&
    !isAreaPaintMode &&
    draftPointerPlaced;
  const draftDisplayAnchor = useMemo<ViewerAnnotationPoint | null>(() => {
    if (!annotationEditingEnabled || selectedAnnotationId) {
      return null;
    }

    if (annotationForm.polygonPoints.length >= 3) {
      return findRegionInteriorAnchor(annotationForm.polygonPoints);
    }

    if (draftPointerPlaced) {
      return { x: annotationForm.anchorX, y: annotationForm.anchorY };
    }

    return null;
  }, [
    annotationEditingEnabled,
    annotationForm.anchorX,
    annotationForm.anchorY,
    annotationForm.polygonPoints,
    draftPointerPlaced,
    selectedAnnotationId,
  ]);
  const draftPointerColor =
    annotationForm.colorHex.trim() || DEFAULT_ANNOTATION_COLOR;
  const draftLabelColor =
    (annotationForm.polygonPoints.length >= 3
      ? annotationForm.overlayColorHex.trim() || annotationForm.colorHex.trim()
      : annotationForm.colorHex.trim()) || DEFAULT_ANNOTATION_COLOR;
  const draftLabelText = draftStructureTitle.trim() || "Draft";
  const canvasSurfaceTransform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale}) rotate(${normalizedCanvasRotation * 90}deg) scaleX(${canvasFlipHorizontal ? -1 : 1}) scaleY(${canvasFlipVertical ? -1 : 1})`;

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

  const ensureAreaMaskContext = useCallback(() => {
    if (!areaMaskCanvasRef.current) {
      const areaMaskCanvas = document.createElement("canvas");
      areaMaskCanvas.width = AREA_MASK_RESOLUTION;
      areaMaskCanvas.height = AREA_MASK_RESOLUTION;
      areaMaskCanvasRef.current = areaMaskCanvas;
      areaMaskContextRef.current = areaMaskCanvas.getContext("2d", {
        willReadFrequently: true,
      });
    }

    return areaMaskContextRef.current;
  }, []);

  const renderAreaMaskPreview = useCallback(() => {
    const previewCanvas = areaMaskPreviewCanvasRef.current;

    if (!previewCanvas) {
      return;
    }

    if (previewCanvas.width !== AREA_MASK_RESOLUTION) {
      previewCanvas.width = AREA_MASK_RESOLUTION;
    }

    if (previewCanvas.height !== AREA_MASK_RESOLUTION) {
      previewCanvas.height = AREA_MASK_RESOLUTION;
    }

    const previewContext = previewCanvas.getContext("2d");

    if (!previewContext) {
      return;
    }

    previewContext.clearRect(0, 0, AREA_MASK_RESOLUTION, AREA_MASK_RESOLUTION);

    const areaMaskCanvas = areaMaskCanvasRef.current;

    if (canvasMode !== "draw-region" || !areaMaskCanvas) {
      return;
    }

    previewContext.save();
    previewContext.drawImage(areaMaskCanvas, 0, 0);
    previewContext.globalCompositeOperation = "source-in";
    previewContext.globalAlpha = clamp(
      annotationForm.overlayOpacity * overlayOpacity,
      0,
      0.92,
    );
    previewContext.fillStyle =
      annotationForm.overlayColorHex.trim() ||
      annotationForm.colorHex.trim() ||
      DEFAULT_ANNOTATION_COLOR;
    previewContext.fillRect(0, 0, AREA_MASK_RESOLUTION, AREA_MASK_RESOLUTION);
    previewContext.restore();
  }, [
    annotationForm.colorHex,
    annotationForm.overlayColorHex,
    annotationForm.overlayOpacity,
    canvasMode,
    overlayOpacity,
  ]);

  const scheduleAreaMaskPreview = useCallback(() => {
    if (pendingMaskPreviewFrameRef.current !== null) {
      return;
    }

    pendingMaskPreviewFrameRef.current = window.requestAnimationFrame(() => {
      pendingMaskPreviewFrameRef.current = null;
      renderAreaMaskPreview();
    });
  }, [renderAreaMaskPreview]);

  const syncAreaMaskFromPolygons = useCallback(
    (polygons: ViewerAnnotationPoint[][]) => {
      const areaMaskContext = ensureAreaMaskContext();

      if (!areaMaskContext) {
        return;
      }

      areaMaskContext.clearRect(
        0,
        0,
        AREA_MASK_RESOLUTION,
        AREA_MASK_RESOLUTION,
      );

      areaMaskContext.fillStyle = "#ffffff";

      for (const polygonPoints of polygons) {
        if (polygonPoints.length < 3) {
          continue;
        }

        areaMaskContext.beginPath();
        areaMaskContext.moveTo(
          polygonPoints[0]!.x * AREA_MASK_RESOLUTION,
          polygonPoints[0]!.y * AREA_MASK_RESOLUTION,
        );

        for (let index = 1; index < polygonPoints.length; index += 1) {
          const polygonPoint = polygonPoints[index]!;

          areaMaskContext.lineTo(
            polygonPoint.x * AREA_MASK_RESOLUTION,
            polygonPoint.y * AREA_MASK_RESOLUTION,
          );
        }

        areaMaskContext.closePath();
        areaMaskContext.fill();
      }
    },
    [ensureAreaMaskContext],
  );

  const commitAreaMaskToPolygon = useCallback(() => {
    const areaMaskContext = ensureAreaMaskContext();

    if (!areaMaskContext) {
      return;
    }

    const imageData = areaMaskContext.getImageData(
      0,
      0,
      AREA_MASK_RESOLUTION,
      AREA_MASK_RESOLUTION,
    );
    const nextPolygons = extractPolygonsFromMask(
      imageData.data,
      AREA_MASK_RESOLUTION,
      AREA_MASK_RESOLUTION,
    );
    const nextPrimaryPolygon = nextPolygons[0] ?? [];
    const nextDisconnectedPolygons = nextPolygons.slice(1);

    skipMaskSyncRef.current = true;
    onDraftPolygonReplace(nextPrimaryPolygon);
    onDraftDisconnectedPolygonsChange(nextDisconnectedPolygons);
  }, [
    ensureAreaMaskContext,
    onDraftDisconnectedPolygonsChange,
    onDraftPolygonReplace,
  ]);

  const stampAreaMaskAtPoint = useCallback(
    (point: ViewerAnnotationPoint) => {
      const areaMaskContext = ensureAreaMaskContext();

      if (!areaMaskContext) {
        return;
      }

      const brushRadiusPixels = activeAreaCursorRadius * AREA_MASK_RESOLUTION;

      areaMaskContext.save();
      areaMaskContext.globalCompositeOperation =
        areaEditTool === "erase" ? "destination-out" : "source-over";
      areaMaskContext.fillStyle = "#ffffff";
      areaMaskContext.beginPath();
      areaMaskContext.arc(
        point.x * AREA_MASK_RESOLUTION,
        point.y * AREA_MASK_RESOLUTION,
        Math.max(brushRadiusPixels, 1),
        0,
        Math.PI * 2,
      );
      areaMaskContext.fill();
      areaMaskContext.restore();

      scheduleAreaMaskPreview();
    },
    [
      activeAreaCursorRadius,
      areaEditTool,
      ensureAreaMaskContext,
      scheduleAreaMaskPreview,
    ],
  );

  const annotationDisplayAnchors = useMemo(() => {
    const anchors = new Map<string, ViewerAnnotationPoint>();

    for (const annotation of visibleAnnotations) {
      const isSelected = annotation.id === selectedAnnotationId;
      const polygonPoints = isSelected
        ? annotationForm.polygonPoints
        : annotation.polygonPoints;
      const anchorOverride = isSelected
        ? { x: annotationForm.anchorX, y: annotationForm.anchorY }
        : { x: annotation.anchorX, y: annotation.anchorY };

      anchors.set(
        annotation.id,
        getAnnotationDisplayAnchor(annotation, polygonPoints, anchorOverride),
      );
    }

    return anchors;
  }, [
    annotationForm.anchorX,
    annotationForm.anchorY,
    annotationForm.polygonPoints,
    selectedAnnotationId,
    visibleAnnotations,
  ]);

  const projectDisplayAnchorToStage = useCallback(
    (displayAnchor: ViewerAnnotationPoint): ViewerAnnotationPoint => {
      const stageWidth = Math.max(stageSizePx.width, 1);
      const stageHeight = Math.max(stageSizePx.height, 1);
      let deltaX =
        (displayAnchor.x - 0.5) * viewerLayout.surfaceWidth *
        (canvasFlipHorizontal ? -1 : 1);
      let deltaY =
        (displayAnchor.y - 0.5) * viewerLayout.surfaceHeight *
        (canvasFlipVertical ? -1 : 1);

      switch (normalizedCanvasRotation) {
        case 1:
          [deltaX, deltaY] = [-deltaY, deltaX];
          break;
        case 2:
          [deltaX, deltaY] = [-deltaX, -deltaY];
          break;
        case 3:
          [deltaX, deltaY] = [deltaY, -deltaX];
          break;
        default:
          break;
      }

      return {
        x: stageWidth / 2 + panOffset.x + deltaX * zoomScale,
        y: stageHeight / 2 + panOffset.y + deltaY * zoomScale,
      };
    },
    [
      canvasFlipHorizontal,
      canvasFlipVertical,
      normalizedCanvasRotation,
      panOffset.x,
      panOffset.y,
      stageSizePx.height,
      stageSizePx.width,
      viewerLayout.surfaceHeight,
      viewerLayout.surfaceWidth,
      zoomScale,
    ],
  );

  // Measure synchronously in a layout effect. The previous implementation
  // deferred this work to requestAnimationFrame, which allowed one browser
  // paint with a 1x1 stage and caused the scan/labels to visibly jump from the
  // center to their real positions.
  useLayoutEffect(() => {
    const stageElement = stageRef.current;

    if (!stageElement) {
      return;
    }

    const measure = () => {
      const rect = stageElement.getBoundingClientRect();
      const width = Math.max(rect.width, 0);
      const height = Math.max(rect.height, 0);

      setStageSizePx((previous) =>
        Math.abs(previous.width - width) < 0.5 &&
        Math.abs(previous.height - height) < 0.5
          ? previous
          : { width, height },
      );
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(stageElement);

    return () => {
      resizeObserver.disconnect();
    };
    // The stage element is not rendered while there is no current asset. The
    // first version of the synchronous measurement change only depended on the
    // ref object, so the effect ran once while stageRef.current was null and
    // never ran again when the first slice became available. That left
    // stageSizePx at 0x0 and the image surface permanently hidden. Re-run when
    // the active asset changes so a newly mounted stage is measured before
    // paint, while ResizeObserver continues to cover panel/layout changes.
  }, [currentAsset?.id, stageRef]);

  useLayoutEffect(() => {
    if (canvasMode !== "draw-region") {
      renderAreaMaskPreview();
      return;
    }

    if (skipMaskSyncRef.current) {
      skipMaskSyncRef.current = false;
      return;
    }

    syncAreaMaskFromPolygons([
      annotationForm.polygonPoints,
      ...draftDisconnectedPolygons,
    ]);
    renderAreaMaskPreview();
  }, [
    draftDisconnectedPolygons,
    annotationForm.polygonPoints,
    canvasMode,
    renderAreaMaskPreview,
    selectedAnnotationId,
    syncAreaMaskFromPolygons,
  ]);

  useLayoutEffect(() => {
    return () => {
      if (pendingMaskPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingMaskPreviewFrameRef.current);
        pendingMaskPreviewFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const stageElement = stageRef.current;

    if (!stageElement) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      onWheelNavigate(event.deltaY);
    };

    stageElement.addEventListener("wheel", handleWheel, {
      passive: false,
    });

    return () => {
      stageElement.removeEventListener("wheel", handleWheel);
    };
  }, [onWheelNavigate, stageRef]);

  useEffect(() => {
    const stageElement = stageRef.current;

    if (!stageElement) {
      return;
    }

    const preventViewerTouchScroll = (event: TouchEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
    };

    stageElement.addEventListener("touchmove", preventViewerTouchScroll, {
      passive: false,
    });

    return () => {
      stageElement.removeEventListener("touchmove", preventViewerTouchScroll);
    };
  }, [stageRef]);

  const commitBrushPoint = useCallback(
    (point: ViewerAnnotationPoint, force = false) => {
      const applyStrokePoint = (strokePoint: ViewerAnnotationPoint) => {
        stampAreaMaskAtPoint(strokePoint);
      };

      const previousPoint = lastBrushPointRef.current;

      if (!previousPoint) {
        lastBrushPointRef.current = point;
        applyStrokePoint(point);
        return;
      }

      const deltaX = point.x - previousPoint.x;
      const deltaY = point.y - previousPoint.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (!force && distance < activeAreaStrokeStep) {
        return;
      }

      const segments = Math.max(1, Math.ceil(distance / activeAreaStrokeStep));

      for (let segmentIndex = 1; segmentIndex <= segments; segmentIndex += 1) {
        const factor = segmentIndex / segments;
        const interpolatedPoint = {
          x: clamp(previousPoint.x + deltaX * factor, 0, 1),
          y: clamp(previousPoint.y + deltaY * factor, 0, 1),
        };

        lastBrushPointRef.current = interpolatedPoint;
        applyStrokePoint(interpolatedPoint);
      }
    },
    [activeAreaStrokeStep, stampAreaMaskAtPoint],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !currentImageElement) {
      return;
    }

    const height = sourceImageHeight;
    const width = sourceImageWidth;
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
    if (currentAtlasFrame) {
      context.drawImage(
        currentImageElement,
        currentAtlasFrame.x,
        currentAtlasFrame.y,
        currentAtlasFrame.width,
        currentAtlasFrame.height,
        0,
        0,
        width,
        height,
      );
      return;
    }

    context.drawImage(currentImageElement, 0, 0, width, height);
  }, [
    currentAtlasFrame,
    currentAsset?.height,
    currentAsset?.id,
    currentImageElement,
    sourceImageHeight,
    sourceImageWidth,
  ]);

  const labelLayout = useMemo(() => {
    const labels = new Map<string, PlacedAnnotationLabel>();

    if (
      !shouldAutoArrangeLabels ||
      stageSizePx.width < 2 ||
      stageSizePx.height < 2 ||
      (visibleAnnotations.length === 0 && !draftDisplayAnchor)
    ) {
      return { labels };
    }

    const stageWidth = Math.max(stageSizePx.width, 1);
    const stageHeight = Math.max(stageSizePx.height, 1);
    const candidates: AnnotationLabelCandidate[] = [];

    for (const annotation of visibleAnnotations) {
      const structure = structuresById.get(annotation.structureId);
      const displayAnchor = annotationDisplayAnchors.get(annotation.id);

      if (!structure || !displayAnchor) {
        continue;
      }

      const projectedAnchor = projectDisplayAnchorToStage(displayAnchor);

      if (
        projectedAnchor.x < 0 ||
        projectedAnchor.x > stageWidth ||
        projectedAnchor.y < 0 ||
        projectedAnchor.y > stageHeight
      ) {
        continue;
      }

      const isSelected = annotation.id === selectedAnnotationId;
      const isRegion = (
        isSelected ? annotationForm.polygonPoints : annotation.polygonPoints
      ).length >= 3;
      const color =
        (isSelected
          ? isRegion
            ? annotationForm.overlayColorHex.trim() ||
              annotationForm.colorHex.trim() ||
              annotation.overlayColorHex ||
              annotation.colorHex ||
              structure.colorHex
            : annotationForm.colorHex.trim() ||
              annotation.colorHex ||
              structure.colorHex
          : isRegion
            ? annotation.overlayColorHex ||
              annotation.colorHex ||
              structure.colorHex
            : annotation.colorHex || structure.colorHex) ||
        DEFAULT_ANNOTATION_COLOR;

      candidates.push({
        anchorX: projectedAnchor.x,
        anchorY: projectedAnchor.y,
        color,
        id: annotation.id,
        label: annotation.titleOverride || structure.title,
        priority:
          (isSelected ? 1_000_000 : 0) +
          (isRegion ? 10_000 : 0) +
          Math.max(0, 5_000 - annotation.sortOrder),
        side: "auto",
      });
    }

    const projectedDraftAnchor = draftDisplayAnchor
      ? projectDisplayAnchorToStage(draftDisplayAnchor)
      : null;
    if (draftDisplayAnchor && projectedDraftAnchor) {
      candidates.push({
        anchorX: projectedDraftAnchor.x,
        anchorY: projectedDraftAnchor.y,
        color: draftLabelColor,
        id: "__draft__",
        label: draftLabelText,
        priority: 2_000_000,
        side: "auto",
      });
    }

    for (const placed of layoutAnnotationLabels(
      candidates,
      stageWidth,
      stageHeight,
    )) {
      labels.set(placed.id, placed);
    }

    return { labels };
  }, [
    annotationForm.colorHex,
    annotationForm.overlayColorHex,
    annotationForm.polygonPoints,
    draftDisplayAnchor,
    draftLabelColor,
    draftLabelText,
    annotationDisplayAnchors,
    projectDisplayAnchorToStage,
    selectedAnnotationId,
    shouldAutoArrangeLabels,
    stageSizePx.height,
    stageSizePx.width,
    structuresById,
    visibleAnnotations,
  ]);

  const draftPlacedLabel = labelLayout.labels.get("__draft__") ?? null;

  const handleAnnotationHover = useCallback(
    (annotationId: string | null) => {
      if (typeof window !== "undefined" && hoverClearTimerRef.current !== null) {
        window.clearTimeout(hoverClearTimerRef.current);
        hoverClearTimerRef.current = null;
      }

      if (annotationId) {
        onAnnotationHover(annotationId);
        return;
      }

      if (typeof window === "undefined") {
        onAnnotationHover(null);
        return;
      }

      hoverClearTimerRef.current = window.setTimeout(() => {
        hoverClearTimerRef.current = null;
        onAnnotationHover(null);
      }, 260);
    },
    [onAnnotationHover],
  );

  const popupTargetId = editorMode
    ? null
    : selectedAnnotationId ?? hoveredAnnotationId;

  const popupTargetHasLabel = Boolean(
    popupTargetId && labelLayout.labels.has(popupTargetId),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (popupHideTimerRef.current !== null) {
      window.clearTimeout(popupHideTimerRef.current);
      popupHideTimerRef.current = null;
    }
    if (popupShowFrameRef.current !== null) {
      window.cancelAnimationFrame(popupShowFrameRef.current);
      popupShowFrameRef.current = null;
    }

    if (editorMode) {
      // Keep editor canvases popup-free without writing the same state on
      // every render. MPR renders three canvases simultaneously, so an
      // identity-changing label map must never be able to create an effect
      // -> setState -> render loop.
      setPopupVisible((current) => (current ? false : current));
      setPopupRenderId((current) => (current === null ? current : null));
      return;
    }

    if (popupTargetId && popupTargetHasLabel) {
      setPopupRenderId((current) =>
        current === popupTargetId ? current : popupTargetId,
      );
      popupShowFrameRef.current = window.requestAnimationFrame(() => {
        popupShowFrameRef.current = null;
        setPopupVisible((current) => (current ? current : true));
      });
      return;
    }

    setPopupVisible((current) => (current ? false : current));
    popupHideTimerRef.current = window.setTimeout(() => {
      popupHideTimerRef.current = null;
      setPopupRenderId((current) => (current === null ? current : null));
    }, 220);
  }, [editorMode, popupTargetHasLabel, popupTargetId]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") {
        return;
      }
      if (hoverClearTimerRef.current !== null) {
        window.clearTimeout(hoverClearTimerRef.current);
      }
      if (popupHideTimerRef.current !== null) {
        window.clearTimeout(popupHideTimerRef.current);
      }
      if (popupShowFrameRef.current !== null) {
        window.cancelAnimationFrame(popupShowFrameRef.current);
      }
    };
  }, []);

  const popupAnnotation = useMemo(
    () =>
      visibleAnnotations.find(
        (annotation) => annotation.id === popupRenderId,
      ) ?? null,
    [popupRenderId, visibleAnnotations],
  );
  const popupStructure = popupAnnotation
    ? structuresById.get(popupAnnotation.structureId) ?? null
    : null;
  const popupLabel = popupRenderId
    ? labelLayout.labels.get(popupRenderId) ?? null
    : null;

  if (!currentAsset) {
    if (isPreparingInitialAsset || isIngesting) {
      return (
        <div className="flex min-h-160 flex-col items-center justify-center bg-black/20 px-6 text-center text-white/70">
          <Loader />
        </div>
      );
    }

    if (ingestFailureMessage) {
      return (
        <div className="flex min-h-160 items-center justify-center bg-red-500/5 px-6 text-center text-red-100">
          <p className="max-w-lg text-sm leading-6">{ingestFailureMessage}</p>
        </div>
      );
    }

    return (
      <div className="flex min-h-160 items-center justify-center bg-black/20 text-white/60">
        This modality does not have any derived slices yet.
      </div>
    );
  }

  const disconnectedOverlayColor =
    annotationForm.overlayColorHex.trim() ||
    annotationForm.colorHex.trim() ||
    DEFAULT_ANNOTATION_COLOR;

  function clearMainInteractionDragState() {
    if (typeof window !== "undefined" && layerScrubFrameRef.current !== null) {
      window.cancelAnimationFrame(layerScrubFrameRef.current);
      layerScrubFrameRef.current = null;
    }

    layerScrubQueuedIndexRef.current = null;
    layerScrubDragRef.current = null;
    panDragRef.current = null;
    zoomDragRef.current = null;
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || canvasMode !== "browse") {
      return;
    }

    event.preventDefault();

    if (mainInteractionTool === "layers") {
      if (totalSliceCount <= 1) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      layerScrubDragRef.current = {
        pointerId: event.pointerId,
        startIndex: clamp(
          currentAssetIndex,
          0,
          Math.max(totalSliceCount - 1, 0),
        ),
        startY: event.clientY,
      };
      return;
    }

    if (mainInteractionTool === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId);
      panDragRef.current = {
        pointerId: event.pointerId,
        startPanX: panOffset.x,
        startPanY: panOffset.y,
        startX: event.clientX,
        startY: event.clientY,
      };
      return;
    }

    if (mainInteractionTool === "zoom") {
      event.currentTarget.setPointerCapture(event.pointerId);
      zoomDragRef.current = {
        pointerId: event.pointerId,
        startScale: zoomScale,
        startY: event.clientY,
      };
    }
  }

  function handleStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const layerDrag = layerScrubDragRef.current;
    if (layerDrag && layerDrag.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const stageHeight = Math.max(rect.height, 1);
      const deltaY = event.clientY - layerDrag.startY;
      const range = Math.max(totalSliceCount - 1, 0);
      const indexDelta = Math.round((deltaY / stageHeight) * range);
      const nextIndex = clamp(layerDrag.startIndex + indexDelta, 0, range);

      if (layerScrubQueuedIndexRef.current === nextIndex) {
        return;
      }

      layerScrubQueuedIndexRef.current = nextIndex;

      if (typeof window === "undefined") {
        onLayerScrubNavigate(nextIndex);
        return;
      }

      if (layerScrubFrameRef.current !== null) {
        return;
      }

      layerScrubFrameRef.current = window.requestAnimationFrame(() => {
        layerScrubFrameRef.current = null;
        const queuedIndex = layerScrubQueuedIndexRef.current;
        layerScrubQueuedIndexRef.current = null;

        if (queuedIndex === null || queuedIndex === currentAssetIndex) {
          return;
        }

        onLayerScrubNavigate(queuedIndex);
      });
      return;
    }

    const panDrag = panDragRef.current;
    if (panDrag && panDrag.pointerId === event.pointerId) {
      const deltaX = event.clientX - panDrag.startX;
      const deltaY = event.clientY - panDrag.startY;

      setPanOffset({
        x: panDrag.startPanX + deltaX,
        y: panDrag.startPanY + deltaY,
      });
      return;
    }

    const zoomDrag = zoomDragRef.current;
    if (zoomDrag && zoomDrag.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const stageHeight = Math.max(rect.height, 1);
      const deltaY = event.clientY - zoomDrag.startY;
      const zoomRange = MAX_ZOOM_SCALE - MIN_ZOOM_SCALE;
      const nextScale = clamp(
        zoomDrag.startScale - (deltaY / stageHeight) * zoomRange,
        MIN_ZOOM_SCALE,
        MAX_ZOOM_SCALE,
      );

      setZoomScale(nextScale);
    }
  }

  function handleStagePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      layerScrubDragRef.current?.pointerId !== event.pointerId &&
      panDragRef.current?.pointerId !== event.pointerId &&
      zoomDragRef.current?.pointerId !== event.pointerId
    ) {
      return;
    }

    if (
      layerScrubDragRef.current?.pointerId === event.pointerId &&
      layerScrubFrameRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.cancelAnimationFrame(layerScrubFrameRef.current);
      layerScrubFrameRef.current = null;
    }

    if (layerScrubDragRef.current?.pointerId === event.pointerId) {
      const queuedIndex = layerScrubQueuedIndexRef.current;
      layerScrubQueuedIndexRef.current = null;

      if (queuedIndex !== null && queuedIndex !== currentAssetIndex) {
        onLayerScrubNavigate(queuedIndex);
      }
    }

    clearMainInteractionDragState();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden overscroll-none bg-black",
        compact && "h-full min-h-0",
      )}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center px-6 py-4 text-sm">
        {showOrientation ? viewerTitle : "Viewer"}
      </div>

      <div
        ref={stageRef}
        className={cn(
          "relative flex h-full touch-none select-none items-center justify-center overscroll-none",
          compact ? "min-h-0" : "min-h-160",
          isAreaPaintMode ? "cursor-crosshair" : null,
        )}
        style={{ touchAction: "none" }}
        onDoubleClick={(event) => {
          if (isAreaPaintMode) {
            // Painting saves only from the explicit Save button. Double-clicks
            // are too easy to trigger while brushing and interrupt the stroke.
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          onViewportDoubleClick?.();
        }}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerEnd}
        onPointerCancel={handleStagePointerEnd}
      >
        <div
          className="relative shrink-0"
          style={{
            height: viewerLayout.surfaceHeight,
            transform: canvasSurfaceTransform,
            transformOrigin: "center center",
            visibility:
              stageSizePx.width >= 2 && stageSizePx.height >= 2
                ? "visible"
                : "hidden",
            width: viewerLayout.surfaceWidth,
          }}
        >
          <canvas
            ref={canvasRef}
            aria-label={currentAsset.label}
            className="block h-full w-full"
            draggable={false}
          />
          <ViewerRegionOverlayCanvas
            annotationForm={annotationForm}
            canvasMode={canvasMode}
            editorMode={editorMode}
            overlayOpacity={overlayOpacity}
            selectedAnnotationId={selectedAnnotationId}
            structuresById={structuresById}
            viewerLayout={viewerLayout}
            visibleAnnotations={visibleAnnotations}
          />
          <canvas
            ref={areaMaskPreviewCanvasRef}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 h-full w-full",
              isAreaPaintMode && isAreaBrushActive ? "block" : "hidden",
            )}
            height={AREA_MASK_RESOLUTION}
            width={AREA_MASK_RESOLUTION}
          />
          <svg
            ref={overlayRef}
            className={cn(
              "absolute inset-0 h-full w-full touch-none",
              isAreaPaintMode ? "cursor-none" : null,
              canvasMode === "set-anchor" ? "cursor-crosshair" : null,
            )}
            style={{ touchAction: "none" }}
            viewBox={`0 0 ${viewerLayout.coordinateWidth} ${viewerLayout.coordinateHeight}`}
            onDoubleClick={(event) => {
              if (!isAreaPaintMode) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              if (canvasMode === "draw-region") {
                event.preventDefault();
                event.stopPropagation();
                return;
              }

              onCanvasClick(resolvePointerPoint(event));
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }

              if (!isAreaPaintMode) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              const pointerPoint = resolvePointerPoint(event);
              setAreaToolCursorPoint(pointerPoint);
              brushingRef.current = true;
              setIsAreaBrushActive(true);
              event.currentTarget.setPointerCapture(event.pointerId);
              commitBrushPoint(pointerPoint, true);
            }}
            onPointerMove={(event) => {
              const pointerPoint = resolvePointerPoint(event);

              const draggingAnchor = draggingAnchorRef.current;
              if (
                draggingAnchor &&
                draggingAnchor.pointerId === event.pointerId
              ) {
                onDraftAnchorMove(pointerPoint);
                return;
              }

              const draggingPolygonPoint = draggingPolygonPointRef.current;
              if (
                draggingPolygonPoint &&
                draggingPolygonPoint.pointerId === event.pointerId
              ) {
                onDraftPolygonPointMove(
                  draggingPolygonPoint.pointIndex,
                  pointerPoint,
                );
                return;
              }

              if (!isAreaPaintMode) {
                setAreaToolCursorPoint(null);
                return;
              }

              event.preventDefault();
              setAreaToolCursorPoint(pointerPoint);

              if (!brushingRef.current) {
                return;
              }

              commitBrushPoint(pointerPoint);
            }}
            onPointerUp={(event) => {
              const draggingAnchor = draggingAnchorRef.current;
              if (
                draggingAnchor &&
                draggingAnchor.pointerId === event.pointerId
              ) {
                draggingAnchorRef.current = null;

                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }

                return;
              }

              const draggingPolygonPoint = draggingPolygonPointRef.current;
              if (
                draggingPolygonPoint &&
                draggingPolygonPoint.pointerId === event.pointerId
              ) {
                draggingPolygonPointRef.current = null;

                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }

                return;
              }

              if (!isAreaPaintMode) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();

              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }

              brushingRef.current = false;
              lastBrushPointRef.current = null;
              commitAreaMaskToPolygon();
              setIsAreaBrushActive(false);
            }}
            onPointerCancel={(event) => {
              const wasBrushing = brushingRef.current;

              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }

              brushingRef.current = false;
              lastBrushPointRef.current = null;
              setIsAreaBrushActive(false);
              draggingAnchorRef.current = null;
              draggingPolygonPointRef.current = null;
              setAreaToolCursorPoint(null);
              if (isAreaPaintMode && wasBrushing) {
                event.preventDefault();
                event.stopPropagation();
                commitAreaMaskToPolygon();
              }
            }}
            onPointerLeave={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
              }

              const wasBrushing = brushingRef.current;

              draggingAnchorRef.current = null;
              draggingPolygonPointRef.current = null;

              if (isAreaPaintMode && wasBrushing) {
                brushingRef.current = false;
                lastBrushPointRef.current = null;
                commitAreaMaskToPolygon();
                setIsAreaBrushActive(false);
              }

              setAreaToolCursorPoint(null);
            }}
          >
            {crosshairPoint ? (
              <g aria-hidden="true" className="pointer-events-none">
                <line
                  x1={crosshairPoint.x * viewerLayout.coordinateWidth}
                  x2={crosshairPoint.x * viewerLayout.coordinateWidth}
                  y1={0}
                  y2={viewerLayout.coordinateHeight}
                  stroke={crosshairStroke}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={0}
                  x2={viewerLayout.coordinateWidth}
                  y1={crosshairPoint.y * viewerLayout.coordinateHeight}
                  y2={crosshairPoint.y * viewerLayout.coordinateHeight}
                  stroke={crosshairStroke}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ) : null}

            <ViewerCanvasMainOverlay
              activeAreaCursorRadius={activeAreaCursorRadius}
              annotationEditingEnabled={annotationEditingEnabled}
              annotationForm={annotationForm}
              areaEditTool={areaEditTool}
              areaToolCursorPoint={areaToolCursorPoint}
              canvasMode={canvasMode}
              disconnectedOverlayColor={disconnectedOverlayColor}
              draftDisconnectedPolygons={draftDisconnectedPolygons}
              draftPointerColor={draftPointerColor}
              draggingAnchorRef={draggingAnchorRef}
              editLockEnabled={editLockEnabled}
              areaPaintPreviewActive={isAreaBrushActive}
              isAreaPaintMode={isAreaPaintMode}
              onAnnotationHover={handleAnnotationHover}
              onAnnotationSelect={onAnnotationSelect}
              onDraftAnchorMove={onDraftAnchorMove}
              overlayOpacity={overlayOpacity}
              resolvePointerPoint={resolvePointerPoint}
              selectedAnnotationId={selectedAnnotationId}
              showCrossReferences={showCrossReferences}
              showDraftPointer={showDraftPointer}
              structuresById={structuresById}
              viewerLayout={viewerLayout}
              visibleAnnotations={visibleAnnotations}
            />
          </svg>
        </div>

        {shouldAutoArrangeLabels ? (
          <ViewerCanvasAutoArrangedLabelOverlay
            annotationForm={annotationForm}
            editLockEnabled={editLockEnabled}
            editorMode={editorMode}
            fitLabelText={fitLabelText}
            labelLayout={labelLayout}
            onAnnotationHover={handleAnnotationHover}
            onAnnotationSelect={onAnnotationSelect}
            selectedAnnotationId={selectedAnnotationId}
            showLabels={showLabels}
            stageSizePx={stageSizePx}
            structuresById={structuresById}
            visibleAnnotations={visibleAnnotations}
          />
        ) : null}

        {showLabels ? (
          <DraftAutoArrangedLabelOverlay
            color={draftLabelColor}
            fitLabelText={fitLabelText}
            label={draftLabelText}
            placed={draftPlacedLabel}
            stageSizePx={stageSizePx}
          />
        ) : null}

        {!editorMode && popupAnnotation && popupStructure && popupLabel ? (
          <AnnotationNoteCard
            key={popupAnnotation.id}
            annotation={popupAnnotation}
            label={popupLabel}
            onHoverChange={(hovered) =>
              handleAnnotationHover(hovered ? popupAnnotation.id : null)
            }
            onSelect={() =>
              onAnnotationSelect(
                popupAnnotation.id,
                popupAnnotation.structureId,
              )
            }
            stageHeight={Math.max(stageSizePx.height, 1)}
            stageWidth={Math.max(stageSizePx.width, 1)}
            structure={popupStructure}
            visible={popupVisible}
          />
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_60%)]" />
    </div>
  );
}
