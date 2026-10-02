"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { LenisOptions } from "lenis";
import { ReactLenis, useLenis } from "lenis/react";
import { usePathname } from "next/navigation";

import {
  PreloaderStateProvider,
  type PreloaderStartMode,
} from "./preloader-state";
import { cn } from "@/lib/utils";
import { SCROLL_LOCK_EVENT } from "./scroll-lock";

type LayoutProviderProps = {
  children: ReactNode;
};

const MOBILE_BREAKPOINT = 1000;

const LENIS_EASING: NonNullable<LenisOptions["easing"]> = (t: number) =>
  Math.min(1, 1.001 - Math.pow(2, -10 * t));

const LENIS_SHARED = {
  easing: LENIS_EASING,
  gestureOrientation: "vertical",
  infinite: false,
  orientation: "vertical",
  smoothWheel: true,
  syncTouch: true,
  wheelMultiplier: 1,
} satisfies LenisOptions;

const LENIS_MOBILE = {
  ...LENIS_SHARED,
  duration: 0.8,
  touchMultiplier: 1.5,
  lerp: 0.09,
} satisfies LenisOptions;

const LENIS_DESKTOP = {
  ...LENIS_SHARED,
  duration: 1.2,
  touchMultiplier: 2,
  lerp: 0.1,
} satisfies LenisOptions;

function LenisScrollGate({ enabled }: { enabled: boolean }) {
  const lenis = useLenis();

  useEffect(() => {
    const sync = () => {
      const transitionLocked =
        document.documentElement.dataset.scrollLocked === "true";

      if (!enabled || transitionLocked) {
        lenis?.stop();
        return;
      }

      lenis?.start();
    };

    sync();
    window.addEventListener(SCROLL_LOCK_EVENT, sync);

    return () => {
      window.removeEventListener(SCROLL_LOCK_EVENT, sync);
    };
  }, [enabled, lenis]);

  return null;
}

function isPublicViewerPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  return segments.length === 2;
}

export default function LayoutProvider({ children }: LayoutProviderProps) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () =>
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const lenisOptions: LenisOptions = isMobile ? LENIS_MOBILE : LENIS_DESKTOP;
  const openPreloader: (mode?: PreloaderStartMode) => void =
    useCallback(() => {}, []);
  const isPublicViewerRoute = isPublicViewerPath(pathname);
  const isLegalRoute =
    pathname === "/terms" || pathname === "/privacy" || pathname === "/about";
  const isStructuresRoute = pathname.startsWith("/structures/");
  const usesNativeDocumentScroll =
    isPublicViewerRoute || isLegalRoute || isStructuresRoute;
  const preloaderStateValue = useMemo(
    () => ({
      isPreloaderActive: false,
      isPreloaderReady: false,
      isPreloaderTransitioningOut: false,
      openPreloader,
    }),
    [openPreloader],
  );
  const content = (
    <div
      className={cn(
        "relative",
        isPublicViewerRoute && "min-h-dvh overflow-x-hidden overflow-y-auto",
        isLegalRoute && "min-h-dvh overflow-x-hidden",
        // The document frame owns its content scroller. Do not allow this
        // outer wrapper to grow or become a second scrolling surface.
        isStructuresRoute && "h-dvh min-h-0 overflow-hidden",
      )}
    >
      <div
        className={cn(
          "opacity-100",
          isPublicViewerRoute &&
            "h-dvh min-h-0 overflow-x-hidden overflow-y-auto dark:bg-[#171717]",
          isLegalRoute && "min-h-dvh",
          isStructuresRoute && "h-dvh min-h-0 overflow-hidden",
        )}
      >
        {children}
      </div>
    </div>
  );

  return (
    <PreloaderStateProvider value={preloaderStateValue}>
      {isStructuresRoute ? (
        content
      ) : (
        <ReactLenis root options={lenisOptions}>
          <LenisScrollGate enabled={!usesNativeDocumentScroll} />
          {content}
        </ReactLenis>
      )}
    </PreloaderStateProvider>
  );
}
