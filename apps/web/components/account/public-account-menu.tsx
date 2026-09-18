"use client"

import { useState } from "react"
import Link from "next/link"
import { useTransitionRouter } from "next-transition-router"
import {
  BellIcon,
  LoaderCircleIcon,
  LogOutIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type PublicAccountMenuProps = {
  className?: string
}

function getInitials(name: string, email: string) {
  return (name.trim() || email)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function PublicAccountMenu({ className }: PublicAccountMenuProps) {
  const router = useTransitionRouter()
  const { data: session, isPending } = authClient.useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      const result = await authClient.signOut()

      if (result.error) {
        toast.error(result.error.message || "Unable to sign out")
        return
      }

      await fetch("/api/auth/second-factor", { method: "DELETE" })
      toast.success("Logged out successfully")
      router.replace("/login")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out")
    } finally {
      setIsSigningOut(false)
    }
  }

  if (isPending) {
    return (
      <div className={className}>
        <Button
          aria-label="Checking account session"
          disabled
          size="icon-lg"
          variant="outline"
        >
          <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
        </Button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className={className}>
        <Button asChild size="xl" variant="outline">
          <Link href="/login">Sign In</Link>
        </Button>
      </div>
    )
  }

  const user = session.user
  const initials = getInitials(user.name, user.email)

  return (
    <div className={cn("flex items-center", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Open account menu"
            className="rounded-md p-0"
            size="icon-xl"
            variant="outline"
          >
            <Avatar size="lg">
              <AvatarImage
                alt={`${user.name || "User"} profile photo`}
                src={user.image ?? undefined}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64" sideOffset={8}>
          <DropdownMenuLabel className="p-2 font-normal">
            <div className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/60 p-2">
              <Avatar>
                <AvatarImage
                  alt={`${user.name || "User"} profile photo`}
                  src={user.image ?? undefined}
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">
                  {user.name || "User"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/account?tab=profile">
                <UserRoundIcon aria-hidden="true" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/account?tab=security">
                <SettingsIcon aria-hidden="true" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/account?tab=notifications">
                <BellIcon aria-hidden="true" />
                Notifications
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSigningOut}
            onSelect={() => void handleSignOut()}
            variant="destructive"
          >
            {isSigningOut ? (
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            ) : (
              <LogOutIcon aria-hidden="true" />
            )}
            {isSigningOut ? "Signing out..." : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
