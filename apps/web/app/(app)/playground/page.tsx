"use client"

import dynamic from "next/dynamic"

const AnatomyPlayground = dynamic(
  () => import("./_components").then((module) => module.AnatomyPlayground),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0d] text-sm text-white/75">
        Loading anatomy playground...
      </div>
    ),
  },
)

export default function PlaygroundPage() {
  return <AnatomyPlayground />
}
