"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function LogoutButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(() => {
      void signOut()
    })
  }

  async function signOut() {
    const result = await authClient.signOut()

    if (result.error) {
      toast.error(result.error.message || "Unable to sign out")
      return
    }

    router.replace("/login")
    router.refresh()
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={isPending}>
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  )
}
