"use client"

import { usePathname, useRouter } from "next/navigation"

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ANALYTICS_EVENT_NAMES } from "@/lib/analytics/events"
import { buildAnalyticsUrl } from "@/lib/analytics/presentation"

function formatEventName(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

const RANGE_ITEMS = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
}
const EVENT_ITEMS = Object.fromEntries(
  ["all", ...ANALYTICS_EVENT_NAMES].map((name) => [
    name,
    name === "all" ? "All events" : formatEventName(name),
  ]),
)

export function AnalyticsFilters({
  days,
  eventName,
  showEventFilter = false,
}: {
  days: number
  eventName?: string
  showEventFilter?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()

  function navigate(next: Partial<{ days: string; event: string }>) {
    router.push(buildAnalyticsUrl(pathname, window.location.search, next))
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        items={RANGE_ITEMS}
        value={String(days)}
        onValueChange={(value) => navigate({ days: value ?? "30" })}
      >
        <SelectTrigger
          aria-label="Analytics date range"
          className="w-40"
          size="sm"
        >
          <SelectValue>Last {days} days</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
        </SelectPopup>
      </Select>

      {showEventFilter ? (
        <Select
          items={EVENT_ITEMS}
          value={eventName ?? "all"}
          onValueChange={(value) => navigate({ event: value ?? "all" })}
        >
          <SelectTrigger
            aria-label="Filter by event name"
            className="w-52"
            size="sm"
          >
            <SelectValue>
              {!eventName || eventName === "all"
                ? "All events"
                : formatEventName(eventName)}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">All events</SelectItem>
            {ANALYTICS_EVENT_NAMES.map((name) => (
              <SelectItem key={name} value={name}>
                {formatEventName(name)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      ) : null}
    </div>
  )
}
