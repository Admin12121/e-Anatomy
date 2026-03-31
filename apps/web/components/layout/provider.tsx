"use client"

import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { LenisOptions } from "lenis"
import { ReactLenis } from "lenis/react"
import { usePathname } from "next/navigation"

import MusicToggle from "./music-toggle"
import Preloader from "./preloader"
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

let hasBootstrappedDocument = false

export default function LayoutProvider({ children }: LayoutProviderProps) {
  const pathname = usePathname()
  const [isMobile, setIsMobile] = useState(false)
  const [showPreloader, setShowPreloader] = useState(() => !hasBootstrappedDocument)

  useEffect(() => {
    const handleResize = () =>
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)

    handleResize()
    window.addEventListener("resize", handleResize)

    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    // Keep the preloader tied to the current document load, not client-side route changes.
    hasBootstrappedDocument = true
  }, [])

  const lenisOptions: LenisOptions = isMobile ? LENIS_MOBILE : LENIS_DESKTOP
  const handlePreloaderComplete = useCallback(() => {
    setShowPreloader(false)
  }, [])
  const shouldShowPreloader = pathname === "/" && showPreloader

  return (
    <TransitionProvider>
      <ReactLenis root options={lenisOptions}>
        <div className="relative">
          {shouldShowPreloader ? <Preloader onComplete={handlePreloaderComplete} /> : null}
          <MusicToggle />
          <div
            aria-hidden={shouldShowPreloader}
            className={`transition-opacity duration-300 ${
              shouldShowPreloader ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            {children}
          </div>
        </div>
      </ReactLenis>
    </TransitionProvider>
  )
}
