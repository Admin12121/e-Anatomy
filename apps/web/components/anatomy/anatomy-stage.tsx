"use client"

import {
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react"
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber"
import { Html, PerspectiveCamera, useGLTF } from "@react-three/drei"
import { easing } from "maath"
import {
  BufferAttribute,
  BufferGeometry,
  Box3,
  Color,
  DoubleSide,
  FrontSide,
  Group,
  InterleavedBufferAttribute,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  type EulerOrder,
  type Object3D,
  Vector3,
} from "three"

import { cn } from "@/lib/utils"

type AnatomyLayerId =
  | "body"
  | "skeleton"
  | "brain"
  | "lungs"
  | "heartKidney"
  | "digestive"

export type HighlightableLayerId = Exclude<AnatomyLayerId, "body" | "skeleton">

type MaterialProfile = {
  color: string
  opacity: number
}

type GradientAxis = "x" | "y" | "z"

type GradientPalette = {
  axis: GradientAxis
  start: string
  mid: string
  end: string
  pulseSpeed?: number
}

type AnatomyLayerConfig = {
  id: AnatomyLayerId
  label: string
  src: string
  renderOrder: number
  material: MaterialProfile
  highlightMaterial?: MaterialProfile
  transform?: {
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: number | [number, number, number]
  }
}

type HoverZoneConfig = {
  target: HighlightableLayerId
  priority: number
  position: [number, number, number]
  scale: [number, number, number]
}

type PointerTarget = {
  x: number
  y: number
}

type HoverZoneUserData = {
  hoverTarget?: HighlightableLayerId
  hoverPriority?: number
  hoverVolume?: number
}

type AnatomySceneProps = {
  focusLayer: HighlightableLayerId | null
  hoveredLayer: HighlightableLayerId | null
  onHoveredLayerChange: (layer: HighlightableLayerId | null) => void
  pointerTarget: MutableRefObject<PointerTarget>
  modelOffsetX: number
  previewLayer: HighlightableLayerId | null
  modelOffsetY: number
  targetModelHeight: number
}

type AnatomyAssemblyProps = AnatomySceneProps

type AnatomyLayerModelProps = {
  config: AnatomyLayerConfig
  highlighted: boolean
}

type GradientBufferSet = {
  attribute: BufferAttribute
  base: Float32Array
  highlight: Float32Array
  normalized: Float32Array
  pulse: Float32Array
}

type LayerRuntimeMaterial = MeshBasicMaterial
type GradientSourceAttribute = BufferAttribute | InterleavedBufferAttribute
type LayerRuntimeEntry = {
  gradientBuffer: GradientBufferSet | null
  material: LayerRuntimeMaterial
}

type AnatomyStageProps = {
  className?: string
  focusLayer?: HighlightableLayerId | null
  modelOffsetX?: number
  modelOffsetY?: number
  overlay?: (hoveredLayer: HighlightableLayerId | null) => ReactNode
  previewLayer?: HighlightableLayerId | null
  targetModelHeight?: number
}

const ANATOMY_LAYERS: readonly AnatomyLayerConfig[] = [
  {
    id: "body",
    label: "Body Shell",
    src: "/anatomy/body.glb",
    renderOrder: 1,
    material: {
      color: "#dfe3ff",
      opacity: 0.08,
    },
  },
  {
    id: "skeleton",
    label: "Skeleton",
    src: "/anatomy/skleton.glb",
    renderOrder: 2,
    material: {
      color: "#fff7ef",
      opacity: 0.16,
    },
  },
  {
    id: "brain",
    label: "Brain",
    src: "/anatomy/brain.glb",
    renderOrder: 3,
    material: {
      color: "#f1f1f7",
      opacity: 0.34,
    },
    highlightMaterial: {
      color: "#f22581",
      opacity: 0.68,
    },
    transform: {
      position: [-35000, -20679, 500848],
      rotation: [Math.PI / 2, MathUtils.degToRad(275), 0],
      scale: 24000,
    },
  },
  {
    id: "lungs",
    label: "Lungs",
    src: "/anatomy/lungs.glb",
    renderOrder: 4,
    material: {
      color: "#f1f0f4",
      opacity: 0.48,
    },
    highlightMaterial: {
      color: "#d78b70",
      opacity: 0.62,
    },
  },
  {
    id: "heartKidney",
    label: "Heart + Kidney",
    src: "/anatomy/heart-kidney.glb",
    renderOrder: 5,
    material: {
      color: "#f1eff3",
      opacity: 0.46,
    },
    highlightMaterial: {
      color: "#fa8396",
      opacity: 0.66,
    },
  },
  {
    id: "digestive",
    label: "Digestive",
    src: "/anatomy/digestive.glb",
    renderOrder: 6,
    material: {
      color: "#f3f1f5",
      opacity: 0.44,
    },
    highlightMaterial: {
      color: "#f25777",
      opacity: 0.64,
    },
  },
] as const

const HOVER_ZONES: readonly HoverZoneConfig[] = [
  {
    target: "brain",
    priority: 1,
    position: [0, 9000, 535000],
    scale: [145000, 145000, 145000],
  },
  {
    target: "lungs",
    priority: 3,
    position: [2000, -5000, 205000],
    scale: [290000, 180000, 230000],
  },
  {
    target: "heartKidney",
    priority: 0,
    position: [12000, -18000, 130000],
    scale: [130000, 125000, 125000],
  },
  {
    target: "digestive",
    priority: 1,
    position: [4000, -15000, 15000],
    scale: [220000, 160000, 260000],
  },
] as const

const CAMERA_POSITION: [number, number, number] = [0, 0, 20.5]
const CAMERA_FOV = 18
const MAX_ROTATION_RADIANS = MathUtils.degToRad(25)
const ROTATION_EULER_ORDER: EulerOrder = "XYZ"
const ROTATION_SMOOTH_TIME = 0.18
const BASE_MODEL_ROTATION_X = -Math.PI / 2
const DEFAULT_TARGET_MODEL_HEIGHT = 5.6
const FOCUS_VIEW_SMOOTH_TIME = 0.82

const FOCUS_PRESETS: Record<
  HighlightableLayerId,
  { modelOffsetX: number; modelOffsetY: number; targetModelHeight: number }
> = {
  brain: {
    modelOffsetX: 0,
    modelOffsetY: -7.95,
    targetModelHeight: 18.2,
  },
  digestive: {
    modelOffsetX: 0,
    modelOffsetY: -2.42,
    targetModelHeight: 11.05,
  },
  heartKidney: {
    modelOffsetX: 0.08,
    modelOffsetY: -3.12,
    targetModelHeight: 13,
  },
  lungs: {
    modelOffsetX: 0,
    modelOffsetY: -4.5,
    targetModelHeight: 13.95,
  },
}

const ORGAN_GRADIENTS: Record<
  HighlightableLayerId,
  {
    base: GradientPalette
    highlight: GradientPalette
    pulse: GradientPalette
  }
> = {
  brain: {
    base: {
      axis: "y",
      start: "#e3e5ec",
      mid: "#fcfcfe",
      end: "#d8dbe4",
      pulseSpeed: 1.9,
    },
    highlight: {
      axis: "y",
      start: "#7a1240",
      mid: "#ff2b89",
      end: "#ff8bc3",
      pulseSpeed: 1.9,
    },
    pulse: {
      axis: "y",
      start: "#5b0b2d",
      mid: "#ff0f6e",
      end: "#ff9dcb",
      pulseSpeed: 1.9,
    },
  },
  lungs: {
    base: {
      axis: "y",
      start: "#e5e7ec",
      mid: "#fcfcfe",
      end: "#dadde5",
      pulseSpeed: 1.6,
    },
    highlight: {
      axis: "y",
      start: "#6d1a43",
      mid: "#ff5c8b",
      end: "#ffb1d0",
      pulseSpeed: 1.6,
    },
    pulse: {
      axis: "y",
      start: "#581032",
      mid: "#ff2f69",
      end: "#ffc5dd",
      pulseSpeed: 1.6,
    },
  },
  heartKidney: {
    base: {
      axis: "y",
      start: "#e4e4e9",
      mid: "#fbfbfd",
      end: "#d8d7df",
      pulseSpeed: 1.55,
    },
    highlight: {
      axis: "y",
      start: "#621427",
      mid: "#ef365f",
      end: "#ff9f9b",
      pulseSpeed: 1.55,
    },
    pulse: {
      axis: "y",
      start: "#500d1e",
      mid: "#ff163d",
      end: "#ffb8b5",
      pulseSpeed: 1.55,
    },
  },
  digestive: {
    base: {
      axis: "y",
      start: "#e6e5ea",
      mid: "#fcfbfe",
      end: "#dad8e0",
      pulseSpeed: 1.4,
    },
    highlight: {
      axis: "y",
      start: "#9a4c52",
      mid: "#ff6a86",
      end: "#ffc4b5",
      pulseSpeed: 1.4,
    },
    pulse: {
      axis: "y",
      start: "#7f3840",
      mid: "#ff455e",
      end: "#ffd3c7",
      pulseSpeed: 1.4,
    },
  },
}

function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object && object.isMesh === true
}

