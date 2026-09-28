"use client"

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type Ref,
} from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import gsap from "gsap"
import { CustomEase } from "gsap/CustomEase"
import { TransitionRouter } from "next-transition-router"

import { cn } from "@/lib/utils"
import { markNonRootClientRouteVisited } from "./preloader-session"
import { ROUTE_TRANSITION_SETTLED_EVENT } from "./transition-events"
import { acquireScrollLock, forceReleaseScrollLocks, setLockedScrollPosition, type ScrollLockHandle } from "./scroll-lock"

gsap.registerPlugin(CustomEase)

CustomEase.create("route-transition-hop", "0.9, 0, 0.1, 1")

type TransitionProviderProps = {
  children: ReactNode
}

const FULL_CLIP = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)"
const LEFT_EDGE_CLIP = "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)"

const BACKDROP_Z_INDEX = 2147482999
const PAGE_Z_INDEX = 2147483001
const CHROME_Z_INDEX = 2147483002
const REVEALER_Z_INDEX = 2147483003

const LEGAL_ROUTES = new Set(["/terms", "/privacy", "/about"])
const PUBLIC_STATIC_ROUTES = new Set(["/", "/account", "/login", ...LEGAL_ROUTES])
const ADMIN_ROUTE_SEGMENTS = new Set([
  "analytics",
  "content",
  "dashboard",
  "playground",
  "settings",
  "users",
])

