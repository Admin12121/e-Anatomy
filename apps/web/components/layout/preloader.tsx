"use client"

import { useEffect, useRef, useState } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { useLenis } from "lenis/react"

gsap.registerPlugin(useGSAP)

type PreloaderProps = {
  onComplete?: () => void
}

const BLOCK_SIZE_DESKTOP = 120
const BLOCK_SIZE_MOBILE = 80
const MOBILE_BREAKPOINT = 1000

const PATH =
  "M0.00,223.62 C13.97,230.86 57.27,254.22 83.80,267.09 C110.33,279.96 126.47,302.27 159.17,300.85 C191.88,299.43 247.15,262.25 280.04,258.58 C312.92,254.91 329.78,276.72 356.48,278.83 C383.18,280.95 415.17,276.23 440.25,271.27 C465.32,266.31 479.47,257.02 506.93,249.06 C534.39,241.10 578.81,233.75 604.99,223.48 C631.16,213.22 634.84,199.17 663.99,187.49 C693.14,175.81 750.43,161.40 779.90,153.40 C809.37,145.40 811.78,139.68 840.80,139.48 C869.82,139.27 928.46,154.71 953.99,152.19 C979.53,149.66 963.87,124.04 994.01,124.35 C1024.15,124.66 1099.27,154.32 1134.83,154.04 C1170.39,153.77 1179.34,123.19 1207.34,122.70 C1235.33,122.21 1275.00,148.47 1302.79,151.09 C1330.59,153.70 1351.23,144.47 1374.10,138.39 C1396.97,132.31 1429.02,118.57 1440.00,114.61"

const DELAY = 0.5
const BASE_IN = 1
const GAP_AFTER_BASE = 0.25
const FILL_IN = 3
const GAP_AFTER_FILL = 0.25
const BOTH_OUT = 1.5
const GAP_BEFORE_BLOCKS = 0
const BLOCKS_OUT = 0.5
const BLOCK_STAGGER = 0.05

export default function Preloader({ onComplete }: PreloaderProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const blocksRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const basePathRef = useRef<SVGPathElement | null>(null)
  const fillPathRef = useRef<SVGPathElement | null>(null)

  const [showPreloader, setShowPreloader] = useState(true)
  const [loaderAnimating, setLoaderAnimating] = useState(true)
  const lenis = useLenis()

  useEffect(() => {
    if (loaderAnimating) {
      lenis?.stop()
      return
    }

    lenis?.start()
  }, [lenis, loaderAnimating])

  useGSAP(
    () => {
      if (!showPreloader) {
        return
      }

      const blocksEl = blocksRef.current
      const svgEl = svgRef.current
      const base = basePathRef.current
      const fill = fillPathRef.current

      if (!blocksEl || !svgEl || !base || !fill) {
        return
      }

      const blockSize =
        window.innerWidth < MOBILE_BREAKPOINT ? BLOCK_SIZE_MOBILE : BLOCK_SIZE_DESKTOP

      const cols = Math.ceil(window.innerWidth / blockSize)
      const rows = Math.ceil(window.innerHeight / blockSize)

      blocksEl.replaceChildren()
      blocksEl.style.setProperty("--preloader-columns", String(cols))
      blocksEl.style.setProperty("--preloader-block-size", `${blockSize}px`)

      const cells: HTMLDivElement[] = []

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < cols; column += 1) {
          const cell = document.createElement("div")

          cell.className = "aspect-square bg-[var(--base-500)]"
          blocksEl.appendChild(cell)
          cells.push(cell)
        }
      }

      gsap.set(cells, { scale: 1.05, transformOrigin: "50% 50%" })

      const pathLength = base.getTotalLength()
      const dashPattern = `${pathLength} ${pathLength}`

      gsap.set(base, { strokeDasharray: dashPattern, strokeDashoffset: pathLength })
      gsap.set(fill, {
        strokeDasharray: dashPattern,
        strokeDashoffset: pathLength,
        opacity: 0,
      })
      gsap.set(svgEl, { visibility: "visible" })

      let completionTimer: number | null = null

      const timeline = gsap.timeline({
        delay: DELAY,
        onComplete: () => {
          setLoaderAnimating(false)
          completionTimer = window.setTimeout(() => {
            setShowPreloader(false)
            onComplete?.()
          }, 100)
        },
      })

      timeline
        .to(base, {
          strokeDashoffset: 0,
          duration: BASE_IN,
          ease: "power1.inOut",
          onComplete: () => {
            gsap.set(fill, { opacity: 1 })
          },
        })
        .to(
          fill,
          {
            strokeDashoffset: 0,
            opacity: 1,
            duration: FILL_IN,
            ease: "power2.inOut",
          },
          `+=${GAP_AFTER_BASE}`,
        )
        .to(
          base,
          {
            strokeDashoffset: -pathLength,
            duration: BOTH_OUT,
            ease: "power2.inOut",
          },
          `+=${GAP_AFTER_FILL}`,
        )
        .to(
          fill,
          {
            strokeDashoffset: -pathLength,
            duration: BOTH_OUT,
            ease: "power2.inOut",
          },
          "<",
        )
        .set(svgEl, { visibility: "hidden" })
        .fromTo(
          cells,
          { scale: 1.05 },
          {
            scale: 0,
            duration: BLOCKS_OUT,
            ease: "power2.inOut",
            stagger: {
              grid: [rows, cols],
              from: "center",
              each: BLOCK_STAGGER,
            },
          },
          `+=${GAP_BEFORE_BLOCKS}`,
        )

      return () => {
        if (completionTimer !== null) {
          window.clearTimeout(completionTimer)
        }
        timeline.kill()
      }
    },
    { scope: wrapperRef, dependencies: [onComplete, showPreloader] },
  )

  if (!showPreloader) {
    return null
  }

  return (
    <div
      ref={wrapperRef}
      className="fixed inset-0 z-[10000000] flex items-center justify-center pointer-events-auto"
    >
      <div
        ref={blocksRef}
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-1/2 z-0 grid h-max w-max -translate-x-1/2 -translate-y-1/2 [grid-auto-rows:var(--preloader-block-size,80px)] [grid-template-columns:repeat(var(--preloader-columns,12),var(--preloader-block-size,80px))]"
      />
      <div className="relative z-[1] flex w-full items-center justify-center">
        <svg
          ref={svgRef}
          className="invisible h-auto min-h-[50vh] w-full overflow-visible"
          viewBox="0 0 1440 500"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            ref={basePathRef}
            className="[stroke-linecap:butt] stroke-[#242424] [stroke-width:1.5]"
            d={PATH}
            fill="none"
          />
          <path
            ref={fillPathRef}
            className="[stroke-linecap:butt] stroke-[var(--base-300)] [stroke-width:2] opacity-0"
            d={PATH}
            fill="none"
          />
        </svg>
      </div>
    </div>
  )
}
