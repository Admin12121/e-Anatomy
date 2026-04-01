import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import { serverApiFetch } from "@/lib/api/server"
import { ApiClientError } from "@/lib/api/errors"
import { isPrivilegedRole, sanitizeNextPath } from "@/lib/auth/access"
import type { SessionResponse } from "@/lib/auth/types"

export const getSession = cache(async (): Promise<SessionResponse | null> => {
  try {
    return await serverApiFetch<SessionResponse>("/auth/session")
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null
    }

    throw error
  }
})

export async function requireAdminSession(nextPath = "/admin/dashboard") {
  const session = await getSession()
  const safeNextPath = sanitizeNextPath(nextPath) ?? "/admin/dashboard"

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(safeNextPath)}`)
  }

  if (!isPrivilegedRole(session.account.roleCode)) {
    redirect("/")
  }

  return session
}
