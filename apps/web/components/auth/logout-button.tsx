"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { useAuthSession } from "@/components/auth/auth-session-provider"
import { browserApiFetch } from "@/lib/api/browser"
import { Button } from "@/components/ui/button"

export function LogoutButton() {
  const router = useRouter()
  const { replaceSession } = useAuthSession()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(() => {
      void signOut()
    })
  }

  async function signOut() {
    await browserApiFetch("/auth/logout", { method: "POST" })
    replaceSession(null)
    router.replace("/login")
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={isPending}>
      {isPending ? "Signing out..." : "Sign out"}
    </Button>
  )
}
