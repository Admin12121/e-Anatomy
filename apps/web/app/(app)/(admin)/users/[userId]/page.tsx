import Link from "next/link"
import { notFound } from "next/navigation"
import { and, count, desc, eq, gt } from "drizzle-orm"
import {
  ActivityIcon,
  ArrowLeftIcon,
  KeyRoundIcon,
  Link2Icon,
  MonitorSmartphoneIcon,
} from "lucide-react"

import { UserActions } from "../_components/user-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
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

type UserDetailPageProps = {
  params: Promise<{ userId: string }>
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

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const { user: currentUser } = await requireAdminSession("/users")
  const { userId } = await params
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
  const detailRows = [
    ["User ID", userRecord.id],
    ["Name", userRecord.name],
    ["Email", userRecord.email],
    ["Email verified", userRecord.emailVerified ? "Verified" : "Not verified"],
    ["Role", getRoleLabel(normalizeRoleCode(userRecord.role))],
    ["Status", normalizedStatus === "active" ? "Active" : "Inactive"],
    [
      "Two-factor authentication",
      userRecord.twoFactorEnabled ? "Enabled" : "Disabled",
    ],
    ["Created", formatDateTime(userRecord.createdAt)],
    ["Updated", formatDateTime(userRecord.updatedAt)],
    ["Last login", formatDateTime(userRecord.lastLoginAt)],
    ["API account ID", userRecord.apiAccountId ?? "Not linked"],
    ["API account slug", userRecord.apiAccountSlug ?? "Not linked"],
    ["API account name", userRecord.apiAccountName ?? "Not linked"],
    ["API account type", userRecord.apiAccountType ?? "Not linked"],
  ]
  const metrics = [
    {
      description: `${activeSessionCount} currently active`,
      icon: MonitorSmartphoneIcon,
      title: "Sessions",
      value: totalSessionCount,
    },
    {
      description: "External sign-in methods",
      icon: Link2Icon,
      title: "Connected accounts",
      value: externalAccounts.length,
    },
    {
      description: "Registered secure credentials",
      icon: KeyRoundIcon,
      title: "Passkeys",
      value: passkeyItems.length,
    },
    {
      description: formatDateTime(sessionItems[0]?.updatedAt),
      icon: ActivityIcon,
      title: "Latest activity",
      value: sessionItems.length > 0 ? "Seen" : "None",
    },
  ]

  return (
    <div className="flex min-h-full flex-col gap-4 p-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Button asChild size="icon-sm" variant="ghost">
            <Link aria-label="Back to users" href="/users">
              <ArrowLeftIcon aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">
              {userRecord.name}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {userRecord.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <Badge variant="outline">
            {getRoleLabel(normalizeRoleCode(userRecord.role))}
          </Badge>
          <Badge
            variant={normalizedStatus === "active" ? "outline" : "secondary"}
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

      <Frame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">Field</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detailRows.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell className="font-medium">{label}</TableCell>
                <TableCell className="break-all text-muted-foreground">
                  {value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Frame>

      <section aria-labelledby="user-analytics-heading" className="space-y-4">
        <div>
          <h2
            className="font-heading text-xl font-semibold tracking-tight"
            id="user-analytics-heading"
          >
            User analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Account and authentication activity currently available for this
            user.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.title}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{metric.title}</CardTitle>
                  <metric.icon className="size-4 text-muted-foreground" />
                </div>
                <CardDescription>{metric.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-heading text-3xl font-semibold">
                  {metric.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Frame>
        <FrameHeader>
          <FrameTitle>Recent sessions</FrameTitle>
          <FrameDescription>
            The latest 25 sign-in sessions. Session tokens are never displayed.
          </FrameDescription>
        </FrameHeader>
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
                      <Badge variant={isActive ? "outline" : "secondary"}>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Frame>
          <FrameHeader>
            <FrameTitle>Sign-in methods</FrameTitle>
            <FrameDescription>
              Authentication providers connected to this account.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-3">
            {accountItems.length === 0 && passkeyItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sign-in methods found.
              </p>
            ) : (
              accountItems.map((item) => (
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
              ))
            )}
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

        <Frame>
          <FrameHeader>
            <FrameTitle>Content activity</FrameTitle>
            <FrameDescription>
              Page views, structures selected, and content engagement.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <p className="text-sm text-muted-foreground">
              Per-user content events will appear here when the analytics event
              collection backend is enabled. No activity is inferred or
              fabricated from authentication data.
            </p>
          </FramePanel>
        </Frame>
      </div>
    </div>
  )
}
