import { BarChart3Icon, LinkIcon, UsersRoundIcon } from "lucide-react"

import { AnalyticsFilters } from "./_components/analytics-filters"
import { AnalyticsOverviewCards } from "@/components/analytics/analytics-overview-cards"
import {
  CardFrame,
  CardFrameDescription,
  CardFrameHeader,
  CardFrameTitle,
} from "@/components/ui/card"
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
import {
  isAnalyticsEventName,
} from "@/lib/analytics/events"
import { getAnalyticsOverview } from "@/lib/analytics/metrics"
import { requireCapabilitySession } from "@/lib/auth/session"

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapabilitySession("view_analytics", "/analytics")
  const params = await searchParams
  const requestedDays = Number.parseInt(readParam(params.days), 10)
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
  const requestedEvent = readParam(params.event)
  const eventName = isAnalyticsEventName(requestedEvent)
    ? requestedEvent
    : "all"
  const overview = await getAnalyticsOverview(days)
  const baseParams = new URLSearchParams()

  if (days !== 30) baseParams.set("days", String(days))
  if (eventName !== "all") baseParams.set("event", eventName)

  const baseUrl = baseParams.size
    ? `/analytics?${baseParams.toString()}`
    : "/analytics"

  return (
    <div className="flex min-h-full flex-col gap-4 p-2">
      <AnalyticsFilters days={days} eventName={eventName} />
      <AnalyticsOverviewCards overview={overview} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CardFrame>
          <CardFrameHeader>
            <CardFrameTitle>Referral sources</CardFrameTitle>
            <CardFrameDescription>
              Original sources that introduced visitors to the application.
            </CardFrameDescription>
          </CardFrameHeader>
          <Empty className="min-h-64">
            <EmptyMedia variant="icon">
              <LinkIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No referral data yet</EmptyTitle>
              <EmptyDescription>
                This becomes available after first-party page-view collection
                is enabled.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardFrame>

        <CardFrame>
          <CardFrameHeader>
            <CardFrameTitle>New versus returning</CardFrameTitle>
            <CardFrameDescription>
              First-time visitors compared with recognized returning visitors.
            </CardFrameDescription>
          </CardFrameHeader>
          <Empty className="min-h-64">
            <EmptyMedia variant="icon">
              <UsersRoundIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No visitor cohorts yet</EmptyTitle>
              <EmptyDescription>
                Anonymous visitor identifiers are created only when analytics
                collection is explicitly enabled.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardFrame>
      </div>

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
              <TableRow>
                <TableCell colSpan={6} className="h-40">
                  <Empty className="py-8">
                    <EmptyMedia variant="icon">
                      <BarChart3Icon />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>No event data collected</EmptyTitle>
                      <EmptyDescription>
                        The six-event frontend contract is ready. Event rows
                        will appear after the backend collection endpoint is
                        enabled.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Frame>
        <TablePagination
          baseUrl={baseUrl}
          currentPage={1}
          pageSize={25}
          totalItems={0}
          totalPages={1}
        />
      </div>
    </div>
  )
}
