"use client";

/** The canonical Anatomy stage: Human Atlas meshes, original Anatomy shell/UI.
 * The previous GLB anchor markers and create-mode pointers are intentionally absent.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import AnatomyScene from "./atlas/scene";
import { DEFAULT_VISIBLE, SYSTEMS, type Atlas, type SystemId } from "./atlas/anatomy";
import type { ZoneAnchor } from "@/lib/playground/types";
import { cn } from "@/lib/utils";
import { FIXED_REGIONS } from "./regions";

export { FIXED_REGIONS };
export type HighlightableLayerId = "brain" | "lungs" | "heartKidney" | "digestive";
export type AnatomyStageZone = { id: string; name: string; slug?: string; anchor?: ZoneAnchor };

type Props = {
  backgroundColor?: string;
  loadingFallback?: ReactNode;
  surfaceTone?: "light" | "dark";
  className?: string;
  /** Kept for callers still transitioning off the former anchor editor. */
  createMode?: boolean;
  draftAnchor?: ZoneAnchor | null;
  focusLayer?: HighlightableLayerId | null;
  modelOffsetX?: number;
  modelOffsetY?: number;
  onCreateAnchor?: (anchor: ZoneAnchor) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  onZoneSelect?: (zoneId: string) => void;
  /** Region-level callbacks, by FIXED_REGIONS slug; work without zone ids. */
  onRegionSelect?: (regionSlug: string) => void;
  onRegionHover?: (regionSlug: string | null) => void;
  /** Highlights a region by slug; takes precedence over selectedZoneId. */
  selectedRegionSlug?: string | null;
  overlay?: (hoveredLayer: HighlightableLayerId | null) => ReactNode;
  previewLayer?: HighlightableLayerId | null;
  selectedZoneId?: string | null;
  showBackdrop?: boolean;
  showPartsToggle?: boolean;
  /** Place controls above the mobile regions/modalities sheet. */
  mobilePanelOffset?: boolean;
  targetModelHeight?: number;
  /** Magnification for previews; 1 = original full-stage framing. */
  modelZoom?: number;
  /** World-space camera centre for vertical framing (previews only). */
  cameraTargetY?: number;
  zones?: readonly AnatomyStageZone[];
};