function createLayerMaterial(
  profile: MaterialProfile,
  useVertexColors = false,
): LayerRuntimeMaterial {
  if (useVertexColors) {
    return new MeshBasicMaterial({
      color: "#ffffff",
      opacity: profile.opacity,
      side: FrontSide,
      transparent: true,
      depthWrite: true,
      toneMapped: false,
      vertexColors: true,
    })
  }

  return new MeshBasicMaterial({
    color: profile.color,
    opacity: profile.opacity,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
}

function isGradientSourceAttribute(
  attribute: unknown,
): attribute is GradientSourceAttribute {
  return (
    attribute instanceof BufferAttribute ||
    attribute instanceof InterleavedBufferAttribute
  )
}

function sampleGradientColor(
  palette: GradientPalette,
  normalizedValue: number,
  target = new Color(),
) {
  const start = new Color(palette.start)
  const mid = new Color(palette.mid)
  const end = new Color(palette.end)
  const clampedValue = MathUtils.clamp(normalizedValue, 0, 1)

  if (clampedValue <= 0.52) {
    target.copy(start).lerp(mid, clampedValue / 0.52)
    return target
  }

  target.copy(mid).lerp(end, (clampedValue - 0.52) / 0.48)
  return target
}

function createGradientBufferSet(
  geometry: BufferGeometry,
  paletteConfig: (typeof ORGAN_GRADIENTS)[HighlightableLayerId],
): GradientBufferSet | null {
  const positionAttribute = geometry.getAttribute("position")
  const normalAttribute = geometry.getAttribute("normal")

  if (!isGradientSourceAttribute(positionAttribute)) {
    return null
  }

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox

  if (!bounds) {
    return null
  }

  const rangeX = Math.max(1e-6, bounds.max.x - bounds.min.x)
  const rangeY = Math.max(1e-6, bounds.max.y - bounds.min.y)
  const rangeZ = Math.max(1e-6, bounds.max.z - bounds.min.z)
  const base = new Float32Array(positionAttribute.count * 3)
  const highlight = new Float32Array(positionAttribute.count * 3)
  const normalized = new Float32Array(positionAttribute.count)
  const pulse = new Float32Array(positionAttribute.count * 3)
  const sharedColor = new Color()
  const highlightLiftColor = new Color("#ffe2ee")

  for (let index = 0; index < positionAttribute.count; index += 1) {
    const positionX = positionAttribute.getX(index)
    const positionY = positionAttribute.getY(index)
    const positionZ = positionAttribute.getZ(index)
    const normalizedX = (positionX - bounds.min.x) / rangeX
    const normalizedY = (positionY - bounds.min.y) / rangeY
    const normalizedZ = (positionZ - bounds.min.z) / rangeZ
    const normalX =
      isGradientSourceAttribute(normalAttribute) ? normalAttribute.getX(index) : 0
    const normalY =
      isGradientSourceAttribute(normalAttribute) ? normalAttribute.getY(index) : 0
    const normalZ =
      isGradientSourceAttribute(normalAttribute) ? normalAttribute.getZ(index) : 0
    const primaryValue =
      paletteConfig.base.axis === "x"
        ? normalizedX
        : paletteConfig.base.axis === "y"
          ? normalizedY
          : normalizedZ
    const topBias = normalizedY
    const frontBias = normalizedZ
    const surfaceNoise = MathUtils.clamp(
      0.5 +
        Math.sin(positionX * 0.00007 + positionY * 0.00011 + positionZ * 0.00005) *
          0.22 +
        Math.sin(positionX * 0.00017 - positionZ * 0.00009) * 0.12,
      0,
      1,
    )
    const gradientDriver = MathUtils.clamp(
      primaryValue * 0.38 + topBias * 0.22 + frontBias * 0.16 + surfaceNoise * 0.24,
      0,
      1,
    )
    const shadingFactor = MathUtils.clamp(
      0.78 +
        normalZ * 0.15 +
        normalY * 0.1 -
        Math.abs(normalX) * 0.12 +
        (surfaceNoise - 0.5) * 0.1,
      0.56,
      1.03,
    )
    const offset = index * 3
    normalized[index] = MathUtils.clamp(gradientDriver * 0.72 + frontBias * 0.28, 0, 1)

    sampleGradientColor(paletteConfig.base, gradientDriver, sharedColor)
    sharedColor.multiplyScalar(Math.min(1.08, shadingFactor * 1.06))
    base[offset] = sharedColor.r
    base[offset + 1] = sharedColor.g
    base[offset + 2] = sharedColor.b

    sampleGradientColor(paletteConfig.highlight, gradientDriver, sharedColor)
    sharedColor.multiplyScalar(Math.min(1.08, shadingFactor * 1.04))
    sharedColor.lerp(
      highlightLiftColor,
      MathUtils.clamp(frontBias * 0.035 + topBias * 0.02, 0, 0.05),
    )
    highlight[offset] = sharedColor.r
    highlight[offset + 1] = sharedColor.g
    highlight[offset + 2] = sharedColor.b

    sampleGradientColor(paletteConfig.pulse, gradientDriver, sharedColor)
    sharedColor.multiplyScalar(Math.min(1.12, shadingFactor * 1.1))
    sharedColor.lerp(
      highlightLiftColor,
      MathUtils.clamp(frontBias * 0.055 + topBias * 0.025, 0, 0.08),
    )
    pulse[offset] = sharedColor.r
    pulse[offset + 1] = sharedColor.g
    pulse[offset + 2] = sharedColor.b
  }

  const attribute = new BufferAttribute(base.slice(), 3)
  geometry.setAttribute("color", attribute)

  return {
    attribute,
    base,
    highlight,
    normalized,
    pulse,
  }
}

function markAttributeNeedsUpdate(attribute: BufferAttribute) {
  attribute.needsUpdate = true
}

function resolveHoveredLayer(
  event: ThreeEvent<PointerEvent>,
): HighlightableLayerId | null {
  const candidates = event.intersections
    .map((intersection) => {
      const userData = intersection.object.userData as HoverZoneUserData

      if (!userData.hoverTarget) {
        return null
      }

      return {
        target: userData.hoverTarget,
        priority: userData.hoverPriority ?? Number.MAX_SAFE_INTEGER,
        volume: userData.hoverVolume ?? Number.MAX_SAFE_INTEGER,
        distance: intersection.distance,
      }
    })
    .filter((candidate) => candidate !== null)

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority
    }

    if (left.volume !== right.volume) {
      return left.volume - right.volume
    }

    return left.distance - right.distance
  })

  return candidates[0].target
}

