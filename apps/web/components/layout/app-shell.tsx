import Link from "next/link"
import type { ReactNode } from "react"

import { AppShellActions } from "@/components/layout/app-shell-actions"

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="space-y-1">
            <Link href="/" className="font-heading text-xl font-semibold tracking-tight text-slate-950">
              Anatomy Platform
            </Link>
            <p className="text-sm text-slate-500">Backend-first bootstrap for the March 2026 review</p>
          </div>

          <AppShellActions />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
    </div>
  )
}
