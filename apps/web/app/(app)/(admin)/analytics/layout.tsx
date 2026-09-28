import type { ReactNode } from "react"

import { AnalyticsSectionNav } from "./_components/analytics-section-nav"

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full p-2 pt-3">
      <AnalyticsSectionNav>{children}</AnalyticsSectionNav>
    </div>
  )
}
