"use client";

import { skipToken } from "@reduxjs/toolkit/query";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { SplitText } from "gsap/SplitText";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react";
import {
  markHomePreloaderSeen,
  shouldRunHomePreloader,
} from "@/components/layout/preloader-session";
import { PublicAccountMenu } from "@/components/account/public-account-menu";
import { Button } from "@/components/ui/button";
import { Frame } from "@/components/ui/frame";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PublicZoneModalitySummary,
  PublicZoneSummary,
} from "@/lib/playground/types";
import {
  useGetPublicZoneModalitiesQuery,
  useGetPublicZonesQuery,
} from "@/lib/store/services/public-playground-api";
import ShinyText from "@/components/shiny-text";
import { acquireScrollLock, setLockedScrollPosition } from "@/components/layout/scroll-lock";
import { Footer } from "./_components";
import { HomeCatalog } from "./_components/home-catalog";
import { modalityDestination } from "@/lib/content/navigation";

const loadAnatomyStage = () => import("@/components/anatomy/anatomy-stage");

const AnatomyStage = dynamic(
  () => loadAnatomyStage().then((module) => module.AnatomyStage),
  {
    ssr: false,
    loading: () => null,
  },
);

gsap.registerPlugin(SplitText, CustomEase);

CustomEase.create("hop", "0.9, 0, 0.1, 1");
CustomEase.create("glide", "0.8, 0, 0.2, 1");

const PRELOADER_CRITICAL_CSS = `
[data-preloader-shell] {
  position: relative;
  isolation: isolate;
  min-height: 100svh;
  background: #000;
}

[data-preloader-shell] .preloader-backdrop,
[data-preloader-shell] .preloader,
[data-preloader-shell] .hero {
  width: 100%;
  height: 100svh;
}

[data-preloader-shell] .preloader-backdrop,
[data-preloader-shell] .preloader {
  position: fixed;
  inset: 0;
}

[data-preloader-shell] .preloader-backdrop {
  z-index: 20;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #fff;
  color: #7a7a7a;
}

[data-preloader-shell] .preloader {
  z-index: 40;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #000;
  color: #fff;
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
}

[data-preloader-shell] .pb-row,
[data-preloader-shell] .p-row {
  display: flex;
  width: 100%;
  justify-content: space-between;
  padding: 1.5rem;
}

[data-preloader-shell] .pb-col {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

[data-preloader-shell] .p-col {
  display: flex;
  align-items: flex-end;
  gap: 6rem;
}

[data-preloader-shell] .p-sub-col {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

[data-preloader-shell] .preloader-backdrop p,
[data-preloader-shell] .preloader p {
  margin: 0;
  font-family: var(--font-preloader-mono), monospace;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  text-transform: uppercase;
}

[data-preloader-shell] .preloader-btn-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20rem;
  height: 20rem;
  transform: translate(-50%, -50%);
}

[data-preloader-shell] #pbc-outro-label {
  opacity: 0;
}

[data-preloader-shell] .hero {
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: #000;
  color: #fff;
  text-align: center;
  overflow: hidden;
  transform: scale(0.75);
  transform-origin: 50% 50%;
}

[data-preloader-shell] .preloader-revealer {
  position: absolute;
  inset: 0;
  background: #fff;
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
}
`;

const EMPTY_ZONES: PublicZoneSummary[] = [];
const EMPTY_MODALITIES: PublicZoneModalitySummary[] = [];
const DESKTOP_PANEL_VARIANTS = {
  hidden: { filter: "blur(8px)", opacity: 0 },
  visible: { filter: "blur(0px)", opacity: 1 },
};
const MOBILE_PANEL_VARIANTS = {
  center: { opacity: 1, x: 0 },
  enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
  exit: (direction: number) => ({ opacity: 0, x: direction * -24 }),
};

type HomePreloaderMode = "checking" | "show" | "skip";
type HomeView = "atlas" | "catalog";

function subscribeToPreloaderPolicy() {
  return () => {};
}

function getServerPreloaderMode(): HomePreloaderMode {
  return "checking";
}

