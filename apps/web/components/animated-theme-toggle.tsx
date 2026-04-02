"use client"

import { useTheme } from "next-themes"

export function AnimatedThemeToggler() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={isDark}
      className="ml-auto inline-flex h-5 w-9 items-center rounded-full border border-border bg-muted px-0.5 transition-colors"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setTheme(isDark ? "light" : "dark")
      }}
    >
      <span
        className={`block h-4 w-4 rounded-full bg-foreground transition-transform ${
          isDark ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  )
}
