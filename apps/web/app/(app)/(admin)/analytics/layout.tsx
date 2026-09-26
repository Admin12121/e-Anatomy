import type { ReactNode } from "react"

import { AnalyticsSectionNav } from "./_components/analytics-section-nav"

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col gap-4 p-2 pt-3">
      <header className="px-1">
        <AnalyticsSectionNav />
      </header>
      {children}
    </div>
  )
}
