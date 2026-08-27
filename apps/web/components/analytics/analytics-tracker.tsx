"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

import {
  shouldTrackPageView,
  trackAnalyticsEvent,
} from "@/lib/analytics/client"

export function AnalyticsTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || !shouldTrackPageView(pathname)) {
      return
    }

    void trackAnalyticsEvent("page_view", {
      path: pathname,
      title: document.title.slice(0, 160),
    })
  }, [pathname])

  return null
}
