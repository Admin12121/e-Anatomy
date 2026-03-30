"use client"

import Link from "next/link"

import { LogoutButton } from "@/components/auth/logout-button"
import { Button } from "@/components/ui/button"
import { useAuthSession } from "@/components/auth/auth-session-provider"

export function AppShellActions() {
  const { isPending, session } = useAuthSession()

  return (
    <div className="flex items-center gap-3">
      <Button asChild variant="ghost">
        <Link href="/">Overview</Link>
      </Button>

      {session ? (
        <>
          <Button asChild variant="ghost">
            <Link href="/admin/dashboard">Dashboard</Link>
          </Button>
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
