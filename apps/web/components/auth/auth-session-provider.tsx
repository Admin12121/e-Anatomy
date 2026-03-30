"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { ApiClientError } from "@/lib/api/errors"
import { browserApiFetch } from "@/lib/api/browser"
import type { SessionResponse } from "@/lib/auth/types"

type AuthSessionContextValue = {
  errorMessage: string | null
  isPending: boolean
  refreshSession: () => Promise<SessionResponse | null>
  replaceSession: (session: SessionResponse | null) => void
  session: SessionResponse | null
}

type AuthSessionProviderProps = {
  children: ReactNode
  initialSession?: SessionResponse | null
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null)

async function fetchSession() {
  try {
    return await browserApiFetch<SessionResponse>("/auth/session")
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return null
    }

    throw error
  }
}

export function AuthSessionProvider({
  children,
  initialSession,
}: AuthSessionProviderProps) {
  const requestIdRef = useRef(0)
  const [session, setSession] = useState<SessionResponse | null>(
    initialSession === undefined ? null : initialSession,
  )
  const [isPending, setIsPending] = useState(initialSession === undefined)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refreshSession = useCallback(async () => {
    const requestId = requestIdRef.current + 1

    requestIdRef.current = requestId
    setIsPending(true)
    setErrorMessage(null)

    try {
      const nextSession = await fetchSession()

      if (requestIdRef.current !== requestId) {
        return nextSession
      }

      setSession(nextSession)
      return nextSession
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setSession(null)
        setErrorMessage("Unable to verify the current session.")
      }

      throw error
    } finally {
      if (requestIdRef.current === requestId) {
        setIsPending(false)
      }
    }
  }, [])

  const replaceSession = useCallback((nextSession: SessionResponse | null) => {
    requestIdRef.current += 1
    setSession(nextSession)
    setIsPending(false)
    setErrorMessage(null)
  }, [])

  useEffect(() => {
    if (initialSession !== undefined) {
      return
    }

    void refreshSession().catch((error) => {
      console.error("Failed to load session", error)
    })
  }, [initialSession, refreshSession])

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      errorMessage,
      isPending,
      refreshSession,
      replaceSession,
      session,
    }),
    [errorMessage, isPending, refreshSession, replaceSession, session],
  )

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}

export function useAuthSession() {
  const value = useContext(AuthSessionContext)

  if (!value) {
    throw new Error("useAuthSession must be used within AuthSessionProvider.")
  }

  return value
}
