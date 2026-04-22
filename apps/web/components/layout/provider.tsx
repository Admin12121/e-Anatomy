"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { LenisOptions } from "lenis"
import { ReactLenis } from "lenis/react"
import { usePathname } from "next/navigation"

import MusicToggle from "./music-toggle"
import {
  PreloaderStateProvider,
  type PreloaderStartMode,
} from "./preloader-state"
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
  const pathname = usePathname()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () =>
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)

    handleResize()
    window.addEventListener("resize", handleResize)

    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const lenisOptions: LenisOptions = isMobile ? LENIS_MOBILE : LENIS_DESKTOP
  const openPreloader: (mode?: PreloaderStartMode) => void = useCallback(() => {}, [])
  const shouldShowMusicToggle = pathname !== "/"
  const preloaderStateValue = useMemo(
    () => ({
      isPreloaderActive: false,
      isPreloaderReady: false,
      isPreloaderTransitioningOut: false,
      openPreloader,
    }),
    [openPreloader],
  )

  return (
    <TransitionProvider>
      <PreloaderStateProvider value={preloaderStateValue}>
        <ReactLenis root options={lenisOptions}>
          <div className="relative">
            {shouldShowMusicToggle ? <MusicToggle /> : null}
            <div className="opacity-100">
              {children}
            </div>
          </div>
        </ReactLenis>
      </PreloaderStateProvider>
    </TransitionProvider>
  )
}
