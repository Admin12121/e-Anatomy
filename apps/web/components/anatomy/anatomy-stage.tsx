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
  Box3,
  DoubleSide,
  Group,
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
      color: "#fff4e0",
      opacity: 0.18,
    },
  },
  {
    id: "skeleton",
    label: "Skeleton",
    src: "/anatomy/skleton.glb",
    renderOrder: 2,
    material: {
      color: "#f8f3ec",
      opacity: 0.34,
    },
  },
  {
    id: "brain",
    label: "Brain",
    src: "/anatomy/brain.glb",
    renderOrder: 3,
    material: {
      color: "#efe6ea",
      opacity: 0.26,
    },
    highlightMaterial: {
      color: "#f22581",
      opacity: 0.58,
    },
    transform: {
      position: [42294, 30679, 500848],
      rotation: [Math.PI / 2, 1.5, 0],
      scale: 24000,
    },
  },
  {
    id: "lungs",
    label: "Lungs",
    src: "/anatomy/lungs.glb",
    renderOrder: 4,
    material: {
      color: "#efe8de",
      opacity: 0.38,
    },
    highlightMaterial: {
      color: "#d78b70",
      opacity: 0.72,
    },
  },
  {
    id: "heartKidney",
    label: "Heart + Kidney",
    src: "/anatomy/heart-kidney.glb",
    renderOrder: 5,
    material: {
      color: "#f1e1d4",
      opacity: 0.34,
    },
    highlightMaterial: {
      color: "#fa8396",
      opacity: 0.68,
    },
  },
  {
    id: "digestive",
    label: "Digestive",
    src: "/anatomy/digestive.glb",
    renderOrder: 6,
    material: {
      color: "#f4ead8",
      opacity: 0.32,
    },
    highlightMaterial: {
      color: "#f25777",
      opacity: 0.66,
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
const FOCUS_POSITION_MAX_SPEED = 0.52
const FOCUS_SCALE_MAX_SPEED = 0.14
const FOCUS_SMOOTH_TIME = 1.45

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

function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object && object.isMesh === true
}

function createLayerMaterial(profile: MaterialProfile): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: profile.color,
    opacity: profile.opacity,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  })
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
      <ambientLight color="#ffffff" intensity={0.7} />
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
    const scale = resolvedTargetModelHeight / fitMetrics.sizeY

    easing.dampE(
      rotationGroup.rotation,
      [0, targetY, 0, ROTATION_EULER_ORDER],
      ROTATION_SMOOTH_TIME,
      delta,
    )
    easing.damp3(
      normalizedGroup.scale,
      [scale, scale, scale],
      FOCUS_SMOOTH_TIME,
      delta,
      FOCUS_SCALE_MAX_SPEED,
    )
    easing.damp3(
      normalizedGroup.position,
      [
        -fitMetrics.center.x * scale + resolvedModelOffsetX,
        -fitMetrics.center.y * scale + resolvedModelOffsetY,
        -fitMetrics.center.z * scale,
      ],
      FOCUS_SMOOTH_TIME,
      delta,
      FOCUS_POSITION_MAX_SPEED,
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

function AnatomyLayerModel({ config, highlighted }: AnatomyLayerModelProps) {
  const { scene } = useGLTF(config.src)
  const clone = useMemo(() => scene.clone(true), [scene])
  const materialsRef = useRef<MeshBasicMaterial[]>([])

  useLayoutEffect(() => {
    const allocatedMaterials: MeshBasicMaterial[] = []

    clone.traverse((object) => {
      if (!isMesh(object)) {
        return
      }

      const nextMaterial = createLayerMaterial(config.material)

      object.material = nextMaterial
      object.renderOrder = config.renderOrder
      object.castShadow = false
      object.receiveShadow = false
      object.raycast = () => null
      allocatedMaterials.push(nextMaterial)
    })

    materialsRef.current = allocatedMaterials

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
      materialsRef.current = []
      for (const material of allocatedMaterials) {
        material.dispose()
      }
    }
  }, [clone, config])

  useFrame((_, delta) => {
    const targetProfile =
      highlighted && config.highlightMaterial ? config.highlightMaterial : config.material

    for (const material of materialsRef.current) {
      easing.dampC(material.color, targetProfile.color, 0.26, delta)
      easing.damp(material, "opacity", targetProfile.opacity, 0.24, delta)
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
