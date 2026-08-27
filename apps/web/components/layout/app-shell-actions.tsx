"use client"

import Link from "next/link"

import { LogoutButton } from "@/components/auth/logout-button"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function AppShellActions() {
  const { data: session, isPending } = authClient.useSession()
  const canAccessDashboard = session?.user.canAccessDashboard ?? false

  return (
    <div className="flex items-center gap-3">
      <Button asChild variant="ghost">
        <Link href="/">Overview</Link>
      </Button>

      {session ? (
        <>
          {canAccessDashboard ? (
            <Button asChild variant="ghost">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : null}
          <LogoutButton />
        </>
      ) : isPending ? (
        <Button variant="outline" disabled>
          Checking session...
        </Button>
      ) : (
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      )}
    </div>
  )
}
