"use client"

import { useCallback, useEffect, useRef, type ReactNode } from "react"
import gsap from "gsap"
import { TransitionRouter } from "next-transition-router"

const BLOCK_SIZE_DESKTOP = 120
const BLOCK_SIZE_MOBILE = 80
const MOBILE_BREAKPOINT = 1000

type TransitionProviderProps = {
  children: ReactNode
}

type TransitionCell = {
  el: HTMLDivElement
  row: number
  col: number
}

export default function TransitionProvider({ children }: TransitionProviderProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const cellsRef = useRef<TransitionCell[]>([])
  const gridRef = useRef({ rows: 0, cols: 0 })

  const buildGrid = useCallback(() => {
    const overlay = overlayRef.current

    if (!overlay) {
      return
    }

    overlay.replaceChildren()
    cellsRef.current = []

    const blockSize =
      window.innerWidth < MOBILE_BREAKPOINT
        ? BLOCK_SIZE_MOBILE
        : BLOCK_SIZE_DESKTOP

    const cols = Math.ceil(window.innerWidth / blockSize)
    const rows = Math.ceil(window.innerHeight / blockSize)

    gridRef.current = { rows, cols }
    overlay.style.setProperty("--transition-columns", String(cols))
    overlay.style.setProperty("--transition-block-size", `${blockSize}px`)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = document.createElement("div")

        cell.className = "transition-cell"
        overlay.appendChild(cell)
        cellsRef.current.push({ el: cell, row, col })
      }
    }

    gsap.set(
      cellsRef.current.map((c) => c.el),
      { scale: 0, willChange: "transform" },
    )
  }, [])

  useEffect(() => {
    buildGrid()

    let resizeTimer: number | undefined

    const handleResize = () => {
      if (resizeTimer !== undefined) {
        window.clearTimeout(resizeTimer)
      }

      resizeTimer = window.setTimeout(buildGrid, 250)
    }

    window.addEventListener("resize", handleResize)

    return () => {
      if (resizeTimer !== undefined) {
        window.clearTimeout(resizeTimer)
      }

      window.removeEventListener("resize", handleResize)
    }
  }, [buildGrid])

  return (
    <TransitionRouter
      auto
      leave={(next) => {
        const overlay = overlayRef.current
        const els = cellsRef.current.map((cell) => cell.el)
        const { rows, cols } = gridRef.current

        if (!overlay) {
          next()
          return
        }

        gsap.set(overlay, { visibility: "visible" })

        const timeline = gsap.timeline({ onComplete: next })

        timeline.fromTo(
          els,
          { scale: 0 },
          {
            scale: 1.05,
            duration: 0.5,
            ease: "power2.inOut",
            stagger: {
              grid: [rows, cols],
              from: "center",
              each: 0.05,
            },
          },
        )

        return () => timeline.kill()
      }}
      enter={(next) => {
        const overlay = overlayRef.current
        const els = cellsRef.current.map((cell) => cell.el)
        const { rows, cols } = gridRef.current

        if (!overlay) {
          next()
          return
        }

        const timeline = gsap.timeline({
          delay: 0.1,
          onComplete: () => {
            gsap.set(overlay, { visibility: "hidden" })
            next()
          },
        })

        timeline.fromTo(
          els,
          { scale: 1.05 },
          {
            scale: 0,
            duration: 0.5,
            ease: "power2.inOut",
            stagger: {
              grid: [rows, cols],
              from: "center",
              each: 0.05,
            },
          },
        )

        return () => timeline.kill()
      }}
    >
      <div ref={overlayRef} className="transition-overlay" />
      {children}
    </TransitionRouter>
  )
}
