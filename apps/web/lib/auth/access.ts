export const AUTH_ROUTE_PATHS = ["/login"] as const

export const DEFAULT_AUTHENTICATED_REDIRECT = "/dashboard"

export const ROLE_CODES = ["admin", "editor", "viewer"] as const

export type RoleCode = (typeof ROLE_CODES)[number]

export const CAPABILITIES = [
  "manage_users",
  "manage_finance",
  "manage_content",
  "view_analytics",
  "manage_configuration",
  "view_content",
] as const

export type Capability = (typeof CAPABILITIES)[number]

const LEGACY_ROLE_ALIASES: Record<string, RoleCode> = {
  admin: "admin",
  content_admin: "editor",
  editor: "editor",
  owner: "admin",
  platform_admin: "admin",
  reviewer: "viewer",
  viewer: "viewer",
}

const ROLE_CAPABILITIES: Record<RoleCode, readonly Capability[]> = {
  admin: CAPABILITIES,
  editor: ["manage_content", "view_content"],
  viewer: ["view_content"],
}

export function normalizeRoleCode(roleCode?: string | null): RoleCode {
  if (!roleCode) {
    return "viewer"
  }

  return LEGACY_ROLE_ALIASES[roleCode.toLowerCase()] ?? "viewer"
}

export function getRoleLabel(roleCode?: string | null) {
  switch (normalizeRoleCode(roleCode)) {
    case "admin":
      return "Owner/Admin"
    case "editor":
      return "Editor"
    default:
      return "Viewer"
  }
}

export function getRoleCapabilities(
  roleCode?: string | null,
): readonly Capability[] {
  return ROLE_CAPABILITIES[normalizeRoleCode(roleCode)]
}

export function hasCapability(
  roleCode: string | null | undefined,
  capability: Capability,
) {
  return getRoleCapabilities(roleCode).includes(capability)
}

export function isAuthRoute(pathname: string) {
  return AUTH_ROUTE_PATHS.includes(pathname as (typeof AUTH_ROUTE_PATHS)[number])
}

export function isPrivilegedRole(roleCode?: string | null) {
  return normalizeRoleCode(roleCode) !== "viewer"
}

export function hasDashboardAccess({
  apiAccountId,
  roleCode,
}: {
  apiAccountId?: string | null
  roleCode?: string | null
}) {
  return Boolean(apiAccountId) && isPrivilegedRole(roleCode)
}

/**
 * Compatibility helper for older callers. Dashboard access is intentionally
 * broader than Owner/Admin access because Editors need the content workspace.
 */
export function hasAdminAccess({
  apiAccountId,
  roleCode,
}: {
  apiAccountId?: string | null
  roleCode?: string | null
}) {
  return hasDashboardAccess({ apiAccountId, roleCode })
}

export function getDefaultAuthenticatedPath(roleCode?: string | null) {
  switch (normalizeRoleCode(roleCode)) {
    case "admin":
      return DEFAULT_AUTHENTICATED_REDIRECT
    case "editor":
      return "/content"
    default:
      return "/"
  }
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
    return sanitizeNextPath(nextPath) ?? getDefaultAuthenticatedPath(roleCode)
  }

  return "/"
}
