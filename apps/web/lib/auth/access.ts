export const AUTH_ROUTE_PATHS = ["/login"] as const

export const DEFAULT_AUTHENTICATED_REDIRECT = "/dashboard"

export const PRIVILEGED_ROLE_CODES = new Set([
  "owner",
  "admin",
  "platform_admin",
  "content_admin",
  "editor",
  "reviewer",
])

export function isAuthRoute(pathname: string) {
  return AUTH_ROUTE_PATHS.includes(pathname as (typeof AUTH_ROUTE_PATHS)[number])
}

export function isPrivilegedRole(roleCode?: string | null) {
  return roleCode ? PRIVILEGED_ROLE_CODES.has(roleCode) : false
}

export function hasAdminAccess({
  apiAccountId,
  roleCode,
}: {
  apiAccountId?: string | null
  roleCode?: string | null
}) {
  return Boolean(apiAccountId) && isPrivilegedRole(roleCode)
}

export function sanitizeNextPath(nextPath?: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return null
  }

  const [pathname] = nextPath.split("?")

  if (isAuthRoute(pathname)) {
    return null
  }

  return nextPath
}

export function createLoginRedirectPath(nextPath = DEFAULT_AUTHENTICATED_REDIRECT) {
  const safeNextPath = sanitizeNextPath(nextPath) ?? DEFAULT_AUTHENTICATED_REDIRECT

  return `/login?next=${encodeURIComponent(safeNextPath)}`
}

export function resolveAuthenticatedRedirectPath({
  hasApiAccountId,
  nextPath,
  roleCode,
}: {
  hasApiAccountId?: boolean
  nextPath?: string | null
  roleCode?: string | null
}) {
  if (Boolean(hasApiAccountId) && isPrivilegedRole(roleCode)) {
    return sanitizeNextPath(nextPath) ?? DEFAULT_AUTHENTICATED_REDIRECT
  }

  return "/"
}
