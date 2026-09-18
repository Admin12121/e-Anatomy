"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import {
  ArrowLeftIcon,
  BellIcon,
  LockKeyholeIcon,
  MonitorSmartphoneIcon,
  MoonIcon,
  PaletteIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react"

import {
  ProfileSettingsPanel,
  type ConnectedAccount,
} from "@/app/(app)/(admin)/settings/_components/profile-settings-panel"
import { SecuritySettingsPanel } from "@/app/(app)/(admin)/settings/_components/security-settings-panel"
import { SessionsSettingsPanel } from "@/app/(app)/(admin)/settings/_components/sessions-settings-panel"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import type { SessionUser } from "@/lib/auth/types"

export type AccountTab =
  | "appearance"
  | "notifications"
  | "profile"
  | "security"
  | "sessions"

type AccountCenterProps = {
  connectedAccounts: ConnectedAccount[]
  googleConfigured: boolean
  initialTab: AccountTab
  user: SessionUser
}

export function AccountCenter({
  connectedAccounts,
  googleConfigured,
  initialTab,
  user,
}: AccountCenterProps) {
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [isDesktopTabs, setIsDesktopTabs] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(min-width: 80rem)")
    const update = () => setIsDesktopTabs(query.matches)

    update()
    query.addEventListener("change", update)

    return () => query.removeEventListener("change", update)
  }, [])

  return (
    <main className="min-h-dvh bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex items-center">
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeftIcon aria-hidden="true" />
              Back to anatomy
            </Link>
          </Button>
        </header>

        <Tabs
          defaultValue={initialTab}
          orientation={isDesktopTabs ? "vertical" : "horizontal"}
          className="items-stretch gap-6 xl:items-start xl:gap-8"
        >
          <div className="w-full max-w-full shrink-0 xl:max-w-64">
            <div className="mb-4 flex flex-col gap-1">
              <h1 className="font-heading text-3xl font-semibold tracking-tight">
                Your account
              </h1>
              <p className="text-sm text-muted-foreground">
                Profile, security, sessions, and viewer preferences.
              </p>
            </div>
            <TabsList className="w-full justify-start overflow-x-auto rounded-md bg-muted/30 p-1.5 xl:overflow-visible">
              <TabsTrigger className="rounded-md" value="profile">
                <UserRoundIcon aria-hidden="true" />
                Profile
              </TabsTrigger>
              <TabsTrigger className="rounded-md" value="security">
                <LockKeyholeIcon aria-hidden="true" />
                Security
              </TabsTrigger>
              <TabsTrigger className="rounded-md" value="sessions">
                <MonitorSmartphoneIcon aria-hidden="true" />
                Sessions
              </TabsTrigger>
              <TabsTrigger className="rounded-md" value="appearance">
                <PaletteIcon aria-hidden="true" />
                Appearance
              </TabsTrigger>
              <TabsTrigger className="rounded-md" value="notifications">
                <BellIcon aria-hidden="true" />
                Notifications
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-w-0 w-full flex-1">
            <TabsContent className="min-w-0" value="profile">
              <ProfileSettingsPanel
                connectedAccounts={connectedAccounts}
                googleConfigured={googleConfigured}
                user={user}
              />
            </TabsContent>

            <TabsContent className="min-w-0" value="security">
              <div className="space-y-1 pb-6">
                <h2 className="font-heading text-2xl font-semibold tracking-tight">
                  Security
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage your password, passkeys, two-factor verification, and
                  recovery options.
                </p>
              </div>
              <SecuritySettingsPanel />
            </TabsContent>

            <TabsContent className="min-w-0" value="sessions">
              <div className="space-y-1 pb-6">
                <h2 className="font-heading text-2xl font-semibold tracking-tight">
                  Sessions
                </h2>
                <p className="text-sm text-muted-foreground">
                  Review active devices and revoke access you no longer
                  recognize.
                </p>
              </div>
              <SessionsSettingsPanel />
            </TabsContent>

            <TabsContent className="min-w-0" value="appearance">
              <Frame>
                <FrameHeader>
                  <FrameTitle>Appearance</FrameTitle>
                  <FrameDescription>
                    Choose how the viewer interface appears on this device.
                  </FrameDescription>
                </FrameHeader>
                <FramePanel className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => setTheme("light")}
                    variant={resolvedTheme === "light" ? "default" : "outline"}
                  >
                    <SunIcon aria-hidden="true" />
                    Light
                  </Button>
                  <Button
                    onClick={() => setTheme("dark")}
                    variant={resolvedTheme === "dark" ? "default" : "outline"}
                  >
                    <MoonIcon aria-hidden="true" />
                    Dark
                  </Button>
                  <Button
                    onClick={() => setTheme("system")}
                    variant={theme === "system" ? "default" : "outline"}
                  >
                    System default
                  </Button>
                </FramePanel>
              </Frame>
            </TabsContent>

            <TabsContent className="min-w-0" value="notifications">
              <Frame>
                <FramePanel className="p-0">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BellIcon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>No notifications yet</EmptyTitle>
                      <EmptyDescription>
                        Account and content updates will appear here when they
                        are available.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </FramePanel>
              </Frame>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </main>
  )
}
