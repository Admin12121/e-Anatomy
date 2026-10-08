"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BoxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Loader from "@/components/ui/loader";
import { useTheme } from "next-themes";
import styles from "./public-article.module.css";

const AnatomyStage = dynamic(
  () =>
    import("@/components/anatomy/anatomy-stage").then(
      (module) => module.AnatomyStage,
    ),
  {
    ssr: false,
    loading: () => <div className="h-80" />,
  },
);

class ModelBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ModelLoader() {
  const loaderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const svg = loaderRef.current?.querySelector("svg");
    if (!svg) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (motion.matches) svg.pauseAnimations();
      else svg.unpauseAnimations();
    };
    sync();
    motion.addEventListener("change", sync);
    return () => motion.removeEventListener("change", sync);
  }, []);

  return (
    <div
      ref={loaderRef}
      role="status"
      data-model-loader=""
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <span className="sr-only">Loading anatomy model…</span>
      <div aria-hidden="true" className="size-64 max-w-full [&>svg]:size-full">
        <Loader />
      </div>
    </div>
  );
}

export function CompactAnatomyModel({
  contentSlug,
  regionSlug,
  onRegionSelect,
}: {
  contentSlug: string;
  /** Region to highlight; the sidebar shows this region's structures. */
  regionSlug?: string | null;
  onRegionSelect?: (regionSlug: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const background = resolvedTheme === "dark" ? "#000030" : "#f2f2f2";
  const previewLayer =
    contentSlug === "brain" || contentSlug === "lungs" ? contentSlug : null;
  const previewRef = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const markReady = useCallback(() => setReady(true), []);
  const markFailed = useCallback(() => setFailed(true), []);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const requestPreview = () => {
      // Do not hide Canvas's unsupported-browser fallback behind a loading
      // overlay, or load model assets when WebGL cannot render them.
      try {
        const probe = document.createElement("canvas");
        const context = probe.getContext("webgl2") || probe.getContext("webgl");
        setUnavailable(!context);
        context?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        setUnavailable(true);
      }
      setRequested(true);
    };
    if (typeof IntersectionObserver === "undefined") {
      requestPreview();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestPreview();
          observer.disconnect();
        }
      },
      { rootMargin: "80px" },
    );
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="relative"
      aria-label="3D anatomy preview"
      data-content-slug={contentSlug}
    >
      <div
        ref={previewRef}
        className="relative h-[min(54rem,calc(100dvh-12rem))] min-h-72 overflow-hidden"
      >
        {requested && !unavailable ? (
          <ModelBoundary key={attempt} onError={markFailed}>
            <div className={styles.model} data-ready={ready}>
              <AnatomyStage
                className="h-[min(54rem,calc(100dvh-12rem))]! min-h-72!"
                backgroundColor={background}
                surfaceTone={resolvedTheme === "dark" ? "dark" : "light"}
                showBackdrop={false}
                targetModelHeight={6.3}
                modelZoom={1.3}
                cameraTargetY={0.67}
                loadingFallback={null}
                previewLayer={previewLayer}
                selectedRegionSlug={regionSlug ?? undefined}
                onRegionSelect={onRegionSelect}
                showPartsToggle={false}
                onReady={markReady}
                onError={markFailed}
              />
            </div>
          </ModelBoundary>
        ) : null}
        {requested && !ready && !unavailable && !failed ? <ModelLoader /> : null}
        {unavailable || failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-5 text-center text-sm text-muted-foreground">
            <BoxIcon aria-hidden="true" className="size-6" />
            <p>
              {unavailable
                ? "3D preview is unavailable in this browser."
                : "The anatomy preview could not load."}
            </p>
            {failed ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReady(false);
                  setFailed(false);
                  setAttempt((current) => current + 1);
                }}
              >
                Retry preview
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
