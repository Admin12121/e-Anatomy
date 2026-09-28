import { Frame, FramePanel } from "@/components/ui/frame"
import type { AnalyticsOverview } from "@/lib/analytics/metrics"
import type { AnalyticsReport } from "@/lib/analytics/server"
import { formatMetricComparison } from "@/lib/analytics/presentation"

export function AnalyticsMetricCard({
  label,
  meta,
  value,
}: {
  label: string
  meta: string
  value: string
}) {
  return (
    <Frame className="cursor-default outline-1 outline-offset-2 outline-neutral-300/50 transition-colors hover:outline-neutral-300 dark:outline-neutral-800/50 dark:hover:outline-neutral-700">
      <FramePanel>
        <div className="flex min-h-28 flex-col justify-between gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </div>
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-foreground/45 shadow-[0_0_18px_color-mix(in_srgb,var(--foreground)_24%,transparent)]"
            />
          </div>
          <div>
            <div className="font-mono text-4xl font-semibold tracking-tight text-foreground tabular-nums sm:text-5xl">
              {value}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{meta}</div>
          </div>
        </div>
      </FramePanel>
    </Frame>
  )
}

export function AnalyticsOverviewCards({
  collection,
  overview,
}: {
  collection?: AnalyticsReport
  overview: AnalyticsOverview
}) {
  const newcomerComparison = formatMetricComparison(
    overview.newcomers.current,
    overview.newcomers.previous,
  )
  const activeComparison = formatMetricComparison(
    overview.activeAccounts.current,
    overview.activeAccounts.previous,
  )
  const metrics = [
    {
      label: "Visitors",
      meta: collection
        ? `${collection.pageViews.toLocaleString()} page views`
        : "Collection not connected",
      value: collection?.uniqueVisitors.toLocaleString() ?? "—",
    },
    {
      label: "Newcomers",
      meta: newcomerComparison.label,
      value: overview.newcomers.current.toLocaleString(),
    },
    {
      label: "Active accounts",
      meta: activeComparison.label,
      value: overview.activeAccounts.current.toLocaleString(),
    },
    {
      label: "Engagement",
      meta: collection
        ? "30-second engagement threshold"
        : "Collection not connected",
      value: collection?.engagedViews.toLocaleString() ?? "—",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <AnalyticsMetricCard
          key={metric.label}
          label={metric.label}
          meta={metric.meta}
          value={metric.value}
        />
      ))}
    </div>
  )
}
