export const AUTH_COOKIE_NAME =
  process.env.AUTH_COOKIE_NAME ?? "anatomy_session"

export const AUTH_ROUTE_PATHS = ["/login"] as const

export const PROTECTED_ROUTE_PREFIXES = ["/admin"] as const

export const DEFAULT_AUTHENTICATED_REDIRECT = "/admin/dashboard"

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

export function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function isPrivilegedRole(roleCode: string) {
  return PRIVILEGED_ROLE_CODES.has(roleCode)
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
