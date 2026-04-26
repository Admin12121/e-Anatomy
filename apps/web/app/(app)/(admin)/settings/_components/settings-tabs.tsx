"use client"

import { useEffect, useState } from "react"
import { LockKeyhole, UserRound } from "lucide-react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import type { SessionUser } from "@/lib/auth/types"

import { ProfileSettingsPanel, type ConnectedAccount } from "./profile-settings-panel"
import { SecuritySettingsPanel } from "./security-settings-panel"

type SettingsTabsProps = {
  connectedAccounts: ConnectedAccount[]
  googleConfigured: boolean
  user: SessionUser
}

export function SettingsTabs({
  connectedAccounts,
  googleConfigured,
  user,
}: SettingsTabsProps) {
  const [isDesktopTabs, setIsDesktopTabs] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(min-width: 80rem)")
    const update = () => setIsDesktopTabs(query.matches)

    update()
    query.addEventListener("change", update)

    return () => query.removeEventListener("change", update)
  }, [])

  return (
    <Tabs
      defaultValue="profile"
      orientation={isDesktopTabs ? "vertical" : "horizontal"}
      className="items-stretch gap-6 xl:items-start xl:gap-8"
    >
      <div className="w-full max-w-full shrink-0 xl:max-w-64">
        <div className="mb-4 space-y-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Settings
          </h1>
        </div>
        <TabsList className="w-full rounded-2xl bg-muted/30 p-1.5">
          <TabsTrigger value="profile" className="rounded-xl">
            <UserRound />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="rounded-xl">
            <LockKeyhole />
            Security
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="min-w-0 w-full flex-1">
        <TabsContent value="profile" className="min-w-0">
          <ProfileSettingsPanel
            connectedAccounts={connectedAccounts}
            googleConfigured={googleConfigured}
            user={user}
          />
        </TabsContent>
        <TabsContent value="security" className="min-w-0">
          <div className="space-y-1 pb-6">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Security
            </h2>
            <p className="text-sm text-muted-foreground">
              Manage passkeys, two-factor verification, and account protection
              options.
            </p>
          </div>
          <SecuritySettingsPanel />
        </TabsContent>
      </div>
    </Tabs>
  )
}
