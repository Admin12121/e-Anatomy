"use client"

import { useCallback, useEffect, useState } from "react"
import { LoaderCircleIcon, MonitorSmartphoneIcon, ShieldXIcon } from "lucide-react"
import { toast } from "sonner"

import { authClient } from "@/lib/auth-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Frame,
  FrameDescription,
  FrameHeader,
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

type SessionListItem = {
  createdAt: Date | string
  expiresAt: Date | string
  id: string
  ipAddress?: string | null
  token: string
  updatedAt: Date | string
  userAgent?: string | null
}

function describeDevice(userAgent?: string | null) {
  if (!userAgent) {
    return "Unknown browser"
  }

  const browser = userAgent.includes("Edg/")
    ? "Microsoft Edge"
    : userAgent.includes("Firefox/")
      ? "Firefox"
      : userAgent.includes("Chrome/")
        ? "Chrome"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Browser"
  const device = /Android|iPhone|iPad|Mobile/i.test(userAgent)
    ? "Mobile device"
    : /Windows/i.test(userAgent)
      ? "Windows device"
      : /Macintosh|Mac OS X/i.test(userAgent)
        ? "Mac device"
        : /Linux/i.test(userAgent)
          ? "Linux device"
          : "Device"

  return `${browser} on ${device}`
}

function describeLocation(ipAddress?: string | null) {
  if (!ipAddress) {
    return "Location unavailable"
  }

  if (
    ipAddress === "::1" ||
    ipAddress.startsWith("127.") ||
    ipAddress.startsWith("10.") ||
    ipAddress.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ipAddress)
  ) {
    return "Local or private network"
  }

  return "Approximate location unavailable"
}

function formatActivity(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message
  ) {
    return String(error.message)
  }

  return fallback
}

export function SessionsSettingsPanel() {
  const currentSession = authClient.useSession()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)

  const loadSessions = useCallback(async () => {
    setLoading(true)

    try {
      const result = await authClient.listSessions()

      if (result.error) {
        toast.error(getErrorMessage(result.error, "Unable to load sessions."))
        return
      }

      setSessions((result.data ?? []) as SessionListItem[])
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to load sessions."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function revokeSession(token: string) {
    setPendingToken(token)

    try {
      const result = await authClient.revokeSession({ token })

      if (result.error) {
        toast.error(getErrorMessage(result.error, "Unable to revoke session."))
        return
      }

      toast.success("Session revoked.")
      await loadSessions()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to revoke session."))
    } finally {
      setPendingToken(null)
    }
  }

  async function revokeOtherSessions() {
    setRevokingOthers(true)

    try {
      const result = await authClient.revokeOtherSessions()

      if (result.error) {
        toast.error(
          getErrorMessage(result.error, "Unable to revoke other sessions."),
        )
        return
      }

      toast.success("Other sessions revoked.")
      await loadSessions()
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to revoke other sessions."))
    } finally {
      setRevokingOthers(false)
    }
  }

  const currentSessionId = currentSession.data?.session.id
  const otherSessionCount = sessions.filter(
    (item) => item.id !== currentSessionId,
  ).length

  return (
    <Frame>
      <FrameHeader className="gap-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <FrameTitle className="flex items-center gap-2">
              <MonitorSmartphoneIcon className="size-4" />
              Active sessions
            </FrameTitle>
            <FrameDescription className="mt-1">
              Review browsers and devices currently signed in to your account.
            </FrameDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={revokingOthers || otherSessionCount === 0}
            onClick={revokeOtherSessions}
          >
            {revokingOthers ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <ShieldXIcon />
            )}
            Revoke other sessions
          </Button>
        </div>
      </FrameHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>Approximate location</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  Loading sessions...
                </span>
              </TableCell>
            </TableRow>
          ) : sessions.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="h-24 text-center text-muted-foreground"
              >
                No active sessions were found.
              </TableCell>
            </TableRow>
          ) : (
            sessions.map((item) => {
              const isCurrent = item.id === currentSessionId

              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {describeDevice(item.userAgent)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {describeLocation(item.ipAddress)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatActivity(item.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isCurrent ? "default" : "outline"}>
                      {isCurrent ? "Current" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isCurrent || pendingToken === item.token}
                      onClick={() => revokeSession(item.token)}
                    >
                      {pendingToken === item.token ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : null}
                      {isCurrent ? "Current device" : "Revoke"}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </Frame>
  )
}
