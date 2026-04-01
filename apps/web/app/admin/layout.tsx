import type { ReactNode } from "react"

import { AuthSessionProvider } from "@/components/auth/auth-session-provider"
import { AppShell } from "@/components/layout/app-shell"
import { requireAdminSession } from "@/lib/auth/session"

type AdminLayoutProps = {
  children: ReactNode
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await requireAdminSession()

  return (
    <AuthSessionProvider initialSession={session}>
      <AppShell>{children}</AppShell>
    </AuthSessionProvider>
  )
}
