import { BarChart3Icon } from "lucide-react"

import { AnalyticsEmptyPanel } from "./_components/analytics-empty-panel"
import { AnalyticsFilters } from "./_components/analytics-filters"
import { AnalyticsOverviewCards } from "@/components/analytics/analytics-overview-cards"
import { Badge } from "@/components/ui/badge"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import { getAnalyticsOverview } from "@/lib/analytics/metrics"
import { getAnalyticsReport } from "@/lib/analytics/server"
import { requireCapabilitySession } from "@/lib/auth/session"

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireCapabilitySession("view_analytics", "/analytics")
  const params = await searchParams
  const requestedDays = Number.parseInt(readParam(params.days), 10)
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
  const [overview, collection] = await Promise.all([
    getAnalyticsOverview(days),
    getAnalyticsReport(user, { days }),
  ])

  return (
    <div className="space-y-4">
      <AnalyticsFilters days={days} />
      <AnalyticsOverviewCards collection={collection} overview={overview} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.5fr)]">
        <AnalyticsEmptyPanel
          description="Visitors and engaged viewers across the selected period."
          emptyDescription="The trend will appear after the first-party event endpoint is connected."
          emptyTitle="No performance history yet"
          icon={BarChart3Icon}
          title="Performance trend"
        />
        <Frame>
          <FrameHeader>
            <FrameTitle>Collection readiness</FrameTitle>
            <FrameDescription>
              Data sources currently available to reporting.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Account activity</span>
              <Badge variant="success">Available</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Page views</span>
              <Badge variant="success">Available</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Referrers and countries</span>
              <Badge variant="success">Available</Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Content engagement</span>
              <Badge variant="success">Available</Badge>
            </div>
          </FramePanel>
        </Frame>
      </div>
    </div>
  )
}
