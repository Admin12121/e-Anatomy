import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import { serverApiFetch } from "@/lib/api/server"
import { ApiClientError } from "@/lib/api/errors"
import {
  createLoginRedirectPath,
  DEFAULT_AUTHENTICATED_REDIRECT,
  isPrivilegedRole,
} from "@/lib/auth/access"
import type { SessionResponse } from "@/lib/auth/types"

export const getSession = cache(async (): Promise<SessionResponse | null> => {
  try {
    return await serverApiFetch<SessionResponse>("/auth/session", {
      cache: "no-store",
    })
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null
    }

    throw error
  }
})

export const requireAdminSession = cache(
  async (nextPath = DEFAULT_AUTHENTICATED_REDIRECT) => {
    const session = await getSession()

    if (!session) {
      redirect(createLoginRedirectPath(nextPath))
    }

    if (!isPrivilegedRole(session.account.roleCode)) {
      redirect("/")
    }

    return session
  },
)

export const getAdminViewer = cache(async () => {
  const session = await requireAdminSession()

  return {
    accountName: session.account.name,
    displayName: session.user.displayName,
    email: session.user.email,
    expiresAt: session.session.expiresAt,
    roleCode: session.account.roleCode,
    status: session.user.status,
  }
})
