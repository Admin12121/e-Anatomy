"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export type RouteTabItem = {
  href: string
  label: string
  value: string
}

export function RouteTabs({
  children,
  className,
  items,
  value,
}: {
  children: ReactNode
  className?: string
  items: readonly RouteTabItem[]
  value: string
}) {
  const router = useRouter()

  return (
    <Tabs
      className={cn("min-w-0 gap-4", className)}
      onValueChange={(nextValue) => {
        const item = items.find((candidate) => candidate.value === nextValue)
        if (item) router.push(item.href)
      }}
      value={value}
    >
      <TabsList
        aria-label="Page sections"
        className="max-w-full justify-start overflow-x-auto"
      >
        {items.map((item) => (
          <TabsTab key={item.value} value={item.value}>
            {item.label}
          </TabsTab>
        ))}
      </TabsList>
      <TabsPanel className="flex flex-col gap-4" value={value}>
        {children}
      </TabsPanel>
    </Tabs>
  )
}
