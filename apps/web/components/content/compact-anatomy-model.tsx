"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { Button } from "@/components/ui/button"

const AnatomyStage = dynamic(
  () =>
    import("@/components/anatomy/anatomy-stage").then(
      (module) => module.AnatomyStage,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        Loading anatomy model…
      </div>
    ),
  },
)

export function CompactAnatomyModel({ zoneSlug }: { zoneSlug: string }) {
  const [open, setOpen] = useState(false)
  return (
    <section
      className="space-y-3 rounded-lg border p-3"
      aria-label="3D anatomy preview"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">3D anatomy</h2>
        {open ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        ) : null}
      </div>
      {open ? (
        <AnatomyStage
          className="h-72! rounded-md"
          backgroundColor="#171717"
          showBackdrop={false}
          focusLayer={zoneSlug === "head" ? "brain" : null}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          Load anatomy preview
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Reference anatomy model. Not a reconstruction of the imaging study.
      </p>
    </section>
  )
}