function useHomePreloaderMode() {
  const decisionRef = useRef<Exclude<HomePreloaderMode, "checking"> | null>(
    null,
  );
  const getClientSnapshot = useCallback(() => {
    decisionRef.current ??= shouldRunHomePreloader() ? "show" : "skip";

    return decisionRef.current;
  }, []);

  return useSyncExternalStore(
    subscribeToPreloaderPolicy,
    getClientSnapshot,
    getServerPreloaderMode,
  );
}
const STAGE_PRELOAD_READY_TIMEOUT_MS = 8000;
const PRELOADER_READY_TIMEOUT_MS = 12000;

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "error" in error.data &&
    error.data.error &&
    typeof error.data.error === "object" &&
    "message" in error.data.error &&
    typeof error.data.error.message === "string"
  ) {
    return error.data.error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallbackMessage;
}

export default function Page() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const stageModelRef = useRef<HTMLDivElement | null>(null);
  const viewTransitionLockRef = useRef(false);
  const preloaderMode = useHomePreloaderMode();
  const shouldRunInitialPreloader = preloaderMode === "show";
  const [homeView, setHomeView] = useState<HomeView>("atlas");
  const [atlasUiVisible, setAtlasUiVisible] = useState(true);
  const [catalogMounted, setCatalogMounted] = useState(false);
  const [catalogLayoutActive, setCatalogLayoutActive] = useState(false);
  const [isStageActivated, setIsStageActivated] = useState(false);
  const shouldRenderStage = preloaderMode === "skip" || isStageActivated;
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const stageReadyRef = useRef(false);
  const pendingEngageRef = useRef(false);
  const runExitAnimationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (preloaderMode === "show") {
      markHomePreloaderSeen();
    }
  }, [preloaderMode]);

  const {
    data: zonesResponse,
    error: zonesQueryError,
    isError: isZonesError,
    isLoading: isZonesLoading,
  } = useGetPublicZonesQuery();
  const zones = zonesResponse?.items ?? EMPTY_ZONES;
  const activeSelectedZoneId =
    selectedZoneId && zones.some((zone) => zone.id === selectedZoneId)
      ? selectedZoneId
      : null;
  const {
    data: modalitiesResponse,
    error: modalitiesQueryError,
    isError: isModalitiesError,
    isLoading: isModalitiesLoading,
  } = useGetPublicZoneModalitiesQuery(activeSelectedZoneId ?? skipToken);
  const stageZones = zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    anchor: zone.anchor,
    slug: zone.slug,
  }));
  const selectedZone = activeSelectedZoneId
    ? (zones.find((zone) => zone.id === activeSelectedZoneId) ?? null)
    : null;
  const selectedZoneModalities = modalitiesResponse?.items ?? EMPTY_MODALITIES;
  const prefersReducedMotion = useReducedMotion();
  const mobilePanelDirection = selectedZone ? 1 : -1;
  const desktopRegionsState = isZonesLoading
    ? "loading"
    : isZonesError
      ? "error"
      : zones.length === 0
        ? "empty"
        : "ready";
  const desktopModalitiesState = isModalitiesLoading
    ? "loading"
    : isModalitiesError
      ? "error"
      : selectedZoneModalities.length === 0
        ? "empty"
        : "ready";

  useLayoutEffect(() => {
    const stageModel = stageModelRef.current;

    if (!stageModel) {
      return;
    }

    const desktopCatalogOffset =
      homeView === "catalog" && window.innerWidth >= 768 ? 35 : 0;

    const finishTransition = () => {
      viewTransitionLockRef.current = false;

      if (homeView === "atlas") {
        setAtlasUiVisible(true);
        setCatalogMounted(false);
        setCatalogLayoutActive(false);
      }
    };

    if (prefersReducedMotion) {
      gsap.set(stageModel, { xPercent: desktopCatalogOffset });
      finishTransition();
      return;
    }

    const tween = gsap.to(stageModel, {
      xPercent: desktopCatalogOffset,
      duration: 1.05,
      ease: "glide",
      force3D: true,
      overwrite: "auto",
      onComplete: finishTransition,
    });

    return () => {
      tween.kill();
    };
  }, [homeView, prefersReducedMotion]);

  function handleSelectZone(zoneId: string) {
    setSelectedZoneId(zoneId);
  }

  function handleViewAll() {
    if (homeView === "catalog" || viewTransitionLockRef.current) {
      return;
    }

    viewTransitionLockRef.current = true;
    window.scrollTo(0, 0);
    setSelectedZoneId(null);
    setAtlasUiVisible(false);
    setCatalogMounted(true);
    setCatalogLayoutActive(true);
    setHomeView("catalog");
  }

  function handleBackToAtlas() {
    if (homeView === "atlas" || viewTransitionLockRef.current) {
      return;
    }

    viewTransitionLockRef.current = true;
    window.scrollTo(0, 0);
    setHomeView("atlas");
  }

  const markStageReady = useCallback(() => {
    if (stageReadyRef.current) {
      return;
    }

    stageReadyRef.current = true;

    if (pendingEngageRef.current) {
      runExitAnimationRef.current?.();
    }
  }, []);

  useEffect(() => {
    if (preloaderMode === "checking") {
      return;
    }

    if (!shouldRunInitialPreloader) {
      markStageReady();
      return;
    }

    let cancelled = false;
    const readyFallback = window.setTimeout(
      markStageReady,
      STAGE_PRELOAD_READY_TIMEOUT_MS,
    );

    void loadAnatomyStage()
      .then((module) => {
        if (cancelled) {
          return;
        }

        // Mount the Canvas behind the white revealer immediately.
        startTransition(() => {
          setIsStageActivated(true);
        });

        // Warm the Human Atlas catalogue in parallel. AnatomyStage calls markStageReady only
        // after its Suspense boundary has resolved and the scene has painted.
        void module.preloadAnatomyStageAssets?.().catch(() => null);
      })
      .catch(() => {
        if (!cancelled) {
          markStageReady();
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(readyFallback);
    };
  }, [markStageReady, preloaderMode, shouldRunInitialPreloader]);

  useLayoutEffect(() => {
    if (preloaderMode === "checking") {
      return;
    }

    if (!shouldRunInitialPreloader) {
      return;
    }

    const page = pageRef.current;

    if (!page) {
      return;
    }

    let preloaderComplete = false;
    let exitStarted = false;
    let exitTimeline: gsap.core.Timeline | null = null;
    let introTimeline: gsap.core.Timeline | null = null;
    let preloaderReadyFallback: number | undefined;

    const preloaderBackdrop =
      page.querySelector<HTMLDivElement>(".preloader-backdrop");
    const preloader = page.querySelector<HTMLDivElement>(".preloader");
    const hero = page.querySelector<HTMLElement>(".hero");
    const heroHeading = page.querySelector<HTMLHeadingElement>(".hero h1");
    const heroRevealer = page.querySelector<HTMLElement>(".preloader-revealer");
    const preloaderTexts =
      page.querySelectorAll<HTMLParagraphElement>(".preloader p");
    const preloaderBtn = page.querySelector<HTMLDivElement>(
      ".preloader-btn-container",
    );
    const btnOutlineTrack =
      page.querySelector<SVGCircleElement>(".stroke-track");
    const btnOutlineProgress =
      page.querySelector<SVGCircleElement>(".stroke-progress");
    const btnSvg = page.querySelector<SVGSVGElement>(".pbc-svg-strokes svg");
    const btnLogo = page.querySelector<HTMLElement>("#pbc-logo");
    const btnLabel = page.querySelector<HTMLElement>("#pbc-label");
    const btnOutroLabel = page.querySelector<HTMLElement>("#pbc-outro-label");

    if (
      !preloaderBackdrop ||
      !preloader ||
      !hero ||
      !heroRevealer ||
      !preloaderBtn ||
      !btnOutlineTrack ||
      !btnOutlineProgress ||
      !btnSvg ||
      !btnLogo ||
      !btnLabel ||
      !btnOutroLabel
    ) {
      return;
    }

    // Freeze scrolling at the document level for the entire preloader. The
    // full-screen preloader is already covering the viewport, so normalize the
    // hidden document to the real hero position without exposing a visible
    // scroll-to-top jump. This also prevents browser scroll restoration or
    // Lenis momentum from moving the footer underneath the 75% reveal frame.
    const scrollLock = acquireScrollLock();
    setLockedScrollPosition(0, 0);

    let scrollLockReleased = false;
    const releasePreloaderScroll = () => {
      if (scrollLockReleased) {
        return;
      }

      scrollLockReleased = true;
      scrollLock.release({ x: 0, y: 0 });
    };

    const svgPathLength = btnOutlineTrack.getTotalLength();
    const preloaderSplits = Array.from(preloaderTexts).map(
      (paragraph) =>
        new SplitText(paragraph, {
          type: "lines",
          linesClass: "line",
          mask: "lines",
        }),
    );
    const heroSplit = heroHeading
      ? new SplitText(heroHeading, {
          type: "words",
          wordsClass: "word",
          mask: "words",
        })
      : null;

    gsap.set(preloaderBackdrop, {
      clearProps: "all",
      display: "flex",
      zIndex: 20,
    });
    gsap.set(preloader, {
      clearProps: "all",
      display: "flex",
      scale: 1,
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
    });
    gsap.set(hero, {
      clearProps: "all",
      pointerEvents: "none",
      scale: 0.75,
    });
    gsap.set(heroRevealer, {
      clearProps: "all",
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
    });
    gsap.set(preloaderBtn, {
      clearProps: "scale",
      scale: 1,
    });
    gsap.set(btnSvg, {
      clearProps: "rotation",
      rotation: 0,
    });
    gsap.set(btnLogo, {
      clearProps: "opacity",
      opacity: 1,
    });
    gsap.set([btnLabel, btnOutroLabel], {
      clearProps: "opacity",
      opacity: 1,
    });
    gsap.set([btnOutlineTrack, btnOutlineProgress], {
      strokeDasharray: svgPathLength,
      strokeDashoffset: svgPathLength,
    });

    const runExitAnimation = () => {
      if (
        exitStarted ||
        !pendingEngageRef.current ||
        !preloaderComplete ||
        !stageReadyRef.current
      ) {
        return;
      }

      pendingEngageRef.current = false;
      preloaderComplete = false;
      exitStarted = true;

      if (preloaderReadyFallback !== undefined) {
        window.clearTimeout(preloaderReadyFallback);
        preloaderReadyFallback = undefined;
      }

      exitTimeline?.kill();
      exitTimeline = gsap.timeline();

      exitTimeline
        .to(preloader, {
          scale: 0.75,
          duration: 1.25,
          ease: "hop",
        })
        .to(
          [btnOutlineTrack, btnOutlineProgress],
          {
            strokeDashoffset: -svgPathLength,
            duration: 1.25,
            ease: "hop",
          },
          "<",
        )
        .to(
          page.querySelectorAll("#pbc-label .line"),
          {
            y: "-100%",
            duration: 0.75,
            ease: "power3.out",
          },
          "-=1.25",
        )
        .to(
          page.querySelectorAll("#pbc-outro-label .line"),
          {
            y: "0%",
            duration: 0.75,
            ease: "power3.out",
          },
          "-=0.75",
        )
        // The black panel closes from right to left. The white revealer below
        // follows almost immediately, so the already-mounted AnatomyStage is
        // exposed inside the same centered 75% frame. The white HUD remains
        // visible only outside that frame.
        .to(preloader, {
          clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
          duration: 1.5,
          ease: "hop",
        })
        .to(
          heroRevealer,
          {
            clipPath: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
            duration: 1.5,
            ease: "hop",
            onComplete: () => {
              gsap.set(preloader, { display: "none" });
            },
          },
          "-=1.45",
        )
        .to(hero, {
          scale: 1,
          duration: 1.25,
          ease: "hop",
          onComplete: () => {
            gsap.set([preloaderBackdrop, heroRevealer], { display: "none" });
            gsap.set(hero, { pointerEvents: "auto" });
            releasePreloaderScroll();
          },
        });

      const heroWords = page.querySelectorAll(".hero h1 .word");

      if (heroWords.length > 0) {
        exitTimeline.to(
          heroWords,
          {
            y: "0%",
            duration: 1,
            ease: "glide",
            stagger: 0.05,
          },
          "-=1.75",
        );
      }
    };

    const markPreloaderComplete = (syncVisualState = false) => {
      if (preloaderComplete || exitStarted) {
        return;
      }

      if (preloaderReadyFallback !== undefined) {
        window.clearTimeout(preloaderReadyFallback);
        preloaderReadyFallback = undefined;
      }

      if (syncVisualState) {
        introTimeline?.progress(1, true);
        gsap.set(page.querySelectorAll(".preloader .p-row p .line"), {
          y: "0%",
        });
        gsap.set(page.querySelectorAll("#pbc-label .line"), { y: "0%" });
        gsap.set(btnLogo, { opacity: 0 });
        gsap.set(preloaderBtn, { scale: 0.9 });
        gsap.set(btnSvg, { rotation: 270 });
        gsap.set([btnOutlineTrack, btnOutlineProgress], {
          strokeDashoffset: 0,
        });
      }

      preloaderComplete = true;
      runExitAnimation();
    };

    introTimeline = gsap.timeline({ delay: 1 });

    introTimeline
      .to(page.querySelectorAll(".preloader .p-row p .line"), {
        y: "0%",
        duration: 0.75,
        ease: "power3.out",
        stagger: 0.1,
      })
      .to(
        btnOutlineTrack,
        {
          strokeDashoffset: 0,
          duration: 2,
          ease: "hop",
        },
        "<",
      )
      .to(
        btnSvg,
        {
          rotation: 270,
          duration: 2,
          ease: "hop",
        },
        "<",
      );

    const progressStops = [0.2, 0.25, 0.85, 1].map((base, index) => {
      if (index === 3) {
        return 1;
      }

      return base + (Math.random() - 0.5) * 0.1;
    });

    progressStops.forEach((stop, index) => {
      introTimeline.to(btnOutlineProgress, {
        strokeDashoffset: svgPathLength - svgPathLength * stop,
        duration: 0.75,
        ease: "glide",
        delay: index === 0 ? 0.3 : 0.3 + Math.random() * 0.2,
      });
    });

    introTimeline
      .to(
        btnLogo,
        {
          opacity: 0,
          duration: 0.35,
          ease: "power1.out",
        },
        "-=0.25",
      )
      .to(
        preloaderBtn,
        {
          scale: 0.9,
          duration: 1.5,
          ease: "hop",
        },
        "-=0.5",
      )
      .to(
        page.querySelectorAll("#pbc-label .line"),
        {
          y: "0%",
          duration: 0.75,
          ease: "power3.out",
          onComplete: () => {
            markPreloaderComplete();
          },
        },
        "-=0.75",
      );

    preloaderReadyFallback = window.setTimeout(
      () => markPreloaderComplete(true),
      PRELOADER_READY_TIMEOUT_MS,
    );

    runExitAnimationRef.current = runExitAnimation;

    const handleClick = () => {
      pendingEngageRef.current = true;
      runExitAnimation();
    };

    preloaderBtn.addEventListener("click", handleClick);

    return () => {
      runExitAnimationRef.current = null;
      pendingEngageRef.current = false;
      preloaderBtn.removeEventListener("click", handleClick);
      if (preloaderReadyFallback !== undefined) {
        window.clearTimeout(preloaderReadyFallback);
      }
      introTimeline?.kill();
      exitTimeline?.kill();
      releasePreloaderScroll();
      heroSplit?.revert();
      preloaderSplits.forEach((split) => split.revert());
    };
  }, [preloaderMode, shouldRunInitialPreloader]);

  const heroClassName = shouldRunInitialPreloader
    ? "hero"
    : "relative z-10 h-[100svh] w-full overflow-hidden bg-black text-white";

  return (
    <div
      ref={pageRef}
      data-preloader-shell={shouldRunInitialPreloader ? "" : undefined}
      style={{
        minHeight: "100svh",
        backgroundColor: catalogLayoutActive ? "#141414" : "#000",
      }}
    >
      {shouldRunInitialPreloader ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: PRELOADER_CRITICAL_CSS }} />
          <div className="preloader-backdrop">
            <div className="pb-row">
              <div className="pb-col">
                <p>MED//204 Neural Trace</p>
                <p>MED//204 Neural Trace</p>
                <p>MED//204 Neural Trace</p>
                <p>MED//204 Neural Trace</p>
                <p>MED//204 Neural Trace</p>
              </div>
              <div className="pb-col">
                <p>Region / Cortical Mesh</p>
                <p>0.392 MRI 008923</p>
              </div>
              <div className="pb-col">
                <p>Modality / Spectral MRI</p>
                <p>Status / Vital Resonance</p>
              </div>
              <div className="pb-col">
                <Image
                  id="pb-logo"
                  src="/logo.webp"
                  alt=""
                  width={40}
                  height={40}
                  priority
                  className="rounded-md dark:rounded-none"
                />
              </div>
              <div className="pb-col">
                <p>:::bio::scan::grid:::</p>
              </div>
            </div>

            <div className="pb-row">
              <div className="pb-col">
                <p>Perfusion Memory</p>
              </div>
              <div className="pb-col">
                <p>{"// / perfusion / lattice / //"}</p>
              </div>
              <div className="pb-col">
                <p>Latency Drift &gt; 17%</p>
              </div>
              <div className="pb-col">
                <p>Synapses Aligning</p>
                <p>Map Emerging</p>
              </div>
              <div className="pb-col">
                <p>Stasis Pending</p>
                <p>Return -- Atlas View</p>
              </div>
              <div className="pb-col">
                <p>XR-9</p>
              </div>
            </div>
          </div>

          <div className="preloader">
            <div className="p-row">
              <p>Booting Voxel Anatomy</p>
            </div>
            <div className="p-row">
              <div className="p-col">
                <div className="p-sub-col">
                  <p>Phase 01</p>
                  <p>Calibration</p>
                </div>
                <div className="p-sub-col">
                  <p>Neural Scan</p>
                  <p>12 Layers</p>
                </div>
              </div>
              <div className="p-col">
                <p>MX-24</p>
              </div>
            </div>

            <div className="preloader-btn-container">
              <Image
                id="pbc-logo"
                src="/preloader.webp"
                alt=""
                width={64}
                height={64}
                priority
              />
              <p id="pbc-label">Engage</p>
              <p id="pbc-outro-label">Atlas Ready</p>

              <div className="pbc-svg-strokes">
                <svg
                  viewBox="0 0 320 320"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    className="stroke-track"
                    cx="160"
                    cy="160"
                    r="155"
                    stroke="#2b2b2b"
                    strokeWidth="2"
                    strokeDasharray="974"
                    strokeDashoffset="974"
                  />
                  <circle
                    className="stroke-progress"
                    cx="160"
                    cy="160"
                    r="155"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeDasharray="974"
                    strokeDashoffset="974"
                  />
                </svg>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div
        className={
          catalogLayoutActive
            ? "relative z-10 min-h-[100svh] bg-[#141414]"
            : ""
        }
      >
        <section
          className={
            catalogLayoutActive
              ? "sticky top-0 h-[100svh] w-full overflow-hidden bg-[#141414] text-white"
              : heroClassName
          }
          data-home-view={homeView}
        >
          {shouldRenderStage ? (
            <div
              className="absolute inset-0 z-0 overflow-hidden bg-[#141414]"
              data-home-stage
            >
              <div
                ref={stageModelRef}
                className="absolute inset-0 will-change-transform"
                data-home-stage-model
              >
                <AnatomyStage
                  backgroundColor="#141414"
                  className="h-full! w-full!"
                  onReady={markStageReady}
                  onZoneSelect={handleSelectZone}
                  selectedZoneId={activeSelectedZoneId}
                  showBackdrop={false}
                  showPartsToggle={atlasUiVisible}
                  mobilePanelOffset
                  zones={stageZones}
                />
              </div>

              <span className="absolute md:w-67.5 w-50 inset-x-4 z-20 md:inset-x-auto top-1 md:top-5 left-1/2 transform -translate-x-1/2 md:translate-x-0 md:left-5 md:bottom-auto h-14 flex items-center">
                <div className="flex size-14 items-center justify-center rounded-md">
                  <Image
                    src="/logo.webp"
                    alt="Anatomy"
                    height={35}
                    width={35}
                    className="rounded-md dark:rounded-none"
                  />
                </div>
                <ShinyText
                  text="Voxel Anatomy"
                  duration={2}
                  delay={1}
                  className="text-xl md:text-3xl"
                />
              </span>
              <PublicAccountMenu
                className="absolute right-4 top-4 z-30 md:right-5 md:top-5"
              />

            <AnimatePresence>
              {atlasUiVisible && selectedZone && (isModalitiesLoading || isModalitiesError || selectedZoneModalities.length > 0) ? (
                <motion.div
                  animate="visible"
                  className="absolute z-10 hidden md:top-20 md:right-5 md:block md:w-80"
                  exit="hidden"
                  initial={prefersReducedMotion ? false : "hidden"}
                  key={`${selectedZone.id}-${desktopModalitiesState}`}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.28,
                    ease: "easeOut",
                  }}
                  variants={DESKTOP_PANEL_VARIANTS}
                >
                  <Frame className="w-full">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-left">
                          <TableHead>Modalities</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isModalitiesLoading ? (
                          <TableRow>
                            <TableCell className="text-left text-muted-foreground">
                              Loading modalities...
                            </TableCell>
                          </TableRow>
                        ) : isModalitiesError ? (
                          <TableRow>
                            <TableCell className="text-left text-destructive">
                              {getApiErrorMessage(
                                modalitiesQueryError,
                                "Unable to load modalities.",
                              )}
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedZoneModalities.map((modality) => (
                            <TableRow key={modality.id}>
                              <TableCell className="font-medium text-left">
                                <Link
                                  className="inline-flex items-center underline-offset-4 hover:underline"
                                  href={modalityDestination(selectedZone.slug, modality.slug, "atlas")}
                                >
                                  {modality.name}
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </Frame>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {atlasUiVisible ? (
                <motion.div
                  animate="visible"
                  className="absolute z-10 hidden md:top-20 md:left-5 md:block md:w-80"
                  exit="hidden"
                  initial={prefersReducedMotion ? false : "hidden"}
                  key={`${desktopRegionsState}-${activeSelectedZoneId ?? "none"}`}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.24,
                    ease: "easeOut",
                  }}
                  variants={DESKTOP_PANEL_VARIANTS}
                >
                  <Frame className="w-full">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-left">
                          <TableHead>
                            <div className="flex items-center justify-between gap-3">
                              <span>Regions / Zone</span>
                              <button
                                className="group/view-all inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={handleViewAll}
                                type="button"
                              >
                                View all
                                <ArrowUpRightIcon
                                  aria-hidden="true"
                                  className="size-3 transition-transform duration-300 group-hover/view-all:translate-x-0.5 group-hover/view-all:-translate-y-0.5"
                                />
                              </button>
                            </div>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isZonesLoading ? (
                          <TableRow>
                            <TableCell className="text-left text-muted-foreground">
                              Loading zones...
                            </TableCell>
                          </TableRow>
                        ) : isZonesError ? (
                          <TableRow>
                            <TableCell className="text-left text-destructive">
                              {getApiErrorMessage(
                                zonesQueryError,
                                "Unable to load zones.",
                              )}
                            </TableCell>
                          </TableRow>
                        ) : zones.length === 0 ? (
                          <TableRow>
                            <TableCell className="text-left text-muted-foreground">
                              No zones are available yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          zones.map((zone) => (
                            <TableRow
                              key={zone.id}
                              className="cursor-pointer"
                              data-state={
                                activeSelectedZoneId === zone.id
                                  ? "selected"
                                  : undefined
                              }
                              onClick={() => handleSelectZone(zone.id)}
                            >
                              <TableCell className="font-medium text-left">
                                {zone.name}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </Frame>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {atlasUiVisible ? (
              <Frame className="absolute inset-x-4 bottom-4 z-10 flex max-h-[40svh] overflow-y-auto md:hidden">
                <motion.div
                  className="relative overflow-hidden rounded-xl"
                  layout={!prefersReducedMotion}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.24,
                    ease: "easeOut",
                  }}
                >
                  <AnimatePresence
                    custom={mobilePanelDirection}
                    initial={false}
                    mode="popLayout"
                  >
                    <motion.div
                      animate="center"
                      custom={mobilePanelDirection}
                      exit="exit"
                      initial={prefersReducedMotion ? false : "enter"}
                      key={selectedZone && (isModalitiesLoading || isModalitiesError || selectedZoneModalities.length > 0) ? `modalities-${selectedZone.id}` : "regions"}
                      transition={{
                        duration: prefersReducedMotion ? 0 : 0.24,
                        ease: "easeOut",
                      }}
                      variants={MOBILE_PANEL_VARIANTS}
                    >
                      <Table>
                        <TableHeader>
                          <TableRow className="text-left">
                            <TableHead>
                              {selectedZone && (isModalitiesLoading || isModalitiesError || selectedZoneModalities.length > 0) ? (
                                <span className="flex items-center gap-1.5">
                                  <Button
                                    aria-label="Back to regions"
                                    className="-ml-1"
                                    onClick={() => setSelectedZoneId(null)}
                                    size="icon-xs"
                                    variant="ghost"
                                  >
                                    <ArrowLeftIcon aria-hidden="true" />
                                  </Button>
                                  Modalities
                                </span>
                              ) : (
                                <span className="flex items-center justify-between gap-3">
                                  <span>Regions / Zone</span>
                                  <button
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
                                    onClick={handleViewAll}
                                    type="button"
                                  >
                                    View all
                                    <ArrowUpRightIcon aria-hidden="true" className="size-3" />
                                  </button>
                                </span>
                              )}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedZone && (isModalitiesLoading || isModalitiesError || selectedZoneModalities.length > 0) ? (
                            isModalitiesLoading ? (
                              <TableRow>
                                <TableCell className="text-left text-muted-foreground">
                                  Loading modalities...
                                </TableCell>
                              </TableRow>
                            ) : isModalitiesError ? (
                              <TableRow>
                                <TableCell className="text-left text-destructive">
                                  {getApiErrorMessage(
                                    modalitiesQueryError,
                                    "Unable to load modalities.",
                                  )}
                                </TableCell>
                              </TableRow>
                            ) : (
                              selectedZoneModalities.map((modality) => (
                                <TableRow key={modality.id}>
                                  <TableCell className="font-medium text-left">
                                    <Link
                                      className="inline-flex items-center underline-offset-4 hover:underline"
                                      href={modalityDestination(selectedZone.slug, modality.slug, "atlas")}
                                    >
                                      {modality.name}
                                    </Link>
                                  </TableCell>
                                </TableRow>
                              ))
                            )
                          ) : isZonesLoading ? (
                            <TableRow>
                              <TableCell className="text-left text-muted-foreground">
                                Loading zones...
                              </TableCell>
                            </TableRow>
                          ) : isZonesError ? (
                            <TableRow>
                              <TableCell className="text-left text-destructive">
                                {getApiErrorMessage(
                                  zonesQueryError,
                                  "Unable to load zones.",
                                )}
                              </TableCell>
                            </TableRow>
                          ) : zones.length === 0 ? (
                            <TableRow>
                              <TableCell className="text-left text-muted-foreground">
                                No zones are available yet.
                              </TableCell>
                            </TableRow>
                          ) : (
                            zones.map((zone) => (
                              <TableRow key={zone.id}>
                                <TableCell className="text-left">
                                  <Button
                                    className="h-auto w-full justify-start rounded-none border-0 p-0 font-medium shadow-none"
                                    onClick={() => handleSelectZone(zone.id)}
                                    variant="ghost"
                                  >
                                    {zone.name}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </Frame>
            ) : null}
          </div>
        ) : null}

        {shouldRunInitialPreloader ? (
          <div className="preloader-revealer z-10" />
        ) : null}
      </section>

        {catalogMounted ? (
          <motion.main
            animate={
              homeView === "catalog"
                ? { opacity: 1, x: 0 }
                : { opacity: 0, x: prefersReducedMotion ? 0 : -10 }
            }
            className="relative z-10 -mt-[100svh] min-h-[100svh] w-full pt-[42svh] text-white md:w-[58vw] md:pt-0"
            initial={
              prefersReducedMotion ? false : { opacity: 0, x: -10 }
            }
            key="home-catalog"
            style={{
              pointerEvents: homeView === "catalog" ? "auto" : "none",
            }}
            transition={
              homeView === "catalog"
                ? {
                    delay: prefersReducedMotion ? 0 : 0.34,
                    duration: prefersReducedMotion ? 0 : 0.42,
                    ease: [0.22, 1, 0.36, 1],
                  }
                : {
                    duration: prefersReducedMotion ? 0 : 0.2,
                    ease: [0.4, 0, 1, 1],
                  }
            }
          >
            <HomeCatalog
              isZonesError={isZonesError}
              isZonesLoading={isZonesLoading}
              onBack={handleBackToAtlas}
              zones={zones}
              zonesErrorMessage={getApiErrorMessage(
                zonesQueryError,
                "Unable to load zones.",
              )}
            />
          </motion.main>
        ) : null}
      </div>

      {/* In catalogue mode, give the original reveal footer one viewport of
          runway. Its own -100dvh margin cancels this layout height, so the
          footer keeps the exact original overlap/reveal math while remaining
          fully reachable below the long catalogue. */}
      {catalogLayoutActive ? (
        <div
          aria-hidden="true"
          className="relative z-10 h-[100dvh] bg-[#141414]"
          data-footer-reveal-runway
        />
      ) : null}
      <Footer />
    </div>
  );
}
