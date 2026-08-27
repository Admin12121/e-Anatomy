"use client"

import type { ReactNode } from "react"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { authClient } from "@/lib/auth-client"
import { createLoginRedirectPath } from "@/lib/auth/access"

let sessionValidation: Promise<boolean | null> | null = null
let lastValidationAt = 0

async function validateSession() {
  if (sessionValidation) {
    return sessionValidation
  }

  sessionValidation = authClient
    .getSession({
      query: {
        disableCookieCache: true,
      },
    })
    .then((result) => {
      lastValidationAt = Date.now()

      if (result.error) {
        return null
      }

      return Boolean(result.data)
    })
    .catch(() => null)
    .finally(() => {
      sessionValidation = null
    })

  return sessionValidation
}

function getCurrentPath() {
  return `${window.location.pathname}${window.location.search}`
}

export function AuthenticatedAppBoundary({
  children,
  expiresAt,
}: {
  children: ReactNode
  expiresAt: string
}) {
  const router = useRouter()
  const sessionState = authClient.useSession()
  const [sessionExpired, setSessionExpired] = useState(false)

  const checkSession = useCallback(async () => {
    const isValid = await validateSession()

    if (isValid === false) {
      setSessionExpired(true)
    }
  }, [])

  useEffect(() => {
    const expiresAtMs = new Date(expiresAt).getTime()

    if (!Number.isFinite(expiresAtMs)) {
      return
    }

    const delay = Math.max(0, expiresAtMs - Date.now())
    const timer = window.setTimeout(
      checkSession,
      Math.min(delay, 2_147_000_000),
    )

    return () => window.clearTimeout(timer)
  }, [checkSession, expiresAt])

  useEffect(() => {
    const validateAfterIdle = () => {
      if (Date.now() - lastValidationAt < 30_000) {
        return
      }

      void checkSession()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        validateAfterIdle()
      }
    }

    window.addEventListener("focus", validateAfterIdle)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", validateAfterIdle)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [checkSession])

  const hasEnded =
    sessionExpired ||
    (!sessionState.isPending &&
      !sessionState.error &&
      !sessionState.data)

  return (
    <>
      {children}
      <Dialog open={hasEnded}>
        <DialogContent
          className="p-6"
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Your session has ended</DialogTitle>
            <DialogDescription>
              Sign in again to continue. We will return you to this page after
              your account is verified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              onClick={() =>
                router.push(createLoginRedirectPath(getCurrentPath()))
              }
            >
              Sign in again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
