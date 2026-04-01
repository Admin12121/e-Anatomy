"use client";

import { useMemo, useRef, useState, type ElementRef } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Brain,
  ChevronRight,
  Clock3,
  Dna,
  FlaskConical,
  Heart,
  Pill,
  Sparkles,
} from "lucide-react";

import type { HighlightableLayerId } from "@/components/anatomy/anatomy-stage";
import { ClickDissolveTransition } from "@/components/landing/click-dissolve-transition";
import { SkullFluidReveal } from "@/components/landing/skull-fluid-reveal";
import { PulsatingButton } from "@/components/layout/pulsating-button";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

const AnatomyStage = dynamic(
  () =>
    import("@/components/anatomy/anatomy-stage").then(
      (module) => module.AnatomyStage,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

type LandingCategory = {
  focusLayer: HighlightableLayerId | null;
  icon: LucideIcon;
  id: string;
  label: string;
};

const LANDING_CATEGORIES: readonly LandingCategory[] = [
  {
    focusLayer: "brain",
    icon: Brain,
    id: "neurology",
    label: "Neurology",
  },
  {
    focusLayer: "heartKidney",
    icon: Heart,
    id: "cardiovascular",
    label: "Cardiovascular",
  },
  {
    focusLayer: "lungs",
    icon: FlaskConical,
    id: "toxins",
    label: "Toxins",
  },
  {
    focusLayer: "digestive",
    icon: Pill,
    id: "gut-health",
    label: "Gut Health",
  },
  {
    focusLayer: "heartKidney",
    icon: Sparkles,
    id: "hormones",
    label: "Hormones",
  },
  {
    focusLayer: "brain",
    icon: Dna,
    id: "genetics",
    label: "Genetics",
  },
  {
    focusLayer: null,
    icon: Clock3,
    id: "longevity",
    label: "Longevity",
  },
] as const;

export default function HomePage() {
  const [hasStartedExperience, setHasStartedExperience] = useState(false);
  const [isExitingExperience, setIsExitingExperience] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<
    "enter" | "exit"
  >("enter");
  const [transitionRunId, setTransitionRunId] = useState(0);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(
    null,
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  const rootRef = useRef<HTMLElement | null>(null);
  const skullRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLDivElement | null>(null);
  const footerLeftRef = useRef<HTMLSpanElement | null>(null);
  const footerRightRef = useRef<HTMLSpanElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const categoryPanelRef = useRef<HTMLDivElement | null>(null);
  const categoryListRef = useRef<HTMLDivElement | null>(null);
  const enterTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const exitTimelineRef = useRef<gsap.core.Timeline | null>(null);

  const activeCategory = useMemo(
    () =>
      LANDING_CATEGORIES.find(
        (category) => category.id === selectedCategoryId,
      ) ?? null,
    [selectedCategoryId],
  );
  const previewCategory = useMemo(
    () =>
      LANDING_CATEGORIES.find(
        (category) => category.id === hoveredCategoryId,
      ) ?? null,
    [hoveredCategoryId],
  );

  useGSAP(
    () => {
      const stage = stageRef.current;
      const skull = skullRef.current;
      const title = titleRef.current;
      const startButton = startButtonRef.current;
      const footerLeft = footerLeftRef.current;
      const footerRight = footerRightRef.current;
      const backButton = backButtonRef.current;
      const categoryPanel = categoryPanelRef.current;

      if (
        !stage ||
        !skull ||
        !title ||
        !startButton ||
        !footerLeft ||
        !footerRight ||
        !backButton ||
        !categoryPanel
      ) {
        return;
      }

      const categoryItems = categoryListRef.current
        ? gsap.utils.toArray<HTMLElement>(
            "[data-category-item]",
            categoryListRef.current,
          )
        : [];

      gsap.set(skull, { autoAlpha: 1 });
      gsap.set(stage, { autoAlpha: 0 });
      gsap.set(title, { top: "50%", yPercent: -50 });
      gsap.set(startButton, { autoAlpha: 1, y: 0 });
      gsap.set([footerLeft, footerRight], { autoAlpha: 1, x: 0 });
      gsap.set(backButton, { autoAlpha: 0, scale: 0.86, y: -24 });
      gsap.set(categoryPanel, {
        autoAlpha: 0,
        height: 0,
        overflow: "hidden",
        y: 28,
      });
      gsap.set(categoryItems, { autoAlpha: 0, y: 18 });

      enterTimelineRef.current = gsap.timeline({
        defaults: {
          ease: "power3.inOut",
        },
        paused: true,
      });

      enterTimelineRef.current
        .to(
          stage,
          {
            autoAlpha: 1,
            duration: 0.16,
            ease: "none",
          },
          0.04,
        )
        .to(
          title,
          {
            duration: 1.08,
            ease: "expo.inOut",
            top: "2.75rem",
            yPercent: 0,
          },
          0.08,
        )
        .to(
          startButton,
          {
            autoAlpha: 0,
            duration: 0.45,
            ease: "power2.inOut",
            y: 30,
          },
          0,
        )
        .to(
          footerLeft,
          {
            autoAlpha: 0,
            duration: 0.85,
            x: -180,
          },
          0,
        )
        .to(
          footerRight,
          {
            autoAlpha: 0,
            duration: 0.85,
            x: 180,
          },
          0,
        )
        .to(
          backButton,
          {
            autoAlpha: 1,
            duration: 0.5,
            ease: "expo.out",
            scale: 1,
            y: 0,
          },
          0.58,
        )
        .to(
          categoryPanel,
          {
            autoAlpha: 1,
            duration: 0.88,
            ease: "expo.out",
            height: "auto",
            y: 0,
          },
          0.56,
        )
        .to(
          categoryItems,
          {
            autoAlpha: 1,
            duration: 0.48,
            ease: "power3.out",
            stagger: 0.06,
            y: 0,
          },
          0.76,
        )
        .to(
          skull,
          {
            autoAlpha: 0,
            duration: 0.24,
            ease: "power2.out",
          },
          1.06,
        );

      exitTimelineRef.current = gsap.timeline({
        defaults: {
          ease: "power3.inOut",
        },
        onComplete: () => {
          setHasStartedExperience(false);
          setHoveredCategoryId(null);
          setSelectedCategoryId(null);
          setIsExitingExperience(false);
        },
        paused: true,
      });

      exitTimelineRef.current
        .to(
          categoryItems,
          {
            autoAlpha: 0,
            duration: 0.32,
            ease: "power2.inOut",
            stagger: {
              each: 0.03,
              from: "end",
            },
            y: 18,
          },
          0,
        )
        .to(
          categoryPanel,
          {
            autoAlpha: 0,
            duration: 0.82,
            ease: "expo.inOut",
            height: 0,
            y: 28,
          },
          0.08,
        )
        .to(
          backButton,
          {
            autoAlpha: 0,
            duration: 0.46,
            ease: "expo.in",
            scale: 0.86,
            y: -24,
          },
          0.06,
        )
        .to(
          title,
          {
            duration: 1.08,
            ease: "expo.inOut",
            top: "50%",
            yPercent: -50,
          },
          0.24,
        )
        .to(
          footerLeft,
          {
            autoAlpha: 1,
            duration: 0.9,
            x: 0,
          },
          0.46,
        )
        .to(
          footerRight,
          {
            autoAlpha: 1,
            duration: 0.9,
            x: 0,
          },
          0.46,
        )
        .to(
          startButton,
          {
            autoAlpha: 1,
            duration: 0.62,
            ease: "expo.out",
            y: 0,
          },
          0.7,
        )
        .to(
          skull,
          {
            autoAlpha: 1,
            duration: 0.12,
            ease: "none",
          },
          2.72,
        )
        .to(
          stage,
          {
            autoAlpha: 0,
            duration: 0.12,
            ease: "none",
          },
          2.72,
        );
    },
    { scope: rootRef },
  );

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategoryId((currentCategoryId) =>
      currentCategoryId === categoryId ? null : categoryId,
    );
  };

  const handleStartExperience = () => {
    if (hasStartedExperience) {
      return;
    }

    setTransitionDirection("enter");
    setHasStartedExperience(true);
    setTransitionRunId((currentRunId) => currentRunId + 1);
    exitTimelineRef.current?.pause(0);
    enterTimelineRef.current?.restart();
  };

  const handleExitExperience = () => {
    if (!hasStartedExperience || isExitingExperience) {
      return;
    }

    setTransitionDirection("exit");
    setIsExitingExperience(true);
    setTransitionRunId((currentRunId) => currentRunId + 1);
    enterTimelineRef.current?.pause();
    exitTimelineRef.current?.restart();
  };

  return (
    <main
      ref={rootRef as React.RefObject<ElementRef<"main">>}
      className="relative h-screen w-full overflow-hidden bg-[#050507]"
    >
      <div ref={skullRef} className="absolute inset-0 z-0">
        <SkullFluidReveal />
      </div>

      <div
        ref={stageRef}
        className={cn(
          "absolute inset-0 z-[1]",
          hasStartedExperience && !isExitingExperience
            ? "pointer-events-auto"
            : "pointer-events-none",
        )}
      >
        <AnatomyStage
          focusLayer={activeCategory?.focusLayer ?? null}
          modelOffsetY={-0.35}
          previewLayer={previewCategory?.focusLayer ?? null}
          targetModelHeight={5.5}
        />
      </div>

      <ClickDissolveTransition
        runId={transitionRunId}
        sourceRootRef={transitionDirection === "enter" ? skullRef : stageRef}
        targetRootRef={transitionDirection === "enter" ? stageRef : skullRef}
      />

      <button
        ref={backButtonRef}
        aria-label="Back"
        className={cn(
          "absolute left-6 top-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-slate-900 shadow-[0_24px_80px_rgba(63,66,176,0.24)] backdrop-blur-xl",
          hasStartedExperience && !isExitingExperience
            ? "pointer-events-auto"
            : "pointer-events-none",
        )}
        type="button"
        onClick={handleExitExperience}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </span>
      </button>

      <div
        ref={categoryPanelRef}
        className={cn(
          "absolute bottom-5 right-5 z-20 w-[340px] rounded-[30px] border border-white/16 bg-white/10 p-4 shadow-[0_30px_120px_rgba(57,61,175,0.35)] backdrop-blur-2xl",
          hasStartedExperience && !isExitingExperience
            ? "pointer-events-auto"
            : "pointer-events-none",
        )}
      >
        <p className="pb-4 text-center text-[0.78rem] font-semibold tracking-[0.22em] text-slate-900/80 uppercase">
          Explore Categories
        </p>
        <div ref={categoryListRef} className="space-y-3">
          {LANDING_CATEGORIES.map((category) => {
            const Icon = category.icon;
            const isSelected = selectedCategoryId === category.id;

            return (
              <button
                key={category.id}
                data-category-item
                className={cn(
                  "group flex w-full items-center gap-4 rounded-full border px-5 py-4 text-left transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  isSelected
                    ? "border-white/80 bg-white text-slate-900 shadow-[0_20px_50px_rgba(86,91,210,0.26)]"
                    : "border-white/18 bg-white/88 text-slate-800 hover:-translate-y-0.5 hover:border-white/60 hover:bg-white hover:shadow-[0_18px_44px_rgba(86,91,210,0.22)]",
                )}
                type="button"
                onMouseEnter={() => setHoveredCategoryId(category.id)}
                onMouseLeave={() => setHoveredCategoryId(null)}
                onClick={() => handleCategorySelect(category.id)}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    isSelected
                      ? "border-[#7e80fc]/30 bg-[#ecebff] text-slate-900"
                      : "border-slate-200/80 bg-white text-slate-900 group-hover:border-[#7e80fc]/35 group-hover:bg-[#f0efff]",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1 text-lg font-medium tracking-[-0.02em]">
                  {category.label}
                </span>
                <ChevronRight
                  className={cn(
                    "h-5 w-5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    isSelected ? "translate-x-1" : "group-hover:translate-x-1",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      <section className="pointer-events-none absolute inset-0 z-10 h-screen w-full">
        <div className="relative h-full w-full text-white">
          <div
            ref={titleRef}
            className="absolute left-1/2 z-20 -translate-x-1/2 text-center"
          >
            <h1 className="hero-header text-center text-5xl font-bold">
              e-Anatomy
            </h1>
          </div>

          <div className="pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
            <div ref={startButtonRef}>
              <PulsatingButton
                pulseColor="#ffffff63"
                className="bg-white text-xl text-indigo-900"
                disabled={hasStartedExperience}
                onClick={handleStartExperience}
              >
                Start Experience
              </PulsatingButton>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-5 flex w-full items-center justify-between px-8 text-white">
          <span ref={footerLeftRef} className="mono sm">
            Preserving What Remains
          </span>
          <span ref={footerRightRef} className="mono sm">
            [ Since 1961 ]
          </span>
        </div>
      </section>
    </main>
  );
}
