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
  EMPTY_ANNOTATION_FORM,
  type AnnotationFormState,
  type FontScaleMode,
  type ViewerCanvasMode,
} from "../modality-viewer.types";
import { clamp } from "./utils";
import { ViewerCanvasAutoArrangedLabelOverlay } from "./viewer-canvas/auto-arranged-label-overlay";
import {
  AREA_MASK_RESOLUTION,
  type ArrangedLabel,
  LABEL_BOX_MAX_WIDTH,
  LABEL_BOX_MIN_WIDTH,
  LABEL_BOX_PADDING_X,
  LABEL_ROW_GAP_LARGE_PX,
  LABEL_ROW_GAP_PX,
  LABEL_SAFE_MAX_Y,
  LABEL_SAFE_MIN_Y,
  MAIN_LABEL_BAND_MIN_GAP_PX,
  MAIN_LABEL_BAND_WIDTH_PX,
  MAIN_LABEL_BASE_OFFSET_PX,
  MAIN_LABEL_OFFSET_MAX_PX,
  MAIN_LABEL_OFFSET_MIN_PX,
  MAX_AREA_RADIUS,
  MAX_AREA_STROKE_STEP,
  MAX_ZOOM_SCALE,
  MIN_AREA_RADIUS,
  MIN_AREA_STROKE_STEP,
  MIN_ZOOM_SCALE,
  type LabelSide,
  distributeLabelRows,
  extractPolygonsFromMask,
} from "./viewer-canvas/helpers";
import { ViewerCanvasMainOverlay } from "./viewer-canvas/main-overlay";

export type MainInteractionTool = "layers" | "pan" | "zoom";
export type AreaEditTool = "brush" | "erase";

