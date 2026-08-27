export const ANALYTICS_EVENT_NAMES = [
  "page_view",
  "account_created",
  "structure_selected",
  "content_engaged",
  "subscription_activated",
  "subscription_canceled",
] as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number]

export type AnalyticsEventProperties = {
  page_view: {
    path: string
    title?: string
  }
  account_created: {
    method: "email" | "google" | "passkey"
  }
  structure_selected: {
    modalityId: string
    structureId: string
    zoneId: string
  }
  content_engaged: {
    contentId: string
    durationSeconds: number
    threshold: "30_seconds" | "50_percent" | "completed"
  }
  subscription_activated: {
    billingPeriod: "monthly" | "yearly"
    planId: string
  }
  subscription_canceled: {
    effective: "immediate" | "period_end"
    planId: string
  }
}

export type AnalyticsEventPayload<
  EventName extends AnalyticsEventName = AnalyticsEventName,
> = {
  eventId: string
  eventName: EventName
  occurredAt: string
  originalReferrer: string | null
  properties: AnalyticsEventProperties[EventName]
  sessionReferrer: string | null
  visitorId: string
}

const EVENT_NAME_SET = new Set<string>(ANALYTICS_EVENT_NAMES)

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === "string" && EVENT_NAME_SET.has(value)
}

export function isSafeAnalyticsPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    value.length <= 512
  )
}

export function isValidEngagementDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 86_400
  )
}
