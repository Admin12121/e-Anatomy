import { Globe2Icon, UsersRoundIcon } from "lucide-react"

import { AnalyticsEmptyPanel } from "../_components/analytics-empty-panel"
import { AnalyticsFilters } from "../_components/analytics-filters"
import { requireCapabilitySession } from "@/lib/auth/session"
import { getAnalyticsReport } from "@/lib/analytics/server"
import { Frame, FramePanel } from "@/components/ui/frame"

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function AudienceAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { user } = await requireCapabilitySession("view_analytics", "/analytics/audience")
  const requestedDays = Number.parseInt(readParam((await searchParams).days), 10)
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
  const report = await getAnalyticsReport(user, { days })

  return (
    <div className="space-y-4">
      <AnalyticsFilters days={days} />
      <div className="grid gap-4 lg:grid-cols-2">
        {report.newVisitors + report.returningVisitors > 0 ? (
          <Frame>
            <FramePanel className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">New visitors</div>
                <div className="mt-2 font-heading text-4xl font-semibold tabular-nums">{report.newVisitors.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Returning</div>
                <div className="mt-2 font-heading text-4xl font-semibold tabular-nums">{report.returningVisitors.toLocaleString()}</div>
              </div>
            </FramePanel>
          </Frame>
        ) : (
          <AnalyticsEmptyPanel description="" emptyDescription="Visitor cohorts will appear after events arrive." emptyTitle="No visitor cohorts yet" icon={UsersRoundIcon} title="New versus returning" />
        )}
        {report.topCountries.length > 0 ? (
          <Frame>
            <FramePanel className="space-y-3">
              {report.topCountries.map((item) => (
                <div className="flex items-center justify-between gap-4" key={item.label}>
                  <span className="font-medium">{item.label}</span>
                  <span className="tabular-nums text-muted-foreground">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </FramePanel>
          </Frame>
        ) : (
          <AnalyticsEmptyPanel description="" emptyDescription="Countries appear when server enrichment supplies a country code." emptyTitle="No geographic data yet" icon={Globe2Icon} title="Top countries" />
        )}
      </div>
    </div>
  )
}