const AREA_MASK_PREVIEW_OPACITY_MULTIPLIER = 1;

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
  currentAtlasFrame: ZoneModalityAtlasFrame | null;
  currentImageElement: HTMLImageElement | null;
  darkMode: boolean;
  draftStructureTitle: string;
  fontScaleMode: FontScaleMode;
  hoveredAnnotationId: string | null;
  ingestFailureMessage: string | null;
  isIngesting: boolean;
  isPreparingInitialAsset: boolean;
  mainInteractionTool: MainInteractionTool;
  onAnnotationHover: (annotationId: string | null) => void;
  onAnnotationSelect: (annotationId: string, structureId: string) => void;
  onCanvasClick: (point: ViewerAnnotationPoint) => void;
  onCanvasDoubleClick: () => void;
  onDraftAnchorMove: (point: ViewerAnnotationPoint) => void;
  onDraftDisconnectedPolygonsChange: (
    polygons: ViewerAnnotationPoint[][],
  ) => void;
  onDraftLabelMove: (point: ViewerAnnotationPoint) => void;
  onDraftPolygonPointMove: (
    index: number,
    point: ViewerAnnotationPoint,
  ) => void;
  onDraftPolygonReplace: (points: ViewerAnnotationPoint[]) => void;
  onLayerScrubNavigate: (nextIndex: number) => void;
  onWheelNavigate: (deltaY: number) => void;
  overlayOpacity: number;
  overlayRef: MutableRefObject<SVGSVGElement | null>;
  pinsOnly: boolean;
  pointAnimation: boolean;
  practiceMode: boolean;
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
  currentAtlasFrame,
  currentImageElement,
  darkMode,
  draftStructureTitle,
  fontScaleMode,
  hoveredAnnotationId,
  ingestFailureMessage,
  isIngesting,
  isPreparingInitialAsset,
  mainInteractionTool,
  onAnnotationHover,
  onAnnotationSelect,
  onCanvasClick,
  onCanvasDoubleClick,
  onDraftAnchorMove,
  onDraftDisconnectedPolygonsChange,
  onDraftLabelMove,
  onDraftPolygonPointMove,
  onDraftPolygonReplace,
  onLayerScrubNavigate,
  onWheelNavigate,
  overlayOpacity,
  overlayRef,
  pinsOnly,
  pointAnimation,
  practiceMode,
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
  const draggingLabelRef = useRef<string | null>(null);
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
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const [areaToolCursorPoint, setAreaToolCursorPoint] =
    useState<ViewerAnnotationPoint | null>(null);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState(1);
  const areaMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const areaMaskContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const pendingMaskPreviewFrameRef = useRef<number | null>(null);
  const skipMaskSyncRef = useRef(false);
  const [isAreaBrushActive, setIsAreaBrushActive] = useState(false);
  const [mainStageAnchors, setMainStageAnchors] = useState<
    Map<string, ViewerAnnotationPoint>
  >(() => new Map());
  const [stageSizePx, setStageSizePx] = useState({ width: 1, height: 1 });
  const [measureLabelTextWidth, setMeasureLabelTextWidth] =
    useState<LabelTextWidthMeasurer>(
      () => (text: string, fontSize: number) =>
        Math.ceil(text.length * fontSize * 0.6),
    );

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
        measurementContext.font = `${fontWeight} ${fontSize}px system-ui`;

        return Math.ceil(measurementContext.measureText(text).width);
      },
    );
  }, []);

  const measureLabelRectWidth = useCallback(
    (text: string, fontSize: number, fontWeight: 500 | 700) => {
      return clamp(
        LABEL_BOX_MIN_WIDTH,
        Math.ceil(
          measureLabelTextWidth(text, fontSize, fontWeight) +
            LABEL_BOX_PADDING_X * 2,
        ),
        LABEL_BOX_MAX_WIDTH,
      );
    },
    [measureLabelTextWidth],
  );

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
    (text: string, fontSize: number, fontWeight: 500 | 700) => {
      const maxTextWidth = LABEL_BOX_MAX_WIDTH - LABEL_BOX_PADDING_X * 2;
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
    [measureLabelTextWidth],
  );

  const clampTextXForLabelBox = useCallback(
    (
      textX: number,
      textAnchor: "start" | "end",
      labelRectWidth: number,
      viewportWidth: number,
    ) => {
      if (textAnchor === "start") {
        return clamp(
          textX,
          LABEL_BOX_PADDING_X,
          viewportWidth - (labelRectWidth - LABEL_BOX_PADDING_X),
        );
      }

      return clamp(
        textX,
        labelRectWidth - LABEL_BOX_PADDING_X,
        viewportWidth - LABEL_BOX_PADDING_X,
      );
    },
    [],
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

  const draftPointerMovedFromDefault =
    Math.abs(annotationForm.anchorX - EMPTY_ANNOTATION_FORM.anchorX) > 0.0005 ||
    Math.abs(annotationForm.anchorY - EMPTY_ANNOTATION_FORM.anchorY) > 0.0005 ||
    Math.abs(annotationForm.labelX - EMPTY_ANNOTATION_FORM.labelX) > 0.0005 ||
    Math.abs(annotationForm.labelY - EMPTY_ANNOTATION_FORM.labelY) > 0.0005;
  const showDraftPointer =
    annotationEditingEnabled &&
    !selectedAnnotationId &&
    !isAreaPaintMode &&
    draftPointerMovedFromDefault;
  const draftPointerColor =
    annotationForm.colorHex.trim() || DEFAULT_ANNOTATION_COLOR;
  const draftPointerLabel = draftStructureTitle.trim() || "Draft";
  const normalizedCanvasRotation = ((canvasRotationQuarterTurns % 4) + 4) % 4;
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

    previewContext.clearRect(
      0,
      0,
      AREA_MASK_RESOLUTION,
      AREA_MASK_RESOLUTION,
    );

    const areaMaskCanvas = areaMaskCanvasRef.current;

    if (canvasMode !== "draw-region" || !areaMaskCanvas) {
      return;
    }

    previewContext.save();
    previewContext.drawImage(areaMaskCanvas, 0, 0);
    previewContext.globalCompositeOperation = "source-in";
    previewContext.globalAlpha = clamp(
      annotationForm.overlayOpacity *
        overlayOpacity *
        AREA_MASK_PREVIEW_OPACITY_MULTIPLIER,
      0,
      0.92,
    );
    previewContext.fillStyle =
      annotationForm.overlayColorHex.trim() ||
      annotationForm.colorHex.trim() ||
      DEFAULT_ANNOTATION_COLOR;
    previewContext.fillRect(
      0,
      0,
      AREA_MASK_RESOLUTION,
      AREA_MASK_RESOLUTION,
    );
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

  const refreshMainStageAnchors = useCallback(() => {
    const stageElement = stageRef.current;
    const overlayElement = overlayRef.current;

    if (!stageElement || !overlayElement) {
      setMainStageAnchors((previous) =>
        previous.size === 0 ? previous : new Map(),
      );
      return;
    }

    const stageRect = stageElement.getBoundingClientRect();
    const stageWidth = Math.max(stageRect.width, 1);
    const stageHeight = Math.max(stageRect.height, 1);

    setStageSizePx((previous) =>
      previous.width === stageWidth && previous.height === stageHeight
        ? previous
        : {
            width: stageWidth,
            height: stageHeight,
          },
    );

    if (visibleAnnotations.length === 0) {
      setMainStageAnchors((previous) =>
        previous.size === 0 ? previous : new Map(),
      );
      return;
    }

    const screenMatrix = overlayElement.getScreenCTM();

    if (!screenMatrix || stageRect.width <= 0 || stageRect.height <= 0) {
      return;
    }

    const svgPoint = overlayElement.createSVGPoint();
    const projectedAnchors = new Map<string, ViewerAnnotationPoint>();

    for (const annotation of visibleAnnotations) {
      const isSelected = annotation.id === selectedAnnotationId;
      const anchorX = isSelected ? annotationForm.anchorX : annotation.anchorX;
      const anchorY = isSelected ? annotationForm.anchorY : annotation.anchorY;

      svgPoint.x = anchorX * 1000;
      svgPoint.y = anchorY * 1000;

      const projectedPoint = svgPoint.matrixTransform(screenMatrix);

      projectedAnchors.set(annotation.id, {
        x: clamp(
          projectedPoint.x - stageRect.left,
          -stageWidth * 0.5,
          stageWidth * 1.5,
        ),
        y: clamp(
          projectedPoint.y - stageRect.top,
          -stageHeight * 0.5,
          stageHeight * 1.5,
        ),
      });
    }

    setMainStageAnchors(projectedAnchors);
  }, [
    annotationForm.anchorX,
    annotationForm.anchorY,
    overlayRef,
    selectedAnnotationId,
    stageRef,
    visibleAnnotations,
  ]);

  useLayoutEffect(() => {
    const frameHandle = window.requestAnimationFrame(() => {
      refreshMainStageAnchors();
    });

    return () => {
      window.cancelAnimationFrame(frameHandle);
    };
  }, [
    canvasFlipHorizontal,
    canvasFlipVertical,
    currentAsset?.id,
    normalizedCanvasRotation,
    panOffset.x,
    panOffset.y,
    refreshMainStageAnchors,
    zoomScale,
  ]);

  useLayoutEffect(() => {
    const stageElement = stageRef.current;

    if (!stageElement) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      refreshMainStageAnchors();
    });

    resizeObserver.observe(stageElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [refreshMainStageAnchors, stageRef]);

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

    const width =
      currentAtlasFrame?.width ??
      currentAsset?.width ??
      currentImageElement.naturalWidth ??
      currentImageElement.width;
    const height =
      currentAtlasFrame?.height ??
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
    currentAsset?.width,
    currentImageElement,
  ]);

  const shouldAutoArrangeLabels =
    showLabels && !pinsOnly && canvasMode === "browse";
  const labelLayout = useMemo(() => {
    const labels = new Map<string, ArrangedLabel>();

    if (!shouldAutoArrangeLabels || visibleAnnotations.length === 0) {
      return {
        labels,
      };
    }

    const stageWidth = Math.max(stageSizePx.width, 1);
    const stageHeight = Math.max(stageSizePx.height, 1);
    const minRowGap =
      fontScaleMode === "large" ? LABEL_ROW_GAP_LARGE_PX : LABEL_ROW_GAP_PX;
    const safeMinY = stageHeight * LABEL_SAFE_MIN_Y;
    const safeMaxY = stageHeight * LABEL_SAFE_MAX_Y;
    const sideBandWidth = Math.min(
      MAIN_LABEL_BAND_WIDTH_PX,
      Math.max(stageWidth / 2 - MAIN_LABEL_BAND_MIN_GAP_PX, 120),
    );
    const bySide: Record<
      LabelSide,
      Array<{ anchorX: number; anchorY: number; id: string }>
    > = {
      left: [],
      right: [],
    };

    for (const annotation of visibleAnnotations) {
      const projectedAnchor = mainStageAnchors.get(annotation.id);
      if (!projectedAnchor) {
        continue;
      }

      const anchorX = clamp(projectedAnchor.x, 0, stageWidth);
      const anchorY = clamp(projectedAnchor.y, 0, stageHeight);

      const isVisibleOnStage =
        projectedAnchor.x >= 0 &&
        projectedAnchor.x <= stageWidth &&
        projectedAnchor.y >= 0 &&
        projectedAnchor.y <= stageHeight;

      if (!isVisibleOnStage) {
        continue;
      }

      const side: LabelSide = anchorX >= stageWidth / 2 ? "right" : "left";

      bySide[side].push({
        anchorX,
        anchorY,
        id: annotation.id,
      });
    }

    for (const side of ["left", "right"] as const) {
      const sideItems = bySide[side].sort(
        (left, right) => left.anchorY - right.anchorY,
      );

      if (sideItems.length === 0) {
        continue;
      }

      const textAnchor = side === "right" ? "start" : "end";
      const availableBand = Math.max(safeMaxY - safeMinY, minRowGap);
      const effectiveGap =
        sideItems.length > 1
          ? Math.min(minRowGap, availableBand / (sideItems.length - 1))
          : minRowGap;
      const distributedRows = distributeLabelRows(
        sideItems.map((item) => item.anchorY),
        safeMinY,
        safeMaxY,
        effectiveGap,
      );

      sideItems.forEach((item, index) => {
        const rowY = distributedRows[index] ?? item.anchorY;
        const labelOffset = clamp(
          MAIN_LABEL_BASE_OFFSET_PX +
            Math.abs(item.anchorX - stageWidth / 2) * 0.12,
          MAIN_LABEL_OFFSET_MIN_PX,
          MAIN_LABEL_OFFSET_MAX_PX,
        );
        const textX =
          side === "right"
            ? clamp(
                item.anchorX + labelOffset,
                stageWidth - sideBandWidth + LABEL_BOX_PADDING_X,
                stageWidth - LABEL_BOX_PADDING_X,
              )
            : clamp(
                item.anchorX - labelOffset,
                LABEL_BOX_PADDING_X,
                sideBandWidth - LABEL_BOX_PADDING_X,
              );

        labels.set(item.id, {
          anchorX: item.anchorX,
          anchorY: item.anchorY,
          side,
          textAnchor,
          textX,
          y: rowY,
        });
      });
    }

    return {
      labels,
    };
  }, [
    fontScaleMode,
    stageSizePx.height,
    stageSizePx.width,
    shouldAutoArrangeLabels,
    mainStageAnchors,
    visibleAnnotations,
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
        "relative overflow-hidden",
        darkMode ? "bg-black" : "bg-white",
      )}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center px-6 py-4 text-sm">
        {showOrientation ? viewerTitle : "Viewer"}
      </div>

      <div
        ref={stageRef}
        className={cn(
          "relative flex min-h-160 h-full select-none items-center justify-center p-8",
          isAreaPaintMode ? "touch-none" : null,
        )}
        style={isAreaPaintMode ? { touchAction: "none" } : undefined}
        onDoubleClick={(event) => {
          if (isAreaPaintMode) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          onCanvasDoubleClick();
        }}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerEnd}
        onPointerCancel={handleStagePointerEnd}
      >
        <div
          className="relative inline-block max-w-full"
          style={{
            transform: canvasSurfaceTransform,
            transformOrigin: "center center",
          }}
        >
          <canvas
            ref={canvasRef}
            aria-label={currentAsset.label}
            className="block max-h-[84vh] w-[min(82vh,82vw)] max-w-full object-contain"
            draggable={false}
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
              "absolute inset-0 h-full w-full",
              isAreaPaintMode ? "cursor-none touch-none" : null,
            )}
            style={isAreaPaintMode ? { touchAction: "none" } : undefined}
            viewBox="0 0 1000 1000"
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

              if (draggingLabelRef.current) {
                onDraftLabelMove(pointerPoint);
                return;
              }

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
              if (draggingLabelRef.current) {
                draggingLabelRef.current = null;
                setDraggingLabelId(null);

                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }

                return;
              }

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
              draggingLabelRef.current = null;
              setDraggingLabelId(null);
              setAreaToolCursorPoint(null);
              if (isAreaPaintMode && wasBrushing) {
                event.preventDefault();
                event.stopPropagation();
                commitAreaMaskToPolygon();
              }
            }}
            onPointerLeave={() => {
              const wasBrushing = brushingRef.current;

              draggingLabelRef.current = null;
              draggingAnchorRef.current = null;
              draggingPolygonPointRef.current = null;
              setDraggingLabelId(null);

              if (isAreaPaintMode && wasBrushing) {
                brushingRef.current = false;
                lastBrushPointRef.current = null;
                commitAreaMaskToPolygon();
                setIsAreaBrushActive(false);
              }

              setAreaToolCursorPoint(null);
            }}
          >
            <ViewerCanvasMainOverlay
              activeAreaCursorRadius={activeAreaCursorRadius}
              annotationEditingEnabled={annotationEditingEnabled}
              annotationForm={annotationForm}
              areaEditTool={areaEditTool}
              areaToolCursorPoint={areaToolCursorPoint}
              canvasMode={canvasMode}
              clampTextXForLabelBox={clampTextXForLabelBox}
              disconnectedOverlayColor={disconnectedOverlayColor}
              draftDisconnectedPolygons={draftDisconnectedPolygons}
              draftPointerColor={draftPointerColor}
              draftPointerLabel={draftPointerLabel}
              draggingAnchorRef={draggingAnchorRef}
              draggingLabelId={draggingLabelId}
              draggingLabelRef={draggingLabelRef}
              editLockEnabled={editLockEnabled}
              fitLabelText={fitLabelText}
              fontScaleMode={fontScaleMode}
              hoveredAnnotationId={hoveredAnnotationId}
              areaPaintPreviewActive={isAreaBrushActive}
              isAreaPaintMode={isAreaPaintMode}
              measureLabelRectWidth={measureLabelRectWidth}
              onAnnotationHover={onAnnotationHover}
              onAnnotationSelect={onAnnotationSelect}
              onDraftAnchorMove={onDraftAnchorMove}
              onDraftLabelMove={onDraftLabelMove}
              overlayOpacity={overlayOpacity}
              pinsOnly={pinsOnly}
              practiceMode={practiceMode}
              resolvePointerPoint={resolvePointerPoint}
              selectedAnnotationId={selectedAnnotationId}
              setDraggingLabelId={setDraggingLabelId}
              shouldAutoArrangeLabels={shouldAutoArrangeLabels}
              showCrossReferences={showCrossReferences}
              showDraftPointer={showDraftPointer}
              showLabels={showLabels}
              structuresById={structuresById}
              visibleAnnotations={visibleAnnotations}
            />
          </svg>
        </div>

        {shouldAutoArrangeLabels ? (
          <ViewerCanvasAutoArrangedLabelOverlay
            annotationForm={annotationForm}
            clampTextXForLabelBox={clampTextXForLabelBox}
            draggingLabelId={draggingLabelId}
            editLockEnabled={editLockEnabled}
            fitLabelText={fitLabelText}
            fontScaleMode={fontScaleMode}
            hoveredAnnotationId={hoveredAnnotationId}
            labelLayout={labelLayout}
            measureLabelRectWidth={measureLabelRectWidth}
            onAnnotationHover={onAnnotationHover}
            onAnnotationSelect={onAnnotationSelect}
            pinsOnly={pinsOnly}
            practiceMode={practiceMode}
            selectedAnnotationId={selectedAnnotationId}
            showLabels={showLabels}
            stageSizePx={stageSizePx}
            structuresById={structuresById}
            visibleAnnotations={visibleAnnotations}
          />
        ) : null}
      </div>

      {pointAnimation ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_60%)]" />
      ) : null}
    </div>
  );
}
