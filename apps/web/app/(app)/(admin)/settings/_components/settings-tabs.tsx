"use client"

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
  return (
    <Tabs
      defaultValue="profile"
      orientation="vertical"
      className="items-start gap-6 xl:gap-8"
    >
      <div className="w-full max-w-full shrink-0 xl:max-w-64">
        <div className="mb-4 space-y-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your profile, security controls, and connected sign-in
            methods.
          </p>
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

      <div className="min-w-0 flex-1">
        <TabsContent value="profile">
          <ProfileSettingsPanel
            connectedAccounts={connectedAccounts}
            googleConfigured={googleConfigured}
            user={user}
          />
        </TabsContent>
        <TabsContent value="security">
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
