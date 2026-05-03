"use client"

import { ChevronRightIcon } from "lucide-react"
import { usePathname } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

function normalizePathname(pathname: string | null) {
  if (!pathname || pathname === "/") {
    return "/dashboard"
  }

  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ")
}

function getHeaderState(rawPathname: string | null) {
  const pathname = normalizePathname(rawPathname)
  const segments = pathname.split("/").filter(Boolean)

  if (segments.length === 0 || segments[0] === "dashboard") {
    return { section: "Dashboard" }
  }

  if (segments[0] === "playground") {
    if (segments.length === 1) {
      return { section: "Playground" }
    }

    return {
      section: "Playground",
      title: titleCase(segments.slice(1).join(" ")),
    }
  }

  if (segments[0] === "settings") {
    if (segments.length === 1) {
      return { section: "Settings", title: "Account" }
    }

    return {
      section: "Settings",
      title: titleCase(segments.slice(1).join(" ")),
    }
  }

  return {
    section: titleCase(segments[0] ?? "Workspace"),
    title:
      segments.length > 1 ? titleCase(segments.slice(1).join(" ")) : undefined,
  }
}

export function SiteHeader() {
  const pathname = usePathname()
  const { section, title } = getHeaderState(pathname)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center justify-between gap-1 px-4 lg:gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-2 flex data-[orientation=vertical]:h-8 sm:hidden"
          />
          <span className="shrink-0 text-muted-foreground">{section}</span>
          {title ? (
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
          {title ? <h1 className="truncate text-base font-medium">{title}</h1> : null}
        </div>
      </div>
    </header>
  )
}
