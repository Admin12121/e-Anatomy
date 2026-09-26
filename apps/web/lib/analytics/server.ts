import "server-only"

import { buildInternalAdminHeaders } from "@/lib/api/admin"
import { serverApiFetch } from "@/lib/api/server"
import type { SessionUser } from "@/lib/auth/types"

export type AnalyticsDimensionValue = {
  label: string
  value: number
}

export type AnalyticsDailyValue = {
  date: string
  engaged: number
  views: number
}

export type AnalyticsReport = {
  daily: AnalyticsDailyValue[]
  engagedViews: number
  newVisitors: number
  pageViews: number
  rangeDays: number
  returningVisitors: number
  topCountries: AnalyticsDimensionValue[]
  topReferrers: AnalyticsDimensionValue[]
  uniqueVisitors: number
}

export type AnalyticsEventRow = {
  contentId: string | null
  countryCode: string | null
  eventName: string
  id: string
  occurredAt: string
  originalReferrer: string | null
  path: string | null
  visitorId: string
}

export type AnalyticsEventsReport = {
  items: AnalyticsEventRow[]
  total: number
}

function reportQuery({
  contentId,
  days,
}: {
  contentId?: string
  days: number
}) {
  const query = new URLSearchParams({ days: String(days) })
  if (contentId) query.set("contentId", contentId)
  return query
}

export function getAnalyticsReport(
  user: Pick<SessionUser, "apiAccountId" | "id">,
  options: { contentId?: string; days: number },
) {
  return serverApiFetch<AnalyticsReport>(
    `/analytics/overview?${reportQuery(options).toString()}`,
    {
      cache: "no-store",
      includeCookie: false,
      headers: buildInternalAdminHeaders(user),
    },
  )
}

export function getAnalyticsEvents(
  user: Pick<SessionUser, "apiAccountId" | "id">,
  options: {
    contentId?: string
    days: number
    eventName?: string
    page: number
  },
) {
  const query = reportQuery(options)
  query.set("page", String(options.page))
  if (options.eventName && options.eventName !== "all") {
    query.set("event", options.eventName)
  }

  return serverApiFetch<AnalyticsEventsReport>(
    `/analytics/events?${query.toString()}`,
    {
      cache: "no-store",
      includeCookie: false,
      headers: buildInternalAdminHeaders(user),
    },
  )
}
