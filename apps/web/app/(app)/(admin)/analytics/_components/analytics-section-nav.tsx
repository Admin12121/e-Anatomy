"use client"

import { usePathname } from "next/navigation"

import { RouteTabs } from "@/components/ui/route-tabs"

const SECTIONS = [
  { href: "/analytics", label: "Overview", value: "overview" },
  { href: "/analytics/content", label: "Content", value: "content" },
  { href: "/analytics/audience", label: "Audience", value: "audience" },
  { href: "/analytics/acquisition", label: "Acquisition", value: "acquisition" },
  { href: "/analytics/engagement", label: "Engagement", value: "engagement" },
  { href: "/analytics/events", label: "Events", value: "events" },
] as const

export function AnalyticsSectionNav() {
  const pathname = usePathname()
  const value =
    SECTIONS.find((section) => section.href === pathname)?.value ?? "overview"

  return <RouteTabs items={SECTIONS} value={value} />
}
