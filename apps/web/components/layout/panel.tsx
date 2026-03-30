import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

type PanelProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "dark"
}

export function Panel({
  className,
  tone = "default",
  ...props
}: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.28)]",
        tone === "default" && "border-slate-200 bg-white/90",
        className,
      )}
      {...props}
    />
  )
}
