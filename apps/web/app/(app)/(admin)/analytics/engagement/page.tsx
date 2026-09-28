import { ScanSearchIcon } from "lucide-react"

import { AnalyticsEmptyPanel } from "../_components/analytics-empty-panel"
import { AnalyticsFilters } from "../_components/analytics-filters"
import { requireCapabilitySession } from "@/lib/auth/session"
import { getAnalyticsReport } from "@/lib/analytics/server"
import { AnalyticsMetricCard } from "@/components/analytics/analytics-overview-cards"

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function EngagementAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireCapabilitySession("view_analytics", "/analytics/engagement")
  const requestedDays = Number.parseInt(readParam((await searchParams).days), 10)
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
  const report = await getAnalyticsReport(user, { days })

  return (
    <div className="space-y-4">
      <AnalyticsFilters days={days} />
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsMetricCard
          label="Engagement"
          meta="30-second engagement threshold"
          value={report.engagedViews.toLocaleString()}
        />
        <AnalyticsEmptyPanel
          description="Structures receiving the most selections and viewing time."
          emptyDescription="Structure rankings require corrected content engagement events."
          emptyTitle="No structure activity yet"
          icon={ScanSearchIcon}
          title="Structure interest"
        />
      </div>
    </div>
  )
}
