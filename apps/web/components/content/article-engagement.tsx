"use client"
import { useEffect } from "react"
import { trackAnalyticsEvent } from "@/lib/analytics/client"

export function ArticleEngagement({
  contentId,
  modalityId,
  zoneId,
  structureId,
}: {
  contentId: string
  modalityId: string | null
  zoneId: string
  structureId: string | null
}) {
  useEffect(() => {
    if (!modalityId) return
    let visibleSeconds = 0
    let sent = false
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || sent) return
      visibleSeconds += 1
      if (visibleSeconds < 30) return
      sent = true
      void trackAnalyticsEvent("content_engaged", {
        contentId,
        modalityId,
        zoneId,
        ...(structureId ? { structureId } : {}),
        durationSeconds: visibleSeconds,
        threshold: "30_seconds",
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [contentId, modalityId, zoneId, structureId])
  return null
}