function normalizeRoutePath(path: string | undefined) {
  if (!path) {
    return null
  }

  const pathname = path.split(/[?#]/, 1)[0] || "/"

  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
}

function isPublicAnimatedRoute(path: string | undefined) {
  const pathname = normalizeRoutePath(path)

  if (!pathname) {
    return false
  }

  if (PUBLIC_STATIC_ROUTES.has(pathname)) {
    return true
  }

  const segments = pathname.split("/").filter(Boolean)

  return segments.length === 2 && !ADMIN_ROUTE_SEGMENTS.has(segments[0] ?? "")
}

function shouldAnimateRouteTransition(
  from: string | undefined,
  to: string | undefined,
) {
  const fromPath = normalizeRoutePath(from)
  const toPath = normalizeRoutePath(to)

  if (!fromPath || !toPath || fromPath === toPath) {
    return false
  }

  const fromLegal = LEGAL_ROUTES.has(fromPath)
  const toLegal = LEGAL_ROUTES.has(toPath)

  // Legal pages are one application surface. Moving between Terms, Privacy,
  // and About should be immediate and should never acquire the full-page
  // transition scroll lock. Only crossings between Home and that legal
  // surface use the cinematic route transition.
  if (fromLegal || toLegal) {
    return (fromPath === "/" && toLegal) || (fromLegal && toPath === "/")
  }

  return isPublicAnimatedRoute(fromPath) && isPublicAnimatedRoute(toPath)
}

const BACKDROP_ROWS = [
  [
    [
      "MED//204 Neural Trace",
      "MED//204 Neural Trace",
      "MED//204 Neural Trace",
      "MED//204 Neural Trace",
      "MED//204 Neural Trace",
    ],
    ["Region / Cortical Mesh", "0.392 MRI 008923"],
    ["Modality / Spectral MRI", "Status / Vital Resonance"],
    "logo",
    [":::bio::scan::grid:::"],
  ],
  [
    ["Perfusion Memory"],
    ["// / perfusion / lattice / //"],
    ["Latency Drift > 17%"],
    ["Synapses Aligning", "Map Emerging"],
    ["Stasis Pending", "Return -- Atlas View"],
    ["XR-9"],
  ],
] as const

type TransitionRefs = {
  backdrop: HTMLDivElement
  stage: HTMLDivElement
  chrome: HTMLDivElement
  labelLine: HTMLSpanElement
  outroLine: HTMLSpanElement
  page: HTMLDivElement
  progress: SVGCircleElement
  revealer: HTMLDivElement
  svg: SVGSVGElement
  track: SVGCircleElement
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function RouteLine({
  children,
  lineRef,
}: {
  children: string
  lineRef?: Ref<HTMLSpanElement>
}) {
  return (
    <span className="inline-block overflow-hidden align-top">
      <span ref={lineRef} className="block will-change-transform">
        {children}
      </span>
    </span>
  )
}

function TransitionBackdrop() {
  return (
    <>
      {BACKDROP_ROWS.map((row, rowIndex) => (
        <div
          key={`route-backdrop-row-${rowIndex}`}
          className={cn(
            "flex w-full justify-between p-6",
            rowIndex === 1 && "items-end",
          )}
        >
          {row.map((column, columnIndex) => (
            <div
              key={`route-backdrop-row-${rowIndex}-col-${columnIndex}`}
              className={cn(
                "flex flex-col gap-1",
                rowIndex === 0 &&
                  (columnIndex === 0 ||
                    columnIndex === 1 ||
                    columnIndex === 4) &&
                  "hidden md:flex",
              )}
            >
              {column === "logo" ? (
                <div className="h-10 w-10 border border-dashed border-[#7a7a7a] p-1">
                  <Image
                    src="/logo.webp"
                    alt=""
                    width={40}
                    height={40}
                    sizes="40px"
                    className="h-full w-full object-contain rounded-md dark:rounded-none"
                  />
                </div>
              ) : (
                column.map((line, lineIndex) => (
                  <p
                    key={`route-backdrop-line-${rowIndex}-${columnIndex}-${lineIndex}`}
                  >
                    {line}
                  </p>
                ))
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function TransitionChrome({
  labelLineRef,
  outroLineRef,
  progressRef,
  svgRef,
  trackRef,
}: {
  labelLineRef: Ref<HTMLSpanElement>
  outroLineRef: Ref<HTMLSpanElement>
  progressRef: Ref<SVGCircleElement>
  svgRef: Ref<SVGSVGElement>
  trackRef: Ref<SVGCircleElement>
}) {
  return (
    <>
      <div className="flex w-full justify-between p-6">
        <p>
          <RouteLine>Booting Atlas</RouteLine>
        </p>
      </div>

      <div className="flex w-full justify-between p-6">
        <div className="flex items-end gap-24">
          <div className="flex flex-col gap-1">
            <p>
              <RouteLine>Phase 01</RouteLine>
            </p>
            <p>
              <RouteLine>Calibration</RouteLine>
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p>
              <RouteLine>Neural Scan</RouteLine>
            </p>
            <p>
              <RouteLine>12 Layers</RouteLine>
            </p>
          </div>
        </div>

        <div className="flex items-end gap-24">
          <p>
            <RouteLine>MX-24</RouteLine>
          </p>
        </div>
      </div>

      <div className="absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2">
        <p className="absolute top-1/2 left-1/2 min-w-48 -translate-x-1/2 -translate-y-1/2 overflow-hidden text-center text-[0.9rem]">
          <RouteLine lineRef={labelLineRef}>Engage</RouteLine>
        </p>
        <p className="absolute top-1/2 left-1/2 min-w-48 -translate-x-1/2 -translate-y-1/2 overflow-hidden text-center text-[0.9rem]">
          <RouteLine lineRef={outroLineRef}>Voxel Anatomy</RouteLine>
        </p>

        <div className="absolute inset-0">
          <svg
            ref={svgRef}
            viewBox="0 0 320 320"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full will-change-transform"
          >
            <circle
              ref={trackRef}
              cx="160"
              cy="160"
              r="155"
              stroke="#2b2b2b"
              strokeWidth="2"
            />
            <circle
              ref={progressRef}
              cx="160"
              cy="160"
              r="155"
              stroke="#ffffff"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>
    </>
  )
}

export default function TransitionProvider({ children }: TransitionProviderProps) {
  const pathname = usePathname()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const chromeRef = useRef<HTMLDivElement | null>(null)
  const revealerRef = useRef<HTMLDivElement | null>(null)
  const labelLineRef = useRef<HTMLSpanElement | null>(null)
  const outroLineRef = useRef<HTMLSpanElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const trackRef = useRef<SVGCircleElement | null>(null)
  const progressRef = useRef<SVGCircleElement | null>(null)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const isTransitionActiveRef = useRef(false)
  const scrollLockRef = useRef<ScrollLockHandle | null>(null)
  const transitionOriginRef = useRef({ x: 0, y: 0 })

  const getRefs = useCallback((): TransitionRefs | null => {
    const stage = stageRef.current
    const page = pageRef.current
    const backdrop = backdropRef.current
    const chrome = chromeRef.current
    const revealer = revealerRef.current
    const labelLine = labelLineRef.current
    const outroLine = outroLineRef.current
    const svg = svgRef.current
    const track = trackRef.current
    const progress = progressRef.current

    if (
      !stage ||
      !page ||
      !backdrop ||
      !chrome ||
      !revealer ||
      !labelLine ||
      !outroLine ||
      !svg ||
      !track ||
      !progress
    ) {
      return null
    }

    return {
      backdrop,
      stage,
      chrome,
      labelLine,
      outroLine,
      page,
      progress,
      revealer,
      svg,
      track,
    }
  }, [])

  const lockScroll = useCallback(() => {
    if (scrollLockRef.current) {
      return scrollLockRef.current
    }

    const scrollLock = acquireScrollLock()
    transitionOriginRef.current = {
      x: scrollLock.initialX,
      y: scrollLock.initialY,
    }
    scrollLockRef.current = scrollLock

    return scrollLock
  }, [])

  const unlockScroll = useCallback((x?: number, y?: number) => {
    const scrollLock = scrollLockRef.current

    if (!scrollLock) {
      return
    }

    scrollLockRef.current = null
    scrollLock.release({
      x: x ?? transitionOriginRef.current.x,
      y: y ?? transitionOriginRef.current.y,
    })
  }, [])

  const pinStage = useCallback((refs: TransitionRefs, scrollY: number) => {
    gsap.set(refs.stage, {
      backgroundColor: "#000",
      height: "100dvh",
      inset: 0,
      isolation: "isolate",
      overflow: "hidden",
      pointerEvents: "none",
      position: "fixed",
      scale: 1,
      transformOrigin: "50% 50%",
      width: "100vw",
      willChange: "transform",
      zIndex: PAGE_Z_INDEX,
    })
    gsap.set(refs.page, {
      left: 0,
      minHeight: "100%",
      overflow: "visible",
      position: "absolute",
      top: -scrollY,
      width: "100%",
    })
  }, [])

  const unpinStage = useCallback((refs: TransitionRefs) => {
    // Defensive cleanup for interrupted transitions. The legal pages use an
    // internal scroll container, so a stale pointer-events/position style on
    // this persistent wrapper makes them look correct but completely blocks
    // scrolling and interaction. Clear with GSAP and then directly remove the
    // properties as a browser-level failsafe.
    refs.page.inert = false
    refs.page.removeAttribute("inert")
    gsap.killTweensOf([refs.stage, refs.page])
    gsap.set(refs.page, {
      clearProps: "left,minHeight,overflow,position,top,width",
    })
    gsap.set(refs.stage, {
      clearProps:
        "backgroundColor,height,inset,isolation,overflow,pointerEvents,position,transform,transformOrigin,width,willChange,zIndex",
    })

    for (const property of [
      "left",
      "min-height",
      "overflow",
      "position",
      "top",
      "width",
    ]) {
      refs.page.style.removeProperty(property)
    }

    for (const property of [
      "background-color",
      "height",
      "inset",
      "isolation",
      "overflow",
      "pointer-events",
      "position",
      "transform",
      "transform-origin",
      "width",
      "will-change",
      "z-index",
    ]) {
      refs.stage.style.removeProperty(property)
    }
  }, [])

  const resetTransition = useCallback(
    (
      destination?: { x: number; y: number },
      notifySettled = false,
    ) => {
      const refs = getRefs()

      timelineRef.current?.kill()
      timelineRef.current = null
      isTransitionActiveRef.current = false

      if (refs) {
        unpinStage(refs)
        gsap.set(refs.chrome, {
          autoAlpha: 0,
          clearProps: "clipPath,transform,willChange",
          display: "none",
        })
        gsap.set(refs.backdrop, {
          autoAlpha: 0,
          display: "none",
        })
        gsap.set(refs.revealer, {
          autoAlpha: 0,
          clipPath: FULL_CLIP,
          display: "none",
        })
      }

      unlockScroll(destination?.x, destination?.y)

      // A public route transition never overlaps the first-load home
      // preloader. If the transition was interrupted during a route swap and
      // a stale lock survived, clear it here so Lenis cannot remain stopped
      // after returning from Terms/Privacy to the home page.
      if (document.documentElement.dataset.scrollLocked === "true") {
        forceReleaseScrollLocks({
          x: destination?.x ?? transitionOriginRef.current.x,
          y: destination?.y ?? transitionOriginRef.current.y,
        })
      }

      if (notifySettled) {
        // The destination page can mount while the transition stage is fixed
        // and removed from normal document flow. Consumers such as the reveal
        // footer must measure only after that geometry has been restored.
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.dispatchEvent(new Event(ROUTE_TRANSITION_SETTLED_EVENT))
          })
        })
      }
    },
    [getRefs, unlockScroll, unpinStage],
  )

  const handleLeave = useCallback(
    (next: () => void, from?: string, to?: string) => {
      if (
        prefersReducedMotion() ||
        !shouldAnimateRouteTransition(from, to)
      ) {
        resetTransition()
        next()
        return
      }

      const refs = getRefs()

      if (!refs) {
        next()
        return
      }

      const pathLength = refs.track.getTotalLength()
      const scrollLock = lockScroll()

      timelineRef.current?.kill()
      isTransitionActiveRef.current = true
      pinStage(refs, scrollLock.initialY)
      gsap.set(refs.backdrop, {
        autoAlpha: 1,
        display: "flex",
      })
      gsap.set(refs.stage, { scale: 1 })
      gsap.set(refs.chrome, {
        autoAlpha: 1,
        clipPath: FULL_CLIP,
        display: "flex",
        scale: 1,
        transformOrigin: "50% 50%",
        willChange: "transform, clip-path",
      })
      gsap.set(refs.revealer, {
        autoAlpha: 0,
        clipPath: FULL_CLIP,
        display: "none",
      })
      gsap.set(refs.labelLine, { y: "0%" })
      gsap.set(refs.outroLine, { y: "100%" })
      gsap.set(refs.svg, {
        rotate: 270,
        transformOrigin: "50% 50%",
      })
      gsap.set([refs.track, refs.progress], {
        strokeDasharray: pathLength,
        strokeDashoffset: 0,
      })

      const timeline = gsap.timeline({
        onComplete: () => {
          timelineRef.current = null
          next()
        },
      })

      timelineRef.current = timeline
      timeline
        .to([refs.stage, refs.chrome], {
          scale: 0.75,
          duration: 1.25,
          ease: "route-transition-hop",
        })
        .to(
          [refs.track, refs.progress],
          {
            strokeDashoffset: -pathLength,
            duration: 1.25,
            ease: "route-transition-hop",
          },
          "<",
        )
        .to(
          refs.labelLine,
          {
            y: "-100%",
            duration: 0.75,
            ease: "power3.out",
          },
          "-=1.25",
        )
        .to(
          refs.outroLine,
          {
            y: "0%",
            duration: 0.75,
            ease: "power3.out",
          },
          "-=0.75",
        )

      return () => {
        timeline.kill()
      }
    },
    [getRefs, lockScroll, pinStage, resetTransition],
  )

  const handleEnter = useCallback(
    (next: () => void) => {
      const refs = getRefs()

      if (prefersReducedMotion() || !refs || !isTransitionActiveRef.current) {
        resetTransition()
        next()
        return
      }

      timelineRef.current?.kill()

      // The transition stage is already pinned to the viewport. Reset the
      // destination document behind the opaque chrome so no visible jump can
      // occur, then reveal the new route from its real top position.
      setLockedScrollPosition(0, 0)
      gsap.set(refs.page, { top: 0 })
      gsap.set(refs.stage, { scale: 0.75 })
      gsap.set(refs.backdrop, {
        autoAlpha: 1,
        display: "flex",
      })
      gsap.set(refs.chrome, {
        autoAlpha: 1,
        clipPath: FULL_CLIP,
        display: "flex",
        scale: 0.75,
        transformOrigin: "50% 50%",
        willChange: "transform, clip-path",
      })
      gsap.set(refs.revealer, {
        autoAlpha: 1,
        clipPath: FULL_CLIP,
        display: "block",
      })

      const timeline = gsap.timeline({
        onComplete: () => {
          resetTransition({ x: 0, y: 0 }, true)
          next()
        },
      })

      timelineRef.current = timeline
      timeline
        .to(refs.chrome, {
          clipPath: LEFT_EDGE_CLIP,
          duration: 1.5,
          ease: "route-transition-hop",
        })
        .to(
          refs.revealer,
          {
            clipPath: LEFT_EDGE_CLIP,
            duration: 1.5,
            ease: "route-transition-hop",
            onComplete: () => {
              gsap.set(refs.chrome, { display: "none" })
            },
          },
          "-=1.45",
        )
        .to(refs.stage, {
          scale: 1,
          duration: 1.25,
          ease: "route-transition-hop",
        })

      return () => {
        timeline.kill()
      }
    },
    [getRefs, resetTransition],
  )

  useEffect(() => {
    if (pathname !== "/") {
      markNonRootClientRouteVisited()
    }
  }, [pathname])

  useEffect(() => {
    return () => {
      resetTransition()
    }
  }, [resetTransition])

  return (
    <TransitionRouter auto enter={handleEnter} leave={handleLeave}>
      <div ref={stageRef} data-route-transition-stage="" className="relative">
        <div ref={pageRef} data-route-transition-page="">
          {children}
        </div>
        <div
          ref={revealerRef}
          data-route-transition-revealer=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden bg-white opacity-0 will-change-[clip-path]"
          style={{
            clipPath: FULL_CLIP,
            zIndex: REVEALER_Z_INDEX,
          }}
        />
      </div>

      <div
        ref={backdropRef}
        data-route-transition-backdrop=""
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 hidden h-[100svh] w-full flex-col justify-between bg-white text-[#7a7a7a] opacity-0"
        style={{ zIndex: BACKDROP_Z_INDEX }}
      >
        <div className="font-preloader-mono text-xs leading-none font-medium uppercase">
          <TransitionBackdrop />
        </div>
      </div>

      <div
        ref={chromeRef}
        data-route-transition-chrome=""
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 hidden h-[100svh] w-full flex-col justify-between bg-black text-white opacity-0"
        style={{ zIndex: CHROME_Z_INDEX }}
      >
        <div className="font-preloader-mono text-xs leading-none font-medium uppercase">
          <TransitionChrome
            labelLineRef={labelLineRef}
            outroLineRef={outroLineRef}
            progressRef={progressRef}
            svgRef={svgRef}
            trackRef={trackRef}
          />
        </div>
      </div>
    </TransitionRouter>
  )
}