let sharedAtlas: Promise<Atlas> | undefined;
export function preloadAnatomyStageAssets(): Promise<Atlas> {
  sharedAtlas ??= fetch("/models/atlas-v2.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error("Anatomical catalogue unavailable"); return r.json() as Promise<Atlas>; })
    .catch((error: unknown) => { sharedAtlas = undefined; throw error; });
  return sharedAtlas;
}

const ORGAN_SYSTEMS: SystemId[] = ["cardiac", "respiratory", "digestive", "urinary", "endocrine", "reproductive"];
const ALL_SYSTEMS = SYSTEMS.map((system) => system.id);

export function AnatomyStage({
  backgroundColor = "#141414",
  surfaceTone = "dark",
  className,
  onReady,
  onError,
  onZoneSelect,
  onRegionSelect,
  onRegionHover,
  selectedRegionSlug,
  overlay,
  selectedZoneId,
  showBackdrop = false,
  showPartsToggle = true,
  mobilePanelOffset = false,
  zones = [],
  loadingFallback,
  previewLayer,
  modelZoom = 1.12,
  cameraTargetY = 0.86,
}: Props) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<SystemId[]>(DEFAULT_VISIBLE);
  const [partsOpen, setPartsOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const selectedIndex = useMemo(() => {
    if (selectedRegionSlug !== undefined) {
      return FIXED_REGIONS.findIndex((region) => region.slug === selectedRegionSlug);
    }
    const zone = zones.find((item) => item.id === selectedZoneId);
    if (!zone) return previewLayer === "brain" ? 0 : previewLayer === "lungs" || previewLayer === "heartKidney" ? 2 : previewLayer === "digestive" ? 3 : -1;
    return FIXED_REGIONS.findIndex((region) => region.slug === (zone.slug || zone.name.toLowerCase().replace(/\s*&\s*|\s+|\//g, "-")));
  }, [selectedRegionSlug, selectedZoneId, zones, previewLayer]);

  useEffect(() => { if (error) onError?.(error); }, [error, onError]);

  useEffect(() => {
    let active = true;
    preloadAnatomyStageAssets()
      .then((data) => { if (active) setAtlas(data); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "Unable to load anatomy"); });
    return () => { active = false; };
  }, []);

  const toggle = (id: SystemId) => setVisible((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectRegion = (index: number) => {
    const region = FIXED_REGIONS[index];
    if (!region) return;
    onRegionSelect?.(region.slug);
    const zone = zones.find((item) => item.slug === region.slug || item.name.toLowerCase() === region.name.toLowerCase());
    if (zone) onZoneSelect?.(zone.id);
  };
  const hoverRegion = (index: number | null) => {
    setHovered(index);
    onRegionHover?.(index === null ? null : (FIXED_REGIONS[index]?.slug ?? null));
  };
  const ready = !!atlas && progress === 100 && !error;

  return (
    <section className={cn("relative h-screen w-full overflow-hidden", className)} style={{ backgroundColor }} aria-label="Interactive 3D anatomy atlas">
      {showBackdrop && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.07),transparent_60%)]" />}
      {atlas && !error && (
        <AnatomyScene
          atlas={atlas} visible={visible} selectedRegion={selectedIndex} modelZoom={modelZoom} cameraTargetY={cameraTargetY}
          onRegionClick={selectRegion} onRegionHover={hoverRegion}
          onProgress={setProgress} onError={setError} onReady={onReady}
        />
      )}
      {hovered !== null && <span className="sr-only" aria-live="polite">{FIXED_REGIONS[hovered]?.name}</span>}
      {!ready && !error && <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 mx-auto w-fit rounded-lg bg-black/65 p-3 text-center text-xs text-white/85" role="status">
        {loadingFallback === undefined ? <>Loading Human Atlas anatomy… {progress}%</> : loadingFallback}
      </div>}
      {error && <div role="alert" className="absolute inset-x-4 top-1/2 z-20 mx-auto max-w-sm rounded-xl bg-red-950 p-4 text-sm text-white">
        <p>{error}</p><button className="mt-2 underline" type="button" onClick={() => { setError(null); setProgress(0); setAtlas(null); sharedAtlas = undefined; void preloadAnatomyStageAssets().then(setAtlas).catch((err: unknown) => setError(String(err))); }}>Retry</button>
      </div>}
      {showPartsToggle && (
        <div className={cn("absolute left-4 z-20 flex max-h-[min(82svh,40rem)] max-w-[calc(100vw-2rem)] flex-col items-start text-left text-white md:bottom-5 md:left-6", mobilePanelOffset ? "bottom-[calc(40svh+1.5rem)]" : "bottom-5")}>
          {partsOpen && <div className="mb-2 flex w-64 max-h-[min(78svh,36rem)] min-h-0 flex-col rounded-xl border border-white/15 bg-[#171717]/95 p-3 shadow-2xl backdrop-blur-md" aria-label="Anatomical systems">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-widest"><span>Body parts</span><span className="text-white/50">{SYSTEMS.length}</span></div>
            <div className="mb-3 flex flex-wrap gap-1">
              {[
                { label: "All", ids: ALL_SYSTEMS },
                { label: "Skeleton", ids: ["skeletal"] as SystemId[] },
                { label: "Organs", ids: ORGAN_SYSTEMS },
                { label: "Hide all", ids: [] as SystemId[] },
              ].map(({label,ids}) => <button key={label} type="button" onClick={() => setVisible([...ids])} className="rounded border border-white/20 px-2 py-1 text-[11px] hover:bg-white/15">{label}</button>)}
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain pr-1" data-lenis-prevent aria-label="All 15 anatomical systems">
            {SYSTEMS.map((system) => <label key={system.id} className="flex cursor-pointer items-center justify-between gap-3 rounded px-1.5 py-1 text-xs hover:bg-white/10">
              <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: system.color }} />{system.name}</span>
              <input type="checkbox" checked={visible.includes(system.id)} onChange={() => toggle(system.id)} aria-label={`Show ${system.name}`} className="accent-white" />
            </label>)}
            </div>
          </div>}
          <button type="button" aria-expanded={partsOpen} onClick={() => setPartsOpen(!partsOpen)} className="rounded-lg border border-white/20 bg-[#171717]/90 px-4 py-2 text-xs shadow-lg backdrop-blur-md hover:bg-[#333]">Parts {partsOpen ? "−" : "+"}</button>
        </div>
      )}
      {overlay?.(null)}
      <span className="sr-only">{surfaceTone} anatomy display</span>
    </section>
  );
}

export function SceneFallback() { return <div role="status">Loading 3D anatomy…</div>; }
