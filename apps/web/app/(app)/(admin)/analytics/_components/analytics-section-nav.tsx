"use client"

import type { ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"

const SECTIONS = [
  { href: "/analytics", label: "Overview", value: "overview" },
  { href: "/analytics/content", label: "Content", value: "content" },
  { href: "/analytics/audience", label: "Audience", value: "audience" },
  { href: "/analytics/acquisition", label: "Acquisition", value: "acquisition" },
  { href: "/analytics/engagement", label: "Engagement", value: "engagement" },
  { href: "/analytics/events", label: "Events", value: "events" },
] as const

export function AnalyticsSectionNav({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const value =
    SECTIONS.find((section) => section.href === pathname)?.value ?? "overview"

  return (
    <Tabs
      className="min-w-0 gap-4"
      onValueChange={(nextValue) => {
        const section = SECTIONS.find((item) => item.value === nextValue)
        if (section) router.push(section.href)
      }}
      value={value}
    >
      <TabsList
        aria-label="Analytics sections"
        className="max-w-full justify-start overflow-x-auto"
      >
        {SECTIONS.map((section) => (
          <TabsTab key={section.value} value={section.value}>
            {section.label}
          </TabsTab>
        ))}
      </TabsList>
      <TabsPanel className="flex flex-col gap-4" value={value}>
        {children}
      </TabsPanel>
    </Tabs>
  )
}
