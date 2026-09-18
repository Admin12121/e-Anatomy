import type { Metadata } from "next"
import { eq } from "drizzle-orm"

import {
  AccountCenter,
  type AccountTab,
} from "@/components/account/account-center"
import { requireSession } from "@/lib/auth/session"
import { getAuthFeatureFlags } from "@/lib/auth/runtime-config"
import { account } from "@/lib/db/auth-schema"
import { db } from "@/lib/db/client"

export const metadata: Metadata = {
  title: "Your account",
}

const ACCOUNT_TABS = new Set<AccountTab>([
  "appearance",
  "notifications",
  "profile",
  "security",
  "sessions",
])

type AccountPageProps = {
  searchParams: Promise<{ tab?: string }>
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const [{ user }, params] = await Promise.all([
    requireSession(undefined, "/account"),
    searchParams,
  ])
  const requestedTab = params.tab === "settings" ? "security" : params.tab
  const initialTab = ACCOUNT_TABS.has(requestedTab as AccountTab)
    ? (requestedTab as AccountTab)
    : "profile"

  const featureFlags = getAuthFeatureFlags()
  const linkedAccounts = await db
    .select({
      accountId: account.accountId,
      id: account.id,
      providerId: account.providerId,
    })
    .from(account)
    .where(eq(account.userId, user.id))
  const connectedAccounts = linkedAccounts.filter(
    (item) => item.providerId !== "credential",
  )

  return (
    <AccountCenter
      connectedAccounts={connectedAccounts}
      googleConfigured={featureFlags.googleEnabled}
      initialTab={initialTab}
      key={initialTab}
      user={user}
    />
  )
}
