"use client"

import { useRouter } from "next/navigation"

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ANALYTICS_EVENT_NAMES } from "@/lib/analytics/events"

function formatEventName(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

export function AnalyticsFilters({
  days,
  eventName,
}: {
  days: number
  eventName: string
}) {
  const router = useRouter()

  function navigate(next: Partial<{ days: string; event: string }>) {
    const params = new URLSearchParams(window.location.search)
    params.delete("page")

    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all") {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }

    const query = params.toString()
    router.push(query ? `/analytics?${query}` : "/analytics")
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[13rem_16rem_1fr]">
      <Select
        value={String(days)}
        onValueChange={(value) => navigate({ days: value ?? "30" })}
      >
        <SelectTrigger aria-label="Analytics date range">
          <SelectValue>Last {days} days</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
        </SelectPopup>
      </Select>

      <Select
        value={eventName}
        onValueChange={(value) => navigate({ event: value ?? "all" })}
      >
        <SelectTrigger aria-label="Filter by event name">
          <SelectValue>
            {eventName === "all" ? "All events" : formatEventName(eventName)}
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
    </div>
  )
}
