import { ContentReport, reportDays } from "../_components/content-report"
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ days?: string }>
}) {
  return (
    <ContentReport
      slug={(await params).slug}
      section="overview"
      days={reportDays((await searchParams).days)}
    />
  )
}
