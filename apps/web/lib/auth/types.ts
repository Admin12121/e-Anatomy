import type { Capability, RoleCode } from "@/lib/auth/access"

export type SessionUser = {
  id: string
  name: string
  email: string
  image: string | null
  roleCode: RoleCode
  status: string
  apiAccountId: string | null
  apiAccountSlug: string | null
  apiAccountName: string | null
  apiAccountType: string | null
  canAccessAdmin: boolean
  canAccessDashboard: boolean
  capabilities: readonly Capability[]
  twoFactorEnabled: boolean
}

export type DashboardViewer = {
  accountName: string
  displayName: string
  email: string
  expiresAt: string
  roleCode: RoleCode
  status: string
}

export type ModuleListItem = {
  id: string
  slug: string
  title: string
  status: string
  latestVersionNo: number | null
  latestVersionState: string | null
  currentReleasePublishedAt: string | null
}

export type ModuleListResponse = {
  total: number
  items: ModuleListItem[]
}

export type LoginDiscoveryResult = {
  canUseEmailOtp: boolean
  canUseGoogle: boolean
  email: string
  exists: boolean
  hasGoogleAccount: boolean
  hasPassword: boolean
  hasPasskey: boolean
  mailDeliveryConfigured: boolean
  name: string | null
  passkeyEnabled: boolean
  secondFactor: {
    emailOtp: boolean
    totp: boolean
  }
  status: string | null
  twoFactorEnabled: boolean
}
