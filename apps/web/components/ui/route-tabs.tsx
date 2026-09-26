"use client"

import { useRouter } from "next/navigation"

import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export type RouteTabItem = {
  href: string
  label: string
  value: string
}

export function RouteTabs({
  className,
  items,
  value,
}: {
  className?: string
  items: readonly RouteTabItem[]
  value: string
}) {
  const router = useRouter()

  return (
    <Tabs
      className={cn("min-w-0 gap-0", className)}
      onValueChange={(nextValue) => {
        const item = items.find((candidate) => candidate.value === nextValue)
        if (item) router.push(item.href)
      }}
      value={value}
    >
      <TabsList
        aria-label="Page sections"
        className="max-w-full justify-start overflow-x-auto"
        variant="underline"
      >
        {items.map((item) => (
          <TabsTab key={item.value} value={item.value}>
            {item.label}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  )
}
