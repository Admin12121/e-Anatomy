import { BarChart3Icon } from "lucide-react"

import { AnalyticsFilters } from "../_components/analytics-filters"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Frame } from "@/components/ui/frame"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TablePagination } from "@/components/ui/table-pagination"
import { isAnalyticsEventName } from "@/lib/analytics/events"
import { getAnalyticsEvents } from "@/lib/analytics/server"
import { requireCapabilitySession } from "@/lib/auth/session"

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function AnalyticsEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireCapabilitySession("view_analytics", "/analytics/events")
  const params = await searchParams
  const requestedDays = Number.parseInt(readParam(params.days), 10)
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
  const requestedEvent = readParam(params.event)
  const eventName = isAnalyticsEventName(requestedEvent) ? requestedEvent : "all"
  const requestedPage = Number.parseInt(readParam(params.page), 10)
  const page = Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1)
  const report = await getAnalyticsEvents(user, {
    days,
    eventName,
    page,
  })
  const totalPages = Math.max(1, Math.ceil(report.total / 25))
  const baseParams = new URLSearchParams()

  if (days !== 30) baseParams.set("days", String(days))
  if (eventName !== "all") baseParams.set("event", eventName)

  const baseUrl = baseParams.size
    ? `/analytics/events?${baseParams.toString()}`
    : "/analytics/events"

  return (
    <div className="space-y-4">
      <AnalyticsFilters days={days} eventName={eventName} showEventFilter />
      <div>
        <Frame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Visitor type</TableHead>
                <TableHead>Account state</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Referrer</TableHead>
                <TableHead className="text-right">Occurred</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.items.length === 0 ? (
                <TableRow>
                  <TableCell className="h-40" colSpan={6}>
                  <Empty className="py-8">
                    <EmptyMedia variant="icon">
                      <BarChart3Icon />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>No event data collected</EmptyTitle>
                      <EmptyDescription>
                        Event rows will appear after the first-party collection endpoint is enabled.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                report.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.eventName.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.visitorId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.path ?? item.contentId?.slice(0, 8) ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">
                      {item.originalReferrer ?? "Direct"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.occurredAt))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Frame>
        <TablePagination
          baseUrl={baseUrl}
          currentPage={Math.min(page, totalPages)}
          pageSize={25}
          totalItems={report.total}
          totalPages={totalPages}
        />
      </div>
    </div>
  )
}
