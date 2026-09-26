import { AnalyticsOverviewCards } from "@/components/analytics/analytics-overview-cards"
import { getAnalyticsOverview } from "@/lib/analytics/metrics"
import { getAnalyticsReport } from "@/lib/analytics/server"
import { requireCapabilitySession } from "@/lib/auth/session"

export default async function DashboardPage() {
  const { user } = await requireCapabilitySession("view_analytics", "/dashboard")
  const [overview, collection] = await Promise.all([
    getAnalyticsOverview(30),
    getAnalyticsReport(user, { days: 30 }),
  ])

  return (
    <div className="flex min-h-full flex-col gap-4 p-2 pt-4">
      <AnalyticsOverviewCards collection={collection} overview={overview} />
    </div>
  )
}
