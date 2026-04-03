import "server-only"

import { and, eq, isNotNull } from "drizzle-orm"

import { getAuthFeatureFlags } from "@/lib/auth/config"
import type { LoginDiscoveryResult } from "@/lib/auth/types"
import { account, passkey, user } from "@/lib/db/auth-schema"
import { db } from "@/lib/db/client"

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function createBaseDiscovery(email: string): LoginDiscoveryResult {
  const features = getAuthFeatureFlags()

  return {
    canUseEmailOtp: features.emailOtpEnabled,
    canUseGoogle: features.googleEnabled,
    email,
    exists: false,
    hasGoogleAccount: false,
    hasPassword: false,
    hasPasskey: false,
    mailDeliveryConfigured: features.mailDeliveryConfigured,
    name: null,
    passkeyEnabled: features.passkeyEnabled,
    secondFactor: {
      emailOtp: features.twoFactorEmailOtpEnabled,
      totp: features.twoFactorTotpEnabled,
    },
    status: null,
    twoFactorEnabled: false,
  }
}

export async function getLoginMethodsForEmail(rawEmail: string) {
  const email = normalizeEmail(rawEmail)
  const base = createBaseDiscovery(email)

  if (!email) {
    return base
  }

  const [matchingUser] = await db
    .select({
      id: user.id,
      name: user.name,
      status: user.status,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!matchingUser) {
    return base
  }

  const [credentialAccounts, googleAccounts, registeredPasskeys] =
    await Promise.all([
      db
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, matchingUser.id),
            eq(account.providerId, "credential"),
            isNotNull(account.password),
          ),
        )
        .limit(1),
      db
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, matchingUser.id),
            eq(account.providerId, "google"),
          ),
        )
        .limit(1),
      db
        .select({ id: passkey.id })
        .from(passkey)
        .where(eq(passkey.userId, matchingUser.id))
        .limit(1),
    ])

  return {
    ...base,
    exists: true,
    hasGoogleAccount: googleAccounts.length > 0,
    hasPassword: credentialAccounts.length > 0,
    hasPasskey: registeredPasskeys.length > 0,
    name: matchingUser.name,
    status: matchingUser.status ?? "active",
    twoFactorEnabled: Boolean(matchingUser.twoFactorEnabled),
  }
}
