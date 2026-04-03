import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import {
  createLoginRedirectPath,
  DEFAULT_AUTHENTICATED_REDIRECT,
  hasAdminAccess,
  resolveAuthenticatedRedirectPath,
} from "@/lib/auth/access"
import {
  hasVerifiedSecondFactor,
  hasVerifiedSecondFactorFromCookieHeader,
} from "@/lib/auth/second-factor"
import type { AuthSession } from "@/lib/auth"
import type { DashboardViewer, SessionUser } from "@/lib/auth/types"

async function readSession(
  requestHeaders: Headers,
  { disableCookieCache = false }: { disableCookieCache?: boolean } = {},
) {
  return auth.api.getSession({
    headers: requestHeaders,
    query: disableCookieCache ? { disableCookieCache: true } : undefined,
  })
}

export const getServerSession = cache(async () => {
  return readSession(await headers())
})

export const getSession = getServerSession

const getValidatedServerSession = cache(async () => {
  return readSession(await headers(), { disableCookieCache: true })
})

async function getValidatedSessionFromHeaders(requestHeaders: Headers) {
  return readSession(requestHeaders, { disableCookieCache: true })
}

export function normalizeSessionUser(user: AuthSession["user"]): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    roleCode: user.role ?? "reviewer",
    status: user.status ?? "active",
    apiAccountId: user.apiAccountId ?? null,
    apiAccountSlug: user.apiAccountSlug ?? null,
    apiAccountName: user.apiAccountName ?? null,
    apiAccountType: user.apiAccountType ?? null,
    canAccessAdmin: hasAdminAccess({
      apiAccountId: user.apiAccountId,
      roleCode: user.role,
    }),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  }
}

function toDashboardViewer({
  session,
  user,
}: {
  session: AuthSession
  user: SessionUser
}): DashboardViewer {
  return {
    accountName: user.apiAccountName ?? "Platform Administration",
    displayName: user.name,
    email: user.email,
    expiresAt:
      session.session.expiresAt instanceof Date
        ? session.session.expiresAt.toISOString()
        : String(session.session.expiresAt),
    roleCode: user.roleCode,
    status: user.status,
  }
}

export const requireSession = cache(
  async (
    allowedRoles?: readonly string[],
    nextPath = DEFAULT_AUTHENTICATED_REDIRECT,
  ) => {
    const session = await getValidatedServerSession()

    if (!session) {
      redirect(createLoginRedirectPath(nextPath))
    }

    const user = normalizeSessionUser(session.user)

    if (
      user.twoFactorEnabled &&
      !(await hasVerifiedSecondFactor(session.session.id))
    ) {
      redirect(createLoginRedirectPath(nextPath))
    }

    if (allowedRoles && !allowedRoles.includes(user.roleCode)) {
      redirect(
        resolveAuthenticatedRedirectPath({
          hasApiAccountId: user.canAccessAdmin,
          roleCode: user.roleCode,
        }),
      )
    }

    return { session, user }
  },
)

export const requireAdminSession = cache(
  async (nextPath = DEFAULT_AUTHENTICATED_REDIRECT) => {
    const result = await requireSession(undefined, nextPath)

    if (!result.user.canAccessAdmin) {
      redirect(
        resolveAuthenticatedRedirectPath({
          hasApiAccountId: Boolean(result.user.apiAccountId),
          roleCode: result.user.roleCode,
        }),
      )
    }

    return result
  },
)

export async function requireApiSession(
  requestHeaders: Headers,
  allowedRoles?: readonly string[],
) {
  const session = await getValidatedSessionFromHeaders(requestHeaders)

  if (!session) {
    return null
  }

  const user = normalizeSessionUser(session.user)

  if (
    user.twoFactorEnabled &&
    !(await hasVerifiedSecondFactorFromCookieHeader(
      session.session.id,
      requestHeaders.get("cookie"),
    ))
  ) {
    return null
  }

  if (allowedRoles && !allowedRoles.includes(user.roleCode)) {
    return null
  }

  return { session, user }
}

export async function requireAdminApiSession(requestHeaders: Headers) {
  const result = await requireApiSession(requestHeaders)

  if (!result || !result.user.canAccessAdmin) {
    return null
  }

  return result
}

export const getAdminViewer = cache(async (): Promise<DashboardViewer> => {
  return toDashboardViewer(await requireAdminSession())
})