export function AnatomyStage({
  className,
  focusLayer = null,
  modelOffsetX = 0,
  modelOffsetY = 0,
  overlay,
  previewLayer = null,
  targetModelHeight = DEFAULT_TARGET_MODEL_HEIGHT,
}: AnatomyStageProps) {
  const pointerTarget = useRef<PointerTarget>({ x: 0, y: 0 })
  const [hoveredLayer, setHoveredLayer] = useState<HighlightableLayerId | null>(null)

  return (
    <section
      className={cn(
        "relative h-screen w-full overflow-hidden bg-[#7e80fc] text-white",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_34%),radial-gradient(circle_at_bottom,rgba(58,63,193,0.18),transparent_28%),linear-gradient(180deg,rgba(126,128,252,0.96)_0%,rgba(111,114,243,1)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:4rem_4rem] [mask-image:radial-gradient(circle_at_center,black,transparent_78%)]" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="aspect-square w-[min(76vw,76vh)] rounded-full border border-white/6 bg-[radial-gradient(circle,rgba(255,255,255,0.02),transparent_70%)] shadow-[0_0_100px_rgba(255,255,255,0.05)]" />
      </div>

      <div
        className="absolute inset-0"
        onPointerLeave={() => {
          pointerTarget.current.x = 0
          pointerTarget.current.y = 0
          setHoveredLayer(null)
        }}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
          const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)

          pointerTarget.current.x = x
          pointerTarget.current.y = y
        }}
      >
        <Canvas
          className="!h-full !w-full"
          dpr={[1, 1.75]}
          gl={{ alpha: true, antialias: true }}
          resize={{ offsetSize: true }}
          fallback={
            <div className="flex h-full w-full items-center justify-center text-sm text-white/80">
              WebGL is unavailable in this browser.
            </div>
          }
        >
          <AnatomyScene
            focusLayer={focusLayer}
            hoveredLayer={hoveredLayer}
            onHoveredLayerChange={setHoveredLayer}
            modelOffsetX={modelOffsetX}
            pointerTarget={pointerTarget}
            previewLayer={previewLayer}
            modelOffsetY={modelOffsetY}
            targetModelHeight={targetModelHeight}
          />
        </Canvas>
      </div>

      {overlay?.(hoveredLayer)}
    </section>
  )
}

