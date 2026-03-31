"use client"

import { AnatomyStage } from "@/components/anatomy/anatomy-stage"

export function AnatomyPlayground() {
  return (
    <AnatomyStage
      overlay={(hoveredLayer) => (
        <header className="pointer-events-none absolute left-6 top-6 z-10 max-w-sm space-y-3">
          <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[0.65rem] font-medium tracking-[0.24em] uppercase text-white/70 backdrop-blur">
            Anatomy Playground
          </div>
          <div className="space-y-2">
            <h1 className="font-heading text-3xl tracking-tight text-white md:text-4xl">
              X-ray anatomy stack
            </h1>
            <p className="max-w-xs text-sm leading-6 text-white/60">
              The shell stays transparent while the internal anatomy remains fully
              readable from the outside.
            </p>
            {hoveredLayer ? (
              <p className="text-xs font-medium tracking-[0.18em] uppercase text-white/80">
                {hoveredLayer === "heartKidney"
                  ? "Heart"
                  : hoveredLayer}
              </p>
            ) : null}
          </div>
        </header>
      )}
    />
  )
}

export default AnatomyPlayground
