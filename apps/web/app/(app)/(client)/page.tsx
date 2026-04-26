"use client";

import { skipToken } from "@reduxjs/toolkit/query";
import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { SplitText } from "gsap/SplitText";
import dynamic from "next/dynamic";
import Link from "next/link";
import { shouldRunHomePreloader } from "@/components/layout/preloader-session";
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
  z-index: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #fff;
  color: #7a7a7a;
}

[data-preloader-shell] .preloader {
  z-index: 2;
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: #000;
  color: #fff;
  text-align: center;
  transform: scale(0.75);
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
  const [shouldRunInitialPreloader] = useState(shouldRunHomePreloader);
  const [shouldRenderStage, setShouldRenderStage] = useState(
    () => !shouldRunInitialPreloader,
  );
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const stageReadyRef = useRef(false);
  const pendingEngageRef = useRef(false);
  const runExitAnimationRef = useRef<(() => void) | null>(null);
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
  }));
  const selectedZone = activeSelectedZoneId
    ? (zones.find((zone) => zone.id === activeSelectedZoneId) ?? null)
    : null;
  const selectedZoneModalities = modalitiesResponse?.items ?? EMPTY_MODALITIES;

  function handleSelectZone(zoneId: string) {
    setSelectedZoneId(zoneId);
  }

  useEffect(() => {
    if (!shouldRunInitialPreloader) {
      stageReadyRef.current = true;
      return;
    }

    let cancelled = false;
    const markStageReady = () => {
      if (cancelled || stageReadyRef.current) {
        return;
      }

      stageReadyRef.current = true;

      if (pendingEngageRef.current) {
        runExitAnimationRef.current?.();
      }
    };
    const readyFallback = window.setTimeout(
      markStageReady,
      STAGE_PRELOAD_READY_TIMEOUT_MS,
    );

    void loadAnatomyStage()
      .then((module) => {
        if (cancelled) {
          return;
        }

        const preloadPromise = module.preloadAnatomyStageAssets?.();
        void preloadPromise?.catch(() => null);
        markStageReady();
      })
      .catch(() => {
        markStageReady();
      });

    return () => {
      cancelled = true;
      window.clearTimeout(readyFallback);
    };
  }, [shouldRunInitialPreloader]);

  useLayoutEffect(() => {
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

    gsap.set(preloader, {
      clearProps: "all",
      display: "flex",
      scale: 1,
      clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
    });
    gsap.set(hero, {
      clearProps: "all",
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

      startTransition(() => {
        setShouldRenderStage(true);
      });
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
      heroSplit?.revert();
      preloaderSplits.forEach((split) => split.revert());
    };
  }, [shouldRunInitialPreloader]);

  const heroClassName = shouldRunInitialPreloader
    ? "hero"
    : "relative h-[100svh] w-full overflow-hidden bg-black text-white";

  return (
    <div
      ref={pageRef}
      data-preloader-shell={shouldRunInitialPreloader ? "" : undefined}
      style={{ minHeight: "100svh", backgroundColor: "#000" }}
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

      <section className={heroClassName}>
        {shouldRenderStage ? (
          <div className="absolute inset-0 z-0">
            <AnatomyStage
              backgroundColor="#141414"
              className="h-full! w-full!"
              onZoneSelect={handleSelectZone}
              selectedZoneId={activeSelectedZoneId}
              showBackdrop={false}
              zones={stageZones}
            />
            <span className="absolute md:w-67.5 w-50 inset-x-4 z-10 md:inset-x-auto top-1 md:top-5 left-1/2 transform -translate-x-1/2 md:translate-x-0 md:left-5 md:bottom-auto h-14 flex items-center">
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
            <span className="absolute inset-x-4 bottom-2 left-1/2 transform -translate-x-1/2 z-10 text-xs flex justify-center gap-1">
              <p className="font-light opacity-50">Built by</p>
              <Link href={"https://admin12121.com"} target="_blank">
                <ShinyText
                  text="Admin12121"
                  duration={2}
                  delay={1}
                  className="text-xs"
                />
              </Link>
            </span>
            {selectedZone ? (
              <Frame className="absolute inset-x-4 bottom-4 z-10 md:inset-x-auto md:top-20 md:left-5 md:bottom-auto md:w-80">
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
                    ) : selectedZoneModalities.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-left text-muted-foreground">
                          No modalities are attached to this zone yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedZoneModalities.map((modality) => (
                        <TableRow key={modality.id}>
                          <TableCell className="font-medium text-left">
                            {selectedZone ? (
                              <Link
                                className="inline-flex items-center underline-offset-4 hover:underline"
                                href={`/${encodeURIComponent(selectedZone.slug)}/${encodeURIComponent(modality.slug)}`}
                              >
                                {modality.name}
                              </Link>
                            ) : (
                              modality.name
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Frame>
            ) : null}

            <Frame className="absolute hidden md:flex inset-x-4 z-10 md:inset-x-auto  md:top-5 md:right-5 md:w-80">
              <Table>
                <TableHeader>
                  <TableRow className="text-left">
                    <TableHead>Regions / Zone</TableHead>
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
                        <TableCell className="font-medium text-left ">
                          {zone.name}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Frame>
          </div>
        ) : null}
        {shouldRunInitialPreloader ? (
          <div className="preloader-revealer z-10" />
        ) : null}
      </section>
    </div>
  );
}