function AnatomyScene({
  focusLayer,
  hoveredLayer,
  onHoveredLayerChange,
  modelOffsetX,
  pointerTarget,
  previewLayer,
  modelOffsetY,
  targetModelHeight,
}: AnatomySceneProps) {
  return (
    <>
      <PerspectiveCamera makeDefault fov={CAMERA_FOV} position={CAMERA_POSITION} />
      <color attach="background" args={["#7e80fc"]} />
      <ambientLight color="#ffffff" intensity={0.14} />
      <hemisphereLight args={["#f4e7ff", "#7e80fc", 0.52]} />
      <directionalLight color="#fff4fb" intensity={0.84} position={[4.5, 6, 7]} />
      <directionalLight color="#d7ddff" intensity={0.4} position={[-5, 2.5, 6]} />
      <directionalLight color="#ffb0c7" intensity={0.18} position={[0, -3.5, 5]} />
      <Suspense fallback={<SceneFallback />}>
        <AnatomyAssembly
          focusLayer={focusLayer}
          hoveredLayer={hoveredLayer}
          onHoveredLayerChange={onHoveredLayerChange}
          modelOffsetX={modelOffsetX}
          pointerTarget={pointerTarget}
          previewLayer={previewLayer}
          modelOffsetY={modelOffsetY}
          targetModelHeight={targetModelHeight}
        />
      </Suspense>
    </>
  )
}

