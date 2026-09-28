import Link from "next/link"
import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { and, count, desc, eq, gt } from "drizzle-orm"
import { ArrowLeftIcon } from "lucide-react"

import { UserActions } from "../_components/user-actions"
import { AnalyticsMetricCard } from "@/components/analytics/analytics-overview-cards"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import { RouteTabs } from "@/components/ui/route-tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getRoleLabel, normalizeRoleCode } from "@/lib/auth/access"
import { requireAdminSession } from "@/lib/auth/session"
import {
  account,
  passkey,
  session,
  user as authUser,
} from "@/lib/db/auth-schema"
import { db } from "@/lib/db/client"
import { resolveRouteTab } from "@/lib/analytics/presentation"

const TABS = ["overview", "sessions", "security", "activity"] as const
type UserTab = (typeof TABS)[number]

type UserDetailPageProps = {
  params: Promise<{ userId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return "Never"
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

function providerLabel(providerId: string) {
  if (providerId === "credential") return "Password"

  return providerId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ")
}

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "Unknown device"
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return "Mobile device"
  if (/windows/i.test(userAgent)) return "Windows computer"
  if (/macintosh|mac os/i.test(userAgent)) return "Mac computer"
  if (/linux/i.test(userAgent)) return "Linux computer"

  return "Web browser"
}

export default async function UserDetailPage({
  params,
  searchParams,
}: UserDetailPageProps) {
  const { user: currentUser } = await requireAdminSession("/users")
  const { userId } = await params
  const tab = resolveRouteTab<UserTab>(
    (await searchParams).tab,
    TABS,
    "overview",
  )
  const [userRecord] = await db
    .select()
    .from(authUser)
    .where(eq(authUser.id, userId))
    .limit(1)

  if (!userRecord) {
    notFound()
  }

  const now = new Date()
  const [
    sessionItems,
    accountItems,
    passkeyItems,
    [sessionCountResult],
    [activeSessionCountResult],
  ] = await Promise.all([
    db
      .select({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        id: session.id,
        ipAddress: session.ipAddress,
        updatedAt: session.updatedAt,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId))
      .orderBy(desc(session.updatedAt))
      .limit(25),
    db
      .select({
        createdAt: account.createdAt,
        id: account.id,
        providerId: account.providerId,
      })
      .from(account)
      .where(eq(account.userId, userId))
      .orderBy(desc(account.createdAt)),
    db
      .select({
        createdAt: passkey.createdAt,
        deviceType: passkey.deviceType,
        id: passkey.id,
        name: passkey.name,
      })
      .from(passkey)
      .where(eq(passkey.userId, userId))
      .orderBy(desc(passkey.createdAt)),
    db
      .select({ value: count() })
      .from(session)
      .where(eq(session.userId, userId)),
    db
      .select({ value: count() })
      .from(session)
      .where(and(eq(session.userId, userId), gt(session.expiresAt, now))),
  ])

  const totalSessionCount = Number(sessionCountResult?.value ?? 0)
  const activeSessionCount = Number(activeSessionCountResult?.value ?? 0)
  const externalAccounts = accountItems.filter(
    (item) => item.providerId !== "credential",
  )
  const normalizedStatus =
    userRecord.status === "active" ? "active" : "inactive"
  const detailRows: Array<{ label: string; value: ReactNode }> = [
    {
      label: "User ID",
      value: <span className="font-mono text-xs">{userRecord.id}</span>,
    },
    { label: "Name", value: userRecord.name },
    { label: "Email", value: userRecord.email },
    {
      label: "Email verified",
      value: (
        <Badge variant={userRecord.emailVerified ? "success" : "secondary"}>
          {userRecord.emailVerified ? "Verified" : "Not verified"}
        </Badge>
      ),
    },
    {
      label: "Role",
      value: (
        <Badge variant="outline">
          {getRoleLabel(normalizeRoleCode(userRecord.role))}
        </Badge>
      ),
    },
    {
      label: "Status",
      value: (
        <Badge variant={normalizedStatus === "active" ? "success" : "secondary"}>
          {normalizedStatus === "active" ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      label: "Two-factor authentication",
      value: (
        <Badge variant={userRecord.twoFactorEnabled ? "success" : "secondary"}>
          {userRecord.twoFactorEnabled ? "Enabled" : "Disabled"}
        </Badge>
      ),
    },
    { label: "Created", value: formatDateTime(userRecord.createdAt) },
    { label: "Updated", value: formatDateTime(userRecord.updatedAt) },
    { label: "Last login", value: formatDateTime(userRecord.lastLoginAt) },
    {
      label: "API account ID",
      value: userRecord.apiAccountId ?? "Not linked",
    },
    {
      label: "API account slug",
      value: userRecord.apiAccountSlug ?? "Not linked",
    },
    {
      label: "API account name",
      value: userRecord.apiAccountName ?? "Not linked",
    },
    {
      label: "API account type",
      value: userRecord.apiAccountType ?? "Not linked",
    },
  ]
  const metrics = [
    {
      label: "Sessions",
      meta: `${activeSessionCount} currently active`,
      value: totalSessionCount,
    },
    {
      label: "Connected accounts",
      meta: "External sign-in methods",
      value: externalAccounts.length,
    },
    {
      label: "Passkeys",
      meta: "Registered secure credentials",
      value: passkeyItems.length,
    },
    {
      label: "Latest activity",
      meta: formatDateTime(sessionItems[0]?.updatedAt),
      value: sessionItems.length > 0 ? "Seen" : "None",
    },
  ]
  const routeTabs = TABS.map((item) => ({
    href:
      item === "overview" ? `/users/${userId}` : `/users/${userId}?tab=${item}`,
    label: item[0].toUpperCase() + item.slice(1),
    value: item,
  }))

  return (
    <div className="flex min-h-full flex-col gap-4 p-2">
      <div className="flex flex-col gap-3 px-1 py-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild size="icon-sm" variant="ghost">
            <Link aria-label="Back to users" href="/users">
              <ArrowLeftIcon aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-xl font-semibold tracking-tight">
              {userRecord.name}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {userRecord.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Badge variant="outline">
            {getRoleLabel(normalizeRoleCode(userRecord.role))}
          </Badge>
          <Badge
            variant={normalizedStatus === "active" ? "success" : "secondary"}
          >
            {normalizedStatus === "active" ? "Active" : "Inactive"}
          </Badge>
          <UserActions
            currentUserId={currentUser.id}
            role={userRecord.role}
            status={userRecord.status}
            userId={userRecord.id}
          />
        </div>
      </div>

      <RouteTabs items={routeTabs} value={tab}>
        {tab === "overview" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <AnalyticsMetricCard
                  key={metric.label}
                  label={metric.label}
                  meta={metric.meta}
                  value={String(metric.value)}
                />
              ))}
            </div>
            <Frame>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-64">Field</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="w-64 font-medium">
                        {row.label}
                      </TableCell>
                      <TableCell className="whitespace-normal break-all text-muted-foreground">
                        {row.value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Frame>
          </>
        ) : null}

        {tab === "sessions" ? (
          <Frame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>IP address</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="h-24 text-center text-muted-foreground"
                      colSpan={6}
                    >
                      No sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessionItems.map((item) => {
                    const isActive = item.expiresAt > now

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {deviceLabel(item.userAgent)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.ipAddress ?? "Unavailable"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(item.createdAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(item.updatedAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(item.expiresAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isActive ? "success" : "secondary"}
                          >
                            {isActive ? "Active" : "Expired"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </Frame>
        ) : null}

        {tab === "security" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Frame>
              <FrameHeader>
                <FrameTitle>Authentication</FrameTitle>
              </FrameHeader>
              <FramePanel className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Email verification
                  </div>
                  <div className="mt-1 font-medium">
                    {userRecord.emailVerified ? "Verified" : "Not verified"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Two-factor authentication
                  </div>
                  <div className="mt-1 font-medium">
                    {userRecord.twoFactorEnabled ? "Enabled" : "Disabled"}
                  </div>
                </div>
              </FramePanel>
            </Frame>
            <Frame>
              <FrameHeader>
                <FrameTitle>Sign-in methods</FrameTitle>
              </FrameHeader>
              <FramePanel className="space-y-3">
                {accountItems.length === 0 && passkeyItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No sign-in methods found.
                  </p>
                ) : null}
                {accountItems.map((item) => (
                  <div
                    className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                    key={item.id}
                  >
                    <span className="font-medium">
                      {providerLabel(item.providerId)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                ))}
                {passkeyItems.map((item) => (
                  <div
                    className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                    key={item.id}
                  >
                    <div>
                      <p className="font-medium">{item.name || "Passkey"}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.deviceType || "Security key"}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                ))}
              </FramePanel>
            </Frame>
          </div>
        ) : null}

        {tab === "activity" ? (
          <Frame>
            <FrameHeader>
              <FrameTitle>Content activity</FrameTitle>
            </FrameHeader>
            <FramePanel>
              <p className="text-sm text-muted-foreground">
                Page views, structure selections, and engagement will appear
                here after first-party event storage is enabled.
              </p>
            </FramePanel>
          </Frame>
        ) : null}
      </RouteTabs>
    </div>
  )
}
