import {
  ActivityIcon,
  ArrowLeftIcon,
  BarChart3Icon,
  ExternalLinkIcon,
  Globe2Icon,
  LinkIcon,
  UsersRoundIcon,
} from "lucide-react"
import { notFound } from "next/navigation"

import { AnalyticsMetricCard } from "@/components/analytics/analytics-overview-cards"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import { LinkButton } from "@/components/ui/link-button"
import { RouteTabs } from "@/components/ui/route-tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireCapabilitySession } from "@/lib/auth/session"
import { findContentBySlug } from "@/lib/content/catalog"
import { loadContentCatalog } from "@/lib/content/catalog-server"
import { resolveRouteTab } from "@/lib/analytics/presentation"
import { getAnalyticsReport } from "@/lib/analytics/server"

const TABS = ["overview", "audience", "acquisition", "engagement"] as const
type ContentTab = (typeof TABS)[number]

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  )
}

function AnalyticsUnavailable({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: typeof BarChart3Icon
  title: string
}) {
  return (
    <Empty className="min-h-64">
      <EmptyMedia variant="icon">
        <Icon />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export default async function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const tab = resolveRouteTab<ContentTab>(
    (await searchParams).tab,
    TABS,
    "overview",
  )
  const { user } = await requireCapabilitySession(
    "view_analytics",
    `/content/${slug}`,
  )
  const content = findContentBySlug(await loadContentCatalog(user), slug)

  if (!content) {
    notFound()
  }

  const report = await getAnalyticsReport(user, {
    contentId: content.id,
    days: 30,
  })

  const metrics = [
    {
      detail: "Event collection required",
      footer: "Content page views",
      icon: BarChart3Icon,
      title: "Total views",
      value: report.pageViews.toLocaleString(),
    },
    {
      detail: "Distinct visitor IDs",
      footer: "Unique viewers",
      icon: UsersRoundIcon,
      title: "Unique viewers",
      value: report.uniqueVisitors.toLocaleString(),
    },
    {
      detail: "30-second threshold",
      footer: "Engaged views",
      icon: ActivityIcon,
      title: "Engagement",
      value: report.engagedViews.toLocaleString(),
    },
    {
      detail: "Insufficient history",
      footer: "Awaiting history",
      icon: Globe2Icon,
      title: "Trending",
      value: report.daily.length >= 2 ? "Active" : "—",
    },
  ]
  const routeTabs = TABS.map((item) => ({
    href:
      item === "overview"
        ? `/content/${content.primarySlug}`
        : `/content/${content.primarySlug}?tab=${item}`,
    label: item[0].toUpperCase() + item.slice(1),
    value: item,
  }))

  return (
    <div className="flex min-h-full flex-col gap-4 p-2">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <LinkButton aria-label="Back to content" href="/content" size="icon-sm" variant="ghost">
            <ArrowLeftIcon />
          </LinkButton>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate font-heading text-xl font-semibold tracking-tight">
              {content.name}
            </h1>
            <Badge variant="outline">{content.modalityType.toUpperCase()}</Badge>
            <Badge variant="secondary">{content.zoneName}</Badge>
          </div>
        </div>
        <LinkButton
          href={`/playground/zones/${content.zoneId}/modalities/${content.primaryModalityId}/viewer`}
          variant="outline"
        >
          Manage content
          <ExternalLinkIcon />
        </LinkButton>
      </div>

      <RouteTabs items={routeTabs} value={tab} />

      {tab === "overview" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <AnalyticsMetricCard
                detail={metric.detail}
                footer={metric.footer}
                icon={metric.icon}
                key={metric.title}
                title={metric.title}
                value={metric.value}
              />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.5fr)]">
            <Frame>
              <FrameHeader>
                <FrameTitle>Views over time</FrameTitle>
                <FrameDescription>
                  Daily views and engaged viewers for the selected period.
                </FrameDescription>
              </FrameHeader>
              <AnalyticsUnavailable
                description="The chart will appear after first-party content events are stored and aggregated."
                icon={BarChart3Icon}
                title="No view history yet"
              />
            </Frame>
            <Frame>
              <FrameHeader>
                <FrameTitle>Content health</FrameTitle>
                <FrameDescription>Current publishing and variant state.</FrameDescription>
              </FrameHeader>
              <FramePanel className="grid gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Ready variants</div>
                  <div className="mt-1 font-heading text-3xl font-semibold tabular-nums">
                    {content.readyVariantCount}/{content.totalVariantCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Last updated</div>
                  <div className="mt-1 font-medium">{formatDate(content.latestUpdatedAt)}</div>
                </div>
              </FramePanel>
            </Frame>
          </div>
        </>
      ) : null}

      {tab === "audience" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Frame>
            <FrameHeader>
              <FrameTitle>New versus returning</FrameTitle>
              <FrameDescription>Recognized first-time and returning viewers.</FrameDescription>
            </FrameHeader>
            <AnalyticsUnavailable
              description="Audience cohorts will appear after visitor events are stored."
              icon={UsersRoundIcon}
              title="No audience cohorts yet"
            />
          </Frame>
          <Frame>
            <FrameHeader>
              <FrameTitle>Top countries</FrameTitle>
              <FrameDescription>Country-level distribution without retaining raw IP addresses.</FrameDescription>
            </FrameHeader>
            <AnalyticsUnavailable
              description="Country data will appear after server-side event enrichment is enabled."
              icon={Globe2Icon}
              title="No geographic data yet"
            />
          </Frame>
        </div>
      ) : null}

      {tab === "acquisition" ? (
        <Frame>
          <FrameHeader>
            <FrameTitle>Traffic sources</FrameTitle>
            <FrameDescription>Original and session referrers for this content.</FrameDescription>
          </FrameHeader>
          <AnalyticsUnavailable
            description="Referrer rankings will appear after first-party page-view collection is connected."
            icon={LinkIcon}
            title="No acquisition data yet"
          />
        </Frame>
      ) : null}

      {tab === "engagement" ? (
        <div className="space-y-4">
          <Frame>
            <FrameHeader>
              <FrameTitle>Variant performance</FrameTitle>
              <FrameDescription>Current variants included in this content family.</FrameDescription>
            </FrameHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Weighting</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {content.variants.map((variant) => (
                  <TableRow key={variant.id}>
                    <TableCell className="font-medium">{variant.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {variant.weightingCode?.toUpperCase() ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{variant.processingStatus.replaceAll("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDate(variant.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Frame>
          <Frame>
            <FrameHeader>
              <FrameTitle>Structure engagement</FrameTitle>
              <FrameDescription>Most selected and longest-viewed structures.</FrameDescription>
            </FrameHeader>
            <AnalyticsUnavailable
              description="Structure rankings will appear after corrected content and structure identifiers are stored."
              icon={ActivityIcon}
              title="No engagement events yet"
            />
          </Frame>
        </div>
      ) : null}
    </div>
  )
}
