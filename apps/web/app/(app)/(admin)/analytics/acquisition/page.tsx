import { LinkIcon, MousePointerClickIcon } from "lucide-react"

import { AnalyticsEmptyPanel } from "../_components/analytics-empty-panel"
import { AnalyticsFilters } from "../_components/analytics-filters"
import { requireCapabilitySession } from "@/lib/auth/session"
import { getAnalyticsReport } from "@/lib/analytics/server"
import { Frame, FramePanel } from "@/components/ui/frame"

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function AcquisitionAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireCapabilitySession("view_analytics", "/analytics/acquisition")
  const requestedDays = Number.parseInt(readParam((await searchParams).days), 10)
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
  const report = await getAnalyticsReport(user, { days })

  return (
    <div className="space-y-4">
      <AnalyticsFilters days={days} />
      <div className="grid gap-4 lg:grid-cols-2">
        {report.topReferrers.length > 0 ? (
          <Frame>
            <FramePanel className="space-y-3">
              {report.topReferrers.map((item) => (
                <div className="flex items-center justify-between gap-4" key={item.label}>
                  <span className="min-w-0 truncate font-medium">{item.label}</span>
                  <span className="tabular-nums text-muted-foreground">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </FramePanel>
          </Frame>
        ) : (
          <AnalyticsEmptyPanel description="" emptyDescription="Referral sources will appear as page-view events arrive." emptyTitle="No referral data yet" icon={LinkIcon} title="Referral sources" />
        )}
        <AnalyticsEmptyPanel
          description="Viewer entry pages and content discovery paths."
          emptyDescription="Landing-page rankings require stored page-view events."
          emptyTitle="No landing-page data yet"
          icon={MousePointerClickIcon}
          title="Landing content"
        />
      </div>
    </div>
  )
}
