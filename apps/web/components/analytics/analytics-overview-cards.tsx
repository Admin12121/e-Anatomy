import {
  ActivityIcon,
  LinkIcon,
  SparklesIcon,
  UserRoundPlusIcon,
  UsersRoundIcon,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AnalyticsOverview } from "@/lib/analytics/metrics"

function comparisonText(current: number, previous: number) {
  if (current === previous) {
    return "No change from the previous period"
  }

  if (previous === 0) {
    return `${current} new in this period`
  }

  const change = Math.round(((current - previous) / previous) * 100)
  return `${change > 0 ? "+" : ""}${change}% from the previous period`
}

export function AnalyticsOverviewCards({
  overview,
}: {
  overview: AnalyticsOverview
}) {
  const metrics = [
    {
      description: "Unique visitors with a page view",
      footer: "Waiting for page_view collection",
      icon: UsersRoundIcon,
      title: "Visitors",
      value: "—",
    },
    {
      description: "Visitors arriving from another source",
      footer: "Waiting for referrer collection",
      icon: LinkIcon,
      title: "Referred visitors",
      value: "—",
    },
    {
      description: `Accounts created in the last ${overview.rangeDays} days`,
      footer: comparisonText(
        overview.newcomers.current,
        overview.newcomers.previous,
      ),
      icon: UserRoundPlusIcon,
      title: "Newcomers",
      value: overview.newcomers.current.toLocaleString(),
    },
    {
      description: `Accounts with session activity in the last ${overview.rangeDays} days`,
      footer: comparisonText(
        overview.activeAccounts.current,
        overview.activeAccounts.previous,
      ),
      icon: ActivityIcon,
      title: "Active accounts",
      value: overview.activeAccounts.current.toLocaleString(),
    },
    {
      description: "Visitors reaching a defined content threshold",
      footer: "Waiting for content_engaged collection",
      icon: SparklesIcon,
      title: "Engagement",
      value: "—",
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => (
        <Card key={metric.title}>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{metric.title}</CardTitle>
              <metric.icon className="size-4 text-muted-foreground" />
            </div>
            <CardDescription>{metric.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-heading text-3xl font-semibold">
              {metric.value}
            </div>
          </CardContent>
          <CardFooter className="mt-auto text-muted-foreground">
            {metric.footer}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
