"use client"

import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { LenisOptions } from "lenis"
import { ReactLenis } from "lenis/react"

import MusicToggle from "./music-toggle"
import TransitionProvider from "./transition"

type LayoutProviderProps = {
  children: ReactNode
}

const MOBILE_BREAKPOINT = 1000

const LENIS_EASING: NonNullable<LenisOptions["easing"]> = (t: number) =>
  Math.min(1, 1.001 - Math.pow(2, -10 * t))

const LENIS_SHARED = {
  easing: LENIS_EASING,
  gestureOrientation: "vertical",
  infinite: false,
  orientation: "vertical",
  smoothWheel: true,
  syncTouch: true,
  wheelMultiplier: 1,
} satisfies LenisOptions

const LENIS_MOBILE = {
  ...LENIS_SHARED,
  duration: 0.8,
  touchMultiplier: 1.5,
  lerp: 0.09,
} satisfies LenisOptions

const LENIS_DESKTOP = {
  ...LENIS_SHARED,
  duration: 1.2,
  touchMultiplier: 2,
  lerp: 0.1,
} satisfies LenisOptions

export default function LayoutProvider({ children }: LayoutProviderProps) {
  const pageRef = useRef<HTMLDivElement | null>(null)
  const pageWrapperRef = useRef<HTMLDivElement | null>(null)

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () =>
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)

    handleResize()
    window.addEventListener("resize", handleResize)

    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const lenisOptions: LenisOptions = isMobile ? LENIS_MOBILE : LENIS_DESKTOP

  return (
    <TransitionProvider>
      <ReactLenis root options={lenisOptions}>
        <div className="page" ref={pageRef}>
          <MusicToggle />
          <div className="page-wrapper" ref={pageWrapperRef}>
            {children}
          </div>
        </div>
      </ReactLenis>
    </TransitionProvider>
  )
}
