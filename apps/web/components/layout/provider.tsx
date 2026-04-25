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
import { markNonRootClientRouteVisited } from "./preloader-session"
import TransitionProvider from "./transition"
import { cn } from "@/lib/utils"

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

function isPublicViewerPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)

  return segments.length === 2
}

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

  useEffect(() => {
    if (pathname === "/") {
      return
    }

    markNonRootClientRouteVisited()
  }, [pathname])

  const lenisOptions: LenisOptions = isMobile ? LENIS_MOBILE : LENIS_DESKTOP
  const openPreloader: (mode?: PreloaderStartMode) => void = useCallback(() => {}, [])
  const isPublicViewerRoute = isPublicViewerPath(pathname)
  const shouldShowMusicToggle = pathname !== "/" && !isPublicViewerRoute
  const preloaderStateValue = useMemo(
    () => ({
      isPreloaderActive: false,
      isPreloaderReady: false,
      isPreloaderTransitioningOut: false,
      openPreloader,
    }),
    [openPreloader],
  )
  const content = (
    <div
      className={cn(
        "relative",
        isPublicViewerRoute && "min-h-dvh overflow-x-hidden overflow-y-auto",
      )}
    >
      {shouldShowMusicToggle ? <MusicToggle /> : null}
      <div
        className={cn(
          "opacity-100",
          isPublicViewerRoute &&
            "h-dvh min-h-0 overflow-x-hidden overflow-y-auto dark:bg-[#171717]",
        )}
      >
        {children}
      </div>
    </div>
  )

  return (
    <TransitionProvider>
      <PreloaderStateProvider value={preloaderStateValue}>
        {isPublicViewerRoute ? (
          content
        ) : (
          <ReactLenis root options={lenisOptions}>
            {content}
          </ReactLenis>
        )}
      </PreloaderStateProvider>
    </TransitionProvider>
  )
}
