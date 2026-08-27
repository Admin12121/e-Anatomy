"use client"

import { useState } from "react"
import { CheckIcon, EllipsisVerticalIcon, LoaderCircleIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getRoleLabel, normalizeRoleCode } from "@/lib/auth/access"

type UserActionsProps = {
  currentUserId: string
  role: string | null
  status: string | null
  userId: string
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error
  ) {
    return String(error.error.message)
  }

  return "Unable to update the user."
}

export function UserActions({
  currentUserId,
  role,
  status,
  userId,
}: UserActionsProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const normalizedRole = normalizeRoleCode(role)
  const normalizedStatus = status === "active" ? "active" : "inactive"

  async function updateUser(
    input: Partial<{ role: "admin" | "editor" | "viewer"; status: string }>,
  ) {
    setPending(true)

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      })
      const payload = (await response.json()) as unknown

      if (!response.ok) {
        toast.error(getErrorMessage(payload))
        return
      }

      toast.success("User updated.")
      router.refresh()
    } catch {
      toast.error("Unable to update the user.")
    } finally {
      setPending(false)
    }
  }

  if (currentUserId === userId) {
    return <span className="text-xs text-muted-foreground">Current user</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={pending}
          aria-label="User actions"
        >
          {pending ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <EllipsisVerticalIcon />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Role</DropdownMenuLabel>
        {(["admin", "editor", "viewer"] as const).map((value) => (
          <DropdownMenuItem
            key={value}
            disabled={pending || normalizedRole === value}
            onSelect={() => updateUser({ role: value })}
          >
            {getRoleLabel(value)}
            {normalizedRole === value ? <CheckIcon className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        {(["active", "inactive"] as const).map((value) => (
          <DropdownMenuItem
            key={value}
            disabled={pending || normalizedStatus === value}
            variant={value === "inactive" ? "destructive" : "default"}
            onSelect={() => updateUser({ status: value })}
          >
            {value === "active" ? "Activate" : "Deactivate"}
            {normalizedStatus === value ? (
              <CheckIcon className="ml-auto" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
