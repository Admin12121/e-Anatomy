"use client"

import type {
  AnalyticsEventName,
  AnalyticsEventPayload,
  AnalyticsEventProperties,
} from "@/lib/analytics/events"

const VISITOR_STORAGE_KEY = "anatomy.analytics.visitor"
const ORIGINAL_REFERRER_KEY = "anatomy.analytics.original-referrer"
const SESSION_REFERRER_KEY = "anatomy.analytics.session-referrer"
const PAGE_VIEW_DEDUP_KEY = "anatomy.analytics.last-page-view"
const VISITOR_TTL_MS = 180 * 24 * 60 * 60 * 1000
const PAGE_VIEW_DEDUP_MS = 2_000
let volatileVisitorId: string | null = null

type StoredVisitor = {
  expiresAt: number
  id: string
}

export function normalizeAnalyticsReferrer(value: string, siteOrigin: string) {
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    if (url.origin === siteOrigin) return null
    return `${url.origin}${url.pathname}`.slice(0, 512)
  } catch {
    return null
  }
}

function getVisitorId() {
  const now = Date.now()

  try {
    const stored = window.localStorage.getItem(VISITOR_STORAGE_KEY)

    if (stored) {
      const visitor = JSON.parse(stored) as StoredVisitor

      if (
        typeof visitor.id === "string" &&
        visitor.id.length > 0 &&
        visitor.expiresAt > now
      ) {
        return visitor.id
      }
    }
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }

  if (volatileVisitorId) return volatileVisitorId

  const id = window.crypto.randomUUID()
  volatileVisitorId = id

  try {
    window.localStorage.setItem(
      VISITOR_STORAGE_KEY,
      JSON.stringify({
        expiresAt: now + VISITOR_TTL_MS,
        id,
      } satisfies StoredVisitor),
    )
  } catch {
    // The in-memory identifier still keeps this page event internally coherent.
  }

  return id
}

function getReferrers() {
  const currentReferrer = normalizeAnalyticsReferrer(
    document.referrer,
    window.location.origin,
  )
  let originalReferrer = currentReferrer
  let sessionReferrer = currentReferrer

  try {
    originalReferrer =
      window.localStorage.getItem(ORIGINAL_REFERRER_KEY) ?? currentReferrer

    if (originalReferrer && !window.localStorage.getItem(ORIGINAL_REFERRER_KEY)) {
      window.localStorage.setItem(ORIGINAL_REFERRER_KEY, originalReferrer)
    }

    sessionReferrer =
      window.sessionStorage.getItem(SESSION_REFERRER_KEY) ?? currentReferrer

    if (sessionReferrer && !window.sessionStorage.getItem(SESSION_REFERRER_KEY)) {
      window.sessionStorage.setItem(SESSION_REFERRER_KEY, sessionReferrer)
    }
  } catch {
    // Referrer values remain available for this event when storage is blocked.
  }

  return { originalReferrer, sessionReferrer }
}

export function shouldTrackPageView(path: string) {
  const now = Date.now()

  try {
    const stored = window.sessionStorage.getItem(PAGE_VIEW_DEDUP_KEY)

    if (stored) {
      const previous = JSON.parse(stored) as { at: number; path: string }

      if (previous.path === path && now - previous.at < PAGE_VIEW_DEDUP_MS) {
        return false
      }
    }

    window.sessionStorage.setItem(
      PAGE_VIEW_DEDUP_KEY,
      JSON.stringify({ at: now, path }),
    )
  } catch {
    // A failed dedup store must not break navigation.
  }

  return true
}

export async function trackAnalyticsEvent<EventName extends AnalyticsEventName>(
  eventName: EventName,
  properties: AnalyticsEventProperties[EventName],
) {
  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT

  if (
    process.env.NEXT_PUBLIC_ANALYTICS_COLLECTION_ENABLED !== "true" ||
    !endpoint
  ) {
    return { status: "disabled" as const }
  }

  const referrers = getReferrers()
  const payload: AnalyticsEventPayload<EventName> = {
    eventId: window.crypto.randomUUID(),
    eventName,
    occurredAt: new Date().toISOString(),
    originalReferrer: referrers.originalReferrer,
    properties,
    sessionReferrer: referrers.sessionReferrer,
    visitorId: getVisitorId(),
  }
  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      keepalive: true,
      method: "POST",
    })

    return { status: response.ok ? ("sent" as const) : ("failed" as const) }
  } catch {
    // Analytics must never interrupt navigation or viewer interactions.
    return { status: "failed" as const }
  }
}
