"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { Panel } from "@/components/layout/panel"
import { useAuthSession } from "@/components/auth/auth-session-provider"

type LoggedOutOnlyProps = {
  children: ReactNode
}

export function LoggedOutOnly({ children }: LoggedOutOnlyProps) {
  const router = useRouter()
  const { errorMessage, isPending, session } = useAuthSession()

  useEffect(() => {
    if (session) {
      router.replace("/admin/dashboard")
    }
  }, [router, session])

  if (session) {
    return (
      <Panel className="max-w-xl">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Session found</p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-slate-950">
            Redirecting to the admin dashboard.
          </h2>
        </div>
      </Panel>
    )
  }

  if (isPending) {
    return (
      <Panel className="max-w-xl">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Session check</p>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-slate-950">
            Verifying the current browser session.
          </h2>
        </div>
      </Panel>
    )
  }

  if (errorMessage) {
    return (
      <div className="space-y-4">
        <Panel className="max-w-xl border-amber-200 bg-amber-50">
          <div className="space-y-2 text-sm leading-7 text-amber-900">
            <p className="text-sm uppercase tracking-[0.24em] text-amber-700">Session check failed</p>
            <p>{errorMessage}</p>
            <p>The sign-in form is still available below so local review is not blocked.</p>
          </div>
        </Panel>
        {children}
      </div>
    )
  }

  return children
}
