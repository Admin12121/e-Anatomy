import { ArrowRightIcon } from "lucide-react"

import { AnalyticsOverviewCards } from "@/components/analytics/analytics-overview-cards"
import {
  CardFrame,
  CardFrameAction,
  CardFrameDescription,
  CardFrameHeader,
  CardFrameTitle,
} from "@/components/ui/card"
import { LinkButton } from "@/components/ui/link-button"
import { getAnalyticsOverview } from "@/lib/analytics/metrics"
import { requireCapabilitySession } from "@/lib/auth/session"

export default async function DashboardPage() {
  await requireCapabilitySession("view_analytics", "/dashboard")
  const overview = await getAnalyticsOverview(30)

  return (
    <div className="flex min-h-full flex-col gap-4 p-2">
      <CardFrame>
        <CardFrameHeader>
          <CardFrameTitle>Phase 2 overview</CardFrameTitle>
          <CardFrameDescription>
            Account activity and the current state of analytics collection.
          </CardFrameDescription>
          <CardFrameAction>
            <LinkButton href="/analytics" variant="outline">
              Open analytics
              <ArrowRightIcon />
            </LinkButton>
          </CardFrameAction>
        </CardFrameHeader>
      </CardFrame>
      <AnalyticsOverviewCards overview={overview} />
    </div>
  )
}
