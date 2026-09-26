import {
  ActivityIcon,
  SparklesIcon,
  UserRoundPlusIcon,
  UsersRoundIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AnalyticsOverview } from "@/lib/analytics/metrics"
import type { AnalyticsReport } from "@/lib/analytics/server"
import { formatMetricComparison } from "@/lib/analytics/presentation"

function ComparisonBars({
  current,
  previous,
}: {
  current: number | null
  previous: number | null
}) {
  if (current === null || previous === null) {
    return (
      <div aria-label="Awaiting analytics data" className="flex h-10 w-24 items-end gap-1">
        {Array.from({ length: 7 }).map((_, index) => (
          <span
            className="h-px flex-1 border-t border-dotted border-muted-foreground/50"
            key={index}
          />
        ))}
      </div>
    )
  }

  const maximum = Math.max(current, previous, 1)
  const previousHeight = Math.max(4, Math.round((previous / maximum) * 32))
  const currentHeight = Math.max(4, Math.round((current / maximum) * 32))

  return (
    <div
      aria-label={`Previous ${previous}, current ${current}`}
      className="flex h-10 w-16 items-end justify-end gap-1.5"
    >
      <span
        className="w-3 rounded-sm bg-muted-foreground/30"
        style={{ height: previousHeight }}
      />
      <span
        className="w-3 rounded-sm bg-primary/80"
        style={{ height: currentHeight }}
      />
    </div>
  )
}

export function AnalyticsMetricCard({
  comparisonLabel,
  current = null,
  detail,
  footer,
  icon: Icon,
  previous = null,
  title,
  value,
}: {
  comparisonLabel?: string
  current?: number | null
  detail: string
  footer: string
  icon: LucideIcon
  previous?: number | null
  title: string
  value: string
}) {
  return (
    <Card className="min-h-44 gap-0 py-0" size="sm">
      <CardHeader className="pt-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 items-end justify-between gap-4 pb-4 pt-3">
        <div className="min-w-0">
          <div className="font-heading text-4xl font-semibold tabular-nums">
            {value}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {comparisonLabel ?? footer}
          </div>
        </div>
        <ComparisonBars current={current} previous={previous} />
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-3 border-t bg-muted/25 py-3 text-muted-foreground">
        <span className="font-medium text-foreground">{footer}</span>
        <span className="text-right text-xs">{detail}</span>
      </CardFooter>
    </Card>
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
      comparison: null,
      current: collection?.uniqueVisitors ?? null,
      detail: collection
        ? `${collection.pageViews.toLocaleString()} page views`
        : "Unique viewers",
      footer: collection ? "Unique viewers" : "Collection not connected",
      icon: UsersRoundIcon,
      previous: collection ? 0 : null,
      title: "Visitors",
      value: collection?.uniqueVisitors.toLocaleString() ?? "—",
    },
    {
      comparison: newcomerComparison,
      current: overview.newcomers.current,
      detail: `Previous ${overview.rangeDays} days: ${overview.newcomers.previous.toLocaleString()}`,
      footer: "Accounts created",
      icon: UserRoundPlusIcon,
      previous: overview.newcomers.previous,
      title: "Newcomers",
      value: overview.newcomers.current.toLocaleString(),
    },
    {
      comparison: activeComparison,
      current: overview.activeAccounts.current,
      detail: `Previous ${overview.rangeDays} days: ${overview.activeAccounts.previous.toLocaleString()}`,
      footer: "Accounts with session activity",
      icon: ActivityIcon,
      previous: overview.activeAccounts.previous,
      title: "Active accounts",
      value: overview.activeAccounts.current.toLocaleString(),
    },
    {
      comparison: null,
      current: collection?.engagedViews ?? null,
      detail: "30-second threshold",
      footer: collection ? "Engaged views" : "Collection not connected",
      icon: SparklesIcon,
      previous: collection ? 0 : null,
      title: "Engagement",
      value: collection?.engagedViews.toLocaleString() ?? "—",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <AnalyticsMetricCard
          comparisonLabel={metric.comparison?.label}
          current={metric.current}
          detail={metric.detail}
          footer={metric.footer}
          icon={metric.icon}
          key={metric.title}
          previous={metric.previous}
          title={metric.title}
          value={metric.value}
        />
      ))}
    </div>
  )
}
