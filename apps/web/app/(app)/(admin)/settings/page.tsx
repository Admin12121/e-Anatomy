import { eq } from "drizzle-orm"

import { SettingsTabs } from "./_components/settings-tabs"
import { requireAdminSession } from "@/lib/auth/session"
import { getAuthFeatureFlags } from "@/lib/auth/runtime-config"
import { account } from "@/lib/db/auth-schema"
import { db } from "@/lib/db/client"

export default async function SettingsPage() {
  const { user } = await requireAdminSession("/settings")
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
    <div className="flex min-h-full flex-col gap-6 p-6 md:p-8">
      <SettingsTabs
        connectedAccounts={connectedAccounts}
        googleConfigured={featureFlags.googleEnabled}
        user={user}
      />
    </div>
  )
}