function AnatomyAssembly({
  focusLayer,
  hoveredLayer,
  onHoveredLayerChange,
  modelOffsetX,
  pointerTarget,
  previewLayer,
  modelOffsetY,
  targetModelHeight,
}: AnatomyAssemblyProps) {
  const rotationGroupRef = useRef<Group>(null)
  const normalizedGroupRef = useRef<Group>(null)
  const modelGroupRef = useRef<Group>(null)
  const presentationGroupRef = useRef<Group>(null)
  const fitMetricsRef = useRef<{ center: Vector3; sizeY: number } | null>(null)
  const hasInitializedFitRef = useRef(false)
  const initialFitSettingsRef = useRef({
    modelOffsetX,
    modelOffsetY,
    targetModelHeight,
  })
  const animatedViewRef = useRef({
    modelOffsetX,
    modelOffsetY,
    targetModelHeight,
  })

  useLayoutEffect(() => {
    const normalizedGroup = normalizedGroupRef.current
    const modelGroup = modelGroupRef.current

    if (!modelGroup || !normalizedGroup) {
      return
    }

    normalizedGroup.position.set(0, 0, 0)
    normalizedGroup.scale.setScalar(1)
    modelGroup.updateWorldMatrix(true, true)

    const bounds = new Box3().setFromObject(modelGroup)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const sizeY = size.y || 1
    const initialFitSettings = initialFitSettingsRef.current
    const scale = initialFitSettings.targetModelHeight / sizeY

    fitMetricsRef.current = {
      center: center.clone(),
      sizeY,
    }

    if (!hasInitializedFitRef.current) {
      normalizedGroup.scale.setScalar(scale)
      normalizedGroup.position.set(
        -center.x * scale + initialFitSettings.modelOffsetX,
        -center.y * scale + initialFitSettings.modelOffsetY,
        -center.z * scale,
      )
      animatedViewRef.current = {
        modelOffsetX: initialFitSettings.modelOffsetX,
        modelOffsetY: initialFitSettings.modelOffsetY,
        targetModelHeight: initialFitSettings.targetModelHeight,
      }
      hasInitializedFitRef.current = true
    }
  }, [])

  useFrame((_, delta) => {
    const rotationGroup = rotationGroupRef.current
    const normalizedGroup = normalizedGroupRef.current
    const fitMetrics = fitMetricsRef.current

    if (!rotationGroup || !normalizedGroup || !fitMetrics) {
      return
    }

    const targetY = pointerTarget.current.x * MAX_ROTATION_RADIANS
    const preset = focusLayer ? FOCUS_PRESETS[focusLayer] : null
    const resolvedModelOffsetX = preset?.modelOffsetX ?? modelOffsetX
    const resolvedTargetModelHeight = preset?.targetModelHeight ?? targetModelHeight
    const resolvedModelOffsetY = preset?.modelOffsetY ?? modelOffsetY
    const animatedView = animatedViewRef.current

    easing.damp(
      animatedView,
      "targetModelHeight",
      resolvedTargetModelHeight,
      FOCUS_VIEW_SMOOTH_TIME,
      delta,
    )
    easing.damp(
      animatedView,
      "modelOffsetX",
      resolvedModelOffsetX,
      FOCUS_VIEW_SMOOTH_TIME,
      delta,
    )
    easing.damp(
      animatedView,
      "modelOffsetY",
      resolvedModelOffsetY,
      FOCUS_VIEW_SMOOTH_TIME,
      delta,
    )

    const scale = animatedView.targetModelHeight / fitMetrics.sizeY

    easing.dampE(
      rotationGroup.rotation,
      [0, targetY, 0, ROTATION_EULER_ORDER],
      ROTATION_SMOOTH_TIME,
      delta,
    )
    normalizedGroup.scale.setScalar(scale)
    normalizedGroup.position.set(
      -fitMetrics.center.x * scale + animatedView.modelOffsetX,
      -fitMetrics.center.y * scale + animatedView.modelOffsetY,
      -fitMetrics.center.z * scale,
    )
  })

  // Keep the original organ-area hover as the highest-priority highlight source.
  // Category hover is only a preview, and category click is a fallback focus state.
  const activeLayer = hoveredLayer ?? previewLayer ?? focusLayer

  return (
    <group ref={rotationGroupRef}>
      <group ref={normalizedGroupRef}>
        <group ref={modelGroupRef} rotation={[BASE_MODEL_ROTATION_X, 0, 0]}>
          {ANATOMY_LAYERS.map((layer) => (
            <AnatomyLayerModel
              key={layer.id}
              config={layer}
              highlighted={layer.id === activeLayer}
            />
          ))}
        </group>
        <group ref={presentationGroupRef} rotation={[BASE_MODEL_ROTATION_X, 0, 0]}>
          {HOVER_ZONES.map((zone) => (
            <mesh
              key={zone.target}
              position={zone.position}
              scale={zone.scale}
              userData={{
                hoverTarget: zone.target,
                hoverPriority: zone.priority,
                hoverVolume: zone.scale[0] * zone.scale[1] * zone.scale[2],
              } satisfies HoverZoneUserData}
              onPointerMove={(event) => {
                event.stopPropagation()
                onHoveredLayerChange(resolveHoveredLayer(event))
              }}
              onPointerOut={(event) => {
                event.stopPropagation()
                onHoveredLayerChange(resolveHoveredLayer(event))
              }}
              onPointerOver={(event) => {
                event.stopPropagation()
                onHoveredLayerChange(resolveHoveredLayer(event))
              }}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial depthWrite={false} opacity={0} transparent />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

function AnatomyLayerModel({
  config,
  highlighted,
}: AnatomyLayerModelProps) {
  const { scene } = useGLTF(config.src)
  const clone = useMemo(() => scene.clone(true), [scene])
  const runtimeEntriesRef = useRef<LayerRuntimeEntry[]>([])
  const highlightStateRef = useRef({ value: 0 })
  const pulseTimeRef = useRef(0)

  useLayoutEffect(() => {
    const runtimeEntries: LayerRuntimeEntry[] = []
    const allocatedMaterials: LayerRuntimeMaterial[] = []
    const allocatedGeometries: BufferGeometry[] = []
    const gradientConfig =
      config.id === "body" || config.id === "skeleton"
        ? null
        : ORGAN_GRADIENTS[config.id]

    clone.traverse((object) => {
      if (!isMesh(object)) {
        return
      }

      const nextGeometry = object.geometry.clone()
      let useVertexColors = false

      object.geometry = nextGeometry
      allocatedGeometries.push(nextGeometry)

      let gradientBuffer: GradientBufferSet | null = null
      if (gradientConfig) {
        gradientBuffer = createGradientBufferSet(nextGeometry, gradientConfig)
        useVertexColors = gradientBuffer !== null
      }

      const nextMaterial = createLayerMaterial(config.material, useVertexColors)

      object.material = nextMaterial
      object.renderOrder = config.renderOrder
      object.castShadow = false
      object.receiveShadow = false
      object.raycast = () => null
      allocatedMaterials.push(nextMaterial)
      runtimeEntries.push({
        gradientBuffer,
        material: nextMaterial,
      })
    })

    runtimeEntriesRef.current = runtimeEntries

    if (config.transform?.position) {
      clone.position.set(...config.transform.position)
    } else {
      clone.position.set(0, 0, 0)
    }

    if (config.transform?.rotation) {
      clone.rotation.set(...config.transform.rotation)
    } else {
      clone.rotation.set(0, 0, 0)
    }

    if (typeof config.transform?.scale === "number") {
      clone.scale.setScalar(config.transform.scale)
    } else if (config.transform?.scale) {
      clone.scale.set(...config.transform.scale)
    } else {
      clone.scale.set(1, 1, 1)
    }

    return () => {
      runtimeEntriesRef.current = []
      for (const material of allocatedMaterials) {
        material.dispose()
      }
      for (const geometry of allocatedGeometries) {
        geometry.dispose()
      }
    }
  }, [clone, config])

  useFrame((_, delta) => {
    const targetProfile =
      highlighted && config.highlightMaterial
        ? config.highlightMaterial
        : config.material
    const gradientConfig =
      config.id === "body" || config.id === "skeleton"
        ? null
        : ORGAN_GRADIENTS[config.id]

    easing.damp(highlightStateRef.current, "value", highlighted ? 1 : 0, 0.22, delta)
    pulseTimeRef.current += delta

    const highlightMix = highlightStateRef.current.value
    const pulseFactor =
      gradientConfig && highlightMix > 0.001
        ? ((Math.sin(pulseTimeRef.current * (gradientConfig.highlight.pulseSpeed ?? 1.5)) +
            1) *
            0.5 *
            0.34 +
            0.12) *
          highlightMix
        : 0

    for (const entry of runtimeEntriesRef.current) {
      const { gradientBuffer, material } = entry

      if (!gradientConfig || !gradientBuffer) {
        easing.dampC(material.color, targetProfile.color, 0.26, delta)
        const fallbackOpacityTarget =
          gradientConfig && highlightMix > 0.001
            ? Math.min(0.78, targetProfile.opacity + 0.04 + pulseFactor * 0.014)
            : targetProfile.opacity
        easing.damp(material, "opacity", fallbackOpacityTarget, 0.22, delta)
        continue
      }

      easing.dampC(material.color, "#ffffff", 0.24, delta)

      const opacityTarget =
        highlightMix > 0.001
          ? Math.min(0.84, targetProfile.opacity + 0.08 + pulseFactor * 0.018)
          : targetProfile.opacity
      easing.damp(material, "opacity", opacityTarget, 0.22, delta)
    }

    for (const entry of runtimeEntriesRef.current) {
      const { gradientBuffer } = entry

      if (!gradientBuffer) {
        continue
      }

      const { attribute, base, highlight, normalized, pulse } = gradientBuffer

      for (let index = 0; index < attribute.count; index += 1) {
        const offset = index * 3
        const animatedGradientMix =
          highlightMix > 0.001
            ? (0.5 +
                0.5 *
                  Math.sin(
                    pulseTimeRef.current * (gradientConfig?.highlight.pulseSpeed ?? 1.5) +
                      normalized[index] * Math.PI * 4,
                  )) *
              pulseFactor
            : 0
        const red =
          base[offset] +
          (highlight[offset] +
            (pulse[offset] - highlight[offset]) * animatedGradientMix -
            base[offset]) *
            highlightMix
        const green =
          base[offset + 1] +
          (highlight[offset + 1] +
            (pulse[offset + 1] - highlight[offset + 1]) * animatedGradientMix -
            base[offset + 1]) *
            highlightMix
        const blue =
          base[offset + 2] +
          (highlight[offset + 2] +
            (pulse[offset + 2] - highlight[offset + 2]) * animatedGradientMix -
            base[offset + 2]) *
            highlightMix

        attribute.setXYZ(index, red, green, blue)
      }

      markAttributeNeedsUpdate(attribute)
    }
  })

  return <primitive object={clone} />
}

function SceneFallback() {
  return (
    <Html center>
      <div className="rounded-full border border-white/10 bg-black/65 px-4 py-2 text-sm text-white/80 shadow-lg backdrop-blur">
        Loading anatomy layers...
      </div>
    </Html>
  )
}

for (const layer of ANATOMY_LAYERS) {
  useGLTF.preload(layer.src)
}
