import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import { serverApiFetch } from "@/lib/api/server"
import { ApiClientError } from "@/lib/api/errors"
import type { SessionResponse } from "@/lib/auth/types"

const privilegedRoles = new Set([
  "owner",
  "admin",
  "platform_admin",
  "content_admin",
  "editor",
  "reviewer",
])

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

export async function requireAdminSession() {
  const session = await getSession()

  if (!session) {
    redirect("/login")
  }

  if (!privilegedRoles.has(session.account.roleCode)) {
    redirect("/")
  }

  return session
}
