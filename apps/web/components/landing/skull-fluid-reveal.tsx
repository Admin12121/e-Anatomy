"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

type SceneStatus = "error" | "loading" | "ready" | "unsupported"

type SkullFluidRevealProps = {
  className?: string
}

export function SkullFluidReveal({ className }: SkullFluidRevealProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<SceneStatus>("loading")

  useEffect(() => {
    const host = hostRef.current

    if (!host) {
      return
    }

    if (!("gpu" in navigator)) {
      setStatus("unsupported")
      return
    }

    let mounted = true
    let runtime: { dispose: () => void } | null = null

    void import("./skull-scene/core/landing-skull-scene.js")
      .then(async ({ LandingSkullScene }) => {
        const scene = new LandingSkullScene(host)

        runtime = scene

        await scene.run()

        if (!mounted) {
          scene.dispose()
          return
        }

        setStatus("ready")
      })
      .catch((error) => {
        console.error("Failed to initialize skull scene", error)
        runtime?.dispose()

        if (mounted) {
          setStatus("error")
        }
      })

    return () => {
      mounted = false
      runtime?.dispose()
    }
  }, [])

  return (
    <div
      data-state={status}
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div
        ref={hostRef}
        aria-hidden="true"
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(14,165,233,0.2),transparent_26%),radial-gradient(circle_at_75%_18%,rgba(125,211,252,0.12),transparent_24%),linear-gradient(180deg,rgba(2,6,12,0.35),rgba(2,6,23,0.88))]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:6rem_6rem] opacity-20 [mask-image:radial-gradient(circle_at_center,black,transparent_88%)]" />
    </div>
  )
}
