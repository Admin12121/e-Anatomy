import { AnalyticsMetricCard } from "@/components/analytics/analytics-overview-cards";
import {
  ContentDimensionChart,
  ContentTrendChart,
} from "@/components/content/report-chart";
import { ReportPeriodSelect } from "@/components/content/report-period-select";
import { requireCapabilitySession } from "@/lib/auth/session";
import { getAnalyticsReport } from "@/lib/analytics/server";
import { loadContentContext } from "@/lib/content/server";
import { contentReportSeries } from "@/lib/content/report-series";

export async function ContentReport({
  slug,
  section,
  days,
}: {
  slug: string;
  section: "overview" | "audience" | "acquisition" | "engagement";
  days: number;
}) {
  const { user, content } = await loadContentContext(slug);
  await requireCapabilitySession(
    "view_analytics",
    `/content/${slug}/${section}`,
  );
  const report = await getAnalyticsReport(user, {
    contentId: content.id,
    days,
  });
  const series = contentReportSeries(
    report.daily,
    days,
    new Date().toISOString().slice(0, 10),
  );
  function dimensions(
    title: string,
    values: { label: string; value: number }[],
  ) {
    return <ContentDimensionChart title={title} data={values} />;
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <ReportPeriodSelect key={`${section}-${days}`} days={days} />
      </div>
      {section === "overview" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {[
              ["Total views", report.pageViews, "Content page views"],
              ["Unique viewers", report.uniqueVisitors, "Recognized visitors"],
              ["Engaged views", report.engagedViews, "30-second threshold"],
              [
                "Ready variants",
                content.readyVariantCount,
                `${content.totalVariantCount} total variants`,
              ],
            ].map(([label, value, meta]) => (
              <AnalyticsMetricCard
                key={String(label)}
                label={String(label)}
                value={Number(value).toLocaleString()}
                meta={String(meta)}
              />
            ))}
          </div>
          <ContentTrendChart data={series} days={days} />
        </>
      ) : null}
      {section === "audience" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <AnalyticsMetricCard
              label="New viewers"
              value={report.newVisitors.toLocaleString()}
              meta="First recognized visit"
            />
            <AnalyticsMetricCard
              label="Returning viewers"
              value={report.returningVisitors.toLocaleString()}
              meta="Previously recognized visitors"
            />
          </div>
          {dimensions("Countries", report.topCountries)}
        </>
      ) : null}
      {section === "acquisition"
        ? dimensions("Traffic sources", report.topReferrers)
        : null}
      {section === "engagement" ? (
        <>
          <ContentTrendChart
            key="engagement"
            data={series}
            days={days}
            title="Engagement over time"
            initialMetric="engaged"
          />
        </>
      ) : null}
    </div>
  );
}

export function reportDays(value: string | string[] | undefined) {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return [7, 30, 90].includes(days) ? days : 30;
}
